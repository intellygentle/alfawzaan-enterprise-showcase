import assert from "node:assert/strict";
import test from "node:test";
import { assignValueBands, buildDemandReports, buildSalesPulseReport } from "../../lib/salesPulse/analytics";
import { categorizeStock } from "../../lib/salesPulse/clustering";
import { lagosDate, lagosMidnight } from "../../lib/salesPulse/dates";
import { readPulsePages } from "../../lib/salesPulse/paging";
import { normalizePulseSales, productResolver } from "../../lib/salesPulse/sales";
import { agedItem, PULSE_HISTORY_START, PULSE_NOW, pulseAudit, pulseInventory, pulseOrder, pulseProduct, pulseSale } from "../fixtures/salesPulse";
import type { NormalizedPulseSales, PulseAuditRow, PulseInventory, PulseProduct } from "../../lib/salesPulse/types";

function reportFor(products: PulseProduct[], inventory: PulseInventory[], history: Partial<NormalizedPulseSales> = {}) {
  return buildSalesPulseReport({
    generatedAt: PULSE_NOW, refreshAfter: "2026-11-04T10:00:00Z", historyStart: PULSE_HISTORY_START,
    products, inventory, history: { sales: [], uncertainKeys: [], ignoredRecords: 0, unpricedUnits: 0, ...history },
  });
}

function reversal(overrides: Partial<PulseAuditRow> = {}) {
  return pulseAudit({
    id: "c3333333-3333-3333-3333-333333333333", action: "SALE_REVERSED", created_at: PULSE_NOW,
    metadata: null, details: "Reversed sale: added 2 back to normal at unilorin (reversal of audit log a1111111).",
    ...overrides,
  });
}

test("aged stock subtracts reservations per grade and never borrows across boutiques", () => {
  const report = reportFor([pulseProduct()], [
    pulseInventory({ grade: "normal", quantity: 3, reserved_quantity: 5 }),
    pulseInventory({ grade: "extra", quantity: 10, reserved_quantity: 2 }),
    pulseInventory({ outlet: "tanke", quantity: 4, reserved_quantity: 4 }),
  ]);
  assert.equal(report.agedStock.length, 1);
  assert.equal(report.agedStock[0].availableUnits, 8);
  assert.equal(report.agedStock[0].stockValue, 80_000);
  assert.deepEqual(report.agedStock[0].grades, { extra: 8 });
  assert.equal(report.inventorySummary.availableUnits, 8);
});

test("a recent sale at one boutique does not hide idle goods at the other", () => {
  const report = reportFor([pulseProduct()], [pulseInventory(), pulseInventory({ outlet: "tanke" })], {
    sales: [pulseSale({ outlet: "tanke", soldAt: "2026-11-03T09:00:00Z", units: 7 })],
  });
  assert.equal(report.agedStock.length, 1);
  assert.equal(report.agedStock[0].outlet, "unilorin");
  assert.equal(report.agedStock[0].otherOutletUnits30, 7);
});

test("new goods and unknown ages are not described as long-unsold", () => {
  const products = [
    pulseProduct({ id: "new", created_at: "2026-10-20T10:00:00Z" }),
    pulseProduct({ id: "bad", created_at: "not-a-date" }),
    pulseProduct({ id: "future", created_at: "2027-01-01T10:00:00Z" }),
    pulseProduct({ id: "old", created_at: "2020-01-01T10:00:00Z" }),
  ];
  const report = reportFor(products, products.map((product) => pulseInventory({ product_id: product.id })));
  assert.deepEqual(report.agedStock.map((item) => item.productId), ["old"]);
  assert.equal(report.agedStock[0].idleDays, 729);
  assert.equal(report.agedStock[0].lastSoldAt, null);
  assert.equal(report.agedStock[0].observationStart, lagosDate(PULSE_HISTORY_START));
  assert.equal(report.inventorySummary.unknownAge, 2);
});

test("30-day boundary is inclusive and unavailable goods are omitted", () => {
  const products = ["at30", "at29", "sold-out"].map((id) => pulseProduct({ id }));
  const report = reportFor(products, [
    pulseInventory({ product_id: "at30" }), pulseInventory({ product_id: "at29" }),
    pulseInventory({ product_id: "sold-out", quantity: 0 }),
  ], { sales: [pulseSale({ productId: "at30", soldAt: "2026-10-05T10:00:00Z" }), pulseSale({ productId: "at29", soldAt: "2026-10-06T10:00:00Z" })] });
  assert.deepEqual(report.agedStock.map((item) => item.productId), ["at30"]);
  assert.equal(report.agedStock[0].idleDays, 30);
});

