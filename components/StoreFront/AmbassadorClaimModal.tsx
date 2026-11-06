// components/StoreFront/AmbassadorClaimModal.tsx
// Ambassador QR claim card, as a guided flow:
//   1. Select  — tick the products; each shows which boutique(s) stock it.
//   2. Pay     — choose the pickup boutique, see the account(s) to pay into.
//   3. Send    — like the normal cart, send to EACH boutique separately (one
//                order + one WhatsApp message per boutique, so the
//                representative is aware and the order is recorded against the
//                right store), then join the group to share the screenshot.
//
// The send uses the cart's exact whatsapp:// handoff so the phone prompts
// WhatsApp vs WhatsApp Business; a group invite is an https link and cannot
// raise that chooser, so the group link is attached to the message instead.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  Landmark,
  Loader2,
  MapPin,
  Megaphone,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { getAmbassadorOfferAction, type AmbassadorOffer } from "@/app/actions/ambassadorActions";
import { placeOrder } from "@/app/actions/orderActions";
import { canonicalAmbassadorCode } from "@/lib/ambassadors";
import { STORE_ACCOUNTS } from "@/lib/constants";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";
import { buildWhatsAppUrl } from "@/utils/whatsappLinkGenerator";

interface AmbassadorClaimModalProps {
  code: string | null;
}

type OfferProduct = AmbassadorOffer["products"][number];
type LoadState = "checking" | "ready" | "unavailable";
type Stage = "select" | "pay" | "send";

interface StoreOrder {
  orderId: string;
  phone: string;
  text: string;
  url: string;
}

function naira(value: number): string {
  return `₦${Math.round(value).toLocaleString()}`;
}

function availabilityLabel(outlets: string[]): string {
  if (outlets.length >= 2) return "Both boutiques";
  if (outlets.length === 1) return `${outlets[0]} only`;
  return "Unavailable";
}

