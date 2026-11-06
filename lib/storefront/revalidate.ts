// lib/storefront/revalidate.ts
// Cache tags + invalidation helper for the storefront's server-side data cache.
// Import from server actions / "use server" modules only — revalidateTag cannot
// run during render.

import { revalidateTag } from "next/cache";

export const CATALOG_TAG = "storefront-catalog";
export const INVENTORY_TAG = "storefront-inventory";
/**
 * Cache tag for the admin Data Health integrity report. The report scans every
 * catalog/order/inventory table (all four databases), so it is cached; this tag
 * lets "Run Again" and a completed price repair force it to recompute instead of
 * re-reading thousands of rows on every tab visit.
 */
export const INTEGRITY_TAG = "admin-integrity-report";

export type StorefrontScope = "catalog" | "inventory" | "both";

/**
 * Invalidate the storefront's cached data. Call from server actions after any
 * mutation that shoppers should see quickly (price changes, discounts, stock
 * movements, product uploads/deletions).
 */
export function revalidateStorefront(scope: StorefrontScope = "both") {
  if (scope === "catalog" || scope === "both") revalidateTag(CATALOG_TAG, "max");
  if (scope === "inventory" || scope === "both") revalidateTag(INVENTORY_TAG, "max");
}
