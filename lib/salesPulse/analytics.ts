import type { Grade } from "../types";
import { categorizeStock } from "./clustering";
import { calendarDays, lagosDate, shiftDate } from "./dates";
import { pulseItemKey } from "./sales";
import {
  MIN_IDLE_DAYS, type AgedStockItem, type NormalizedPulseSales, type PulseInventory,
  type PulseProduct, type PulseSale, type SalesAnalyticsPeriod, type SalesAnalyticsProduct,
  type SalesAnalyticsReport, type SalesPulseReport, type ValueBand,
} from "./types";

const PERIODS: Record<SalesAnalyticsPeriod, { days: number; label: string }> = {
  day: { days: 1, label: "Today" },
  week: { days: 7, label: "Last 7 days" },
  month: { days: 30, label: "Last 30 days" },
  year: { days: 365, label: "Last 12 months" },
};
const moneyRound = (value: number) => Math.round(value * 100) / 100;

/** All four periods are calculated from one history read, including comparisons. */
export function buildDemandReports(
  sales: PulseSale[], products: PulseProduct[], generatedAt: string,
): Record<SalesAnalyticsPeriod, SalesAnalyticsReport> {
  const today = lagosDate(generatedAt);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const dated = sales.map((sale) => ({ sale, date: lagosDate(sale.soldAt) }));
  return Object.fromEntries(Object.entries(PERIODS).map(([key, period]) => {
    const start = shiftDate(today, 1 - period.days);
    const previousStart = shiftDate(start, -period.days);
    const current = dated.filter(({ date }) => date >= start && date <= today).map(({ sale }) => sale);
    const previous = dated.filter(({ date }) => date >= previousStart && date < start).map(({ sale }) => sale);
    const totals = (rows: PulseSale[]) => ({
      units: rows.reduce((sum, sale) => sum + sale.units, 0),
      revenue: moneyRound(rows.reduce((sum, sale) => sum + sale.revenue, 0)),
    });
    const grouped = new Map<string, SalesAnalyticsProduct>();
    for (const sale of current) {
      const existing = grouped.get(sale.productId);
      if (existing) {
        existing.units += sale.units;
        existing.revenue = moneyRound(existing.revenue + sale.revenue);
        if (!existing.outlets.includes(sale.outlet)) existing.outlets.push(sale.outlet);
      } else {
        const product = productMap.get(sale.productId);
        grouped.set(sale.productId, {
          productId: sale.productId,
          productName: product?.name || sale.productName || `Product ${sale.productId.slice(0, 8)}`,
          category: product?.category ?? null, imageUrl: product?.base_image_url ?? null,
          units: sale.units, revenue: sale.revenue, outlets: [sale.outlet],
        });
      }
    }
    const total = totals(current);
    const prior = totals(previous);
    const report: SalesAnalyticsReport = {
      period: key as SalesAnalyticsPeriod, periodLabel: period.label, generatedAt,
      periodStart: start, periodEnd: today,
      totalUnits: total.units, totalRevenue: total.revenue,
      previousUnits: prior.units, previousRevenue: prior.revenue,
      topProducts: [...grouped.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue || a.productId.localeCompare(b.productId)).slice(0, 8),
      outletSummary: (["unilorin", "tanke"] as const).map((outlet) => ({ outlet, ...totals(current.filter((sale) => sale.outlet === outlet)) })),
    };
    return [key, report];
  })) as Record<SalesAnalyticsPeriod, SalesAnalyticsReport>;
}

/** ABC contribution to the aged stock's retail value (roughly 70% / 20% / 10%). */
export function assignValueBands(items: AgedStockItem[]): void {
  const ordered = [...items].sort((a, b) => b.stockValue - a.stockValue || a.key.localeCompare(b.key));
  const total = ordered.reduce((sum, item) => sum + item.stockValue, 0);
  let accumulated = 0;
  let previousValue = -1;
  let band: ValueBand = "A";
  for (const item of ordered) {
    if (item.stockValue <= 0) { item.valueBand = "unpriced"; continue; }
    // Equal-value goods stay in the same band, even across a cut-off.
    if (item.stockValue !== previousValue) band = accumulated / total < 0.7 ? "A" : accumulated / total < 0.9 ? "B" : "C";
    item.valueBand = band;
    previousValue = item.stockValue;
    accumulated += item.stockValue;
  }
}