test("a fully reversed recent sale cannot reset the inactivity clock", () => {
  const history = normalizePulseSales([], [
    pulseAudit(), reversal(),
    pulseAudit({ id: "d4444444-4444-4444-4444-444444444444", created_at: "2026-08-01T09:00:00Z" }),
  ], [], PULSE_HISTORY_START, PULSE_NOW);
  const report = reportFor([pulseProduct()], [pulseInventory()], history);
  assert.equal(history.sales.length, 1);
  assert.equal(report.agedStock[0].lastSoldAt, "2026-08-01T09:00:00Z");
  assert.equal(report.agedStock[0].idleDays, 95);
  assert.equal(report.sales.month.totalUnits, 0);
});

test("partial reversals reduce original units and revenue, including across periods", () => {
  const history = normalizePulseSales([], [
    pulseAudit({ created_at: "2026-09-10T09:00:00Z", metadata: { qty: 3, grade: "normal", outlet: "unilorin", price: 100 } }),
    reversal({ details: "Reversed sale: added 1 back to normal at unilorin (reversal of audit log a1111111)." }),
  ], [], PULSE_HISTORY_START, PULSE_NOW);
  assert.equal(history.sales[0].units, 2);
  assert.equal(history.sales[0].revenue, 200);
  const periods = buildDemandReports(history.sales, [], PULSE_NOW);
  assert.equal(periods.month.totalUnits, 0);
  assert.equal(periods.month.previousUnits, 2);
  assert.equal(periods.month.previousRevenue, 200);
});

test("verified orders count once alongside admin/rep deductions; pending orders and rollback attempts do not count", () => {
  const orders = [
    pulseOrder(),
    pulseOrder({ order_id: "e5555555-5555-5555-5555-555555555555", product_id: "rep-product", quantity: 3, total_price: 300,
      orders: { status: "paid", updated_at: "2026-11-03T10:01:00Z" } }),
    pulseOrder({ order_id: "pending", product_id: "pending-product", orders: { status: "pending", updated_at: "2026-11-03T09:01:00Z" } }),
    pulseOrder({ order_id: "cancelled", orders: { status: "cancelled", updated_at: "2026-11-03T09:01:00Z" } }),
  ];
  const history = normalizePulseSales(orders, [
    pulseAudit({ admin_id: "order-verify-b2222222" }),
    pulseAudit({ id: "rep-deduction", admin_id: "rep-verify-12345678", product_id: "rep-product", created_at: "2026-11-03T10:00:00Z", metadata: { qty: 3, grade: "normal", outlet: "unilorin", price: 100 } }),
    pulseAudit({ id: "failed-deduction", admin_id: "order-verify-pending", product_id: "pending-product" }),
    pulseAudit({ id: "direct-sale", product_id: "direct-product", metadata: { qty: 4, grade: "normal", outlet: "unilorin", price: 50 } }),
  ], [], PULSE_HISTORY_START, PULSE_NOW);
  assert.equal(history.sales.length, 3);
  assert.equal(history.sales.reduce((sum, sale) => sum + sale.units, 0), 9);
  assert.equal(history.sales.reduce((sum, sale) => sum + sale.revenue, 0), 20_500);
  assert.equal(history.sales.find((sale) => sale.productId === "product-one")?.soldAt, "2026-11-03T09:00:00Z");
});

test("a linked reversal of an admin order cancels its order item", () => {
  const history = normalizePulseSales([pulseOrder()], [pulseAudit({ admin_id: "order-verify-b2222222" }), reversal()], [], PULSE_HISTORY_START, PULSE_NOW);
  assert.deepEqual(history.sales, []);
  assert.deepEqual(history.uncertainKeys, []);
});

test("untraceable reversals and malformed sales exclude their product from the promotion shortlist", () => {
  const history = normalizePulseSales([], [
    pulseAudit({ admin_id: "rep-verify-unknown" }), reversal(),
    pulseAudit({ id: "malformed", product_id: "broken", details: "Missing sale quantity", metadata: null }),
  ], [], PULSE_HISTORY_START, PULSE_NOW);
  const report = reportFor([pulseProduct(), pulseProduct({ id: "broken" })], [pulseInventory(), pulseInventory({ product_id: "broken" })], history);
  assert.equal(history.ignoredRecords, 2);
  assert.equal(report.inventorySummary.excludedForHistory, 2);
  assert.equal(report.agedStock.length, 0);
});

test("historical aliases resolve transitively and keep sold goods out of the wrong shortlist", () => {
  const aliases = [
    { alias_product_id: "old", survivor_product_id: "middle" },
    { alias_product_id: "middle", survivor_product_id: "product-one" },
  ];
  const history = normalizePulseSales([], [pulseAudit({ product_id: "old" })], aliases, PULSE_HISTORY_START, PULSE_NOW);
  assert.equal(history.sales[0].productId, "product-one");
  assert.equal(reportFor([pulseProduct()], [pulseInventory()], history).agedStock.length, 0);
  assert.throws(() => productResolver([...aliases, { alias_product_id: "product-one", survivor_product_id: "old" }])("old"), /alias cycle/);
});

