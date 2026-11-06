// app/actions/giftCodeActions.ts
// Gift-code server actions. Two access levels:
//   PUBLIC  — getGiftCodeStatusAction: callable by the storefront claim card.
//             It validates server-side and exposes no personal data.
//             getGiftPerfumeSelectionAction: the three FA 50ml perfumes a gift
//             code can be redeemed against, priced with the 2500 naira credit.
//   ADMIN   — lookupGiftCodeAction / claimGiftCodeAction /
//             listGiftCodesAction / listGiftClaimQueueAction: gated by
//             requireAdminSession. The claim action is the single redemption
//             point that prevents double claiming.
//
// NOTE: gift codes REGISTER at verification time (verifyOrder calls
// registerGiftCode in lib/archive/giftCodes.ts), not at receipt generation —
// a printed code only goes live once the admin has verified the order.

"use server";

import { requireAdminSession } from "@/lib/auth/session";
import type { GiftCodeStatus } from "@/lib/archive/giftCodes";
import {
  getGiftCodeStatus as getGiftCodeStatusDb,
  lookupGiftCode as lookupGiftCodeDb,
  claimGiftCode as claimGiftCodeDb,
  listRecentGiftCodes,
  listGiftClaimQueue,
} from "@/lib/archive/giftCodes";
import { giftCreditPrice, isGiftEligibleProduct } from "@/lib/gifts";
import type { GiftCreditApplication } from "@/lib/gifts";
import { getStoreProducts } from "@/lib/storefront/data";

/** Status for the store-page claim card. */
export async function getGiftCodeStatusAction(code: string): Promise<{ status: GiftCodeStatus }> {
  return { status: await getGiftCodeStatusDb(code) };
}

/** Admin: full redemption details for a code (order, customer, status). */
export async function lookupGiftCodeAction(code: string) {
  await requireAdminSession();
  return lookupGiftCodeDb(code);
}

/**
 * Admin: redeem a code exactly once. Double claims are rejected atomically.
 * `credit` records what the credit was applied to in store; it lands in the
 * GIFT_CREDIT_REDEEMED audit entry.
 */
export async function claimGiftCodeAction(
  code: string,
  outlet: "unilorin" | "tanke",
  credit?: GiftCreditApplication,
) {
  await requireAdminSession();
  return claimGiftCodeDb(code, outlet, credit);
}

/** Admin: recent gift codes for the dashboard list. */
export async function listGiftCodesAction(limit = 20) {
  await requireAdminSession();
  return listRecentGiftCodes(limit);
}

/**
 * Admin: the claim queue — verified Extravaganza orders whose receipts
 * requested WhatsApp delivery, each with its gift code, claim status, and
 * customer WhatsApp number, so the admin can send the verified receipt and
 * mark the code claimed from one place.
 */
export async function listGiftClaimQueueAction() {
  await requireAdminSession();
  return listGiftClaimQueue();
}

/**
 * The FA 50ml perfumes a gift code can be redeemed against: the three
 * cheapest candidates, each priced at the current Master price minus the
 * 2500 naira credit. Served from the storefront's cached catalog so it adds
 * no extra Supabase egress and revalidates with catalog mutations.
 *
 * Gift eligibility is decided by qualifiesForGift() and the product rule is
 * shared with checkout (isGiftEligibleProduct) so the card can only offer what
 * placeOrder will actually discount. `outlets` lists the boutiques that can
 * fulfil the order today — the card sends a real order, not a voucher. The
 * double-claim enforcement point remains claimGiftCode in
 * lib/archive/giftCodes.ts.
 */
export async function getGiftPerfumeSelectionAction() {
  const products = await getStoreProducts();
  return products
    .filter((p) => isGiftEligibleProduct(p.name) && p.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl,
      currentPrice: p.price,
      creditPrice: giftCreditPrice(p.price),
      outlets: p.outlets.filter((outlet) => (p.outletStock[outlet] ?? 0) > 0),
    }));
}
