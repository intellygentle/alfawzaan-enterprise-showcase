// lib/archive/giftCodes.ts — server-only gift-code ledger operations.
// Deliberately NOT "use server": unlike lib/archive/ledger.ts, these exports
// must not become directly-callable client actions — the claim operation is
// the double-claim enforcement point and may only run behind the
// admin-authenticated wrapper in app/actions/giftCodeActions.ts.

import { getArchiveServer } from "@/lib/supabase/server";
import {
  canonicalGiftCode,
  computeTierTotals,
  giftCodeForOrderId,
  giftCreditAuditDetails,
  GIFT_CREDIT_NAIRA,
  GIFT_MIN_RECEIPT_TOTAL,
  qualifiesForGift,
} from "@/lib/gifts";
import type { GiftCreditApplication } from "@/lib/gifts";

export type GiftCodeStatus = "available" | "claimed" | "awaiting_verification" | "unknown";

export interface GiftCodeRow {
  code: string;
  order_id: string;
  created_at: string;
  claimed_at: string | null;
  claimed_outlet: string | null;
}

/**
 * Fetch the gift_codes row for a well-formed code, or null. Accepts the code in
 * either shape ("ALF-XXXXXXXX" or a bare reference) so no caller can miss the
 * row just by handing over the reference form.
 */
async function findGiftCode(code: string): Promise<GiftCodeRow | null> {
  const canonical = canonicalGiftCode(code);
  if (!canonical) return null;
  const { data, error } = await getArchiveServer()
    .from("gift_codes")
    .select("*")
    .eq("code", canonical)
    .maybeSingle();
  if (error) throw new Error(`Gift code lookup failed: ${error.message}`);
  return (data as GiftCodeRow) ?? null;
}

/**
 * Register a gift code for an order. Validates SERVER-SIDE that the order
 * exists, is VERIFIED, and actually qualifies (dominant tier Extravaganza,
 * recomputed from persisted order_items — never trusting the client's claim),
 * then inserts with ON CONFLICT DO NOTHING so re-registering can never
 * resurrect or reset an already-claimed code.
 *
 * Called from verifyOrder once the order flips to "paid" — a code only
 * becomes claimable after the admin has verified the order, never at
 * receipt-generation time.
 */
export async function registerGiftCode(orderId: string, code: string): Promise<{ registered: boolean; reason?: string }> {
  // The code must be the deterministic code for THIS order — a client cannot
  // register arbitrary code strings.
  if (code !== giftCodeForOrderId(orderId)) {
    return { registered: false, reason: "Code does not match this order." };
  }

  const archive = getArchiveServer();

  // Only verified orders earn a live gift code. Pending orders keep their
  // printed code "awaiting verification" — registration happens in
  // verifyOrder the moment the admin confirms the order.
  const { data: order, error: orderError } = await archive
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(`Gift registration could not read the order: ${orderError.message}`);
  if (!order) {
    return { registered: false, reason: "Order not found." };
  }
  if (order.status === "pending") {
    return { registered: false, reason: "Order is not verified yet." };
  }
  if (order.status === "cancelled") {
    return { registered: false, reason: "Order was cancelled." };
  }

  const { data: items, error: itemsError } = await archive
    .from("order_items")
    .select("unit_price, quantity")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(`Gift registration could not read order items: ${itemsError.message}`);
  if (!items || items.length === 0) {
    return { registered: false, reason: "Order not found." };
  }
  if (!qualifiesForGift(items.map((i) => ({ unitPrice: Number(i.unit_price), quantity: Number(i.quantity) })))) {
    return { registered: false, reason: "Order does not qualify for a gift code." };
  }

  const { error: insertError } = await archive
    .from("gift_codes")
    .upsert({ code, order_id: orderId }, { onConflict: "code", ignoreDuplicates: true });
  if (insertError) throw new Error(`Gift registration failed: ${insertError.message}`);
  return { registered: true };
}

/**
 * Public status for the store-page claim card. Returns no personal data —
 * only where the code stands:
 *   available           — registered and unclaimed; can be redeemed in store
 *   claimed             — already redeemed; double claiming blocked
 *   awaiting_verification — the order behind the code exists but is still
 *                         pending; the customer is told to wait for their
 *                         verified receipt from Alfawzaan's Enterprise
 *   unknown             — no such order at all
 */
export async function getGiftCodeStatus(code: string): Promise<GiftCodeStatus> {
  const row = await findGiftCode(code);
  if (row) return row.claimed_at ? "claimed" : "available";

  // Not registered: the code may still belong to a PENDING order (gift codes
  // register at verification time). Resolve the order by reference so the
  // claim card can show "awaiting verification" instead of "unknown".
  const canonical = canonicalGiftCode(code);
  if (!canonical) return "unknown";
  const { data: order, error } = await getArchiveServer()
    .from("orders")
    .select("status")
    .ilike("id", `${canonical.slice(4)}%`)
    .maybeSingle();
  if (error) throw new Error(`Gift status lookup failed: ${error.message}`);
  if (!order) return "unknown";
  return order.status === "pending" ? "awaiting_verification" : "unknown";
}