test("legacy text sales parse prices; missing prices never invent revenue", () => {
  const history = normalizePulseSales([], [
    pulseAudit({ metadata: null }),
    pulseAudit({ id: "no-price", metadata: null, details: "Deducted 3 from extra at tanke. Remaining: 1", outlet: "tanke" }),
  ], [], PULSE_HISTORY_START, PULSE_NOW);
  assert.equal(history.sales.reduce((sum, sale) => sum + sale.revenue, 0), 20_000);
  assert.equal(history.unpricedUnits, 3);
});

test("calendar-day comparisons use Lagos midnight and do not overlap", () => {
  assert.equal(lagosDate("2026-11-03T23:00:00Z"), "2026-11-04");
  assert.equal(lagosMidnight("2026-11-04"), "2026-11-03T23:00:00.000Z");
  const reports = buildDemandReports([
    pulseSale({ soldAt: "2026-11-03T23:00:00Z", units: 1 }),
    pulseSale({ soldAt: "2026-11-03T22:59:59Z", units: 2 }),
    pulseSale({ soldAt: "2026-10-28T23:00:00Z", units: 4 }),
    pulseSale({ soldAt: "2026-10-28T22:59:59Z", units: 8 }),
  ], [], PULSE_NOW);
  assert.equal(reports.day.totalUnits, 1);
  assert.equal(reports.day.previousUnits, 2);
  assert.equal(reports.week.totalUnits, 7);
  assert.equal(reports.week.previousUnits, 8);
});

test("ABC tiers use contribution to retail value and keep ties together", () => {
  const items = [700, 200, 100, 0].map((stockValue, index) => agedItem({ key: `item-${index}`, stockValue }));
  assignValueBands(items);
  assert.deepEqual(items.map((item) => item.valueBand), ["A", "B", "C", "unpriced"]);
  const ties = [700, 150, 150].map((stockValue, index) => agedItem({ key: `item-${index}`, stockValue }));
  assignValueBands(ties);
  assert.deepEqual(ties.map((item) => item.valueBand), ["A", "B", "B"]);
});

test("local ML learns distinct stock groups reproducibly regardless of input order", () => {
  const items = Array.from({ length: 9 }, (_, i) => agedItem({
    key: `item-${i}`, idleDays: i < 6 ? 180 : 45,
    stockValue: i < 3 ? 1_000_000 : i < 6 ? 100_000 : 1_000,
    availableUnits: i < 3 ? 1 : i < 6 ? 100 : 2, units90: i < 6 ? 0 : 10,
  }));
  assert.deepEqual(categorizeStock(items), { method: "kmeans", sampleSize: 9, clusterCount: 3 });
  assert.ok(items.slice(0, 3).every((item) => item.segment === "value-recovery"));
  assert.ok(items.slice(3, 6).every((item) => item.segment === "stock-heavy"));
  assert.ok(items.slice(6).every((item) => item.segment === "rediscovery"));
  const shuffled = structuredClone(items).reverse();
  categorizeStock(shuffled);
  assert.deepEqual(shuffled.reverse().map((item) => item.segment), items.map((item) => item.segment));
});

test("small or indistinguishable samples explicitly fall back to rules", () => {
  assert.equal(categorizeStock([agedItem()]).method, "rules");
  assert.equal(categorizeStock(Array.from({ length: 10 }, (_, i) => agedItem({ key: `item-${i}` }))).method, "rules");
  assert.equal(categorizeStock([agedItem({ stockValue: 0 })]).method, "none");
  assert.equal(categorizeStock([]).method, "none");
});

test("paging reads past the default API cap and rejects failed or oversized scans", async () => {
  const data = Array.from({ length: 1_005 }, (_, id) => ({ id }));
  const result = await readPulsePages((from, to) => Promise.resolve({ data: data.slice(from, to + 1), error: null }), "test");
  assert.deepEqual(result, data);
  await assert.rejects(readPulsePages((from, to) => Promise.resolve({ data: data.slice(from, to + 1), error: null }), "test", 1_000), /exceeds 1000/);
  await assert.rejects(readPulsePages((from, to) => Promise.resolve(from ? { data: null, error: { message: "offline" } } : { data: data.slice(from, to + 1), error: null }), "test"), /offline/);
  assert.deepEqual(await readPulsePages(() => Promise.resolve({ data: [], error: null }), "test"), []);
  assert.equal((await readPulsePages((from, to) => Promise.resolve({ data: data.slice(0, 1_000).slice(from, to + 1), error: null }), "test", 1_000)).length, 1_000);
});
