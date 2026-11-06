// components\StoreFront\CartDrawer.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  Trash2,
  MapPin,
  MessageCircle,
  ShoppingBag,
  AlertTriangle,
  Loader2,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Landmark,
  Lock,
  Phone,
  Truck,
} from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { placeOrder } from "@/app/actions/orderActions";
import { STORE_ACCOUNTS } from "@/lib/constants";
import { MoniepointLogo } from "./MoniepointLogo";
import OptimizedImage from "./OptimizedImage";
import { buildWhatsAppUrl } from "@/utils/whatsappLinkGenerator";
import { isValidWhatsAppPhone } from "@/lib/phone";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { cn } from "@/lib/utils";

export function CartDrawer() {
  const {
    items,
    isCartOpen,
    setIsCartOpen,
    removeItem,
    updateQuantity,
    updateOutlet,
    totalPrice,
    clearCart,
  } = useCart();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(false);
  const [receiptName, setReceiptName] = useState("");
  const [checkoutExpanded, setCheckoutExpanded] = useState(false);
  const [submittingOutlet, setSubmittingOutlet] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [orderedOutlets, setOrderedOutlets] = useState<Set<string>>(new Set());
  const [paidOutlets, setPaidOutlets] = useState<Set<string>>(new Set());
  const [copiedOutlet, setCopiedOutlet] = useState<string | null>(null);
  const [receiptOrders, setReceiptOrders] = useState<Record<string, { id: string; total: number }>>({});
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkoutIdsRef = useRef<Record<string, string>>({});

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

  const hasUnselectedOutlets = items.some((i) => !i.selectedOutlet);

  const maxQuantityFor = (item: (typeof items)[number]) => {
    if (!item.availableStock || !item.selectedOutlet) return undefined;
    return item.availableStock[item.selectedOutlet] ?? 0;
  };

  // Group items by selected outlet
  const groupedByOutlet = items.reduce(
    (acc, item) => {
      const outlet = item.selectedOutlet || "Unassigned";
      if (!acc[outlet]) acc[outlet] = [];
      acc[outlet].push(item);
      return acc;
    },
    {} as Record<string, typeof items>
  );

  const outletGroups = Object.entries(groupedByOutlet).filter(
    ([outlet]) => outlet !== "Unassigned"
  );

  const allOutletsOrdered =
    outletGroups.length > 0 &&
    outletGroups.every(([outlet]) => orderedOutlets.has(outlet));

  const handleWhatsAppOrder = async (outlet: string) => {
    if (hasUnselectedOutlets) return;

    setSubmittingOutlet(outlet);
    setError("");
    if (receiptRequested && !receiptName.trim()) {
      setError("Enter the receiver name for your receipt, or turn receipt off.");
      setSubmittingOutlet(null);
      return;
    }
    // A receipt request requires a WhatsApp number: the store sends the
    // VERIFIED receipt to this number after verifying the order, so it must
    // be a real, deliverable number before the order is placed.
    if (receiptRequested && !isValidWhatsAppPhone(phoneNumber)) {
      setError("Enter your WhatsApp number so we can send your verified receipt.");
      setSubmittingOutlet(null);
      return;
    }

    // Get items for this specific outlet
    const outletItems = groupedByOutlet[outlet];
    if (!outletItems || outletItems.length === 0) return;

    try {
      const checkoutId = checkoutIdsRef.current[outlet] ?? crypto.randomUUID();
      checkoutIdsRef.current[outlet] = checkoutId;
      const result = await placeOrder({
        checkoutId,
        customerPhone: phoneNumber.trim() || undefined,
        receiptRequested,
        receiptName: receiptName.trim() || undefined,
        items: outletItems.map((item) => ({
          productId: item.productId,
          productName: item.name,
          grade: "pending" as const,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
          outlet: outlet.toLowerCase() as "unilorin" | "tanke",
        })),
      });

      if (result.success) {
        // Open WhatsApp via the `whatsapp://` custom scheme so the customer's
        // device prompts them to choose WhatsApp vs WhatsApp Business when
        // both are installed (the https link always opens regular WhatsApp).
        // A real anchor click fires the custom scheme most reliably on mobile.
        if (result.whatsappLinks?.length) {
          const link = result.whatsappLinks[0];
          const anchor = document.createElement("a");
          anchor.href = buildWhatsAppUrl(link.phone, link.text);
          anchor.rel = "noopener";
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
        }

        // Mark this outlet as ordered
        setOrderedOutlets((prev) => {
          const next = new Set(prev);
          next.add(outlet);

          // If all outlets are now ordered, clear cart after a delay
           if (next.size === outletGroups.length && !receiptRequested) {
            successTimerRef.current = setTimeout(() => {
              clearCart();
              setIsCartOpen(false);
              setOrderedOutlets(new Set());
              setPaidOutlets(new Set());
              setCopiedOutlet(null);
              setPhoneNumber("");
              successTimerRef.current = null;
            }, 2500);
          }

          return next;
        });
        delete checkoutIdsRef.current[outlet];
        const created = result.orders.find((entry) => entry.outlet.toLowerCase() === outlet.toLowerCase());
        if (created) setReceiptOrders((prev) => ({ ...prev, [outlet]: { id: created.id, total: created.total } }));
      } else {
        setError(result.message || "Failed to place order");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmittingOutlet(null);
    }
  };

  const allOrdered = allOutletsOrdered;

  /** Toggle the customer's "I have paid" confirmation for a store. */
  const togglePaid = (outlet: string) => {
    setPaidOutlets((prev) => {
      const next = new Set(prev);
      if (next.has(outlet)) {
        next.delete(outlet);
      } else {
        next.add(outlet);
      }
      return next;
    });
  };

  /** Copy a store's account number to the clipboard with a short "Copied" ack. */
  const handleCopyAccount = async (outlet: string, accountNumber: string) => {
    const ack = () => {
      setCopiedOutlet(outlet);
      setTimeout(() => {
        setCopiedOutlet((prev) => (prev === outlet ? null : prev));
      }, 2000);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(accountNumber);
        ack();
        return;
      }
      throw new Error("Clipboard API unavailable");
    } catch {
      // Fallback for insecure contexts / older browsers
      try {
        const textarea = document.createElement("textarea");
        textarea.value = accountNumber;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        ack();
      } catch {
        // Neither method worked — the number is still visible on screen to copy manually
      }
    }
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setIsCartOpen(false);
              setOrderedOutlets(new Set());
              setPaidOutlets(new Set());
              setCopiedOutlet(null);
              if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
                successTimerRef.current = null;
              }
            }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#FCFAF2] border-l border-white/40 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-6 border-b border-[#D4AF37]/10">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#D4AF37]" />
                <h2 className="text-lg font-serif font-bold text-[#121212]">Your Cart</h2>
                <span className="bg-[#D4AF37]/10 text-[#D4AF37] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-[#D4AF37]/10">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
              </div>
              <button
                type="button"
                aria-label="Close cart"
                onClick={() => {
                  setIsCartOpen(false);
                  setOrderedOutlets(new Set());
                  setPaidOutlets(new Set());
                  setCopiedOutlet(null);
                }}
                className="p-2 hover:bg-[#121212]/5 text-[#121212]/40 hover:text-[#121212] rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <ShoppingBag size={48} className="text-[#121212]/10 mb-4" />
                  <p className="text-[#121212]/55 font-medium">Your cart is empty</p>
                  <p className="text-xs text-[#121212]/25 mt-1">Browse our collection and add items</p>
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {items.map((item) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      key={item.id}
                      className="bg-white/80 border border-white/30 rounded-2xl p-4 space-y-3 shadow-md"
                    >
                      <div className="flex gap-3">
                        <OptimizedImage
                          src={item.imageUrl}
                          alt={item.name}
                          sizes="64px"
                          containerClassName="w-16 h-16 shrink-0 rounded-xl border border-white/30 bg-[#FAF5E6] overflow-hidden"
                          className="object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#121212] truncate">{item.name}</p>
                          <p className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">{item.category}</p>
                          <p className="text-sm font-bold text-brand-gold mt-1">
                            ₦{(item.price * item.quantity).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name} from cart`}
                          onClick={() => removeItem(item.id)}
                          className="p-2 text-[#121212]/30 hover:text-red-500 transition-colors self-start"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name}`}
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="w-9 h-9 rounded-lg bg-[#121212]/5 border border-[#121212]/10 flex items-center justify-center text-[#121212]/60 hover:border-[#D4AF37] hover:text-[#121212] transition-colors disabled:opacity-30 disabled:hover:border-[#121212]/10"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold w-8 text-center text-[#121212]">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name}`}
                            onClick={() => updateQuantity(item.id, item.quantity + 1, maxQuantityFor(item))}
                            disabled={maxQuantityFor(item) != null && item.quantity >= (maxQuantityFor(item) ?? 0)}
                            className="w-9 h-9 rounded-lg bg-[#121212]/5 border border-[#121212]/10 flex items-center justify-center text-[#121212]/60 hover:border-[#D4AF37] hover:text-[#121212] transition-colors disabled:opacity-30 disabled:hover:border-[#121212]/10"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {item.outlets.map((outlet) => (
                            <button
                              type="button"
                              aria-pressed={item.selectedOutlet === outlet}
                              aria-label={`Select ${outlet} for ${item.name}`}
                              key={outlet}
                              onClick={() => updateOutlet(item.id, outlet)}
                              className={cn(
                                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all border",
                                item.selectedOutlet === outlet
                                  ? "bg-[#121212] text-white border-[#121212] shadow-md shadow-[#121212]/10"
                                  : "bg-[#121212]/5 border-[#121212]/10 text-[#121212]/40 hover:border-[#D4AF37]/50"
                              )}
                            >
                              <MapPin size={9} className="sm:size-[10px]" />
                              {outlet}
                            </button>
                          ))}
                        </div>
                      </div>
                      {item.selectedOutlet && maxQuantityFor(item) != null && (
                        <p className={`text-[10px] font-semibold ${item.quantity >= (maxQuantityFor(item) ?? 0) ? "text-amber-600" : "text-[#121212]/35"}`}>
                          {maxQuantityFor(item)} available at {item.selectedOutlet}
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <>
                {/* ─── COLLAPSIBLE CHECKOUT ─── */}
                   {allOrdered ? (
                     <div className="border-t border-[#D4AF37]/10 bg-white/60 backdrop-blur-sm">
                       <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center justify-center gap-3 p-4 bg-green-950/25 border border-green-900/30 rounded-xl"
                      >
                        <Check size={18} className="text-green-400" />
                         <p className="text-sm font-medium text-green-400">All orders sent via WhatsApp!</p>
                       </motion.div>
                       {receiptRequested && (
                         <div className="rounded-xl border border-brand-gold/20 bg-brand-gold/5 p-4 space-y-2">
                           <p className="text-xs font-bold text-[#121212]">Your receipt is ready to claim</p>
                           <p className="text-[10px] text-[#121212]/45">It will show as pending until the store verifies your order.</p>
                           {outletGroups.map(([outlet]) => receiptOrders[outlet] && (
                             <button key={outlet} type="button" onClick={() => void downloadReceiptPdf({ orderId: receiptOrders[outlet].id, customerName: receiptName, outlet, status: "pending", total: receiptOrders[outlet].total, items: (groupedByOutlet[outlet] ?? []).map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.price, totalPrice: item.price * item.quantity })) })} className="w-full rounded-xl border border-brand-gold/30 bg-white py-2.5 text-[10px] font-black uppercase tracking-widest text-brand-gold transition hover:bg-brand-gold/10">Claim {outlet} receipt</button>
                           ))}
                         </div>
                       )}
                       <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex items-center justify-between p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/15 rounded-xl"
                      >
                        <div>
                          <p className="text-xs font-bold text-[#121212]">Need delivery?</p>
                          <p className="text-[10px] text-[#121212]/40 mt-0.5">Set up delivery and pair with others to save costs</p>
                        </div>
                        <a
                          href="/delivery"
                          className="px-4 py-2 rounded-xl bg-[#D4AF37] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#D4AF37]/80 transition-all shadow-sm"
                        >
                          <Truck size={12} className="inline mr-1" />
                          Deliver
                        </a>
                      </motion.div>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-[#D4AF37]/10 bg-white/60 backdrop-blur-sm">
                    {/* Compact bottom bar — always visible */}
                    <div className="px-4 sm:px-6 py-3 sm:py-4">
                      <button
                        onClick={() => setCheckoutExpanded(!checkoutExpanded)}
                        className="w-full flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-sm text-[#121212]/50">Total</span>
                          <span className="text-lg sm:text-xl font-bold text-[#121212]">₦{totalPrice.toLocaleString()}</span>
                          {!hasUnselectedOutlets && (
                            <span className="hidden sm:inline text-[10px] text-brand-gold font-bold uppercase tracking-wider">
                              {outletGroups.length} store{outletGroups.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasUnselectedOutlets && (
                            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider hidden sm:inline">
                              Select outlet
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#121212] text-white text-[11px] sm:text-xs font-bold uppercase tracking-widest transition-all hover:bg-[#121212]/90 shadow-md">
                            {checkoutExpanded ? (
                              <><X size={14} /> Close</>
                            ) : (
                              <><ShoppingBag size={14} /> Checkout</>
                            )}
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Expanded panel — only renders when toggled open
                        Animates to the content's natural height so multi-store
                        checkout cards never get clipped, and scrolls internally
                        on short screens. */}
                    <AnimatePresence initial={false}>
                      {checkoutExpanded && (
                        <motion.div
                          key="checkout-panel"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-3 sm:space-y-4 border-t border-[#D4AF37]/10 pt-3 sm:pt-4 max-h-[60vh] overflow-y-auto">
                            {/* Optional Phone Input — required when a receipt is
                                requested, because the store sends the VERIFIED
                                receipt to this WhatsApp number after verifying. */}
                            <div className="relative">
                              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#121212]/30" />
                              <input
                                type="tel"
                                placeholder={receiptRequested ? "Your WhatsApp number (required)" : "Phone number (optional)"}
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className={cn(
                                  "w-full pl-10 pr-4 py-2.5 sm:py-3 text-sm bg-white/80 border rounded-xl focus:outline-none focus:ring-1 text-[#121212] transition-all placeholder:text-[#121212]/25",
                                  receiptRequested
                                    ? "border-[#D4AF37] focus:border-[#D4AF37] focus:ring-[#D4AF37]/30"
                                    : "border-white/40 focus:border-[#D4AF37] focus:ring-[#D4AF37]/30"
                                )}
                              />
                            </div>

                            <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-3">
                              <label className="flex items-center gap-2 text-xs font-bold text-[#121212]">
                                <input type="checkbox" checked={receiptRequested} onChange={(event) => setReceiptRequested(event.target.checked)} className="accent-[#D4AF37]" />
                                I want a receipt
                              </label>
                              {receiptRequested && (
                                <>
                                  <input type="text" value={receiptName} onChange={(event) => setReceiptName(event.target.value)} placeholder="Receipt receiver name" className="mt-2 w-full rounded-lg border border-white/50 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#D4AF37]" />
                                  <p className="mt-1.5 text-[10px] text-[#121212]/45 leading-relaxed">
                                    Your verified receipt will be sent to your WhatsApp number above once the store confirms your order — that&apos;s why the number is required.
                                  </p>
                                </>
                              )}
                              {!receiptRequested && (
                                <p className="mt-1 text-[10px] text-[#121212]/45">The receipt becomes available after you send the order to the representative.</p>
                              )}
                            </div>

                            {/* Error Message */}
                            {error && (
                              <div className="flex items-center gap-2.5 p-3 bg-red-950/20 border border-red-900/30 rounded-xl text-xs text-red-400">
                                <AlertTriangle size={14} />
                                <span>{error}</span>
                              </div>
                            )}

                            {/* Per-outlet payment + order cards */}
                            <div className="space-y-3">
                              {outletGroups.map(([outlet, outletItems]) => {
                                const isOrdered = orderedOutlets.has(outlet);
                                const isSubmittingThis = submittingOutlet === outlet;
                                const isPaid = paidOutlets.has(outlet);
                                const account =
                                  STORE_ACCOUNTS[outlet.toLowerCase()] ?? STORE_ACCOUNTS.unilorin;
                                const outletTotal = outletItems.reduce(
                                  (sum, item) => sum + item.price * item.quantity,
                                  0
                                );

                                return (
                                  <div
                                    key={outlet}
                                    className={cn(
                                      "rounded-2xl border p-3 sm:p-4 space-y-3 transition-colors",
                                      isOrdered
                                        ? "border-green-900/30 bg-green-950/10"
                                        : "border-[#121212]/10 bg-white/70 shadow-sm"
                                    )}
                                   >
                                     {isOrdered && receiptRequested && receiptOrders[outlet] && (
                                       <button type="button" onClick={() => void downloadReceiptPdf({ orderId: receiptOrders[outlet].id, customerName: receiptName, outlet, status: "pending", total: receiptOrders[outlet].total, items: outletItems.map((item) => ({ name: item.name, quantity: item.quantity, unitPrice: item.price, totalPrice: item.price * item.quantity })) })} className="w-full rounded-xl border border-brand-gold/30 bg-brand-gold/10 py-2.5 text-[10px] font-black uppercase tracking-widest text-brand-gold transition hover:bg-brand-gold/20">
                                         Download pending receipt
                                       </button>
                                     )}
                                     {receiptRequested && !isOrdered && (
                                       <button type="button" disabled className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-[10px] font-black uppercase tracking-widest text-gray-300">
                                         Claim receipt after WhatsApp is sent
                                       </button>
                                     )}
                                     {/* ─── Account number card ─── */}
                                    <div className="relative overflow-hidden rounded-xl border border-[#1B46EC]/25 bg-gradient-to-br from-[#1B46EC]/10 via-white/70 to-white/90 p-3.5">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#1B46EC]">
                                            Bank Transfer · {outlet} Store
                                          </p>
                                          <p className="text-xl sm:text-2xl font-black text-[#121212] mt-1 tracking-tight">
                                            ₦{outletTotal.toLocaleString()}
                                          </p>
                                          <p className="text-[10px] text-[#121212]/45 mt-0.5">
                                            Pay this exact amount to confirm your {outlet} order
                                          </p>
                                        </div>
                                        <MoniepointLogo className="h-5 w-auto shrink-0" />
                                      </div>

                                      <div className="mt-3 rounded-xl bg-white/90 border border-[#1B46EC]/10 divide-y divide-[#1B46EC]/5">
                                        <div className="px-3 py-2">
                                          <p className="text-[9px] font-bold uppercase tracking-wider text-[#121212]/35">
                                            Account Name
                                          </p>
                                          <p className="text-[11px] sm:text-xs font-bold text-[#121212] truncate mt-0.5">
                                            {account.accountName}
                                          </p>
                                        </div>
                                        <div className="px-3 py-2 flex items-center justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-[#121212]/35">
                                              Account Number
                                            </p>
                                            <p className="text-sm font-black text-[#121212] tracking-[0.08em] mt-0.5 font-mono">
                                              {account.accountNumber}
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleCopyAccount(outlet, account.accountNumber)
                                            }
                                            className={cn(
                                              "shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                                              copiedOutlet === outlet
                                                ? "bg-green-100 border-green-300 text-green-700"
                                                : "bg-[#1B46EC] border-[#1B46EC] text-white hover:bg-[#1B46EC]/85"
                                            )}
                                          >
                                            {copiedOutlet === outlet ? (
                                              <>
                                                <Check size={11} /> Copied
                                              </>
                                            ) : (
                                              <>
                                                <Copy size={11} /> Copy
                                              </>
                                            )}
                                          </button>
                                        </div>
                                        <div className="px-3 py-1.5 flex items-center gap-1.5">
                                          <Landmark size={10} className="text-[#1B46EC]" />
                                          <p className="text-[10px] font-semibold text-[#121212]/50">
                                            {account.bank}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {/* ─── I have paid toggle ─── */}
                                    <button
                                      type="button"
                                      onClick={() => togglePaid(outlet)}
                                      aria-pressed={isPaid}
                                      disabled={isOrdered}
                                      className={cn(
                                        "w-full flex items-center justify-center gap-2 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest rounded-xl border transition-all",
                                        isPaid
                                          ? "bg-green-100/90 border-green-300 text-green-700"
                                          : "bg-white border-[#121212]/15 text-[#121212]/60 hover:border-[#D4AF37] hover:text-[#121212]"
                                      )}
                                    >
                                      {isPaid ? (
                                        <>
                                          <CheckCircle2 size={14} />
                                          Payment confirmed
                                        </>
                                      ) : (
                                        <>
                                          <Circle size={14} />
                                          I have paid
                                        </>
                                      )}
                                    </button>

                                    {/* ─── WhatsApp send (unlocks after paid) ─── */}
                                    <button
                                      onClick={() => handleWhatsAppOrder(outlet)}
                                      disabled={
                                        isSubmittingThis ||
                                        isOrdered ||
                                        hasUnselectedOutlets ||
                                        !isPaid
                                      }
                                      className={cn(
                                        "w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-lg",
                                        isOrdered
                                          ? "bg-green-950/20 border border-green-900/30 text-green-400 shadow-none cursor-default"
                                          : isPaid
                                          ? "bg-[#25D366] hover:bg-[#20BD5A] disabled:bg-[#121212]/10 disabled:text-[#121212]/20 disabled:border-[#121212]/5 text-white shadow-[#25D366]/10 hover:shadow-[#25D366]/20 disabled:shadow-none"
                                          : "bg-[#121212]/5 border border-[#121212]/10 text-[#121212]/25 shadow-none cursor-not-allowed"
                                      )}
                                    >
                                      {isOrdered ? (
                                        <>
                                          <Check size={16} />
                                          {outlet} — Sent
                                        </>
                                      ) : isSubmittingThis ? (
                                        <>
                                          <Loader2 size={16} className="animate-spin" />
                                          Sending to {outlet}...
                                        </>
                                      ) : !isPaid ? (
                                        <>
                                          <Lock size={14} />
                                          Send {outlet} order via WhatsApp — ₦{outletTotal.toLocaleString()}
                                        </>
                                      ) : (
                                        <>
                                          <MessageCircle size={16} />
                                          <span className="sm:hidden">Send {outlet} — ₦{outletTotal.toLocaleString()}</span>
                                          <span className="hidden sm:inline">Send {outlet} order via WhatsApp — ₦{outletTotal.toLocaleString()}</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>

                            {outletGroups.length > 1 && (
                              <p className="text-[10px] text-[#121212]/30 text-center leading-relaxed">
                                {hasUnselectedOutlets
                                  ? "Select a pickup outlet for each item above"
                                  : `Transfer to each store's account, tap “I have paid”, then send its order via WhatsApp — ${paidOutlets.size} of ${outletGroups.length} confirmed`}
                              </p>
                            )}

                            {hasUnselectedOutlets && (
                              <p className="text-[10px] text-amber-500/80 text-center flex items-center justify-center gap-1">
                                <AlertTriangle size={12} />
                                Select a pickup outlet for all items above
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
