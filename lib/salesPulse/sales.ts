import type { Grade, Outlet } from "../types";
import type {
  NormalizedPulseSales, PulseAlias, PulseAuditRow, PulseOrderItem, PulseSale,
} from "./types";

export const pulseItemKey = (productId: string, outlet: string) => `${productId}|${outlet}`;
const isOutlet = (value: string): value is Outlet => value === "unilorin" || value === "tanke";
const isGrade = (value: string): value is Grade => ["special", "extra", "normal"].includes(value);
const positiveUnits = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function productResolver(aliases: PulseAlias[]): (id: string) => string {
  const map = new Map(aliases.map((alias) => [alias.alias_product_id, alias.survivor_product_id]));
  return (id) => {
    const visited = new Set<string>();
    while (map.has(id)) {
      if (visited.has(id)) throw new Error("Product alias cycle prevents a reliable sales snapshot.");
      visited.add(id);
      id = map.get(id)!;
    }
    return id;
  };
}

function parseAudit(row: PulseAuditRow) {
  const match = row.details?.match(row.action === "SALE_REVERSED"
    ? /added (\d+) back to (\w+) at (\w+)/i
    : /Deducted (\d+) from (\w+) at (\w+)/i);
  const units = Number(row.metadata?.qty ?? match?.[1]);
  const grade = String(row.metadata?.grade ?? match?.[2] ?? "").toLowerCase();
  const outlet = String(row.metadata?.outlet ?? row.outlet ?? match?.[3] ?? "").toLowerCase();
  const priceMatch = row.details?.match(/@\s*₦([\d,.]+)/);
  const price = Number(row.metadata?.price ?? priceMatch?.[1]?.replace(/,/g, "") ?? 0);
  if (!positiveUnits(units) || !isGrade(grade) || !isOutlet(outlet)) return null;
  return { units, grade, outlet, price: Number.isFinite(price) && price >= 0 ? price : 0 };
}

/**
 * Reconcile BEFORE computing recency or periods. A reversal cancels its original
 * sale, even across reporting boundaries; a fully reversed sale cannot make old
 * stock look recently sold. Both admin and rep verification audit rows are
 * excluded as independent sales (the verified order is the authority).
 */