export interface GiftCodeDetails {
  code: string;
  orderId: string;
  receiver: string | null;
  orderTotal: number;
  orderStatus: string | null;
  tierTotals: Record<string, number>;
  status: GiftCodeStatus;
  claimedAt: string | null;
  claimedOutlet: string | null;
  registeredAt: string;
}

/** Full details for the admin redemption view (includes order + customer). */
export async function lookupGiftCode(code: string): Promise<GiftCodeDetails | null> {
  const row = await findGiftCode(code);
  if (!row) return null;

  const archive = getArchiveServer();
  const { data: order, error } = await archive
    .from("orders")
    .select("customer_name, total_amount, status")
    .eq("id", row.order_id)
    .maybeSingle();
  if (error) throw new Error(`Gift lookup could not read the order: ${error.message}`);

  const { data: items } = await archive
    .from("order_items")
    .select("unit_price, quantity")
    .eq("order_id", row.order_id);

  return {
    code: row.code,
    orderId: row.order_id,
    receiver: order?.customer_name ?? null,
    orderTotal: Number(order?.total_amount ?? 0),
    orderStatus: order?.status ?? null,
    tierTotals: computeTierTotals(
      (items ?? []).map((i: { unit_price: number; quantity: number }) => ({
        unitPrice: Number(i.unit_price),
        quantity: Number(i.quantity),
      })),
    ),
    status: row.claimed_at ? "claimed" : "available",
    claimedAt: row.claimed_at,
    claimedOutlet: row.claimed_outlet,
    registeredAt: row.created_at,
  };
}

export interface ClaimGiftCodeResult {
  success: boolean;
  message: string;
  claimedAt?: string;
}

/**
 * THE double-claim guard. A single atomic UPDATE restricted to
 * claimed_at IS NULL: if two boutiques redeem the same code simultaneously,
 * exactly one update matches and the other sees zero rows. Also inserts
 * audit_logs entries so every redemption is traceable: GIFT_CODE_CLAIMED for
 * the code itself and GIFT_CREDIT_REDEEMED for the ₦2,500 credit the staff
 * member applies to a product in store.
 */
export async function claimGiftCode(
  code: string,
  outlet: "unilorin" | "tanke",
  credit?: GiftCreditApplication,
): Promise<ClaimGiftCodeResult> {
  const canonical = canonicalGiftCode(code);
  if (!canonical) return { success: false, message: "That is not a valid gift code format." };

  const archive = getArchiveServer();

  // Atomic one-time claim. `.select()` returns the updated row only when this
  // call was the one that flipped it.
  const { data: updated, error: updateError } = await archive
    .from("gift_codes")
    .update({ claimed_at: new Date().toISOString(), claimed_outlet: outlet })
    .eq("code", canonical)
    .is("claimed_at", null)
    .select()
    .maybeSingle();
  if (updateError) throw new Error(`Gift claim failed: ${updateError.message}`);

  if (!updated) {
    // Either unknown, or already claimed. Distinguish for a useful message.
    const row = await findGiftCode(canonical);
    if (!row) {
      return { success: false, message: "Unknown gift code. The receipt must be generated before claiming." };
    }
    if (row.claimed_at) {
      const when = new Date(row.claimed_at).toLocaleString("en-NG");
      return {
        success: false,
        message: `Already claimed${row.claimed_outlet ? ` at ${row.claimed_outlet}` : ""} on ${when}. Double claim prevented.`,
        claimedAt: row.claimed_at,
      };
    }
    return { success: false, message: "Gift claim failed. Please retry." };
  }

  // Audit trail — the repo's rule: every correction/redemption is logged.
  await archive.from("audit_logs").insert({
    action: "GIFT_CODE_CLAIMED",
    product_id: updated.order_id,
    details: `Gift code ${canonical} redeemed at ${outlet}. Double claiming is now blocked for this code.`,
    admin_id: "admin-gift-claims",
    outlet,
  });

  // The in-store credit application, recorded separately so the Audit Trail
  // shows the reward value, not just the code flip. Fire-and-forget would
  // risk losing the record; await keeps claim = ledger event.
  await archive.from("audit_logs").insert({
    action: "GIFT_CREDIT_REDEEMED",
    product_id: credit?.productId ?? updated.order_id,
    product_name: credit?.productName ?? null,
    details: giftCreditAuditDetails(credit?.productName),
    admin_id: "admin-gift-claims",
    outlet,
    metadata: {
      gift_code: canonical,
      order_id: updated.order_id,
      credit_naira: GIFT_CREDIT_NAIRA,
      current_price: credit?.currentPrice ?? null,
      credit_price: credit?.creditPrice ?? null,
    },
  });

  return {
    success: true,
    message: `Gift code ${canonical} claimed at ${outlet}. This code can no longer be redeemed.`,
    claimedAt: updated.claimed_at,
  };
}

