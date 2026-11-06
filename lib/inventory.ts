// lib/inventory.ts — Shared inventory merge logic

import type { StoreProduct, ProductDiscountFields } from './types';
import { resolveActiveDiscount } from './types';
import { GRADE_PRIORITY, PLACEHOLDER_IMAGE } from './constants';

interface InventoryRow {
  product_id: string;
  price: number;
  grade: string;
  quantity: number;
  reserved_quantity?: number | null;
}

interface MergeResult {
  outlets: string[];
  grade: string;
  outletStock: Record<string, number>;
}

/**
 * Merges inventory rows from both outlets into a per-product map.
 * Tracks outlets, stock, and highest-priority grade. Price comes from the product, not inventory.
 */
function mergeInventoryRows(
  uInv: InventoryRow[],
  tInv: InventoryRow[]
): Map<string, MergeResult> {
  const inventoryMap = new Map<string, MergeResult>();

  const processInv = (inv: InventoryRow[], outletName: string) => {
    for (const item of inv) {
      // Available = total quantity minus reserved for pending orders
      const available = item.quantity - (item.reserved_quantity ?? 0);
      if (available <= 0) continue; // Skip fully reserved items

      const existing = inventoryMap.get(item.product_id);
      if (!existing) {
        inventoryMap.set(item.product_id, {
          outlets: [outletName],
          grade: item.grade,
          outletStock: { [outletName]: available },
        });
      } else {
        // A customer order is assigned to one grade shelf, so advertise the
        // largest quantity one shelf can actually fulfil, not a sum that may be
        // split across incompatible grades.
        existing.outletStock[outletName] = Math.max(
          existing.outletStock[outletName] || 0,
          available,
        );
        if (!existing.outlets.includes(outletName)) {
          existing.outlets.push(outletName);
        }
        const currentPriority = GRADE_PRIORITY[existing.grade] || 0;
        const newPriority = GRADE_PRIORITY[item.grade] || 0;
        if (newPriority > currentPriority) {
          existing.grade = item.grade;
        }
      }
    }
  };

  processInv(uInv, 'Unilorin');
  processInv(tInv, 'Tanke');

  return inventoryMap;
}

/** Catalog reads only need products with a shelf that can still fulfil an order. */
export function getInStockProductIds(uInv: InventoryRow[], tInv: InventoryRow[]): string[] {
  return Array.from(mergeInventoryRows(uInv, tInv).keys()).sort();
}

/**
 * Merges product catalog data with live inventory from both outlets.
 * Uses the product's own price (from master DB) as the single source of truth,
 * substituted by the active discount price when a time-boxed discount is
 * running. Expired discounts are ignored, so prices revert automatically.
 * Returns only products that have at least some stock somewhere by default.
 * Search can explicitly include sold-out products with empty availability.
 */
export function mergeInventoryWithProducts<
  T extends { id: string; name: string; category: string; description?: string | null; base_image_url?: string | null; price?: number | null } & ProductDiscountFields
>(
  products: T[],
  uInv: InventoryRow[],
  tInv: InventoryRow[],
  options: { includeOutOfStock?: boolean } = {}
): StoreProduct[] {
  const inventoryMap = mergeInventoryRows(uInv, tInv);

  return products
    .map((p) => {
      const inv = inventoryMap.get(p.id);
      if (!inv && !options.includeOutOfStock) return null;

      const gradeRaw = inv?.grade || 'normal';
      const grade = (gradeRaw.charAt(0).toUpperCase() + gradeRaw.slice(1)) as 'Special' | 'Extra' | 'Normal';

      const imageUrl =
        p.base_image_url && p.base_image_url.trim() !== ''
          ? p.base_image_url
          : PLACEHOLDER_IMAGE;

      const normalPrice = p.price ?? 0;
      const discount = resolveActiveDiscount(p);

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description ?? undefined,
        price: discount ? discount.discountPrice : normalPrice,
        originalPrice: discount ? normalPrice : undefined,
        discountExpiresAt: discount ? discount.expiresAt : undefined,
        grade,
        outlets: inv?.outlets ?? [],
        outletStock: inv?.outletStock ?? {},
        imageUrl,
      };
    })
    .filter(Boolean) as StoreProduct[];
}
