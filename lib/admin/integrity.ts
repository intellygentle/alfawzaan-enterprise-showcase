// lib/admin/integrity.ts — server-only Data Health integrity scan.
//
// Why this lives outside app/admin/dashboard/actions.ts: the scan reads every
// row of products, orders, order_items, product_aliases, and both outlets'
// inventory + reservations (~5k rows). Running that on every Data Health tab
// visit burned cached egress for no reason, since integrity findings change
// slowly. The result is cached here (and invalidated by catalog/inventory/
// integrity tags), so repeat visits and tab switches cost zero Supabase reads.
//
// Deliberately NOT "use server": the authenticated wrapper lives in
// app/admin/dashboard/actions.ts. No dynamic APIs (cookies/headers) are used
// here, because unstable_cache callbacks cannot call them.

import "server-only";

import { unstable_cache } from "next/cache";
import {
  getArchiveServer,
  getMasterServer,
  getTankeServer,
  getUnilorinServer,
} from "@/lib/supabase/server";
import { CATALOG_TAG, INVENTORY_TAG, INTEGRITY_TAG } from "@/lib/storefront/revalidate";

/** Rows the report renders in one pass — the remainder is summarised, never silent. */
const MAX_FINDINGS = 300;

export interface IntegrityFinding {
  severity: "critical" | "warning" | "info";
  kind: string;
  message: string;
  outlet?: string;
  productId?: string;
  productName?: string;
  orderId?: string;
}

export interface IntegrityReport {
  generatedAt: string;
  summary: { critical: number; warning: number; info: number };
  findings: IntegrityFinding[];
  metrics: {
    ordersWithoutItems: number;
    orphanOrderItems: number;
    /** Items on a merged-away product id — traceable through product_aliases. */
    mergedOrderItems: number;
    activeReservations: number;
    reservationMismatches: number;
    priceDriftRows: number;
    unknownInventoryProducts: number;
  };
}

/**
 * PostgREST caps an unbounded select at 1,000 rows, and the tables this report
 * reads are already past it (order_items 1,450; Tanke's reservations 1,199). A
 * single select therefore hides the tail silently — which is what invented
 * "order with no items" warnings for orders whose rows fell past the cap, and
 * left the reserved-stock comparison wrong in both directions. Page until the
 * table ends. Callers must order by a UNIQUE column, or a page boundary can
 * repeat or skip rows.
 */
const INTEGRITY_PAGE_SIZE = 1_000;

async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += INTEGRITY_PAGE_SIZE) {
    const { data, error } = await page(from, from + INTEGRITY_PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < INTEGRITY_PAGE_SIZE) return rows;
  }
}

/**
 * The uncached scan. Prefer getCachedIntegrityReport(); call this directly only
 * when the admin explicitly forces a refresh.
 */
