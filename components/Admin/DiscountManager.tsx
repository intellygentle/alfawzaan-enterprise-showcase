"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent, Search, X, Loader2, AlertCircle, AlertTriangle,
  Clock, CheckCircle2, Pencil, Ban, Info, Layers,
} from "lucide-react";
import {
  getDiscountProducts,
  setProductDiscount,
  clearProductDiscount,
  setBulkDiscounts,
  type DiscountProduct,
} from "@/app/admin/dashboard/actions";
import { computeBulkDiscountPrice, type BulkDiscountMode } from "@/lib/discounts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const ADMIN_ID = "admin-discount-manager";
const PAGE_SIZE = 50;

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString()}`;
}

/** "2026-09-14T15:00" → local-time value accepted by datetime-local inputs */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeRemaining(expiresAt: string, now: number): string {
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return "Expired";
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h left`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m left`;
  return `${minutes}m left`;
}

type DiscountState = "active" | "expired" | "none";

function discountState(product: DiscountProduct, now: number): DiscountState {
  if (product.discountPrice == null || !product.discountExpiresAt) return "none";
  return new Date(product.discountExpiresAt).getTime() > now ? "active" : "expired";
}

export default function DiscountManager() {
  const [products, setProducts] = useState<DiscountProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DiscountState>("all");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  // Edit dialog state
  const [editing, setEditing] = useState<DiscountProduct | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [expiryInput, setExpiryInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);

  // Bulk-by-label dialog state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkMode, setBulkMode] = useState<BulkDiscountMode>("percent");
  const [bulkValue, setBulkValue] = useState("20");
  const [bulkExpiry, setBulkExpiry] = useState("");
  const [bulkExcluded, setBulkExcluded] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{
    updated: number;
    skipped: Array<{ name: string; reason: string }>;
    expiresAt: string;
  } | null>(null);

  const isMigrationError = !!error && error.includes("016_master_product_discounts");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDiscountProducts();
      setProducts(data);
    } catch (err: any) {
      setError(err.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  // Ticking clock keeps countdowns and active/expired badges honest
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    let active = 0;
    let expired = 0;
    for (const p of products) {
      const state = discountState(p, now);
      if (state === "active") active++;
      else if (state === "expired") expired++;
    }
    return { active, expired, none: products.length - active - expired };
  }, [products, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (statusFilter !== "all" && discountState(p, now) !== statusFilter) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        // Active discounts first, then expired, then everything else by name
        const rank = (p: DiscountProduct) => ({ active: 0, expired: 1, none: 2 })[discountState(p, now)];
        const r = rank(a) - rank(b);
        return r !== 0 ? r : a.name.localeCompare(b.name);
      });
  }, [products, search, statusFilter, now]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openDialog(product: DiscountProduct) {
    setEditing(product);
    setFormError(null);
    setPriceInput(
      product.discountPrice != null ? String(product.discountPrice) : ""
    );
    const base =
      product.discountExpiresAt && new Date(product.discountExpiresAt).getTime() > now
        ? new Date(product.discountExpiresAt)
        : new Date(now + 7 * 24 * 60 * 60 * 1000);
    setExpiryInput(toDatetimeLocalValue(base));
  }

  function applyPercentOff(percent: number) {
    if (!editing) return;
    const discounted = Math.round((editing.price * (100 - percent)) / 100);
    setPriceInput(String(discounted));
  }

  function applyPresetDays(days: number) {
    const target = new Date(now + days * 24 * 60 * 60 * 1000);
    // End-of-day feels more natural for whole-day presets
    target.setHours(23, 59, 0, 0);
    setExpiryInput(toDatetimeLocalValue(target));
  }

  async function handleSave() {
    if (!editing) return;
    setFormError(null);
    const discountPrice = Number(priceInput);
    if (!Number.isFinite(discountPrice) || discountPrice <= 0) {
      setFormError("Enter a discount price greater than zero.");
      return;
    }
    if (discountPrice >= editing.price) {
      setFormError(`Discount price must be lower than the normal price (${formatNaira(editing.price)}).`);
      return;
    }
    const expiryMs = new Date(expiryInput).getTime();
    if (!expiryInput || !Number.isFinite(expiryMs)) {
      setFormError("Pick a valid expiry date and time.");
      return;
    }
    if (expiryMs <= Date.now()) {
      setFormError("Expiry must be in the future.");
      return;
    }

    setSaving(true);
    try {
      await setProductDiscount(editing.id, discountPrice, new Date(expiryInput).toISOString(), ADMIN_ID);
      setEditing(null);
      await fetchProducts();
    } catch (err: any) {
      setFormError(err.message || "Failed to save discount.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(product: DiscountProduct) {
    setClearingId(product.id);
    try {
      await clearProductDiscount(product.id, ADMIN_ID);
      await fetchProducts();
    } catch (err: any) {
      setError(err.message || "Failed to remove discount.");
    } finally {
      setClearingId(null);
    }
  }

  // ─── Bulk by label ───

  /** Products whose name contains every space-separated term of the label. */
  const bulkMatches = useMemo(() => {
    const q = bulkLabel.trim().toLowerCase();
    if (q.length < 2) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const name = p.name.toLowerCase();
      return terms.every((t) => name.includes(t));
    });
  }, [products, bulkLabel]);

  const bulkValueNum = Number(bulkValue);
  const bulkPreview = bulkMatches.map((p) => ({
    product: p,
    discounted: computeBulkDiscountPrice(p.price, bulkMode, bulkValueNum),
  }));
  const bulkValid = bulkPreview.filter((x) => x.discounted != null);
  const bulkSelected = bulkValid.filter((x) => !bulkExcluded.has(x.product.id));
  const bulkAllSelected = bulkValid.length > 0 && bulkSelected.length === bulkValid.length;

  function openBulkDialog() {
    setBulkLabel("");
    setBulkMode("percent");
    setBulkValue("20");
    setBulkExpiry(toDatetimeLocalValue(new Date(now + 7 * 24 * 60 * 60 * 1000)));
    setBulkExcluded(new Set());
    setBulkError(null);
    setBulkResult(null);
    setBulkOpen(true);
  }

  function closeBulkDialog() {
    setBulkOpen(false);
    setBulkError(null);
    setBulkResult(null);
  }

  function toggleBulkProduct(productId: string) {
    setBulkExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleBulkSelectAll() {
    setBulkExcluded(bulkAllSelected ? new Set(bulkValid.map((x) => x.product.id)) : new Set());
  }

  function applyBulkPresetDays(days: number) {
    const target = new Date(now + days * 24 * 60 * 60 * 1000);
    target.setHours(23, 59, 0, 0);
    setBulkExpiry(toDatetimeLocalValue(target));
  }

  async function handleBulkApply() {
    setBulkError(null);
    if (bulkMode === "percent" && (!Number.isFinite(bulkValueNum) || bulkValueNum <= 0 || bulkValueNum >= 100)) {
      setBulkError("Percentage must be between 1 and 99.");
      return;
    }
    if (bulkMode === "fixed" && (!Number.isFinite(bulkValueNum) || bulkValueNum <= 0)) {
      setBulkError("Enter a positive discount price.");
      return;
    }
    if (bulkSelected.length === 0) {
      setBulkError("Select at least one product.");
      return;
    }
    const expiryMs = new Date(bulkExpiry).getTime();
    if (!bulkExpiry || !Number.isFinite(expiryMs)) {
      setBulkError("Pick a valid expiry date and time.");
      return;
    }
    if (expiryMs <= now) {
      setBulkError("Expiry must be in the future.");
      return;
    }

    setBulkSaving(true);
    try {
      const entries = bulkSelected.map(({ product, discounted }) => ({
        productId: product.id,
        discountPrice: discounted!,
      }));
      const result = await setBulkDiscounts(entries, new Date(bulkExpiry).toISOString(), ADMIN_ID, bulkLabel.trim() || undefined);
      setBulkResult({ updated: result.updated, skipped: result.skipped, expiresAt: new Date(bulkExpiry).toISOString() });
      await fetchProducts();
    } catch (err: any) {
      setBulkError(err.message || "Failed to apply bulk discount.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-500">
            <BadgePercent size={20} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900">Discount Sales</h2>
            <p className="text-xs text-gray-400 font-medium">
              Set a discount price and an expiry — prices revert automatically once it passes
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600">
              <CheckCircle2 size={12} /> {counts.active} active
            </span>
            {counts.expired > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock size={12} /> {counts.expired} expired
              </span>
            )}
          </div>
          <button
            onClick={openBulkDialog}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20"
          >
            <Layers size={14} /> Bulk by Label
          </button>
        </div>
      </div>

      {/* Migration hint */}
      {isMigrationError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-800">One-time database setup needed</p>
            <p className="text-xs text-amber-700 mt-1">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">devtools/migrations/016_master_product_discounts.sql</code> in
              the <strong>Master</strong> Supabase project&apos;s SQL Editor, then reload this tab.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isMigrationError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-sm text-red-600">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => void fetchProducts()}
            className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter bar */}
      {!loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {([
              ["all", `All (${products.length})`],
              ["active", `Active (${counts.active})`],
              ["expired", `Expired (${counts.expired})`],
              ["none", `No discount (${counts.none})`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  statusFilter === value
                    ? "bg-brand-gold text-white"
                    : "text-gray-400 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Product list */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Loader2 size={28} className="animate-spin text-brand-gold mx-auto mb-3" />
          <p className="text-xs text-gray-400 font-medium">Loading products...</p>
        </div>
      ) : !error && filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Search size={40} className="text-gray-200 mx-auto mb-3" />
          <h3 className="text-base font-bold text-gray-900 mb-1">No products match</h3>
          <p className="text-xs text-gray-400">Try a different search or filter.</p>
        </div>
      ) : !error && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {paginated.map((product) => {
              const state = discountState(product, now);
              const percentOff =
                state !== "none" && product.discountPrice != null
                  ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
                  : 0;
              return (
                <div
                  key={product.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/50 transition-colors"
                >
                  {/* Name + category */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{product.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                      {product.category || "Uncategorised"}
                    </p>
                  </div>

                  {/* Prices */}
                  <div className="flex items-center gap-3 sm:justify-end">
                    {state === "active" && product.discountPrice != null ? (
                      <>
                        <span className="text-sm text-gray-400 line-through">{formatNaira(product.price)}</span>
                        <span className="text-sm font-black text-green-600">{formatNaira(product.discountPrice)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600 text-[9px] font-black uppercase tracking-wider">
                          -{percentOff}%
                        </span>
                      </>
                    ) : state === "expired" && product.discountPrice != null ? (
                      <>
                        <span className="text-sm font-semibold text-gray-700">{formatNaira(product.price)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[9px] font-black uppercase tracking-wider">
                          Expired
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-gray-700">{formatNaira(product.price)}</span>
                    )}
                  </div>

                  {/* Status + actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    {state === "active" && product.discountExpiresAt ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-wider">
                        <Clock size={11} />
                        {timeRemaining(product.discountExpiresAt, now)}
                      </span>
                    ) : state === "expired" ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                        <Info size={11} />
                        Reverted to normal
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">No discount</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {state === "none" ? (
                        <button
                          onClick={() => openDialog(product)}
                          className="px-3 py-1.5 rounded-lg bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-sm shadow-brand-gold/20"
                        >
                          Set Discount
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openDialog(product)}
                            className="p-2 rounded-lg text-gray-400 hover:text-brand-gold hover:bg-brand-gold/10 transition-all"
                            title="Edit discount"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => void handleClear(product)}
                            disabled={clearingId === product.id}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
                            title="End discount now (revert to normal price)"
                          >
                            {clearingId === product.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Ban size={14} />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="mt-2 px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-[10px] text-gray-400">
                Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 disabled:opacity-30"
                >
                  Previous
                </button>
                <span className="text-[10px] font-bold text-gray-500">{safePage} / {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={safePage === pageCount}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Set / Edit Discount Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
              <BadgePercent size={20} className="text-brand-gold" />
              {editing?.discountPrice != null ? "Edit Discount" : "Set Discount"}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {editing ? (
                <>
                  <span className="font-bold text-gray-900">{editing.name}</span> — normal price{" "}
                  <span className="font-bold">{formatNaira(editing.price)}</span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Discount price */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                Discount price (₦)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder={`e.g. ${Math.max(1, Math.round((editing?.price ?? 1000) * 0.8))}`}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
              />
              <div className="flex items-center gap-1.5 mt-2">
                {[10, 20, 25, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyPercentOff(pct)}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider hover:bg-brand-gold/10 hover:text-brand-gold transition-all"
                  >
                    {pct}% off
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                Expiry date &amp; time
              </label>
              <input
                type="datetime-local"
                value={expiryInput}
                onChange={(e) => setExpiryInput(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
              />
              <div className="flex items-center gap-1.5 mt-2">
                {[1, 3, 7, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => applyPresetDays(days)}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider hover:bg-brand-gold/10 hover:text-brand-gold transition-all"
                  >
                    {days === 1 ? "1 day" : `${days} days`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                The price automatically reverts to {editing ? formatNaira(editing.price) : "normal"} once the expiry passes — no action needed.
              </p>
            </div>

            {/* Live preview */}
            {editing && Number(priceInput) > 0 && Number(priceInput) < editing.price && expiryInput && (
              <div className="rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm">
                <span className="text-gray-400 line-through mr-2">{formatNaira(editing.price)}</span>
                <span className="font-black text-green-600">{formatNaira(Number(priceInput))}</span>
                <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-green-500">
                  {Math.round(((editing.price - Number(priceInput)) / editing.price) * 100)}% off
                </span>
                {Number.isFinite(new Date(expiryInput).getTime()) && new Date(expiryInput).getTime() > now && (
                  <p className="text-[10px] text-green-700 mt-1">until {formatExpiry(expiryInput)}</p>
                )}
              </div>
            )}

            {formError && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertCircle size={14} className="shrink-0" />
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Save Discount
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Discount by Label Dialog */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { if (!open && !bulkSaving) closeBulkDialog(); }}>
        <DialogContent className="sm:max-w-lg bg-white max-h-[90vh] overflow-y-auto">
          {bulkResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
                  <Layers size={20} className="text-brand-gold" />
                  Bulk Discount Applied
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500">
                  {bulkLabel.trim() ? (
                    <>Label <span className="font-bold text-gray-900">{bulkLabel.trim()}</span> — </>
                  ) : null}
                  discounts run until {formatExpiry(bulkResult.expiresAt)} and revert automatically.
                </DialogDescription>
              </DialogHeader>

              <div className="py-2 space-y-3">
                <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 size={16} className="shrink-0" />
                  Applied to {bulkResult.updated} product{bulkResult.updated !== 1 ? "s" : ""}.
                </div>
                {bulkResult.skipped.length > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                    <p className="text-xs font-bold text-amber-800">
                      Skipped {bulkResult.skipped.length} product{bulkResult.skipped.length !== 1 ? "s" : ""}:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-[11px] text-amber-700 max-h-32 overflow-y-auto">
                      {bulkResult.skipped.map((s, i) => (
                        <li key={i}>• {s.name} — {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={closeBulkDialog}
                  className="px-5 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20"
                >
                  Done
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
                  <Layers size={20} className="text-brand-gold" />
                  Bulk Discount by Label
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500">
                  Apply one discount to every product sharing a name label — e.g.{" "}
                  <span className="font-medium">naseem</span> or{" "}
                  <span className="font-medium">naseem 24ml</span>.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Label */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                    Name label
                  </label>
                  <input
                    type="text"
                    value={bulkLabel}
                    onChange={(e) => { setBulkLabel(e.target.value); setBulkExcluded(new Set()); }}
                    placeholder="e.g. naseem"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    {bulkLabel.trim().length < 2
                      ? "Type at least 2 characters — every word must appear in the product name."
                      : `${bulkMatches.length} product${bulkMatches.length !== 1 ? "s" : ""} match "${bulkLabel.trim()}"`}
                  </p>
                </div>

                {/* Mode + value */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                    Discount
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBulkMode("percent")}
                        className={`px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          bulkMode === "percent" ? "bg-brand-gold text-white" : "text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        % off
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkMode("fixed")}
                        className={`px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          bulkMode === "fixed" ? "bg-brand-gold text-white" : "text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        Fixed ₦
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                      placeholder={bulkMode === "percent" ? "20" : "4000"}
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                    />
                  </div>
                  {bulkMode === "percent" && (
                    <div className="flex items-center gap-1.5 mt-2">
                      {[10, 20, 25, 40, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setBulkValue(String(pct))}
                          className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider hover:bg-brand-gold/10 hover:text-brand-gold transition-all"
                        >
                          {pct}% off
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                    {bulkMode === "percent"
                      ? "Each product gets the same percentage off its own normal price — works across mixed prices."
                      : "Every selected product gets this exact price. Products where it isn't lower than the normal price are skipped."}
                  </p>
                </div>

                {/* Expiry */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                    Expiry date &amp; time
                  </label>
                  <input
                    type="datetime-local"
                    value={bulkExpiry}
                    onChange={(e) => setBulkExpiry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                  />
                  <div className="flex items-center gap-1.5 mt-2">
                    {[1, 3, 7, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => applyBulkPresetDays(days)}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider hover:bg-brand-gold/10 hover:text-brand-gold transition-all"
                      >
                        {days === 1 ? "1 day" : `${days} days`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Matching products preview */}
                {bulkMatches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Matching products ({bulkSelected.length}/{bulkMatches.length} selected)
                      </label>
                      <button
                        type="button"
                        onClick={toggleBulkSelectAll}
                        className="text-[10px] font-black uppercase tracking-widest text-brand-gold hover:text-brand-gold/80 transition-colors"
                      >
                        {bulkAllSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {bulkPreview.map(({ product, discounted }) => (
                        <label
                          key={product.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={discounted != null && !bulkExcluded.has(product.id)}
                            disabled={discounted == null}
                            onChange={() => toggleBulkProduct(product.id)}
                            className="accent-[#D4AF37] w-4 h-4 shrink-0"
                          />
                          <span className="flex-1 min-w-0 text-xs font-bold text-gray-900 truncate">
                            {product.name}
                          </span>
                          {discounted != null ? (
                            <span className="text-[11px] whitespace-nowrap">
                              <span className="text-gray-400 line-through mr-1.5">{formatNaira(product.price)}</span>
                              <span className="font-black text-green-600">{formatNaira(discounted)}</span>
                              <span className="ml-1.5 text-[9px] font-bold uppercase text-green-500">
                                -{Math.round(((product.price - discounted) / product.price) * 100)}%
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-500 font-bold uppercase whitespace-nowrap">
                              n/a
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {bulkError && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertCircle size={14} className="shrink-0" />
                    {bulkError}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <button
                  type="button"
                  onClick={closeBulkDialog}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkApply()}
                  disabled={bulkSaving || bulkSelected.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50"
                >
                  {bulkSaving && <Loader2 size={12} className="animate-spin" />}
                  Apply to {bulkSelected.length} Product{bulkSelected.length !== 1 ? "s" : ""}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
