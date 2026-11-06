// lib/ambassadors.ts — pure helpers for the ambassador QR campaign.
// Shared by the storefront claim card, the admin QR builder, and checkout.
// No imports: keep it usable from both the browser and server bundles.
//
// Pricing rule (management's, verbatim): take each eligible product's EXISTING
// stored discount price, add ₦1,000, then cut ₦500 back out. Net: the base
// discount price + ₦500. For the 50ml FA line that is ₦4,000 → ₦4,500 against
// a real price of ₦6,500, which is exactly what the ambassador card advertises.

export const AMBASSADOR_CODE_PREFIX = "AMB-";
export const AMBASSADOR_CODE_PATTERN = /^AMB-[A-Z0-9]{4,10}$/;

export const AMBASSADOR_BASE_MARKUP_NAIRA = 1_000;
export const AMBASSADOR_CUSTOMER_CUT_NAIRA = 500;
/** Net effect of the markup then cut: +₦500 over the stored discount price. */
export const AMBASSADOR_NET_UPCHARGE_NAIRA =
  AMBASSADOR_BASE_MARKUP_NAIRA - AMBASSADOR_CUSTOMER_CUT_NAIRA;

/**
 * When a product in the ambassador set has no stored discount price to derive
 * from (an admin added a product that never carried one), assume the catalogue's
 * observed 50ml FA gap of ₦2,500 below the real price before the markup/cut.
 * That keeps the advertised figure a genuine below-MSRP discount instead of
 * dropping the product entirely.
 */
export const AMBASSADOR_ASSUMED_DISCOUNT_NAIRA = 2_500;

/** Public storefront origin encoded into every ambassador QR code. */
export const PUBLIC_STORE_ORIGIN = "https://www.alfawzaanenterprise.ng";

/**
 * Does this product name look like the 50ml FA line? Token-based so it matches
 * "Ameer al oud 50ml FA", "Barakat FA 50ml (White,Red,Satin)", "Hayati Black
 * 50ml FA", etc., without matching unrelated words that merely contain "fa"
 * (e.g. "Fragrance").
 */
export function isFa50ProductName(name: string): boolean {
  const tokens: string[] = name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const hasFa = tokens.includes("fa");
  const has50ml = tokens.includes("50ml") || tokens.includes("50m") || tokens.some((t) => /^50ml/.test(t));
  return hasFa && has50ml;
}

/** Accepts "AMB-XXXX" or a bare reference and returns the canonical form. */
export function canonicalAmbassadorCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (AMBASSADOR_CODE_PATTERN.test(trimmed)) return trimmed;
  const ref = trimmed.replace(/^AMB-?/, "");
  if (/^[A-Z0-9]{4,10}$/.test(ref)) return `${AMBASSADOR_CODE_PREFIX}${ref}`;
  return null;
}

/**
 * Random, unambiguous reference (no 0/O/1/I) for a new ambassador code.
 * Uses Web Crypto, available in both the browser and Node 18+.
 */
export function randomAmbassadorRef(length = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function makeAmbassadorCode(): string {
  return `${AMBASSADOR_CODE_PREFIX}${randomAmbassadorRef()}`;
}

/**
 * The ambassador price for one product: base discount + ₦1,000 − ₦500.
 * Returns null when no valid below-normal price can be produced, so callers
 * can skip the product rather than advertise a broken figure.
 */
export function ambassadorPrice(
  normalPrice: number,
  baseDiscountPrice?: number | null,
): number | null {
  const normal = Number(normalPrice);
  if (!Number.isFinite(normal) || normal <= 0) return null;

  const rawBase = Number(baseDiscountPrice);
  const base =
    Number.isFinite(rawBase) && rawBase > 0 && rawBase < normal
      ? rawBase
      : Math.max(0, normal - AMBASSADOR_ASSUMED_DISCOUNT_NAIRA);

  const price = Math.round(base + AMBASSADOR_NET_UPCHARGE_NAIRA);
  if (!Number.isFinite(price) || price <= 0 || price >= normal) return null;
  return price;
}

/** The URL the QR code encodes, e.g. .../store?ambassador=AMB-7K2P9Q. */
export function ambassadorStoreUrl(code: string, origin: string = PUBLIC_STORE_ORIGIN): string {
  const canonical = canonicalAmbassadorCode(code) ?? code;
  return `${origin.replace(/\/$/, "")}/store?ambassador=${encodeURIComponent(canonical)}`;
}

/**
 * The ambassador's private read-only sales portal. The token makes the link
 * unguessable; without it the page refuses to render. Kept on the same origin
 * as the store so it needs no separate host.
 */
export function ambassadorPortalUrl(
  code: string,
  token: string,
  origin: string = PUBLIC_STORE_ORIGIN,
): string {
  const canonical = canonicalAmbassadorCode(code) ?? code;
  return `${origin.replace(/\/$/, "")}/ambassador/${encodeURIComponent(canonical)}?token=${encodeURIComponent(token)}`;
}

/** Order-status buckets the portal and pruner share. */
export function isPaidOrderStatus(status: string | null | undefined): boolean {
  return status === "paid" || status === "shipping" || status === "delivered";
}

/** Order note so the boutique can see the order arrived via an ambassador. */
export function ambassadorOrderNote(
  code: string,
  ambassadorName: string | null | undefined,
  amountOff: number,
): string {
  const name = ambassadorName ? ` (${ambassadorName})` : "";
  return `🤝 Ambassador ${code}${name}: ₦${Math.max(0, Math.round(amountOff)).toLocaleString()} off eligible items.`;
}

/** Audit-log detail for a redemption record. */
export function ambassadorAuditDetails(
  code: string,
  ambassadorName: string | null | undefined,
): string {
  const name = ambassadorName ? ` (${ambassadorName})` : "";
  return `Ambassador ${code}${name} link used to place an order.`;
}
