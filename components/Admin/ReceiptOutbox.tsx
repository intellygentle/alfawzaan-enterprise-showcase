// components/Admin/ReceiptOutbox.tsx
// The persistent receipt-sending desk. The pending-orders list only shows
// orders BEFORE verification, and the "Just verified" pinned card disappears
// on reload — so there was no lasting place to send a verified receipt to the
// WhatsApp number the customer entered at checkout. This component lists every
// receipt-requested order (pending + verified) and offers, per order:
//
//   · "Send Verified Receipt" — downloads the verified receipt PDF and opens
//     the customer's WhatsApp DM pre-filled with the appreciation message
//     (the admin attaches the PDF in the chat)
//   · "Download" — receipt PDF only, no WhatsApp handoff
//   · "Mark Sent" — local acknowledgment so the row visually clears; the
//     server stays authoritative (rows reappear on another device/refresh)
//
// Pending rows show a "waiting for verification" state — the receipt becomes
// sendable the moment the order is verified.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2, AlertCircle, RefreshCw, MessageCircle, FileText,
  CheckCheck, Clock, Search, Send,
} from "lucide-react";
import { getReceiptOutbox, getReceiptData } from "@/app/admin/dashboard/actions";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { openVerifiedReceiptWhatsapp } from "@/lib/receiptMessage";

interface OutboxEntry {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  receiptName: string | null;
  outlet: string;
  total: number;
  status: "pending" | "paid";
  updatedAt: string;
  /** False for verified orders whose receipt flag was lost before the Archive
   *  RPC fix (migration 018) — sendable, but only if the customer asked. */
  receiptRequested: boolean;
}

const SENT_KEY = "alfawzaan-receipt-outbox-sent-v1";
const SENT_LIMIT = 200;

function loadSentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveSentIds(ids: string[]) {
  if (typeof window === "undefined") return;
  // Keep the newest entries; bounded like the cart persistence.
  window.localStorage.setItem(SENT_KEY, JSON.stringify(ids.slice(0, SENT_LIMIT)));
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function ReceiptOutbox() {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [filter, setFilter] = useState("");

  const fetchOutbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getReceiptOutbox());
    } catch (err: any) {
      setError(err.message || "Failed to load the receipt outbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSentIds(loadSentIds());
    void fetchOutbox();
  }, [fetchOutbox]);

  function markSent(id: string) {
    setSentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)];
      saveSentIds(next);
      return next;
    });
  }

  /** Download the VERIFIED receipt PDF, then open the customer's WhatsApp DM. */
  async function handleSend(entry: OutboxEntry) {
    setBusyId(entry.id);
    setError(null);
    setNotice(null);
    try {
      const receipt = await getReceiptData(entry.id);
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
      const phone = openVerifiedReceiptWhatsapp(
        entry.customerPhone || "",
        entry.receiptName,
        entry.customerName,
      );
      if (!phone) {
        setError(`No valid WhatsApp number on order #${entry.id.slice(0, 8)} — receipt downloaded only.`);
        return;
      }
      markSent(entry.id);
      setNotice(`Receipt downloaded and WhatsApp opened for +${phone}. Attach the PDF in the chat.`);
    } catch (err: any) {
      setError(err.message || "Failed to send the receipt.");
    } finally {
      setBusyId(null);
    }
  }

  /** Download the verified receipt PDF without the WhatsApp handoff. */
  async function handleDownload(entry: OutboxEntry) {
    setBusyId(entry.id);
    setError(null);
    setNotice(null);
    try {
      const receipt = await getReceiptData(entry.id);
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
      setNotice(`Receipt for order #${entry.id.slice(0, 8)} downloaded.`);
    } catch (err: any) {
      setError(err.message || "Failed to download the receipt.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = entries.filter((entry) => {
    const sent = sentIds.includes(entry.id);
    if (filter === "unsent") return !sent;
    if (filter === "sent") return sent;
    return true;
  });

  const unsentCount = entries.filter((e) => !sentIds.includes(e.id) && e.status === "paid").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Receipt Outbox</h2>
          <p className="text-xs text-gray-500 mt-1">
            Verified receipts waiting to reach the customer&apos;s WhatsApp number from checkout.
            {unsentCount > 0 && (
              <span className="ml-1 font-bold text-brand-gold">{unsentCount} ready to send.</span>
            )}
            <br />
            Verified orders with a number on file but no receipt request are listed
            too, so a receipt request placed before the checkout fix can still be sent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white p-0.5 text-[10px] font-black uppercase tracking-wider">
            {(["all", "unsent", "sent"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(filter === key ? "" : key)}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  filter === key ? "bg-brand-gold text-white" : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fetchOutbox()}
            className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-xs text-green-700">
          <CheckCheck size={14} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white p-12 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Loading receipts...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-sm text-gray-400">
          {filter === "sent"
            ? "No receipts marked as sent yet."
            : filter === "unsent"
              ? "Every verified receipt has been sent. 🎉"
              : "No customers have requested receipts yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => {
            const sent = sentIds.includes(entry.id);
            const verified = entry.status === "paid";
            return (
              <div
                key={entry.id}
                className={`rounded-2xl border bg-white overflow-hidden transition-opacity ${
                  sent ? "border-green-100 opacity-70" : "border-gray-100"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900 text-sm">Order #{entry.id.slice(0, 8)}</p>
                      {verified ? (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-wider">
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider">
                          <Clock size={9} /> Awaiting verification
                        </span>
                      )}
                      {!entry.receiptRequested && (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-black uppercase tracking-wider"
                          title="No receipt request was recorded on this order — send only if the customer asked for one"
                        >
                          No receipt request
                        </span>
                      )}
                      {sent && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-600 text-[9px] font-black uppercase tracking-wider">
                          <CheckCheck size={9} /> Sent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {entry.receiptName || entry.customerName || "Unnamed customer"}
                      {entry.customerPhone ? ` • ${entry.customerPhone}` : " • no phone entered"}
                      {` • ${entry.outlet.charAt(0).toUpperCase() + entry.outlet.slice(1)}`}
                      {` • ₦${Number(entry.total || 0).toLocaleString()}`}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Last update {formatWhen(entry.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative">
                      <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                      <input
                        type="tel"
                        defaultValue={entry.customerPhone || ""}
                        placeholder="No phone on order"
                        className="w-36 rounded-lg border border-gray-200 bg-white pl-7 pr-2 py-1.5 text-xs text-gray-600 outline-none focus:border-brand-gold"
                        title="The WhatsApp number the customer entered at checkout"
                        readOnly
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!verified || busyId === entry.id}
                      onClick={() => void handleSend(entry)}
                      title={verified ? "Download receipt and open the customer's WhatsApp" : "Verify the order first"}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#20BD5A] transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busyId === entry.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : sent ? (
                        <Send size={12} />
                      ) : (
                        <MessageCircle size={12} />
                      )}
                      {sent ? "Send again" : "Send"}
                    </button>
                    <button
                      type="button"
                      disabled={!verified || busyId === entry.id}
                      onClick={() => void handleDownload(entry)}
                      title={verified ? "Download the verified receipt PDF" : "Verify the order first"}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-300 bg-white text-green-700 text-[10px] font-black uppercase tracking-widest hover:bg-green-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileText size={12} />
                      PDF
                    </button>
                    {!sent && verified && (
                      <button
                        type="button"
                        onClick={() => markSent(entry.id)}
                        title="Mark as sent without opening WhatsApp"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                      >
                        <CheckCheck size={12} />
                        Mark sent
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
