import "server-only";

import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getArchiveServer, getMasterServer, getTankeServer, getUnilorinServer } from "@/lib/supabase/server";
import { buildDemandReports, buildSalesPulseReport } from "@/lib/salesPulse/analytics";
import { lagosDate, lagosMidnight, shiftDate } from "@/lib/salesPulse/dates";
import { readPulsePages } from "@/lib/salesPulse/paging";
import { normalizePulseSales } from "@/lib/salesPulse/sales";
import {
  SALES_HISTORY_DAYS, SALES_PULSE_CACHE_SECONDS,
  type PulseAlias, type PulseAuditRow, type PulseInventory, type PulseOrderItem,
  type PulseProduct, type SalesPulseReport,
} from "@/lib/salesPulse/types";

/**
 * A planning snapshot, not a live feed. One shared key per clock hour, across
 * periods, weeks, filters and admins. It deliberately has NO storefront tags:
 * selling one item must not trigger a two-year history reread, and opening this
 * board must not invalidate any public catalogue/image cache. Auth is checked
 * by callers before entering the cache. There is no browser/cron polling.
 */
async function computeSalesPulseReport(hour: number): Promise<SalesPulseReport> {
  const generatedAt = new Date().toISOString();
  const historyStart = lagosMidnight(shiftDate(lagosDate(generatedAt), 1 - SALES_HISTORY_DAYS));
  const archive = getArchiveServer();
  const master = getMasterServer();
  type InventoryRow = Omit<PulseInventory, "outlet">;

  const [unilorin, tanke, orderItems, audits, aliases] = await Promise.all([
    readPulsePages<InventoryRow>((from, to) => getUnilorinServer().from("inventory")
      .select("product_id, grade, quantity, reserved_quantity").gt("quantity", 0).order("id").range(from, to), "Unilorin inventory", 5_000),
    readPulsePages<InventoryRow>((from, to) => getTankeServer().from("inventory")
      .select("product_id, grade, quantity, reserved_quantity").gt("quantity", 0).order("id").range(from, to), "Tanke inventory", 5_000),
    readPulsePages<PulseOrderItem>((from, to) => archive.from("order_items")
      .select("order_id, product_id, product_name, outlet, grade, quantity, unit_price, total_price, orders!inner(status, updated_at)")
      .in("orders.status", ["paid", "shipping", "delivered"])
      .gte("orders.updated_at", historyStart).lte("orders.updated_at", generatedAt)
      .order("id").range(from, to), "verified sales"),
    readPulsePages<PulseAuditRow>((from, to) => archive.from("audit_logs")
      .select("id, product_id, action, outlet, admin_id, created_at, details, metadata")
      .in("action", ["SALE", "SALE_REVERSED"])
      .gte("created_at", historyStart).lte("created_at", generatedAt)
      .order("id").range(from, to), "sale history"),
    readPulsePages<PulseAlias>((from, to) => master.from("product_aliases")
      .select("alias_product_id, survivor_product_id").order("alias_product_id").range(from, to), "product aliases", 5_000),
  ]);

  const history = normalizePulseSales(orderItems, audits, aliases, historyStart, generatedAt);
  const inventory: PulseInventory[] = [
    ...unilorin.map((row) => ({ ...row, outlet: "unilorin" as const })),
    ...tanke.map((row) => ({ ...row, outlet: "tanke" as const })),
  ];
  const demand = buildDemandReports(history.sales, [], generatedAt);
  const topIds = [...new Set(Object.values(demand).flatMap((report) => report.topProducts.map((product) => product.productId)))].sort();
  const stockIds = inventory.filter((row) => row.quantity > (row.reserved_quantity ?? 0)).map((row) => row.product_id);
  const productIds = [...new Set([...stockIds, ...topIds])].sort();
  const batches: string[][] = [];
  for (let offset = 0; offset < productIds.length; offset += 100) batches.push(productIds.slice(offset, offset + 100));

  const [catalogPages, imageRows] = await Promise.all([
    Promise.all(batches.map(async (ids) => {
      const { data, error } = await master.from("products")
        .select("id, name, category, price, created_at").in("id", ids);
      if (error) throw new Error(`Sales Pulse catalogue: ${error.message}`);
      return (data ?? []) as PulseProduct[];
    })),
    // Only the existing hot-seller cards need image URLs, at most 32 unique
    // goods across the four periods. The aged list and exports are image-free.
    topIds.length ? master.from("products").select("id, base_image_url").in("id", topIds) : { data: [], error: null },
  ]);
  if (imageRows.error) throw new Error(`Sales Pulse hot-seller details: ${imageRows.error.message}`);
  const images = new Map((imageRows.data ?? []).map((row) => [row.id, row.base_image_url]));
  const products = catalogPages.flat().map((product) => ({ ...product, base_image_url: images.get(product.id) ?? null }));
  const report = buildSalesPulseReport({
    generatedAt, refreshAfter: new Date((hour + 1) * SALES_PULSE_CACHE_SECONDS * 1_000).toISOString(),
    historyStart, products, inventory, history,
  });
  // Next's data-cache entry limit is 2 MB. Fail visibly rather than silently
  // serving an uncached, expensive report if the business outgrows this source.
  if (Buffer.byteLength(JSON.stringify(report), "utf8") > 1_500_000) {
    throw new Error("Sales Pulse snapshot needs an aggregated history source before it can grow further.");
  }
  return report;
}

const inFlight = new Map<number, Promise<SalesPulseReport>>();
// Also isolate different data sources when a local build is reused against a
// test/staging database. No credentials enter the key or the response.
const sourceNamespace = createHash("sha256").update(
  ["MASTER", "UNILORIN", "TANKE", "ARCHIVE"].map((pool) => process.env[`SUPABASE_URL_${pool}`] ?? "").join("|"),
).digest("hex").slice(0, 16);
const cachedSnapshot = unstable_cache(
  async (hour: number) => {
    const pending = inFlight.get(hour);
    if (pending) return pending;
    const next = computeSalesPulseReport(hour).finally(() => { inFlight.delete(hour); });
    inFlight.set(hour, next);
    return next;
  },
  ["admin-sales-pulse-v1", sourceNamespace],
  { revalidate: SALES_PULSE_CACHE_SECONDS },
);

/** Internal only; HTTP/action callers must requireAdminSession first. */
export function getCachedSalesPulseReport(): Promise<SalesPulseReport> {
  return cachedSnapshot(Math.floor(Date.now() / (SALES_PULSE_CACHE_SECONDS * 1_000)));
}