export function buildSalesPulseReport(input: {
  generatedAt: string;
  refreshAfter: string;
  historyStart: string;
  products: PulseProduct[];
  inventory: PulseInventory[];
  history: NormalizedPulseSales;
}): SalesPulseReport {
  const { generatedAt, refreshAfter, historyStart, products, inventory, history } = input;
  const today = lagosDate(generatedAt);
  const startDate = lagosDate(historyStart);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const uncertain = new Set(history.uncertainKeys);
  const stock = new Map<string, { productId: string; outlet: PulseInventory["outlet"]; units: number; grades: Partial<Record<Grade, number>> }>();
  let invalidStockRows = 0;
  for (const row of inventory) {
    const quantity = Number(row.quantity);
    const reserved = Number(row.reserved_quantity ?? 0);
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(reserved) || quantity < 0 || reserved < 0 || !["special", "extra", "normal"].includes(row.grade)) {
      invalidStockRows++;
      uncertain.add(pulseItemKey(row.product_id, row.outlet));
      continue;
    }
    // Clamp per grade, BEFORE summing: an over-reserved shelf cannot borrow
    // available units from another grade or from the other boutique.
    const available = Math.max(0, quantity - reserved);
    if (available === 0) continue;
    const key = pulseItemKey(row.product_id, row.outlet);
    const entry = stock.get(key) ?? { productId: row.product_id, outlet: row.outlet, units: 0, grades: {} };
    const grade = row.grade as Grade;
    entry.units += available;
    entry.grades[grade] = (entry.grades[grade] ?? 0) + available;
    stock.set(key, entry);
  }

  const salesByItem = new Map<string, { last: string; units90: number; units30: number }>();
  const since90 = shiftDate(today, -89);
  const since30 = shiftDate(today, -29);
  for (const sale of history.sales) {
    const key = pulseItemKey(sale.productId, sale.outlet);
    const entry = salesByItem.get(key) ?? { last: sale.soldAt, units90: 0, units30: 0 };
    if (Date.parse(sale.soldAt) > Date.parse(entry.last)) entry.last = sale.soldAt;
    const date = lagosDate(sale.soldAt);
    if (date >= since90) entry.units90 += sale.units;
    if (date >= since30) entry.units30 += sale.units;
    salesByItem.set(key, entry);
  }

  const agedStock: AgedStockItem[] = [];
  const inventorySummary = { availableUnits: 0, retailValue: 0, excludedForHistory: 0, missingProducts: 0, unknownAge: 0 };
  for (const [key, entry] of stock) {
    inventorySummary.availableUnits += entry.units;
    const product = productMap.get(entry.productId);
    if (!product) { inventorySummary.missingProducts++; continue; }
    const price = Number(product.price);
    const unitPrice = Number.isFinite(price) && price > 0 ? price : 0;
    const stockValue = moneyRound(unitPrice * entry.units);
    inventorySummary.retailValue = moneyRound(inventorySummary.retailValue + stockValue);
    if (uncertain.has(key)) { inventorySummary.excludedForHistory++; continue; }
    const sales = salesByItem.get(key);
    const createdAt = product.created_at && Number.isFinite(Date.parse(product.created_at)) ? lagosDate(product.created_at) : null;
    if (!sales && (!createdAt || createdAt > today)) { inventorySummary.unknownAge++; continue; }
    const observationStart = sales ? lagosDate(sales.last) : createdAt! > startDate ? createdAt! : startDate;
    const idleDays = calendarDays(observationStart, today);
    if (idleDays < MIN_IDLE_DAYS) continue;
    const otherOutlet = entry.outlet === "unilorin" ? "tanke" : "unilorin";
    agedStock.push({
      key, productId: product.id, productName: product.name, category: product.category || "Uncategorised",
      outlet: entry.outlet, availableUnits: entry.units, grades: entry.grades,
      unitPrice, stockValue, lastSoldAt: sales?.last ?? null, idleDays, observationStart,
      units90: sales?.units90 ?? 0,
      otherOutletUnits30: salesByItem.get(pulseItemKey(product.id, otherOutlet))?.units30 ?? 0,
      valueBand: "unpriced", segment: "rediscovery", priorityScore: 0,
    });
  }

  assignValueBands(agedStock);
  const model = categorizeStock(agedStock);
  const maxValue = Math.max(1, ...agedStock.map((item) => item.stockValue));
  for (const item of agedStock) {
    // This transparent priority score is a planning rule, separate from ML.
    item.priorityScore = Math.round(
      40 * Math.min(item.idleDays / 180, 1)
      + 40 * Math.log1p(item.stockValue) / Math.log1p(maxValue)
      + 20 * Math.min(item.availableUnits / Math.max(1, item.units90) / 30, 1),
    );
  }
  agedStock.sort((a, b) => b.priorityScore - a.priorityScore || b.stockValue - a.stockValue || a.key.localeCompare(b.key));

  return {
    generatedAt, refreshAfter, historyStart,
    sales: buildDemandReports(history.sales, products, generatedAt),
    agedStock, inventorySummary, model,
    quality: { ignoredRecords: history.ignoredRecords + invalidStockRows, unpricedSalesUnits: history.unpricedUnits },
  };
}