export default function AmbassadorClaimModal({ code }: AmbassadorClaimModalProps) {
  const canonical = code ? canonicalAmbassadorCode(code) : null;
  const valid = Boolean(canonical);

  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [reason, setReason] = useState<"unknown" | "inactive" | "unconfigured" | null>(null);
  const [offer, setOffer] = useState<AmbassadorOffer | null>(null);

  const [stage, setStage] = useState<Stage>("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chosenOutlet, setChosenOutlet] = useState<string | null>(null);
  const [sendingOutlet, setSendingOutlet] = useState<string | null>(null);
  const [sendError, setSendError] = useState("");
  const [storeOrders, setStoreOrders] = useState<Record<string, StoreOrder>>({});
  const [copied, setCopied] = useState(false);
  const checkoutIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (valid) setOpen(true);
  }, [valid]);

  useEffect(() => {
    if (!valid || !canonical) return;
    let cancelled = false;
    setLoadState("checking");
    getAmbassadorOfferAction(canonical)
      .then((result) => {
        if (cancelled) return;
        if (result.available) {
          setOffer(result.offer);
          setLoadState("ready");
          const first = result.offer.products[0];
          if (first) {
            setSelectedIds(new Set([first.id]));
            setChosenOutlet(first.outlets[0] ?? null);
          }
        } else {
          setReason(result.reason);
          setLoadState("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReason("unknown");
          setLoadState("unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [valid, canonical]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selectedProducts = useMemo(
    () => (offer ? offer.products.filter((product) => selectedIds.has(product.id)) : []),
    [offer, selectedIds],
  );

  const commonOutlets = useMemo(() => {
    if (selectedProducts.length === 0) return [];
    return selectedProducts
      .map((product) => product.outlets)
      .reduce((common, outlets) => common.filter((outlet) => outlets.includes(outlet)));
  }, [selectedProducts]);

  const availableStores = useMemo(() => {
    const set = new Set<string>();
    for (const product of selectedProducts) for (const outlet of product.outlets) set.add(outlet);
    return ["Unilorin", "Tanke"].filter((outlet) => set.has(outlet));
  }, [selectedProducts]);

  const fulfilOptions = commonOutlets.length > 0 ? commonOutlets : availableStores;
  const pickupOutlet =
    chosenOutlet && fulfilOptions.includes(chosenOutlet) ? chosenOutlet : fulfilOptions[0] ?? null;

  // The store each item's order is recorded against: the pickup store when it
  // stocks it, otherwise the boutique that does. This yields one group (all at
  // one boutique) or two (items split across the two boutiques) — exactly the
  // per-boutique split the normal cart sends.
  const sendGroups = useMemo(() => {
    if (!pickupOutlet || selectedProducts.length === 0) return [] as Array<{ outlet: string; items: OfferProduct[] }>;
    const map = new Map<string, OfferProduct[]>();
    for (const product of selectedProducts) {
      const fulfil = product.outlets.includes(pickupOutlet) ? pickupOutlet : product.outlets[0];
      const list = map.get(fulfil) ?? [];
      list.push(product);
      map.set(fulfil, list);
    }
    return ["Unilorin", "Tanke"]
      .filter((outlet) => map.has(outlet))
      .map((outlet) => ({ outlet, items: map.get(outlet) as OfferProduct[] }));
  }, [selectedProducts, pickupOutlet]);

  const itemsNeedingTransfer = pickupOutlet
    ? selectedProducts.filter((product) => !product.outlets.includes(pickupOutlet))
    : [];

  const total = selectedProducts.reduce((sum, product) => sum + product.ambassadorPrice, 0);
  const savings = selectedProducts.reduce(
    (sum, product) => sum + Math.max(0, product.realPrice - product.ambassadorPrice),
    0,
  );
  const allSent = sendGroups.length > 0 && sendGroups.every((group) => storeOrders[group.outlet]);

  function toggleProduct(id: string) {
    setSendError("");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function orderSummary(): string {
    const refs = sendGroups
      .map((group) => `- ${group.outlet}: ${storeOrders[group.outlet]?.orderId.slice(0, 8) ?? "pending"}`)
      .join("\n");
    const lines = selectedProducts
      .map((product) => `• ${product.name} — ${naira(product.ambassadorPrice)} (${availabilityLabel(product.outlets)})`)
      .join("\n");
    return (
      `Ambassador order ${offer?.code ?? ""}\n` +
      `Orders:\n${refs}\n` +
      `${lines}\n` +
      `Total: ${naira(total)}\n` +
      `Pickup: ${pickupOutlet ?? ""}\n\n` +
      `I've attached my payment screenshot.`
    );
  }

  async function copyOrderSummary() {
    if (!offer) return;
    const text = orderSummary();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
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
    setTimeout(() => setCopied(false), 2000);
  }

  function openUrl(url: string, newTab = false) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    if (newTab) anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  /**
   * Place one order for one boutique and open that boutique's WhatsApp — the
   * same one-outlet-at-a-time flow the cart uses, so each representative gets
   * the order for their store and it is recorded against the right outlet.
   */
  async function sendStore(group: { outlet: string; items: OfferProduct[] }) {
    if (!offer || sendingOutlet || storeOrders[group.outlet]) return;
    setSendingOutlet(group.outlet);
    setSendError("");
    try {
      const checkoutId = checkoutIdRef.current ?? crypto.randomUUID();
      checkoutIdRef.current = checkoutId;
      const result = await placeOrder({
        checkoutId,
        ambassadorCode: offer.code,
        notes: `Pickup: ${pickupOutlet}`,
        items: group.items.map((product) => ({
          productId: product.id,
          productName: product.name,
          grade: "pending" as const,
          quantity: 1,
          unitPrice: product.ambassadorPrice,
          totalPrice: product.ambassadorPrice,
          outlet: group.outlet.toLowerCase() as "unilorin" | "tanke",
        })),
      });

      if (!result.success) {
        setSendError(result.message || "Could not place the order. Please try again.");
        return;
      }

      const link = result.whatsappLinks?.[0];
      const info: StoreOrder = {
        orderId: result.orders?.[0]?.id ?? "",
        phone: link?.phone ?? "",
        text: link?.text ?? "",
        url: link?.url ?? "",
      };
      setStoreOrders((prev) => ({ ...prev, [group.outlet]: info }));

      const extra = [`Pickup: ${pickupOutlet}`];
      if (offer.whatsappGroupUrl) {
        extra.push(`Join our order group to share your payment screenshot:\n${offer.whatsappGroupUrl}`);
      }
      const text = [info.text, ...extra].filter(Boolean).join("\n\n");
      if (info.phone) openUrl(buildWhatsAppUrl(info.phone, text));
      else if (info.url) openUrl(info.url, true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not place the order. Please try again.");
    } finally {
      setSendingOutlet(null);
    }
  }

  if (!code) return null;

  const stepIndex = stage === "select" ? 0 : stage === "pay" ? 1 : 2;

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
            aria-label="Ambassador offer"
            className="bg-white rounded-3xl w-full max-w-md p-6 sm:p-7 relative shadow-2xl border border-[#D4AF37]/15 max-h-[92vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close ambassador offer"
              className="absolute top-4 right-4 p-2 text-[#121212]/40 hover:text-[#121212] hover:bg-black/5 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            {loadState === "checking" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="animate-spin text-[#D4AF37]" />
                <p className="text-xs text-black/45 font-medium">Loading this ambassador&apos;s offer…</p>
              </div>
            ) : loadState === "unavailable" ? (
              <div className="flex flex-col items-center text-center gap-4 py-6">
                <div className="w-14 h-14 rounded-2xl bg-black/5 border border-black/10 flex items-center justify-center">
                  <AlertCircle size={26} className="text-black/40" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-serif font-bold text-[#121212] tracking-tight">
                    {reason === "inactive" ? "Offer Unavailable" : "Link Not Recognised"}
                  </h2>
                  <p className="text-xs text-black/50 leading-relaxed max-w-[280px] mx-auto">
                    {reason === "inactive"
                      ? "This ambassador's offer is not active right now. Please ask them for an up-to-date link."
                      : "We couldn't find this ambassador offer. Check the link or ask the ambassador to share it again."}
                  </p>
                </div>
                <a
                  href="/store"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8B7355] underline"
                >
                  Browse the full collection <ArrowRight size={12} />
                </a>
              </div>
            ) : offer ? (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FAF5E6] border border-[#D4AF37]/25 flex items-center justify-center">
                  <Megaphone size={22} className="text-[#D4AF37]" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">Ambassador Offer</p>
                  <h2 className="text-xl font-serif font-bold text-[#121212] tracking-tight">{offer.name}</h2>
                  <p className="font-mono text-[10px] text-black/40">{offer.code}</p>
                </div>

                <div className="flex items-center gap-1.5" aria-hidden="true">
                  {["Select", "Pay", "Send"].map((label, index) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span
                        className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wider ${
                          index <= stepIndex ? "bg-[#121212] text-white" : "bg-black/5 text-black/35"
                        }`}
                      >
                        {index + 1}
                      </span>
                      {index < 2 && <span className={`h-px w-3 ${index < stepIndex ? "bg-[#121212]" : "bg-black/10"}`} />}
                    </div>
                  ))}
                </div>

                {/* ── Select ── */}
                {stage === "select" && (
                  <>
                    <p className="text-xs text-black/50 leading-relaxed max-w-[320px]">
                      Exclusive prices on these picks. Each item shows the boutique that stocks it.
                    </p>
                    <div role="group" aria-label="Ambassador products" className="w-full space-y-1.5 max-h-[42vh] overflow-y-auto pr-0.5">
                      {offer.products.map((product) => {
                        const active = selectedIds.has(product.id);
                        return (
                          <button
                            key={product.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleProduct(product.id)}
                            className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                              active
                                ? "border-[#D4AF37] bg-[#FAF5E6] ring-1 ring-[#D4AF37]/40"
                                : "border-black/10 bg-white hover:border-[#D4AF37]/40"
                            }`}
                          >
                            <OptimizedImage
                              src={product.imageUrl}
                              alt={product.name}
                              containerClassName="w-11 h-11 rounded-lg overflow-hidden shrink-0"
                              sizes="44px"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-[#121212] truncate">{product.name}</p>
                              <p className="text-[10px] text-black/45">
                                <span className="line-through">{naira(product.realPrice)}</span>{" "}
                                <span className="font-black text-[#121212]">{naira(product.ambassadorPrice)}</span>
                              </p>
                              <p className={`mt-0.5 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${
                                product.outlets.length >= 2 ? "text-emerald-600" : "text-amber-600"
                              }`}>
                                <MapPin size={9} /> {availabilityLabel(product.outlets)}
                              </p>
                            </div>
                            <span
                              aria-hidden="true"
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                active ? "border-[#D4AF37] bg-[#D4AF37] text-white" : "border-black/15 text-transparent"
                              }`}
                            >
                              <Check size={12} />
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedProducts.length > 0 && (
                      <dl className="w-full rounded-2xl border border-[#D4AF37]/25 bg-[#FAF5E6]/60 px-4 py-3 text-left space-y-1 text-[11px]">
                        <div className="flex justify-between gap-3">
                          <dt className="text-black/50">Items</dt>
                          <dd className="font-bold text-[#121212]">{selectedProducts.length}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-black/50">Ambassador savings</dt>
                          <dd className="font-bold text-[#D4AF37]">−{naira(savings)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-[#D4AF37]/20 pt-1">
                          <dt className="font-bold text-[#121212]">Total</dt>
                          <dd className="font-black text-[#121212]">{naira(total)}</dd>
                        </div>
                      </dl>
                    )}

                    <button
                      type="button"
                      disabled={selectedProducts.length === 0 || !pickupOutlet}
                      onClick={() => setStage("pay")}
                      className="flex items-center justify-center gap-2 w-full rounded-full bg-[#121212] px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next <ArrowRight size={14} />
                    </button>
                    {selectedProducts.length === 0 && (
                      <p className="text-[10px] text-black/40">Select at least one product to continue</p>
                    )}
                  </>
                )}

                {/* ── Pay ── */}
                {stage === "pay" && (
                  <>
                    {fulfilOptions.length > 1 && (
                      <div className="w-full">
                        <p className="mb-1.5 text-left text-[8px] font-bold uppercase tracking-[0.25em] text-black/40">
                          {commonOutlets.length > 1
                            ? "This item is in both boutiques — pick up from"
                            : "Items are split across boutiques — pick up from"}
                        </p>
                        <div className="flex gap-1.5">
                          {fulfilOptions.map((outlet) => (
                            <button
                              key={outlet}
                              type="button"
                              aria-pressed={pickupOutlet === outlet}
                              onClick={() => setChosenOutlet(outlet)}
                              className={`flex-1 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                                pickupOutlet === outlet
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

                    {itemsNeedingTransfer.length > 0 && (
                      <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[10px] leading-relaxed text-amber-800">
                        {itemsNeedingTransfer.map((p) => p.name).join(", ")}{" "}
                        {itemsNeedingTransfer.length === 1 ? "is" : "are"} not stocked at {pickupOutlet}. We&apos;ll
                        bring {itemsNeedingTransfer.length === 1 ? "it" : "them"} over for your pickup — just allow a
                        little extra time.
                      </p>
                    )}

                    {sendGroups.map((group) => {
                      const groupAccount = STORE_ACCOUNTS[group.outlet.toLowerCase()];
                      const groupTotal = group.items.reduce((sum, product) => sum + product.ambassadorPrice, 0);
                      return (
                        <div key={group.outlet} className="w-full rounded-2xl border border-[#D4AF37]/30 bg-[#FAF5E6] px-4 py-3 text-left">
                          <p className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#8B7355]">
                            <span>{group.outlet} boutique</span>
                            <span>{naira(groupTotal)}</span>
                          </p>
                          {groupAccount && (
                            <>
                              <p className="mt-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-black/40">
                                <Landmark size={11} /> Pay to
                              </p>
                              <p className="text-sm font-black text-[#121212]">{groupAccount.accountNumber}</p>
                              <p className="text-[11px] text-black/60">{groupAccount.accountName}</p>
                              <p className="text-[10px] uppercase tracking-wider text-black/40">{groupAccount.bank}</p>
                            </>
                          )}
                        </div>
                      );
                    })}

                    <p className="text-[11px] text-black/50 leading-relaxed">
                      Pay the exact total to each boutique above, then continue. Keep your payment screenshot —
                      you&apos;ll send it with your order.
                    </p>

                    {sendError && (
                      <p className="flex items-start gap-1.5 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-600 text-left">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />
                        {sendError}
                      </p>
                    )}

                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => setStage("select")}
                        className="flex items-center justify-center gap-1.5 rounded-full border border-black/10 px-5 py-3.5 text-[11px] font-bold uppercase tracking-widest text-black/50"
                      >
                        <ArrowLeft size={14} /> Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSendError("");
                          setStage("send");
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-[#20BD5A]"
                      >
                        <Check size={14} /> I have made payment
                      </button>
                    </div>
                  </>
                )}

                {/* ── Send (one boutique at a time, like the cart) ── */}
                {stage === "send" && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest text-black/40">
                      Send to each boutique
                    </p>
                    <p className="-mt-2 text-[11px] text-black/50 leading-relaxed">
                      {sendGroups.length > 1
                        ? "Your items are in two boutiques. Send to one, then come back and send to the other so each representative gets the order for their store."
                        : "Send your order on WhatsApp. Your phone will ask WhatsApp or WhatsApp Business if both are installed."}
                    </p>

                    {sendGroups.map((group) => {
                      const done = storeOrders[group.outlet];
                      const busy = sendingOutlet === group.outlet;
                      return (
                        <div key={group.outlet} className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left">
                          <p className="flex items-center justify-between text-xs font-bold text-[#121212]">
                            <span className="flex items-center gap-1.5">
                              <MapPin size={13} className="text-[#D4AF37]" /> {group.outlet} boutique
                            </span>
                            <span className="text-[11px] font-black">
                              {naira(group.items.reduce((sum, product) => sum + product.ambassadorPrice, 0))}
                            </span>
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {group.items.map((product) => (
                              <li key={product.id} className="text-[10px] text-black/50">
                                {product.name} — {naira(product.ambassadorPrice)}
                              </li>
                            ))}
                          </ul>

                          {done ? (
                            <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-green-700">
                              <Check size={12} /> Sent · ref {done.orderId.slice(0, 8)}
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void sendStore(group)}
                              disabled={sendingOutlet !== null}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[#20BD5A] disabled:opacity-50"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                              {busy ? "Sending…" : `Send order to ${group.outlet}`}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {sendError && (
                      <p className="flex items-start gap-1.5 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-600 text-left">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />
                        {sendError}
                      </p>
                    )}

                    {allSent && (
                      <>
                        <div className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left">
                          <p className="flex items-center gap-2 text-xs font-bold text-[#121212]">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#121212] text-[9px] font-black text-white">
                              ✓
                            </span>
                            Join the group &amp; share your screenshot
                          </p>
                          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-black/55">
                            <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#D4AF37]" />
                            It&apos;s a small, private group — not a busy community. Only you, your ambassador, and
                            Alfawzaan&apos;s Enterprise representatives are there to confirm your payment and help if
                            anything goes wrong. Post the order details and your <strong>payment screenshot</strong>.
                          </p>
                          {offer.whatsappGroupUrl ? (
                            <button
                              type="button"
                              onClick={() => openUrl(offer.whatsappGroupUrl as string, true)}
                              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#128C4A] hover:bg-[#25D366]/20"
                            >
                              <Users size={12} /> Join the order group
                            </button>
                          ) : (
                            <p className="mt-2 text-[10px] text-black/40">
                              The boutique will send you the group invite on WhatsApp.
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => void copyOrderSummary()}
                          className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-black/60"
                        >
                          {copied ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                          {copied ? "Copied" : "Copy order details"}
                        </button>
                      </>
                    )}

                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => setStage("pay")}
                        className="flex items-center justify-center gap-1.5 rounded-full border border-black/10 px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-black/50"
                      >
                        <ArrowLeft size={14} /> Back
                      </button>
                      {!allSent && sendGroups.length > 1 && (
                        <p className="flex flex-1 items-center justify-center text-[10px] text-black/40">
                          Send to each boutique to finish
                        </p>
                      )}
                      {allSent && (
                        <a
                          href="/store"
                          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#121212] px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-[#2A2A2A]"
                        >
                          Done <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </>
                )}

                <div className="w-full rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-2.5">
                  <p className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8B7355]">
                    <BadgeCheck size={12} /> Ambassador {offer.code}
                  </p>
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
