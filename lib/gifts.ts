// lib/gifts.ts — pure gift-code logic shared by the receipt generator
// (client) and the server-side registration/claim validation. No imports:
// this file must stay dependency-free so it runs identically in the browser,
// in node tests, and inside server actions.

export type GiftTierKey = "normal" | "extra" | "special";

/**
 * Gift codes look like "ALF-9F8E7D6C" — the ALF- prefix plus the first UUID
 * segment of the order id. Validation happens server-side again before any
 * DB write; this pattern only gates the store-page claim card and input forms.
 */
export const GIFT_CODE_PATTERN = /^ALF-[A-Z0-9]{4,12}$/;

/** Price tier thresholds (naira) — mirrors the receipt's fragrance profile. */
export function tierOfPrice(unitPrice: number): GiftTierKey {
  if (unitPrice >= 35_000) return "special";
  if (unitPrice >= 15_000) return "extra";
  return "normal";
}

/**
 * Receipt total (naira) a customer must reach for the gift. Encoded explicitly
 * so the rule survives future tier-threshold changes: today any receipt with a
 * ₦35k+ "special" item already clears ₦30k, but the two rules stay independent.
 */
export const GIFT_MIN_RECEIPT_TOTAL = 30_000;

/**
 * In-store credit (naira) the gift code carries towards an FA 50ml perfume:
 * the current price minus ₦2,500. Applied server-side from the live Master
 * price so the card can never drift from what the boutique actually charges.
 */
export const GIFT_CREDIT_NAIRA = 2_500;

/** Credit price for a perfume under the gift: current price minus ₦2,500. */
export function giftCreditPrice(currentPrice: number): number {
  return Math.max(0, Math.round(currentPrice) - GIFT_CREDIT_NAIRA);
}

/**
 * The FA 50ml perfumes the credit applies to. Matched against the authoritative
 * Master product name, so the storefront claim card and the checkout that
 * redeems the credit can never offer/accept different products. Covers both
 * real catalog spellings: "Barakat FA 50ml" and "Ameer al oud 50ml FA".
 */
export function isGiftEligibleProduct(name: string): boolean {
  return /fa\s*50|50\s*ml\s*fa/i.test(name);
}

/**
 * Order note recorded when a checkout claims the credit. The admin order card
 * renders order.notes, so the claim is visible at verification time even after
 * the customer's WhatsApp chat has scrolled away — and the amounts printed here
 * are the ones actually charged (the browser never sends a price).
 */
export function giftOrderNote(args: {
  code: string;
  originalPrice: number;
  creditPrice: number;
}): string {
  const money = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;
  return (
    `🎁 Gift code ${args.code}: ${money(args.originalPrice)} → ${money(args.creditPrice)} ` +
    `(${money(GIFT_CREDIT_NAIRA)} credit). Redeem the code before verifying.`
  );
}

/**
 * What staff recorded when applying the credit in store. Everything is
 * optional: a claim without product details still logs the credit amount.
 */
export interface GiftCreditApplication {
  productId?: string;
  productName?: string;
  /** Display prices at application time (naira). */
  currentPrice?: number;
  creditPrice?: number;
}

/** Human-readable audit line for an applied gift credit. */
export function giftCreditAuditDetails(productName?: string | null): string {
  const amount = `₦${GIFT_CREDIT_NAIRA.toLocaleString("en-NG")}`;
  return productName
    ? `${amount} credit applied to ${productName}`
    : `${amount} credit applied (product not specified)`;
}

export interface TierQuantities {
  unitPrice: number;
  quantity: number;
}

/** Spend per tier: unit price × quantity, summed per tier key. */
export function computeTierTotals(items: TierQuantities[]): Record<GiftTierKey, number> {
  const totals: Record<GiftTierKey, number> = { normal: 0, extra: 0, special: 0 };
  for (const item of items) {
    totals[tierOfPrice(item.unitPrice)] += item.unitPrice * item.quantity;
  }
  return totals;
}

/** The tier with the highest spend, or null when nothing was purchased. */
export function dominantTierKey(items: TierQuantities[]): GiftTierKey | null {
  const totals = computeTierTotals(items);
  let best: GiftTierKey | null = null;
  for (const key of ["special", "extra", "normal"] as const) {
    if (totals[key] > 0 && (best === null || totals[key] > totals[best])) {
      best = key;
    }
  }
  return best;
}

/**
 * An order earns a gift code when its dominant spend tier is Extravaganza
 * ("special") AND the receipt total reaches GIFT_MIN_RECEIPT_TOTAL. The same
 * rule governs the receipt's printed QR, server-side registration, the admin
 * claim queue, and the store claim card, so they can never disagree.
 */
export function qualifiesForGift(items: TierQuantities[]): boolean {
  if (dominantTierKey(items) !== "special") return false;
  const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return total >= GIFT_MIN_RECEIPT_TOTAL;
}

/** Short order reference: the first UUID segment (e.g. "9F8E7D6C"). */
export function orderRefForOrderId(orderId: string): string {
  return (orderId.split("-")[0] || orderId).slice(0, 12).toUpperCase();
}

/** Deterministic gift code for an order: "ALF-" + the order reference. */
export function giftCodeForOrderId(orderId: string): string {
  return `ALF-${orderRefForOrderId(orderId)}`;
}

/** Parse a claimed code back into its order reference; null when malformed. */
export function parseGiftCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!GIFT_CODE_PATTERN.test(trimmed)) return null;
  return trimmed.slice(4);
}

/**
 * Canonical "ALF-XXXXXXXX" form of a code. Accepts both the shape the receipt
 * QR carries ("ALF-9F8E7D6C") and the bare order reference some callers pass
 * around ("9F8E7D6C"). Every ledger lookup keys on the prefixed form, so a bare
 * reference matched nothing and a live code was reported as inactive.
 * Returns null when the input is neither shape.
 */
export function canonicalGiftCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  const ref = parseGiftCode(trimmed) ?? (/^[A-Z0-9]{4,12}$/.test(trimmed) ? trimmed : null);
  return ref ? `ALF-${ref}` : null;
}
