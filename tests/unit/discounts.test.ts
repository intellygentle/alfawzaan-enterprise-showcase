import assert from "node:assert/strict";
import test from "node:test";
import { resolveActiveDiscount } from "../../lib/types";
import { mergeInventoryWithProducts } from "../../lib/inventory";
import { computeBulkDiscountPrice } from "../../lib/discounts";

// Dates are derived from the current time so these tests never rot: a
// "future" expiry is always in the future, a "past" one always in the past.
// (The originals hardcoded 2026-09-07/14, which expired and broke the suite.)
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();
const FUTURE = new Date(NOW + 7 * 24 * HOUR).toISOString();
const PAST = new Date(NOW - 7 * 24 * HOUR).toISOString();

const baseProduct = {
  id: "prod-1",
  name: "Oud Touch",
  category: "100MLs",
  description: null,
  base_image_url: null,
  price: 10000,
};

const stockRow = (grade: string, quantity = 5) => ({
  product_id: "prod-1",
  price: 10000,
  grade,
  quantity,
  reserved_quantity: 0,
});

test("resolveActiveDiscount returns the discount while the expiry is in the future", () => {
  const result = resolveActiveDiscount(
    { price: 10000, discount_price: 7500, discount_expires_at: FUTURE },
    NOW
  );
  assert.ok(result);
  assert.equal(result.discountPrice, 7500);
  assert.equal(result.expiresAt, FUTURE);
});

test("resolveActiveDiscount is null after expiry so prices revert automatically", () => {
  assert.equal(
    resolveActiveDiscount(
      { price: 10000, discount_price: 7500, discount_expires_at: PAST },
      NOW
    ),
    null
  );
});

test("resolveActiveDiscount ignores invalid discounts", () => {
  // No discount set
  assert.equal(resolveActiveDiscount({ price: 10000 }, NOW), null);
  // Discount at or above the normal price
  assert.equal(
    resolveActiveDiscount({ price: 10000, discount_price: 10000, discount_expires_at: FUTURE }, NOW),
    null
  );
  assert.equal(
    resolveActiveDiscount({ price: 10000, discount_price: 12000, discount_expires_at: FUTURE }, NOW),
    null
  );
  // Zero / negative price
  assert.equal(
    resolveActiveDiscount({ price: 10000, discount_price: 0, discount_expires_at: FUTURE }, NOW),
    null
  );
  // Price set without an expiry
  assert.equal(
    resolveActiveDiscount({ price: 10000, discount_price: 7500, discount_expires_at: null }, NOW),
    null
  );
});

test("mergeInventoryWithProducts uses the active discount price and keeps the normal price", () => {
  const [merged] = mergeInventoryWithProducts(
    [{ ...baseProduct, discount_price: 7500, discount_expires_at: FUTURE }],
    [stockRow("normal")],
    []
  );
  assert.equal(merged.price, 7500);
  assert.equal(merged.originalPrice, 10000);
  assert.equal(merged.discountExpiresAt, FUTURE);
});

test("mergeInventoryWithProducts reverts to the normal price once the discount expires", () => {
  const [merged] = mergeInventoryWithProducts(
    [{ ...baseProduct, discount_price: 7500, discount_expires_at: PAST }],
    [stockRow("normal")],
    []
  );
  assert.equal(merged.price, 10000);
  assert.equal(merged.originalPrice, undefined);
  assert.equal(merged.discountExpiresAt, undefined);
});

test("mergeInventoryWithProducts keeps the normal price when no discount is set", () => {
  const [merged] = mergeInventoryWithProducts(
    [baseProduct],
    [stockRow("normal")],
    []
  );
  assert.equal(merged.price, 10000);
  assert.equal(merged.originalPrice, undefined);
});

test("computeBulkDiscountPrice applies a percentage off each product's own price", () => {
  assert.equal(computeBulkDiscountPrice(2500, "percent", 20), 2000);
  assert.equal(computeBulkDiscountPrice(5500, "percent", 27), 4015);
  assert.equal(computeBulkDiscountPrice(1000, "percent", 50), 500);
});

test("computeBulkDiscountPrice rounds to whole naira", () => {
  // 999 × 0.75 = 749.25 → 749
  assert.equal(computeBulkDiscountPrice(999, "percent", 25), 749);
});

test("computeBulkDiscountPrice rejects invalid percentages", () => {
  assert.equal(computeBulkDiscountPrice(2500, "percent", 0), null);
  assert.equal(computeBulkDiscountPrice(2500, "percent", 100), null);
  assert.equal(computeBulkDiscountPrice(2500, "percent", 150), null);
});

test("computeBulkDiscountPrice accepts fixed prices strictly below the normal price", () => {
  assert.equal(computeBulkDiscountPrice(5500, "fixed", 4000), 4000);
  assert.equal(computeBulkDiscountPrice(5500, "fixed", 5500), null);
  assert.equal(computeBulkDiscountPrice(5500, "fixed", 6000), null);
  assert.equal(computeBulkDiscountPrice(5500, "fixed", 0), null);
  assert.equal(computeBulkDiscountPrice(5500, "fixed", -100), null);
});

test("computeBulkDiscountPrice rejects products without a usable normal price", () => {
  assert.equal(computeBulkDiscountPrice(0, "percent", 20), null);
  assert.equal(computeBulkDiscountPrice(-5, "fixed", 100), null);
  assert.equal(computeBulkDiscountPrice(Number.NaN, "percent", 20), null);
});
