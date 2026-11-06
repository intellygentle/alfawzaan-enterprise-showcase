// lib/discounts.ts — pure helpers for bulk discount operations

export type BulkDiscountMode = "percent" | "fixed";

/**
 * Compute the discounted price for one product under a bulk operation.
 *
 * Returns null when the result would be invalid — not a positive whole-naira
 * price strictly below the normal price — so callers can skip that product
 * and report why, instead of failing the whole batch.
 */
export function computeBulkDiscountPrice(
  normalPrice: number,
  mode: BulkDiscountMode,
  value: number
): number | null {
  if (!Number.isFinite(normalPrice) || normalPrice <= 0) return null;
  if (!Number.isFinite(value)) return null;

  let discounted: number;
  if (mode === "percent") {
    if (value <= 0 || value >= 100) return null;
    discounted = Math.round((normalPrice * (100 - value)) / 100);
  } else {
    if (value <= 0) return null;
    discounted = Math.round(value);
  }

  if (discounted <= 0 || discounted >= normalPrice) return null;
  return discounted;
}
