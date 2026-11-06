// components/StoreFront/GiftCodeModal.tsx
// Claim card for gift codes arriving via /store?gift=CODE (scanned from an
// Extravaganza receipt's QR). Pops up on load, shows the code, and offers
// one-tap copy (with an execCommand fallback for WhatsApp's webview, which
// lacks the async clipboard API).
//
// The reward: codes with a current credit of ₦2,500 towards any of three
// featured FA 50ml perfumes — priced live from the Master catalog minus the
// credit. An "available" code can be claimed without leaving the page: the
// customer picks ONE perfume, picks a boutique when more than one can fulfil
// it, and sends the order. That goes through the normal placeOrder path (real
// order row, real stock reservation, verify page, representative's WhatsApp)
// with the gift code in the message and in the order note, so the boutique can
// see the order is a discounted one and redeem the code.
//
// Double-claim prevention: the card checks the code's status server-side. A
// code the boutique has already redeemed renders as claimed, with no send
// action, plus a pointer to the WhatsApp channel where the boutique drops the
// next codes — a spent code is a dead end for the customer otherwise.
// "unknown"/fetch-failure still shows the voucher — the card is only
// a voucher; the authoritative one-time enforcement lives in the boutique's
// redemption tool (lib/archive/giftCodes.ts claimGiftCode), and placeOrder
// re-validates the code server-side before any discount is applied.

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Copy, Check, X, MapPin, BadgeCheck, AlertCircle, Clock, Send, Loader2, ExternalLink } from "lucide-react";
import { getGiftCodeStatusAction, getGiftPerfumeSelectionAction } from "@/app/actions/giftCodeActions";
import { placeOrder } from "@/app/actions/orderActions";
import { buildWhatsAppUrl } from "@/utils/whatsappLinkGenerator";
import { GIFT_CREDIT_NAIRA } from "@/lib/gifts";
import { WHATSAPP_CHANNEL_URL } from "@/lib/constants";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

interface GiftPerfumeOption {
  id: string;
  name: string;
  imageUrl: string;
  currentPrice: number;
  creditPrice: number;
  /** Boutiques that can fulfil the order today (the storefront's in-stock list). */
  outlets: string[];
}

interface GiftCodeModalProps {
  /** Raw ?gift= value; the modal only renders when it passes validation. */
  code: string | null;
}

const CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/;

/** Which screen the claim card shows, resolved from the code's server status. */
type ClaimState = "checking" | "available" | "claimed" | "awaiting_verification" | "unknown";

