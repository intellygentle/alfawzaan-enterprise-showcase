// components/Admin/GiftClaimsManager.tsx
// The boutique's gift-claims hub, in two connected sections:
//
//   1. CLAIM QUEUE — every VERIFIED order whose dominant tier is
//      Extravaganza and whose customer requested a receipt. Each entry shows
//      the gift code, claim status, and customer WhatsApp number, with:
//        · "Send Verified Receipt" — downloads the verified receipt PDF and
//          opens the customer's WhatsApp DM pre-filled with an appreciation
//          message (the admin attaches the PDF in the chat)
//        · "Mark Claimed" — redeems the code exactly once; the atomic
//          server-side claim blocks double marking
//
//   2. CODE LOOKUP — enter any code to inspect/redeem it, plus the recent
//      registration list.
//
// Codes go live at VERIFICATION time (verifyOrder registers them), so a code
// printed on an awaiting-verification receipt resolves on the store's claim
// card as "waiting for order verification" until it appears here.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Gift, Search, Loader2, AlertCircle, CheckCircle2, Ticket,
  Ban, RefreshCw, MapPin, MessageCircle, FileText,
} from "lucide-react";
import {
  lookupGiftCodeAction,
  claimGiftCodeAction,
  listGiftCodesAction,
  listGiftClaimQueueAction,
  getGiftPerfumeSelectionAction,
} from "@/app/actions/giftCodeActions";

/** Shape returned by getGiftPerfumeSelectionAction (defined locally: the
 * "use server" module must only export async functions). */
interface GiftPerfumeOption {
  id: string;
  name: string;
  imageUrl: string;
  currentPrice: number;
  creditPrice: number;
}
import type { GiftCodeDetails } from "@/lib/archive/giftCodes";
import type { GiftClaimQueueEntry } from "@/lib/archive/giftCodes";
import type { GiftCreditApplication } from "@/lib/gifts";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { normalizeWhatsAppPhone } from "@/lib/phone";