export async function computeIntegrityReport(): Promise<IntegrityReport> {
  const master = getMasterServer();
  const archive = getArchiveServer();
  const outlets = {
    unilorin: getUnilorinServer(),
    tanke: getTankeServer(),
  } as const;

  const [products, orders, items] = await Promise.all([
    fetchAllRows((from, to) => master.from("products").select("id, name, price").order("id").range(from, to), "products"),
    fetchAllRows((from, to) => archive.from("orders").select("id, status, outlet").order("id").range(from, to), "orders"),
    fetchAllRows((from, to) => archive.from("order_items").select("id, order_id, product_id, quantity, unit_price, total_price").order("id").range(from, to), "order_items"),
  ]);

  // product_aliases is what keeps a deleted duplicate resolvable. The merge
  // action deliberately leaves historical order_items/audit_logs on the original
  // product id and records the mapping instead of rewriting evidence — so
  // without reading it, every merged product reads as missing from Master and
  // the finding count grows with each merge. Tolerate the table being absent,
  // exactly as getProductAudit does.
  let aliases: Array<{ alias_product_id: string; survivor_product_id: string; alias_name: string | null; survivor_name: string | null }> = [];
  try {
    aliases = await fetchAllRows(
      (from, to) => master.from("product_aliases").select("alias_product_id, survivor_product_id, alias_name, survivor_name").order("alias_product_id").range(from, to),
      "product_aliases",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/product_aliases|relation .* does not exist|PGRST205/i.test(message)) {
      throw new Error(`Integrity report could not read product aliases: ${message}`);
    }
  }

  const findings: IntegrityFinding[] = [];
  const productMap = new Map(products.map((product) => [product.id, product]));
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const aliasMap = new Map<string, { survivorId: string; aliasName?: string | null; survivorName?: string | null }>();
  for (const alias of aliases) {
    aliasMap.set(alias.alias_product_id, {
      survivorId: alias.survivor_product_id,
      aliasName: alias.alias_name,
      survivorName: alias.survivor_name,
    });
  }
  /**
   * A merged id stays traceable only while its survivor still exists in Master:
   * an alias whose survivor was itself deleted is a real orphan again.
   */
  const resolveAlias = (productId: string) => {
    const alias = aliasMap.get(productId);
    if (!alias || !productMap.has(alias.survivorId)) return null;
    return alias;
  };
  const productName = (productId: string) => {
    const direct = productMap.get(productId)?.name;
    if (direct) return direct;
    const alias = resolveAlias(productId);
    if (!alias) return "Unknown product";
    const survivorName = productMap.get(alias.survivorId)?.name || alias.survivorName || "the surviving product";
    return alias.aliasName ? `${alias.aliasName} (merged into ${survivorName})` : `Merged into ${survivorName}`;
  };
  /**
   * Grades are lowercase throughout the app, but historical or hand-edited rows
   * can differ in case — a case-sensitive key would report every such row as a
   * mismatch against itself. Normalise both sides before comparing.
   */
  const gradeKey = (productId: string, grade: string | null | undefined) =>
    `${productId}|${String(grade ?? "").trim().toLowerCase()}`;
  const itemsByOrder = new Map<string, typeof items>();
  let mergedOrderItems = 0;
  for (const item of items ?? []) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
     if (!productMap.has(item.product_id)) {
       if (resolveAlias(item.product_id)) {
         // Expected after a merge, and fully traceable through product_aliases.
         // Counted rather than listed: one entry per historical line would bury
         // the findings that actually need an action.
         mergedOrderItems++;
       } else {
         findings.push({ severity: "critical", kind: "orphan_order_item", message: `An order item references a product that no longer exists in the Master catalog, and no merge record points it at a surviving product.`, orderId: item.order_id, productId: item.product_id, productName: productName(item.product_id) });
       }
     }
     if (Math.round(item.quantity * item.unit_price) !== Math.round(item.total_price)) findings.push({ severity: "critical", kind: "item_total_mismatch", message: `The saved total for ${productName(item.product_id)} does not equal quantity × unit price.`, orderId: item.order_id, productId: item.product_id, productName: productName(item.product_id) });
  }
  for (const order of orders ?? []) {
    if (!itemsByOrder.has(order.id)) findings.push({ severity: "warning", kind: "order_without_items", message: `Order ${order.id.slice(0, 8)} has no order items.`, orderId: order.id });
  }

  // Outlets are read independently so one unreachable database still lets the
  // other one's findings through.
  type OutletInventory = { product_id: string; grade: string; quantity: number; reserved_quantity: number | null; price: number };
  type OutletReservation = { id: string; order_id: string; product_id: string; quantity: number; assigned_grade: string; status: string; expires_at: string | null };
  const outletData = await Promise.all(
    (Object.keys(outlets) as Array<keyof typeof outlets>).map(async (outlet) => {
      try {
        const [inventory, reservations] = await Promise.all([
          fetchAllRows<OutletInventory>((from, to) => outlets[outlet].from("inventory").select("product_id, grade, quantity, reserved_quantity, price").order("id").range(from, to), `${outlet} inventory`),
          fetchAllRows<OutletReservation>((from, to) => outlets[outlet].from("inventory_reservations").select("id, order_id, product_id, quantity, assigned_grade, status, expires_at").order("id").range(from, to), `${outlet} reservations`),
        ]);
        return { outlet, inventory, reservations };
      } catch (error) {
        return { outlet, error: error instanceof Error ? error.message : "read failed" };
      }
    }),
  );

  let activeReservations = 0;
  let reservationMismatches = 0;
  let priceDriftRows = 0;
  let unknownInventoryProducts = 0;
  for (const result of outletData) {
    if ("error" in result) {
      findings.push({ severity: "critical", kind: "database_read_failure", message: `Could not read ${result.outlet}: ${result.error}`, outlet: result.outlet });
      continue;
    }
    const { outlet, inventory, reservations } = result;
    const active = reservations.filter((reservation) => reservation.status === "active");
    activeReservations += active.length;
    const activeTotals = new Map<string, number>();
    for (const reservation of active) {
      const key = gradeKey(reservation.product_id, reservation.assigned_grade);
      activeTotals.set(key, (activeTotals.get(key) ?? 0) + reservation.quantity);
      const order = orderMap.get(reservation.order_id);
         if (!order) findings.push({ severity: "critical", kind: "orphan_reservation", message: `An active reservation for ${productName(reservation.product_id)} has no matching Archive order.`, outlet, orderId: reservation.order_id, productId: reservation.product_id, productName: productName(reservation.product_id) });
       else if (order.status !== "pending") findings.push({ severity: "critical", kind: "reservation_status_mismatch", message: `The active reservation for ${productName(reservation.product_id)} belongs to a ${order.status} order instead of a pending order.`, outlet, orderId: order.id, productId: reservation.product_id, productName: productName(reservation.product_id) });
       // Deliberately info, not a warning: reservations are never expired
       // automatically (see lib/outlets/reservations.ts) because manual
       // verification routinely runs past the 30-minute reference stamp. A
       // warning here would fire for every healthy order awaiting verification.
       if (reservation.expires_at && new Date(reservation.expires_at).getTime() < Date.now()) findings.push({ severity: "info", kind: "expired_reservation", message: `The active reservation for ${productName(reservation.product_id)} is past its reference stamp — expected while an order waits for manual verification. Verify or cancel that order to release the stock.`, outlet, orderId: reservation.order_id, productId: reservation.product_id, productName: productName(reservation.product_id) });
    }
    const inventoryTotals = new Map<string, number>();
    for (const row of inventory) {
      if (!productMap.has(row.product_id)) {
        if (resolveAlias(row.product_id)) {
          // Stock parked on a merged id: worth consolidating into the survivor,
          // but it is not a broken catalog reference.
          findings.push({ severity: "warning", kind: "merged_inventory_product", message: `Inventory still sits on this merged product id — consolidate it into the surviving product.`, outlet, productId: row.product_id, productName: productName(row.product_id) });
        } else {
          unknownInventoryProducts++;
          findings.push({ severity: "critical", kind: "unknown_inventory_product", message: `Inventory references a product that no longer exists in the Master catalog.`, outlet, productId: row.product_id, productName: productName(row.product_id) });
        }
      }
      const key = gradeKey(row.product_id, row.grade);
      inventoryTotals.set(key, (inventoryTotals.get(key) ?? 0) + (row.reserved_quantity ?? 0));
      const masterPrice = productMap.get(row.product_id)?.price;
      if (masterPrice != null && Number(row.price) !== Number(masterPrice)) {
        priceDriftRows++;
         findings.push({ severity: "warning", kind: "price_drift", message: `${productName(row.product_id)} is priced at ₦${Number(row.price).toLocaleString()} in ${outlet}, but Master says ₦${Number(masterPrice).toLocaleString()}.`, outlet, productId: row.product_id, productName: productName(row.product_id) });
      }
    }
    for (const key of new Set([...inventoryTotals.keys(), ...activeTotals.keys()])) {
      const counted = inventoryTotals.get(key) ?? 0;
      const reserved = activeTotals.get(key) ?? 0;
      if (counted !== reserved) {
        reservationMismatches++;
        const mismatchProductId = key.split("|")[0];
        findings.push({ severity: "critical", kind: "reserved_quantity_mismatch", message: `Reserved stock for ${productName(mismatchProductId)} does not match its active reservation records (${key.split("|")[1]} grade): the shelf counts ${counted} reserved, active reservations account for ${reserved}.`, outlet, productId: mismatchProductId, productName: productName(mismatchProductId) });
      }
    }
  }

  // Criticals first: a long tail of warnings and info entries must never push a
  // real orphan or mismatch out of the capped list. sort() is stable, so within
  // one severity the discovery order is preserved.
  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  const capped = [...findings]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, MAX_FINDINGS);
  if (findings.length > capped.length) {
    capped.push({ severity: "info", kind: "findings_truncated", message: `${findings.length - capped.length} further finding(s) are not listed — clear the ones above to see them.` });
  }
  const summary = capped.reduce((result, finding) => { result[finding.severity]++; return result; }, { critical: 0, warning: 0, info: 0 });
  return {
    generatedAt: new Date().toISOString(), summary, findings: capped,
    metrics: {
      ordersWithoutItems: orders.filter((order) => !itemsByOrder.has(order.id)).length,
      orphanOrderItems: items.filter((item) => !orderMap.has(item.order_id)).length,
      mergedOrderItems,
      activeReservations,
      reservationMismatches,
      priceDriftRows,
      unknownInventoryProducts,
    },
  };
}

/**
 * Cached report. Revalidates every 30 minutes as a backstop, and immediately
 * whenever catalog or inventory data changes (both tags are revalidated by
 * admin mutations) or when the admin forces a refresh. `computedAt` is the
 * cache-generation time, so the UI can show when the data was last scanned.
 */
export const getCachedIntegrityReport = unstable_cache(
  computeIntegrityReport,
  ["admin-integrity-report-v1"],
  { revalidate: 1_800, tags: [CATALOG_TAG, INVENTORY_TAG, INTEGRITY_TAG] },
);