export interface RecentGiftCode {
  code: string;
  order_id: string;
  created_at: string;
  claimed_at: string | null;
  claimed_outlet: string | null;
  /** Customer's WhatsApp number (from the order) so the admin can DM the
   *  verified receipt without opening the order. */
  customer_phone: string | null;
  customer_name: string | null;
}

/** Most recent codes for the admin dashboard list. */
export async function listRecentGiftCodes(limit = 20): Promise<RecentGiftCode[]> {
  const { data, error } = await getArchiveServer()
    .from("gift_codes")
    .select(`
      code,
      order_id,
      created_at,
      claimed_at,
      claimed_outlet,
      orders ( customer_phone, customer_name )
    `)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(`Failed to list gift codes: ${error.message}`);
  return (data ?? []).map((row) => {
    // supabase-js types embedded resources as arrays, but PostgREST returns a
    // single object for the many-to-one gift_codes.order_id → orders embed.
    // Normalize both shapes so the admin list always gets the customer fields.
    const raw: unknown = row.orders;
    const order = (
      Array.isArray(raw) ? raw[0] : raw
    ) as { customer_phone: string | null; customer_name: string | null } | null | undefined;
    return {
      code: row.code,
      order_id: row.order_id,
      created_at: row.created_at,
      claimed_at: row.claimed_at,
      claimed_outlet: row.claimed_outlet,
      customer_phone: order?.customer_phone || null,
      customer_name: order?.customer_name || null,
    };
  });
}

export interface GiftClaimQueueEntry {
  code: string;
  orderId: string;
  receiver: string | null;
  customerPhone: string | null;
  orderTotal: number;
  outlet: string;
  verifiedAt: string;
  claimedAt: string | null;
  claimedOutlet: string | null;
  /** Computed per-order spend per tier (only "special" drives eligibility). */
  specialSpend: number;
}

/**
 * The admin Gift Claims queue: VERIFIED orders whose dominant tier is
 * Extravaganza (the gift-code-earning tier) — each joined with its gift code
 * and claim state. This is the single place the admin sends verified
 * receipts over WhatsApp and marks codes claimed.
 *
 * Dominance is enforced SQL-side by requiring special-tier spend to exceed
 * both other tiers' spend, mirroring qualifiesForGift().
 */
export async function listGiftClaimQueue(): Promise<GiftClaimQueueEntry[]> {
  const archive = getArchiveServer();

  // Tier spend per order (PostgREST can't aggregate, so fetch verified
  // receipt-requested orders' items and reduce in-process — bounded by the
  // number of verified Extravaganza receipt orders, which is small).
  const { data: orders, error: ordersError } = await archive
    .from("orders")
    .select(`
      id,
      customer_name,
      customer_phone,
      total_amount,
      outlet,
      updated_at,
      order_items (unit_price, quantity)
    `)
    .eq("status", "paid")
    .eq("receipt_requested", true)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (ordersError) throw new Error(`Failed to list the gift claim queue: ${ordersError.message}`);

  // Existing codes + claim state, keyed by order id.
  const { data: codes, error: codesError } = await archive
    .from("gift_codes")
    .select("code, order_id, claimed_at, claimed_outlet");
  if (codesError) throw new Error(`Failed to list gift codes: ${codesError.message}`);
  const codeByOrder = new Map((codes ?? []).map((row) => [row.order_id, row]));

  const entries: GiftClaimQueueEntry[] = [];
  for (const order of orders ?? []) {
    const items = (order.order_items ?? []) as Array<{ unit_price: number; quantity: number }>;
    const totals = computeTierTotals(
      items.map((i) => ({ unitPrice: Number(i.unit_price), quantity: Number(i.quantity) })),
    );
    // Extravaganza must dominate: strictly more special spend than either
    // other tier (ties go to the higher tier only when it strictly wins,
    // matching dominantTierKey's ordering), and the receipt total must reach
    // the gift floor — mirroring qualifiesForGift() exactly.
    const specialWins =
      totals.special > 0 &&
      totals.special > totals.extra &&
      totals.special > totals.normal;
    const orderTotal = Number(order.total_amount ?? 0);
    if (!specialWins || orderTotal < GIFT_MIN_RECEIPT_TOTAL) continue;

    const codeRow = codeByOrder.get(order.id);
    entries.push({
      code: codeRow?.code ?? giftCodeForOrderId(order.id),
      orderId: order.id,
      receiver: order.customer_name ?? null,
      customerPhone: order.customer_phone || null,
      orderTotal: Number(order.total_amount ?? 0),
      outlet: order.outlet,
      verifiedAt: order.updated_at,
      claimedAt: codeRow?.claimed_at ?? null,
      claimedOutlet: codeRow?.claimed_outlet ?? null,
      specialSpend: totals.special,
    });
  }
  return entries;
}
