// app/actions/ambassadorActions.ts
// Ambassador QR campaign server actions. Two access levels:
//   PUBLIC — getAmbassadorOfferAction: callable by the storefront claim card
//            after a customer scans /store?ambassador=CODE. Validates the code
//            server-side and returns only the public products + prices.
//   ADMIN  — everything else: gated by requireAdminSession. Creates the
//            ambassadors and their QR-ready codes, manages the global product
//            set, and reports redemptions.

"use server";

import { requireAdminSession } from "@/lib/auth/session";
import {
  ambassadorPrice,
  canonicalAmbassadorCode,
  isFa50ProductName,
} from "@/lib/ambassadors";
import {
  createAmbassador,
  defaultAmbassadorProductIds,
  deleteAmbassador,
  getAmbassadorByCode,
  getCachedMasterProducts,
  listAmbassadors,
  resetAmbassadorProducts,
  resolveAmbassadorProductIds,
  setAmbassadorProduct,
  updateAmbassador,
  type AmbassadorRow,
} from "@/lib/master/ambassadors";
import { getAmbassadorStats, pruneStaleAmbassadorRedemptions, type AmbassadorStats } from "@/lib/archive/ambassadorRedemptions";
import { getStoreProducts } from "@/lib/storefront/data";

export interface AmbassadorOfferProduct {
  id: string;
  name: string;
  imageUrl: string;
  realPrice: number;
  ambassadorPrice: number;
  /** Boutiques that can fulfil this product today. */
  outlets: string[];
}

export interface AmbassadorOffer {
  code: string;
  name: string;
  /** Invite link to the ambassador's WhatsApp group, where the buyer posts the
   *  order and payment screenshot. Null when the admin has not set one. */
  whatsappGroupUrl: string | null;
  products: AmbassadorOfferProduct[];
}

export type AmbassadorOfferResult =
  | { available: true; offer: AmbassadorOffer }
  | { available: false; reason: "unknown" | "inactive" | "unconfigured" };

/**
 * The public product card behind an ambassador QR. Returns the global
 * ambassador set, priced with the ambassador formula, against each product's
 * real Master price. Only products that are genuinely below the regular shelf
 * price are offered, so the card can never advertise a "discount" that is
 * more expensive than shopping normally.
 */
export async function getAmbassadorOfferAction(code: string): Promise<AmbassadorOfferResult> {
  const canonical = canonicalAmbassadorCode(code);
  if (!canonical) return { available: false, reason: "unknown" };

  const ambassador = await getAmbassadorByCode(canonical);
  if (!ambassador) return { available: false, reason: "unknown" };
  if (!ambassador.is_active) return { available: false, reason: "inactive" };

  const [productIds, storefront, masterProducts] = await Promise.all([
    resolveAmbassadorProductIds(),
    getStoreProducts(),
    getCachedMasterProducts(),
  ]);

  const idSet = new Set(productIds);
  const masterMap = new Map(masterProducts.map((product) => [product.id, product]));

  const products = storefront
    .filter((product) => idSet.has(product.id))
    .map((product) => {
      const master = masterMap.get(product.id);
      const realPrice = Number(master?.price ?? product.price ?? 0);
      const amb = ambassadorPrice(realPrice, master?.discount_price ?? null);
      // Never offer a product whose ambassador price is not below the price a
      // normal shopper pays today.
      if (amb == null || amb >= product.price) return null;
      const outlets = product.outlets.filter((outlet) => (product.outletStock[outlet] ?? 0) > 0);
      if (outlets.length === 0) return null;
      return {
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        realPrice,
        ambassadorPrice: amb,
        outlets,
      };
    })
    .filter((product): product is AmbassadorOfferProduct => product !== null)
    .sort((a, b) => a.ambassadorPrice - b.ambassadorPrice);

  if (products.length === 0) return { available: false, reason: "unconfigured" };
  return {
    available: true,
    offer: {
      code: ambassador.code,
      name: ambassador.name,
      whatsappGroupUrl: ambassador.whatsapp_group_url ?? null,
      products,
    },
  };
}

// ─── Admin ───

export interface AmbassadorSummary extends AmbassadorRow {
  stats: AmbassadorStats;
}

export async function listAmbassadorsAction(): Promise<AmbassadorSummary[]> {
  await requireAdminSession();
  // Opportunistically expire stale unpaid attribution rows so the ledger stays
  // tiny without any scheduled job. Best-effort — a prune failure must not
  // stop the admin list from loading. Paid rows are never removed.
  try {
    await pruneStaleAmbassadorRedemptions(30);
  } catch (err) {
    console.error("[ambassadors] unpaid prune skipped:", err instanceof Error ? err.message : err);
  }
  const ambassadors = await listAmbassadors();
  const stats = await getAmbassadorStats(ambassadors.map((a) => a.code));
  return ambassadors.map((ambassador) => ({
    ...ambassador,
    stats: stats[ambassador.code] ?? { redemptions: 0, revenue: 0, lastAt: null },
  }));
}

export async function createAmbassadorAction(name: string, code?: string): Promise<AmbassadorRow> {
  await requireAdminSession();
  return createAmbassador(name, code);
}

export async function updateAmbassadorAction(
  id: string,
  patch: { name?: string; is_active?: boolean; whatsapp_group_url?: string | null },
): Promise<AmbassadorRow> {
  await requireAdminSession();
  return updateAmbassador(id, patch);
}

export async function deleteAmbassadorAction(id: string): Promise<{ success: true }> {
  await requireAdminSession();
  await deleteAmbassador(id);
  return { success: true };
}

/** Admin: immediately prune stale unpaid attribution rows (same as the auto-pass). */
export async function pruneAmbassadorUnpaidAction(): Promise<{ removed: number }> {
  await requireAdminSession();
  const removed = await pruneStaleAmbassadorRedemptions(30);
  return { removed };
}

export interface AmbassadorProductOption {
  id: string;
  name: string;
  realPrice: number;
  ambassadorPrice: number | null;
  selected: boolean;
  isDefaultFa50: boolean;
}

/** Every catalog product with its computed ambassador price and set membership. */
export async function listAmbassadorProductOptionsAction(): Promise<AmbassadorProductOption[]> {
  await requireAdminSession();
  const [products, selectedIds] = await Promise.all([
    getCachedMasterProducts(),
    resolveAmbassadorProductIds(),
  ]);
  const selected = new Set(selectedIds);
  return products
    .map((product) => ({
      id: product.id,
      name: product.name,
      realPrice: Number(product.price ?? 0),
      ambassadorPrice: ambassadorPrice(Number(product.price ?? 0), product.discount_price),
      selected: selected.has(product.id),
      isDefaultFa50: isFa50ProductName(product.name),
    }))
    .sort((a, b) => {
      if (a.selected !== b.selected) return a.selected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function setAmbassadorProductAction(
  productId: string,
  include: boolean,
): Promise<{ success: true }> {
  await requireAdminSession();
  await setAmbassadorProduct(productId, include);
  return { success: true };
}

export async function resetAmbassadorProductsAction(): Promise<{ success: true; count: number }> {
  await requireAdminSession();
  await resetAmbassadorProducts();
  const defaults = await defaultAmbassadorProductIds();
  return { success: true, count: defaults.length };
}