export function normalizePulseSales(
  orderItems: PulseOrderItem[],
  auditRows: PulseAuditRow[],
  aliases: PulseAlias[],
  historyStart: string,
  asOf: string,
): NormalizedPulseSales {
  const resolve = productResolver(aliases);
  const uncertain = new Set<string>();
  let ignoredRecords = 0;
  const startMs = Date.parse(historyStart);
  const endMs = Date.parse(asOf);
  const inWindow = (date: string) => Date.parse(date) >= startMs && Date.parse(date) <= endMs;
  const markUncertain = (productId: string | null, outlet: string | null) => {
    ignoredRecords++;
    if (!productId) return;
    for (const target of isOutlet(outlet ?? "") ? [outlet!] : ["unilorin", "tanke"]) {
      uncertain.add(pulseItemKey(resolve(productId), target));
    }
  };

  type Event = PulseSale & { orderId?: string; orderUpdatedAt?: string; priced: boolean };
  const orders = new Map<string, Event>();
  for (const row of orderItems) {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!order || !["paid", "shipping", "delivered"].includes(order.status)) continue;
    const outlet = row.outlet?.toLowerCase();
    const grade = row.grade?.toLowerCase();
    if (!inWindow(order.updated_at) || !positiveUnits(row.quantity) || !isOutlet(outlet) || !isGrade(grade)) {
      markUncertain(row.product_id, outlet);
      continue;
    }
    const productId = resolve(row.product_id);
    const key = `${row.order_id}|${productId}|${outlet}|${grade}`;
    const revenue = Number(row.total_price ?? Number(row.quantity) * Number(row.unit_price));
    if (!Number.isFinite(revenue) || revenue < 0) {
      markUncertain(row.product_id, outlet);
      continue;
    }
    const existing = orders.get(key);
    if (existing) {
      existing.units += Number(row.quantity);
      existing.revenue += revenue;
    } else {
      orders.set(key, {
        orderId: row.order_id, orderUpdatedAt: order.updated_at,
        productId, productName: row.product_name, outlet, grade,
        soldAt: order.updated_at, units: Number(row.quantity), revenue, priced: true,
      });
    }
  }

  const events: Event[] = [...orders.values()];
  const auditEvents = new Map<string, Event>();
  const saleAudits = auditRows.filter((row) => row.action === "SALE" && inWindow(row.created_at));
  const verificationTimes = new Map<Event, string>();

  for (const row of saleAudits) {
    if (!row.product_id) { markUncertain(null, row.outlet); continue; }
    const parsed = parseAudit(row);
    if (!parsed) { markUncertain(row.product_id, row.outlet); continue; }
    const productId = resolve(row.product_id);
    const verification = /^(order|rep)-verify-/.test(row.admin_id ?? "");
    if (verification) {
      const orderPrefix = row.admin_id?.startsWith("order-verify-") ? row.admin_id.slice(13) : null;
      const matches = [...orders.values()].filter((event) => {
        if (event.productId !== productId || event.outlet !== parsed.outlet || event.grade !== parsed.grade) return false;
        if (Date.parse(row.created_at) > Date.parse(event.orderUpdatedAt!)) return false;
        if (orderPrefix) return event.orderId!.startsWith(orderPrefix);
        // Legacy rep markers contain a rep ID, not an order ID. Only link an
        // unambiguous matching deduction within five minutes of verification.
        return event.units === parsed.units && Date.parse(event.orderUpdatedAt!) - Date.parse(row.created_at) <= 300_000;
      });
      if (matches.length === 1) {
        const event = matches[0];
        auditEvents.set(row.id, event);
        const previous = verificationTimes.get(event);
        if (!previous || Date.parse(previous) < Date.parse(row.created_at)) verificationTimes.set(event, row.created_at);
      }
      continue;
    }
    const event: Event = {
      productId, productName: "", outlet: parsed.outlet, grade: parsed.grade,
      soldAt: row.created_at, units: parsed.units, revenue: parsed.units * parsed.price,
      priced: parsed.price > 0,
    };
    events.push(event);
    auditEvents.set(row.id, event);
  }
  for (const [event, timestamp] of verificationTimes) event.soldAt = timestamp;

  for (const row of auditRows.filter((entry) => entry.action === "SALE_REVERSED" && inWindow(entry.created_at))) {
    const parsed = parseAudit(row);
    const reference = String(row.metadata?.audit_log_id ?? row.details?.match(/reversal of audit log ([a-f\d-]+)/i)?.[1] ?? "");
    if (!parsed || !row.product_id || !reference) { markUncertain(row.product_id, row.outlet); continue; }
    const productId = resolve(row.product_id);
    const originals = saleAudits.filter((sale) => sale.id.startsWith(reference) && sale.product_id && resolve(sale.product_id) === productId);
    if (originals.length !== 1) { markUncertain(row.product_id, parsed.outlet); continue; }
    const original = originals[0];
    const event = auditEvents.get(original.id);
    if (!event) {
      // A pending/cancelled admin order has no sale to cancel. Unlinkable rep
      // history stays out of the promotion list rather than guessing an order.
      const prefix = original.admin_id?.startsWith("order-verify-") ? original.admin_id.slice(13) : null;
      if (prefix && ![...orders.values()].some((entry) => entry.orderId?.startsWith(prefix))) continue;
      markUncertain(row.product_id, parsed.outlet);
      continue;
    }
    if (event.outlet !== parsed.outlet || event.grade !== parsed.grade || Date.parse(original.created_at) > Date.parse(row.created_at)) {
      markUncertain(row.product_id, parsed.outlet);
      continue;
    }
    const remaining = Math.max(0, event.units - parsed.units);
    event.revenue = event.units ? event.revenue * remaining / event.units : 0;
    event.units = remaining;
  }

  return {
    sales: events.filter((event) => event.units > 0).map(({ productId, productName, outlet, grade, soldAt, units, revenue }) => ({
      productId, productName, outlet, grade, soldAt, units, revenue: Math.round(revenue * 100) / 100,
    })),
    uncertainKeys: [...uncertain],
    ignoredRecords,
    unpricedUnits: events.reduce((sum, event) => sum + (event.priced ? 0 : event.units), 0),
  };
}