export default function GiftCodeModal({ code }: GiftCodeModalProps) {
  const valid = !!code && CODE_PATTERN.test(code);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [claimState, setClaimState] = useState<ClaimState>("checking");
  const [perfumes, setPerfumes] = useState<GiftPerfumeOption[]>([]);

  // ─── Gifting an order ───
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  /** Set once the order is away: boutique name + the chat the customer sent to. */
  const [sent, setSent] = useState<{ outlet: string; url: string } | null>(null);
  // One retry-safe key per attempt (mirrors the cart checkout): a timed-out
  // request that actually succeeded must not create a second discounted order.
  const checkoutIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (valid) setOpen(true);
  }, [valid]);

  // Resolve the code's status server-side. "awaiting_verification" means the
  // order behind the code is still pending — the customer is told to wait for
  // their verified receipt from Alfawzaan's Enterprise. "unknown"/fetch
  // failure falls back to the voucher view; enforcement happens at
  // redemption and again inside placeOrder, not on the customer's screen.
  useEffect(() => {
    if (!valid || !code) return;
    let cancelled = false;
    setClaimState("checking");
    getGiftCodeStatusAction(code)
      .then(({ status }) => {
        if (!cancelled) setClaimState(status);
      })
      .catch(() => {
        if (!cancelled) setClaimState("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [valid, code]);

  // The FA 50ml reward selection. Loaded once per mount, regardless of claim
  // state: even claimed/awaiting cards show what the gift would have offered,
  // which helps staff resolve "but my card said..." questions.
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    getGiftPerfumeSelectionAction()
      .then((options) => {
        if (!cancelled) setPerfumes(options);
      })
      .catch(() => {
        if (!cancelled) setPerfumes([]); // decorative only — never blocks the card
      });
    return () => {
      cancelled = true;
    };
  }, [valid]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (!code) return null;
  const display = valid ? code.toUpperCase() : "";

  // Only a code the ledger knows and hasn't redeemed can place a discounted
  // order. "unknown" (unregistered/typo'd) stays a voucher: the boutique sorts
  // it out in person rather than the customer hitting a server rejection.
  const canOrder = claimState === "available";
  const selected = perfumes.find((p) => p.id === selectedId) ?? null;
  // The chosen boutique, falling back to the first one that has stock.
  const chosenOutlet =
    selected && selectedOutlet && selected.outlets.includes(selectedOutlet)
      ? selectedOutlet
      : selected?.outlets[0] ?? null;

  async function copyCode() {
    if (!display) return;
    try {
      await navigator.clipboard.writeText(display);
    } catch {
      // Fallback for embedded webviews without the async clipboard API.
      try {
        const ta = document.createElement("textarea");
        ta.value = display;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopied(true);
  }

  /** Pick a perfume; keeps the boutique valid for the new selection. */
  function selectPerfume(id: string) {
    setSelectedId(id);
    setSendError("");
    // A different product is a different order attempt.
    checkoutIdRef.current = null;
    const perfume = perfumes.find((p) => p.id === id);
    setSelectedOutlet((prev) =>
      prev && perfume?.outlets.includes(prev) ? prev : perfume?.outlets[0] ?? null,
    );
  }

  /**
   * Send the discounted order through the normal checkout path: placeOrder
   * creates the order, reserves the stock, and returns the representative's
   * number plus the gift-aware message (code, real price, discount, price after
   * discount). We open that chat exactly like the cart does.
   */
  async function sendOrder() {
    if (!selected || !chosenOutlet || sending || sent) return;
    setSending(true);
    setSendError("");
    try {
      const checkoutId = checkoutIdRef.current ?? crypto.randomUUID();
      checkoutIdRef.current = checkoutId;
      const result = await placeOrder({
        checkoutId,
        giftCode: display,
        items: [
          {
            productId: selected.id,
            productName: selected.name,
            grade: "pending" as const,
            quantity: 1,
            unitPrice: selected.currentPrice,
            totalPrice: selected.currentPrice,
            outlet: chosenOutlet.toLowerCase() as "unilorin" | "tanke",
          },
        ],
      });

      if (!result.success) {
        setSendError(result.message || "Could not send the order. Please try again.");
        return;
      }

      const link = result.whatsappLinks?.[0];
      if (link) {
        // A real anchor click fires the whatsapp:// custom scheme most reliably
        // on mobile (same handoff the cart uses).
        const anchor = document.createElement("a");
        anchor.href = buildWhatsAppUrl(link.phone, link.text);
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }

      checkoutIdRef.current = null;
      setSent({ outlet: chosenOutlet, url: link?.url ?? "" });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send the order. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && valid && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Gift code"
            className="bg-white rounded-3xl w-full max-w-sm p-7 relative shadow-2xl border border-[#D4AF37]/15 max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close gift code"
              className="absolute top-4 right-4 p-2 text-[#121212]/40 hover:text-[#121212] hover:bg-black/5 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-center text-center gap-4">
              {claimState === "awaiting_verification" ? (
                <div className="w-14 h-14 rounded-2xl bg-[#FAF5E6] border border-[#D4AF37]/25 flex items-center justify-center">
                  <Clock size={26} className="text-[#D4AF37]" />
                </div>
              ) : claimState === "claimed" ? (
                <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center">
                  <BadgeCheck size={26} className="text-black/40" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-[#FAF5E6] border border-[#D4AF37]/25 flex items-center justify-center">
                  <Gift size={26} className="text-[#D4AF37]" />
                </div>
              )}

              {claimState === "awaiting_verification" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
                      Almost There
                    </p>
                    <h2 className="text-2xl font-serif font-bold text-[#121212] tracking-tight">
                      Awaiting Order Verification
                    </h2>
                    <p className="text-xs text-black/50 leading-relaxed max-w-[270px] mx-auto">
                      Your gift code is registered to this order, but the order is still being
                      verified. Please wait for your verified receipt from Alfawzaan&apos;s
                      Enterprise — your gift unlocks once it arrives.
                    </p>
                  </div>

                  <div className="w-full rounded-2xl border-2 border-dashed border-[#D4AF37]/40 bg-[#FAF5E6]/60 px-5 py-4">
                    <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-black/40 mb-1">
                      Your Gift Code
                    </p>
                    <p className="font-mono text-xl font-black text-black/60 tracking-[0.12em] select-all">
                      {display}
                    </p>
                  </div>

                  <p className="flex items-center gap-1.5 text-[10px] text-black/40">
                    <Clock size={12} className="text-[#D4AF37]" />
                    Check back after you receive your verified receipt on WhatsApp
                  </p>
                </>
              ) : claimState === "claimed" ? (
                <>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-black/40">
                      Already Redeemed
                    </p>
                    <h2 className="text-2xl font-serif font-bold text-[#121212] tracking-tight">
                      This Gift Has Been Claimed
                    </h2>
                    <p className="text-xs text-black/50 leading-relaxed max-w-[260px] mx-auto">
                      This code was already redeemed in store and can&apos;t be used again.
                    </p>
                  </div>

                  <div className="w-full rounded-2xl border border-black/10 bg-black/[0.03] px-5 py-4">
                    <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-black/40 mb-1">
                      Gift Code
                    </p>
                    <p className="font-mono text-xl font-black text-black/40 tracking-[0.12em] line-through select-all">
                      {display}
                    </p>
                  </div>

                  <p className="flex items-start gap-1.5 text-[10px] text-black/40 text-left w-full">
                    <AlertCircle size={12} className="text-black/30 shrink-0 mt-0.5" />
                    If you believe this is a mistake, please see a member of staff at the boutique with your receipt.
                  </p>

                  {/* Redeemed doesn't mean the rewards are over — the channel is
                      where the boutique drops the next codes, so the customer
                      who missed this one still has somewhere to go. */}
                  <a
                    href={WHATSAPP_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 px-4 py-3 text-left transition-colors hover:bg-[#25D366]/10"
                  >
                    <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-[#128C4A]">
                      <Gift size={12} /> More Gift Codes Drop Here
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-black/55">
                      Join our WhatsApp channel to win another gift code — we drop new ones
                      there occasionally.
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#128C4A] underline decoration-[#128C4A]/40 underline-offset-2 transition-colors group-hover:decoration-[#128C4A]">
                      <ExternalLink size={11} /> Join the channel
                    </span>
                  </a>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
                      A Gift For You
                    </p>
                    <h2 className="text-2xl font-serif font-bold text-[#121212] tracking-tight">
                      Thank You For Your Order
                    </h2>
                    <p className="text-xs text-black/50 leading-relaxed max-w-[280px] mx-auto">
                      Your Extravaganza collection comes with ₦2,500 off any FA 50ml perfume.
                      Pick one below and send your order — the boutique applies your credit.
                    </p>
                  </div>

                  <div className="w-full rounded-2xl border-2 border-dashed border-[#D4AF37]/50 bg-[#FAF5E6] px-5 py-3">
                    <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-black/40 mb-0.5">
                      Your Gift Code
                    </p>
                    <p className="font-mono text-lg font-black text-[#121212] tracking-[0.12em] select-all">
                      {display}
                    </p>
                  </div>

                  {perfumes.length > 0 ? (
                    <div className="w-full">
                      <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-black/40 mb-2 text-left">
                        Select one perfume — ₦2,500 off
                      </p>
                      <div role="radiogroup" aria-label="Gift perfume selection" className="space-y-1.5">
                        {perfumes.map((perfume) => {
                          const active = perfume.id === selectedId;
                          const soldOut = perfume.outlets.length === 0;
                          return (
                            <button
                              key={perfume.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={soldOut || !!sent || !canOrder}
                              onClick={() => selectPerfume(perfume.id)}
                              className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all disabled:opacity-50 ${
                                active
                                  ? "border-[#D4AF37] bg-[#FAF5E6] ring-1 ring-[#D4AF37]/40"
                                  : "border-black/10 bg-white hover:border-[#D4AF37]/40"
                              }`}
                            >
                              <OptimizedImage
                                src={perfume.imageUrl}
                                alt={perfume.name}
                                containerClassName="w-10 h-10 rounded-lg overflow-hidden shrink-0"
                                sizes="40px"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-[#121212] truncate">{perfume.name}</p>
                                <p className="text-[10px] text-black/45">
                                  <span className="line-through">₦{perfume.currentPrice.toLocaleString()}</span>{" "}
                                  <span className="font-black text-[#121212]">₦{perfume.creditPrice.toLocaleString()}</span>
                                  {soldOut && <span className="ml-1 text-black/35">· out of stock online</span>}
                                </p>
                              </div>
                              <span
                                aria-hidden="true"
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                  active ? "border-[#D4AF37] bg-[#D4AF37] text-white" : "border-black/15 text-transparent"
                                }`}
                              >
                                <Check size={12} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-black/45 leading-relaxed">
                      No FA 50ml perfume is available online right now. Show this code at the
                      boutique and staff will apply it for you.
                    </p>
                  )}

                  {/* Two boutiques can stock the same perfume — let the customer choose. */}
                  {canOrder && selected && selected.outlets.length > 1 && !sent && (
                    <div className="w-full">
                      <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-black/40 mb-1.5 text-left">
                        Pick-up boutique
                      </p>
                      <div className="flex gap-1.5">
                        {selected.outlets.map((outlet) => (
                          <button
                            key={outlet}
                            type="button"
                            aria-pressed={chosenOutlet === outlet}
                            onClick={() => {
                              setSelectedOutlet(outlet);
                              setSendError("");
                            }}
                            className={`flex-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                              chosenOutlet === outlet
                                ? "border-[#D4AF37] bg-[#FAF5E6] text-[#121212]"
                                : "border-black/10 bg-white text-black/50 hover:border-[#D4AF37]/40"
                            }`}
                          >
                            {outlet}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {canOrder && selected && !sent && (
                    <dl className="w-full rounded-2xl border border-[#D4AF37]/25 bg-[#FAF5E6]/60 px-4 py-3 text-left space-y-1 text-[11px]">
                      <div className="flex justify-between gap-3">
                        <dt className="text-black/50">Gift code</dt>
                        <dd className="font-mono font-bold text-[#121212]">{display}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-black/50">Real price</dt>
                        <dd className="text-black/50 line-through">₦{selected.currentPrice.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-black/50">Discount</dt>
                        <dd className="font-bold text-[#D4AF37]">−₦{GIFT_CREDIT_NAIRA.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-[#D4AF37]/20 pt-1">
                        <dt className="font-bold text-[#121212]">You pay</dt>
                        <dd className="font-black text-[#121212]">₦{selected.creditPrice.toLocaleString()}</dd>
                      </div>
                    </dl>
                  )}

                  {sendError && (
                    <p className="flex items-start gap-1.5 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-600 text-left">
                      <AlertCircle size={12} className="shrink-0 mt-0.5" />
                      {sendError}
                    </p>
                  )}

                  {!canOrder && (
                    <p className="flex items-start gap-1.5 w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700 text-left">
                      <AlertCircle size={12} className="shrink-0 mt-0.5" />
                      We can&apos;t activate this code online yet. Show it at the boutique and staff
                      will check it for you.
                    </p>
                  )}

                  {sent ? (
                    <div className="w-full rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-left space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-green-700">
                        <Check size={12} /> Order sent
                      </p>
                      <p className="text-[11px] text-green-800 leading-relaxed">
                        Your discounted order is with the {sent.outlet} boutique. The representative
                        will confirm it, and your gift code is redeemed when you collect.
                      </p>
                      {sent.url && (
                        <a
                          href={sent.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-700 underline"
                        >
                          <ExternalLink size={11} /> Did the chat not open? Tap here
                        </a>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={!canOrder || !selected || !chosenOutlet || sending || perfumes.length === 0}
                      onClick={() => void sendOrder()}
                      title={selected ? undefined : "Select one perfume first"}
                      className="flex items-center justify-center gap-2 w-full rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all shadow-md bg-[#25D366] text-white hover:bg-[#20BD5A] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#25D366]"
                    >
                      {sending ? (
                        <>
                          <Loader2 size={15} className="animate-spin" /> Sending your order...
                        </>
                      ) : (
                        <>
                          <Send size={14} /> Send Order via WhatsApp
                        </>
                      )}
                    </button>
                  )}

                  {canOrder && !sent && !selected && perfumes.length > 0 && (
                    <p className="text-[10px] text-black/40">Select one perfume to send your discounted order</p>
                  )}

                  <button
                    type="button"
                    onClick={() => void copyCode()}
                    className={`flex items-center justify-center gap-2 w-full rounded-full px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest transition-all shadow-md ${
                      copied
                        ? "bg-green-600 text-white"
                        : "bg-[#121212] text-white hover:bg-[#2A2A2A]"
                    }`}
                  >
                    {copied ? <Check size={15} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy Gift Code"}
                  </button>

                  <p className="flex items-center gap-1.5 text-[10px] text-black/40">
                    <MapPin size={12} className="text-[#D4AF37]" />
                    Show this code at our Unilorin or Tanke boutique to claim
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
