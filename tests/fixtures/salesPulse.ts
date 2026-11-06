import { buildSalesPulseReport } from "../../lib/salesPulse/analytics";
import { lagosDate, lagosMidnight, shiftDate } from "../../lib/salesPulse/dates";
import { SALES_HISTORY_DAYS, type AgedStockItem, type PulseAuditRow, type PulseInventory, type PulseOrderItem, type PulseProduct, type PulseSale } from "../../lib/salesPulse/types";

export const PULSE_NOW = "2026-11-04T09:00:00.000Z";
export const PULSE_HISTORY_START = lagosMidnight(shiftDate(lagosDate(PULSE_NOW), 1 - SALES_HISTORY_DAYS));

export function pulseProduct(overrides: Partial<PulseProduct> = {}): PulseProduct {
  return { id: "product-one", name: "Amber Classic", category: "100MLs", price: 10_000, created_at: "2026-01-01T09:00:00Z", ...overrides };
}

export function pulseInventory(overrides: Partial<PulseInventory> = {}): PulseInventory {
  return { product_id: "product-one", outlet: "unilorin", grade: "normal", quantity: 10, reserved_quantity: 0, ...overrides };
}

export function pulseSale(overrides: Partial<PulseSale> = {}): PulseSale {
  return { productId: "product-one", productName: "Amber Classic", outlet: "unilorin", grade: "normal", soldAt: "2026-09-01T10:00:00Z", units: 2, revenue: 20_000, ...overrides };
}

export function pulseAudit(overrides: Partial<PulseAuditRow> = {}): PulseAuditRow {
  return {
    id: "a1111111-1111-1111-1111-111111111111", product_id: "product-one", action: "SALE",
    outlet: "unilorin", admin_id: "admin", created_at: "2026-11-03T09:00:00Z",
    details: "Deducted 2 from normal at unilorin @ ₦10,000. Remaining: 5",
    metadata: { qty: 2, grade: "normal", outlet: "unilorin", price: 10_000 },
    ...overrides,
  };
}

export function pulseOrder(overrides: Partial<PulseOrderItem> = {}): PulseOrderItem {
  return {
    order_id: "b2222222-2222-2222-2222-222222222222", product_id: "product-one", product_name: "Amber Classic",
    outlet: "unilorin", grade: "normal", quantity: 2, unit_price: 10_000, total_price: 20_000,
    orders: { status: "paid", updated_at: "2026-11-03T09:01:00Z" }, ...overrides,
  };
}

export function agedItem(overrides: Partial<AgedStockItem> = {}): AgedStockItem {
  return {
    key: "product-one|unilorin", productId: "product-one", productName: "Amber Classic", category: "100MLs",
    outlet: "unilorin", availableUnits: 10, grades: { normal: 10 }, unitPrice: 10_000, stockValue: 100_000,
    lastSoldAt: "2026-09-01T10:00:00Z", idleDays: 64, observationStart: "2026-09-01", units90: 2,
    otherOutletUnits30: 0, valueBand: "A", segment: "value-recovery", priorityScore: 85,
    ...overrides,
  };
}

export function pulseFixture(count = 9) {
  const products = Array.from({ length: count }, (_, i) => pulseProduct({
    id: `product-${i}`, name: `Spotlight ${i + 1}`, category: ["100MLs", "Body care", "Gift sets"][i % 3],
    price: i === count - 1 ? 0 : [30_000, 10_000, 2_000][i % 3],
  }));
  return buildSalesPulseReport({
    generatedAt: PULSE_NOW, refreshAfter: "2026-11-04T10:00:00.000Z", historyStart: PULSE_HISTORY_START,
    products,
    inventory: products.map((product, i) => pulseInventory({
      product_id: product.id, outlet: i % 2 === 0 ? "unilorin" : "tanke", quantity: [3, 30, 6][i % 3], reserved_quantity: 1,
    })),
    history: {
      sales: products.slice(0, 5).map((product, i) => pulseSale({
        productId: product.id, productName: product.name, outlet: i % 2 === 0 ? "unilorin" : "tanke",
        soldAt: ["2026-05-01T10:00:00Z", "2026-08-01T10:00:00Z", "2026-09-20T10:00:00Z"][i % 3],
      })), uncertainKeys: [], ignoredRecords: 0, unpricedUnits: 0,
    },
  });
}

/** A mixed, multi-boutique content queue, including legacy category placement. */
export function contentFixture(perCategory = 16) {
  const products = Array.from({ length: 5 }, (_, group) => Array.from({ length: perCategory }, (_, i) => {
    const number = String(i + 1).padStart(2, "0");
    const name = [
      `Oud Selection ${number} 100ml`,
      `Pocket Scent ${number} ${[50, 25, 30, 5, 10][i % 5]}ml`,
      `${["Body Spray", "Body Mist", "Reed Diffuser", "Air Freshener", "Body Lotion", "Pure Honey"][i % 6]} ${number}`,
      `${["Embroidered Cap", "Prayer Mat", "Zamzam Water", "Jalabia"][i % 4]} ${number}`,
      `Gift Accessory ${number}`,
    ][group];
    return pulseProduct({
      id: `content-${group}-${i}`, name,
      category: ["100MLs", "Miniatures", i % 6 === 5 ? "Islamic Materials" : "Extra goods", "Accessories", "Uncategorised"][group],
      price: group === 4 && i === perCategory - 1 ? 0
        : group === 0 ? (i % 3 === 0 ? 6_000 : 30_000)
          : i % 7 === 0 ? 18_000 : [0, 5_000, 4_000, 6_000, 2_000][group],
    });
  })).flat();
  const inventory = products.flatMap((product, i) => {
    const primary = i % 2 === 0 ? "unilorin" : "tanke";
    return [
      pulseInventory({ product_id: product.id, outlet: primary, quantity: 4 + i % 7, reserved_quantity: 1 }),
      ...(i % 5 === 0 ? [pulseInventory({ product_id: product.id, outlet: primary === "unilorin" ? "tanke" : "unilorin", quantity: 4, reserved_quantity: 1 })] : []),
    ];
  });
  return buildSalesPulseReport({
    generatedAt: PULSE_NOW, refreshAfter: "2026-11-04T10:00:00Z", historyStart: PULSE_HISTORY_START, products, inventory,
    history: {
      sales: inventory.filter((_, i) => i % 3 !== 0).map((row, i) => pulseSale({
        productId: row.product_id, outlet: row.outlet,
        soldAt: `${shiftDate(lagosDate(PULSE_NOW), -(90 + i % 18 * 7))}T10:00:00Z`,
      })), uncertainKeys: [], ignoredRecords: 0, unpricedUnits: 0,
    },
  });
}