interface RecentCode {
  code: string;
  order_id: string;
  created_at: string;
  claimed_at: string | null;
  claimed_outlet: string | null;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function GiftClaimsManager() {
  // Claim queue (verified Extravaganza receipt orders)
  const [queue, setQueue] = useState<GiftClaimQueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [claimingCode, setClaimingCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState<string | null>(null);
  const [outlet, setOutlet] = useState<"unilorin" | "tanke">("unilorin");
  // What the ₦2,500 credit was applied to in store — recorded in the
  // GIFT_CREDIT_REDEEMED audit entry. Global like the outlet selector; all
  // claim buttons send it along.
  const [perfumes, setPerfumes] = useState<GiftPerfumeOption[]>([]);
  const [creditProductId, setCreditProductId] = useState<string>("");

  // Lookup panel
  const [codeInput, setCodeInput] = useState("");
  const [detail, setDetail] = useState<GiftCodeDetails | null>(null);
  const [checking, setChecking] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [lookupOutlet, setLookupOutlet] = useState<"unilorin" | "tanke">("unilorin");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCode[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const [queueRows, recentRows] = await Promise.all([
        listGiftClaimQueueAction(),
        listGiftCodesAction(20),
      ]);
      setQueue(queueRows);
      setRecent(recentRows);
    } catch (err: any) {
      setQueueError(err.message || "Failed to load the claim queue.");
    } finally {
      setQueueLoading(false);
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
    // The credit-target menu mirrors what the customer's claim card shows.
    // Decorative on failure: staff can still claim without picking a product.
    getGiftPerfumeSelectionAction()
      .then(setPerfumes)
      .catch(() => setPerfumes([]));
  }, [fetchAll]);

  /** Build the audit payload from the selected credit target, if any. */
  function creditPayload(): GiftCreditApplication | undefined {
    const picked = perfumes.find((p) => p.id === creditProductId);
    if (!picked) return undefined;
    return {
      productId: picked.id,
      productName: picked.name,
      currentPrice: picked.currentPrice,
      creditPrice: picked.creditPrice,
    };
  }

  async function markClaimed(code: string) {
    setClaimingCode(code);
    setError(null);
    setNotice(null);
    try {
      const result = await claimGiftCodeAction(code, outlet, creditPayload());
      if (result.success) {
        setNotice(result.message);
      } else {
        setError(result.message);
      }
      await fetchAll();
    } catch (err: any) {
      setError(err.message || "Claim failed.");
    } finally {
      setClaimingCode(null);
    }
  }

  /**
   * Download the VERIFIED receipt for a queue entry and open the customer's
   * WhatsApp DM with an appreciation message. The admin attaches the PDF in
   * the chat (WhatsApp links cannot pre-attach files).
   */
  async function sendVerifiedReceipt(entry: GiftClaimQueueEntry) {
    setSendingCode(entry.code);
    setError(null);
    setNotice(null);
    try {
      const { getReceiptData } = await import("@/app/admin/dashboard/actions");
      const receipt = await getReceiptData(entry.orderId);
      await downloadReceiptPdf({
        ...receipt,
        status: "paid",
        items: receipt.items.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
          grade: item.grade,
        })),
      });
      const customerPhone = normalizeWhatsAppPhone(entry.customerPhone || "");
      if (customerPhone) {
        const name = (entry.receiver || "there").split(" ")[0];
        const firstName = name.charAt(0).toUpperCase() + name.slice(1);
        const message =
          `Hello ${firstName}! 🌟\n\n` +
          `Thank you so much for shopping with Alfawzaan's Enterprise — your order has been verified and confirmed! ✅\n\n` +
          `Your verified receipt is attached. Your gift code ${entry.code} is also ready — show it at our boutique to claim something special. 💛\n\n` +
          `We can't wait to serve you again!\n\n` +
          `— Alfawzaan's Enterprise\nwww.alfawzaanenterprise.ng`;
        window.open(
          `https://api.whatsapp.com/send?phone=${customerPhone}&text=${encodeURIComponent(message)}`,
          "_blank",
          "noopener,noreferrer",
        );
      } else {
        setError("No valid WhatsApp number on this order — receipt downloaded only.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send the receipt.");
    } finally {
      setSendingCode(null);
    }
  }

  async function handleLookup(rawCode?: string) {
    // Accepts the code directly (Recent-list clicks) or falls back to the
    // input field — reading input state in the same tick as setCodeInput
    // would see the stale value.
    const trimmed = (rawCode ?? codeInput).trim().toUpperCase();
    setError(null);
    setNotice(null);
    setDetail(null);
    if (!trimmed) {
      setError("Enter the gift code from the customer's receipt.");
      return;
    }
    setCodeInput(trimmed);
    setChecking(true);
    try {
      const found = await lookupGiftCodeAction(trimmed);
      if (!found) {
        setError(`Code ${trimmed} is not registered. Codes go live when the order is verified.`);
      } else {
        setDetail(found);
      }
    } catch (err: any) {
      setError(err.message || "Lookup failed.");
    } finally {
      setChecking(false);
    }
  }

  async function handleClaimFromLookup() {
    if (!detail || detail.status !== "available") return;
    setClaiming(true);
    setError(null);
    setNotice(null);
    try {
      const result = await claimGiftCodeAction(detail.code, lookupOutlet, creditPayload());
      if (result.success) {
        setNotice(result.message);
        const refreshed = await lookupGiftCodeAction(detail.code);
        setDetail(refreshed);
        await fetchAll();
      } else {
        setError(result.message);
        const refreshed = await lookupGiftCodeAction(detail.code);
        setDetail(refreshed);
      }
    } catch (err: any) {
      setError(err.message || "Claim failed.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-500">
            <Gift size={20} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900">Gift Claims</h2>
            <p className="text-xs text-gray-400 font-medium">
              Verified Extravaganza receipts — send via WhatsApp and mark each code claimed exactly once
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Credit target: which perfume the ₦2,500 went to — recorded in the
              GIFT_CREDIT_REDEEMED audit entry on every claim. */}
          {perfumes.length > 0 && (
            <select
              value={creditProductId}
              onChange={(e) => setCreditProductId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-bold uppercase tracking-wider text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
              title="Which perfume the ₦2,500 credit was applied to (for the audit log)"
            >
              <option value="">Credit target: unspecified</option>
              {perfumes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · ₦{p.creditPrice.toLocaleString()}
                </option>
              ))}
            </select>
          )}
          {/* Outlet selector for claim marking */}
          <div className="flex items-center gap-1.5 mr-2">
            <MapPin size={13} className="text-gray-400" />
            {(["unilorin", "tanke"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { setOutlet(opt); setLookupOutlet(opt); }}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  outlet === opt ? "bg-brand-gold text-white" : "text-gray-400 hover:bg-black/5"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="flex items-center gap-2 self-start px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:text-gray-900 hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ─── Section 1: claim queue ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <MessageCircle size={15} className="text-[#25D366]" />
          <h3 className="font-bold text-gray-900 text-sm">Verified receipts to send</h3>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-auto">
            {queue.length} order{queue.length !== 1 ? "s" : ""}
          </span>
        </div>
        {queueLoading ? (
          <div className="p-8 text-center">
            <Loader2 size={22} className="animate-spin text-brand-gold mx-auto" />
          </div>
        ) : queueError ? (
          <div className="p-6 text-center text-xs text-red-500">{queueError}</div>
        ) : queue.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 max-w-md mx-auto leading-relaxed">
            Nothing waiting here yet. This queue collects <strong>verified</strong> orders from customers who
            ticked <strong>&ldquo;I want a receipt&rdquo;</strong> at checkout with an
            Extravaganza-dominant basket. Existing codes are listed below — open or mark any of them claimed there.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {queue.map((entry) => (
              <motion.div
                key={entry.code}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-black text-gray-900 tracking-wider">{entry.code}</p>
                    {entry.claimedAt ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/10 text-black/60 text-[9px] font-black uppercase tracking-widest">
                        <Ban size={10} /> Claimed{entry.claimedOutlet ? ` · ${entry.claimedOutlet}` : ""}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest">
                        <Ticket size={10} /> Unclaimed
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[9px] font-black uppercase tracking-widest">
                      {entry.outlet}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 font-bold mt-1 truncate">
                    {entry.receiver || "Customer"}
                    {entry.customerPhone ? <span className="text-gray-400 font-normal"> • {entry.customerPhone}</span> : null}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                    ₦{entry.orderTotal.toLocaleString()} total · Extravaganza ₦{entry.specialSpend.toLocaleString()} · verified {formatWhen(entry.verifiedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void sendVerifiedReceipt(entry)}
                    disabled={sendingCode === entry.code}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#20BD5A] transition-all shadow-md shadow-[#25D366]/20 disabled:opacity-50"
                  >
                    {sendingCode === entry.code ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                    Send Verified Receipt
                  </button>
                  {entry.claimedAt ? (
                    <button
                      type="button"
                      onClick={() => { void handleLookup(entry.code); }}
                      className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                    >
                      Details
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markClaimed(entry.code)}
                      disabled={claimingCode === entry.code}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
                    >
                      {claimingCode === entry.code ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      Mark Claimed
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Section 2: lookup + recent ─── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") void handleLookup(); }}
              placeholder="Enter gift code, e.g. ALF-9F8E7D6C"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono text-sm font-bold tracking-wider text-gray-900 placeholder:text-gray-300 placeholder:font-sans placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleLookup()}
            disabled={checking}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50"
          >
            {checking ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Check Code
          </button>
        </div>

        {/* Lookup result */}
        {detail && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl border p-5 space-y-4 ${
              detail.status === "claimed"
                ? "bg-black/[0.02] border-black/10"
                : "bg-emerald-50/50 border-emerald-100"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-black text-gray-900 tracking-[0.12em]">{detail.code}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                  Order #{detail.orderId.slice(0, 8).toUpperCase()} · {formatWhen(detail.registeredAt)}
                </p>
              </div>
              {detail.status === "claimed" ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/10 text-black/60 text-[10px] font-black uppercase tracking-widest">
                  <Ban size={12} /> Claimed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">
                  <Ticket size={12} /> Available
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Customer</p>
                <p className="font-bold text-gray-900 truncate">{detail.receiver || "—"}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Order Total</p>
                <p className="font-bold text-gray-900">₦{detail.orderTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Extravaganza</p>
                <p className="font-bold text-gray-900">₦{(detail.tierTotals.special ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Redeemed</p>
                <p className="font-bold text-gray-900">
                  {detail.claimedAt ? `${formatWhen(detail.claimedAt)}${detail.claimedOutlet ? ` · ${detail.claimedOutlet}` : ""}` : "—"}
                </p>
              </div>
            </div>

            {detail.status === "available" && (
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-emerald-100">
                <button
                  type="button"
                  onClick={() => void handleClaimFromLookup()}
                  disabled={claiming}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
                >
                  {claiming ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Claim Gift — One Time Only
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Recent codes */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
          <Ticket size={15} className="text-brand-gold" />
          <h3 className="font-bold text-gray-900 text-sm">Recent Gift Codes</h3>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-auto">
            {recent.length} registered
          </span>
        </div>
        {recentLoading ? (
          <div className="p-8 text-center">
            <Loader2 size={22} className="animate-spin text-brand-gold mx-auto" />
          </div>
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400">
            No gift codes registered yet. They go live when Extravaganza orders are verified.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((row) => (
              <div
                key={row.code}
                className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => { void handleLookup(row.code); }}
                  className="min-w-0 flex-1 text-left"
                  title="Inspect this code"
                >
                  <p className="font-mono text-sm font-bold text-gray-900 tracking-wider">{row.code}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Order #{row.order_id.slice(0, 8).toUpperCase()} · registered {formatWhen(row.created_at)}
                  </p>
                </button>
                {row.claimed_at ? (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-black/40">
                    {row.claimed_outlet ? `${row.claimed_outlet} · ` : ""}{formatWhen(row.claimed_at)}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void markClaimed(row.code)}
                    disabled={claimingCode === row.code}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50"
                  >
                    {claimingCode === row.code ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                    Mark Claimed
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
