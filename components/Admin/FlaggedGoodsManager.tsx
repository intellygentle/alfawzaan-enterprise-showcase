/* filepath: components/Admin/FlaggedGoodsManager.tsx */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Flag,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import {
  getSalesFlags,
  resolveSalesFlag,
  reopenSalesFlag,
  searchGoodsForFlagging,
  type FlagGoodsSearchItem,
  type SalesFlagFilter,
} from "@/app/admin/dashboard/actions";
import SalesFlagModal, { type FlagTarget } from "@/components/Admin/SalesFlagModal";
import FlaggedGoodsPdfDialog from "@/components/Admin/FlaggedGoodsPdfDialog";
import {
  flagAgeDays,
  isOverdue,
  CHRONIC_FLAG_THRESHOLD,
  type SalesFlag,
  type SalesFlagType,
} from "@/lib/salesFlags";

const TYPE_LABEL: Record<SalesFlagType, string> = {
  number_less: "Number less",
  number_more: "Number more",
  match: "Matches",
};

const TYPE_STYLE: Record<SalesFlagType, string> = {
  number_less: "text-red-600 bg-red-50 border-red-200",
  number_more: "text-blue-600 bg-blue-50 border-blue-200",
  match: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

const GRADE_COLORS: Record<string, string> = {
  special: "text-amber-500 bg-amber-50 border-amber-200",
  extra: "text-blue-500 bg-blue-50 border-blue-200",
  normal: "text-green-500 bg-green-50 border-green-200",
};

function TypeBadge({ type }: { type: SalesFlagType }) {
  const Icon = type === "number_less" ? ArrowDown : type === "number_more" ? ArrowUp : CheckCircle2;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wider ${TYPE_STYLE[type]}`}>
      <Icon size={11} />
      {TYPE_LABEL[type]}
    </span>
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function todayLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function itemKey(outlet: string, productId: string, grade: string): string {
  return `${outlet}|${productId}|${grade}`;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  );
}

export default function FlaggedGoodsManager() {
  const [flags, setFlags] = useState<SalesFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SalesFlagFilter>("open");
  const [outletFilter, setOutletFilter] = useState<"all" | "unilorin" | "tanke">("all");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [chronicOnly, setChronicOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<FlagTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFinder, setShowFinder] = useState(false);
  const [finderOutlet, setFinderOutlet] = useState<"unilorin" | "tanke">("unilorin");
  const [goodsQuery, setGoodsQuery] = useState("");
  const [goodsResults, setGoodsResults] = useState<FlagGoodsSearchItem[]>([]);
  const [goodsLoading, setGoodsLoading] = useState(false);
  const [goodsError, setGoodsError] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setFlags(await getSalesFlags("all"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load flagged goods.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // On-demand catalogue search. Debounced so typing does not spend a request
  // per keystroke; the panel is only mounted/queried once the admin opens it.
  useEffect(() => {
    if (!showFinder) return;
    const query = goodsQuery.trim();
    if (query.length < 2) {
      setGoodsResults([]);
      setGoodsLoading(false);
      setGoodsError(null);
      return;
    }

    let cancelled = false;
    setGoodsLoading(true);
    setGoodsError(null);
    const timer = setTimeout(() => {
      searchGoodsForFlagging(query, finderOutlet)
        .then((rows) => {
          if (!cancelled) setGoodsResults(rows);
        })
        .catch((err) => {
          if (!cancelled) {
            setGoodsResults([]);
            setGoodsError(err instanceof Error ? err.message : "Failed to search goods.");
          }
        })
        .finally(() => {
          if (!cancelled) setGoodsLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [goodsQuery, finderOutlet, showFinder]);

  // Most relevant flag per goods item: prefer an open flag, otherwise the most
  // recent resolved one. Reuses the already-loaded list, so no extra egress.
  const flagByItem = useMemo(() => {
    const map = new Map<string, SalesFlag>();
    for (const flag of flags) {
      const key = itemKey(flag.outlet, flag.product_id, flag.grade);
      const existing = map.get(key);
      if (!existing || (existing.status !== "open" && flag.status === "open")) {
        map.set(key, flag);
      }
    }
    return map;
  }, [flags]);

  const counts = useMemo(() => {
    const base = { open: 0, resolved: 0, number_less: 0, number_more: 0, recurring: 0, overdue: 0, chronic: 0 };
    const perItem = new Map<string, number>();
    for (const flag of flags) {
      if (flag.status === "resolved") base.resolved += 1;
      else base.open += 1;
      if (flag.discrepancy_type === "number_less") base.number_less += 1;
      if (flag.discrepancy_type === "number_more") base.number_more += 1;
      if (flag.is_recurrence) base.recurring += 1;
      if (isOverdue(flag)) base.overdue += 1;
      const key = `${flag.outlet}|${flag.product_id}|${flag.grade}`;
      perItem.set(key, (perItem.get(key) ?? 0) + 1);
    }
    for (const total of perItem.values()) if (total >= CHRONIC_FLAG_THRESHOLD) base.chronic += 1;
    return base;
  }, [flags]);

  const chronicKeys = useMemo(() => {
    const perItem = new Map<string, number>();
    for (const flag of flags) {
      const key = `${flag.outlet}|${flag.product_id}|${flag.grade}`;
      perItem.set(key, (perItem.get(key) ?? 0) + 1);
    }
    return new Set([...perItem.entries()].filter(([, n]) => n >= CHRONIC_FLAG_THRESHOLD).map(([k]) => k));
  }, [flags]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return flags.filter((flag) => {
      if (statusFilter !== "all" && flag.status !== statusFilter) return false;
      if (outletFilter !== "all" && flag.outlet !== outletFilter) return false;
      if (recurringOnly && !flag.is_recurrence) return false;
      if (staleOnly && !isOverdue(flag)) return false;
      if (chronicOnly && !chronicKeys.has(`${flag.outlet}|${flag.product_id}|${flag.grade}`)) return false;
      if (query) {
        const haystack = `${flag.product_name ?? ""} ${flag.product_id} ${flag.note ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [flags, statusFilter, outletFilter, recurringOnly, staleOnly, chronicOnly, chronicKeys, search]);

  function exportCsv() {
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      "Sale date", "Flagged at", "Store", "Product", "Product ID", "Grade",
      "Online", "Physical", "Discrepancy", "Status", "Age (days)",
      "Recurrence count", "Cause note", "Resolution note",
    ];
    const rows = filtered.map((flag) => [
      flag.flag_date,
      flag.flagged_at,
      flag.outlet,
      flag.product_name ?? flag.product_id,
      flag.product_id,
      flag.grade,
      String(flag.online_remaining),
      String(flag.physical_remaining),
      TYPE_LABEL[flag.discrepancy_type],
      flag.status,
      String(flagAgeDays(flag.flagged_at)),
      String(flag.recurrence_count ?? 0),
      flag.note ?? "",
      flag.resolution_note ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flagged-goods-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const openTarget = (flag: SalesFlag) => {
    setTarget({
      date: flag.flag_date,
      outlet: flag.outlet,
      productId: flag.product_id,
      productName: flag.product_name ?? `${flag.product_id.slice(0, 8)}…`,
      grade: flag.grade,
      quantitySold: 0,
      currentStock: flag.online_remaining,
      flag,
    });
  };

  const openGoodsTarget = (
    item: FlagGoodsSearchItem,
    stock: { grade: string; quantity: number },
  ) => {
    const existing = flagByItem.get(itemKey(finderOutlet, item.id, stock.grade));
    setTarget({
      date: existing?.flag_date ?? todayLocalDate(),
      outlet: finderOutlet,
      productId: item.id,
      productName: item.name,
      grade: stock.grade,
      quantitySold: 0,
      currentStock: existing?.online_remaining ?? stock.quantity,
      flag: existing ?? null,
    });
  };

  async function quickToggle(flag: SalesFlag) {
    setBusyId(flag.id);
    setError(null);
    try {
      if (flag.status === "resolved") await reopenSalesFlag(flag.id);
      else await resolveSalesFlag(flag.id);
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-gold/10 text-brand-gold">
            <Flag size={22} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900">Flagged Goods</h2>
            <p className="text-xs text-gray-400 font-medium">
              Sales records with an online vs physical count discrepancy. Resolve once corrected.
            </p>
          </div>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-brand-gold hover:border-brand-gold/30 transition-all disabled:opacity-40"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Find & flag goods */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Find goods to flag</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Search the catalogue and flag a shelf directly, without waiting for a sale record.
            </p>
          </div>
          <button
            onClick={() => setShowFinder((value) => !value)}
            aria-expanded={showFinder}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
              showFinder
                ? "bg-brand-gold text-white border-brand-gold"
                : "bg-white border-gray-200 text-gray-500 hover:text-brand-gold hover:border-brand-gold/30"
            }`}
          >
            <Search size={14} />
            {showFinder ? "Hide search" : "Search goods"}
          </button>
        </div>

        {showFinder && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={finderOutlet}
                onChange={(e) => setFinderOutlet(e.target.value as "unilorin" | "tanke")}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-bold uppercase tracking-wider text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all cursor-pointer"
              >
                <option value="unilorin">Unilorin</option>
                <option value="tanke">Tanke</option>
              </select>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={goodsQuery}
                  onChange={(e) => setGoodsQuery(e.target.value)}
                  placeholder="Type a product name (at least 2 characters)..."
                  className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                />
                {goodsLoading && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-gold" />
                )}
              </div>
            </div>

            {goodsError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-600">
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                <span>{goodsError}</span>
              </div>
            )}

            {goodsQuery.trim().length < 2 ? (
              <p className="text-xs text-gray-400">Start typing a product name to search this store&apos;s shelves.</p>
            ) : goodsLoading && goodsResults.length === 0 ? (
              <p className="text-xs text-gray-400">Searching...</p>
            ) : goodsResults.length === 0 && goodsQuery.trim().length >= 2 && !goodsError ? (
              <p className="text-xs text-gray-400">No products match &ldquo;{goodsQuery.trim()}&rdquo;.</p>
            ) : goodsResults.length > 0 ? (
              <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {goodsResults.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                      <p className="text-[10px] text-gray-400">{item.category || "Uncategorised"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.stock.map((stock) => {
                        const existing = flagByItem.get(itemKey(finderOutlet, item.id, stock.grade));
                        const isOpen = existing?.status === "open";
                        return (
                          <button
                            key={stock.grade}
                            onClick={() => openGoodsTarget(item, stock)}
                            title={
                              existing
                                ? `${isOpen ? "Open" : "Resolved"} flag for ${stock.grade} — click to manage`
                                : `Flag ${stock.grade} (online shows ${stock.quantity})`
                            }
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${
                              isOpen
                                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : existing
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-gray-200 bg-white text-gray-500 hover:border-brand-gold/40 hover:text-brand-gold"
                            }`}
                          >
                            <span className="capitalize">{stock.grade}</span>
                            <span className={existing ? "" : "text-gray-900"}>{stock.quantity}</span>
                            {existing && (isOpen ? <Flag size={10} /> : <CheckCircle2 size={10} />)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-[10px] text-gray-400">
              The number on each grade is the current online stock. Click a grade to open its flag form; a flag icon means an existing flag will be opened instead.
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard label="Open Flags" value={counts.open} tone="text-amber-500" />
        <StatCard label="Overdue" value={counts.overdue} tone="text-red-500" />
        <StatCard label="Recurring" value={counts.recurring} tone="text-purple-600" />
        <StatCard label="Chronic" value={counts.chronic} tone="text-rose-600" />
        <StatCard label="Number Less" value={counts.number_less} tone="text-orange-500" />
        <StatCard label="Number More" value={counts.number_more} tone="text-blue-500" />
        <StatCard label="Resolved" value={counts.resolved} tone="text-emerald-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex bg-white border border-gray-100 rounded-xl p-0.5 w-fit">
          {(["open", "resolved", "all"] as SalesFlagFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                statusFilter === status ? "bg-brand-gold text-white shadow-sm" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value as "all" | "unilorin" | "tanke")}
          className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-bold uppercase tracking-wider text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all cursor-pointer"
        >
          <option value="all">All Stores</option>
          <option value="unilorin">Unilorin</option>
          <option value="tanke">Tanke</option>
        </select>
        <button
          onClick={() => setRecurringOnly((value) => !value)}
          aria-pressed={recurringOnly}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
            recurringOnly
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-white text-gray-500 border-gray-200 hover:text-purple-600 hover:border-purple-300"
          }`}
          title="Show only items flagged more than once"
        >
          <RotateCcw size={13} />
          Recurring
        </button>
        <button
          onClick={() => setStaleOnly((value) => !value)}
          aria-pressed={staleOnly}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
            staleOnly
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-gray-500 border-gray-200 hover:text-red-600 hover:border-red-300"
          }`}
          title="Show only overdue open flags"
        >
          <Clock size={13} />
          Overdue
        </button>
        <button
          onClick={() => setChronicOnly((value) => !value)}
          aria-pressed={chronicOnly}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
            chronicOnly
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-white text-gray-500 border-gray-200 hover:text-rose-600 hover:border-rose-300"
          }`}
          title={`Show only items flagged ${CHRONIC_FLAG_THRESHOLD}+ times`}
        >
          <AlertTriangle size={13} />
          Chronic
        </button>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-brand-gold hover:border-brand-gold/30 transition-all disabled:opacity-40"
          title="Export the filtered flags to CSV"
        >
          <Download size={13} />
          Export
        </button>
        <button
          onClick={() => setPdfOpen(true)}
          disabled={flags.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-brand-gold hover:border-brand-gold/30 transition-all disabled:opacity-40"
          title="Download a detailed PDF report"
        >
          <FileText size={13} />
          PDF report
        </button>
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or note..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
          <Loader2 size={30} className="animate-spin text-brand-gold mx-auto mb-3" />
          <p className="text-xs text-gray-400 font-medium">Loading flagged goods...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-softGray flex items-center justify-center mx-auto mb-4">
            {statusFilter === "resolved" ? (
              <CheckCircle2 size={28} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={28} className="text-brand-gold" />
            )}
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            {flags.length === 0 ? "No flagged goods yet" : "Nothing matches these filters"}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {flags.length === 0
              ? "Flag a sold item from the Daily Sales tab when its online and physical counts disagree."
              : "Try a different status, store, or search term."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Product</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Store</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Grade</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Sale date</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Age</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Online</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Physical</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Discrepancy</th>
                  <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Note</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Status</th>
                  <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                 {filtered.map((flag) => {
                  const isResolved = flag.status === "resolved";
                  const age = flagAgeDays(flag.flagged_at);
                  const overdue = isOverdue(flag);
                  const chronic = chronicKeys.has(`${flag.outlet}|${flag.product_id}|${flag.grade}`);
                  return (
                    <tr key={flag.id} className={`border-b border-gray-50 last:border-b-0 transition-colors ${overdue ? "bg-red-50/40 hover:bg-red-50/60" : "hover:bg-gray-50/30"}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate max-w-[220px]">
                              {flag.product_name || `${flag.product_id.slice(0, 8)}…`}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{flag.product_id.slice(0, 8)}…</p>
                          </div>
                          {chronic && (
                            <span
                              className="inline-flex items-center gap-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg"
                              title={`Flagged ${CHRONIC_FLAG_THRESHOLD}+ times`}
                            >
                              <AlertTriangle size={11} />
                              Chronic
                            </span>
                          )}
                          {flag.is_recurrence && (
                            <span
                              className="inline-flex items-center gap-1 shrink-0 text-[9px] font-black uppercase tracking-wider text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg"
                              title={`Flagged ${flag.recurrence_count ?? 1} time(s) before`}
                            >
                              <RotateCcw size={11} />
                              Repeat ×{flag.recurrence_count ?? 1}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-bold text-gray-600 capitalize">{flag.outlet}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${GRADE_COLORS[flag.grade] || "text-gray-400 bg-gray-50 border-gray-100"}`}>
                          {flag.grade}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500 whitespace-nowrap">{formatDate(flag.flag_date)}</td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold ${overdue ? "text-red-600" : "text-gray-500"}`}>
                          {overdue && <Clock size={12} />}
                          {isResolved ? "—" : `${age}d`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">{flag.online_remaining}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-gray-900">{flag.physical_remaining}</td>
                      <td className="px-3 py-3 text-center"><TypeBadge type={flag.discrepancy_type} /></td>
                      <td className="px-3 py-3">
                        <p className="text-xs text-gray-500 max-w-[220px] truncate" title={flag.note ?? ""}>
                          {flag.note || <span className="text-gray-300">—</span>}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                          isResolved ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-amber-600 bg-amber-50 border-amber-200"
                        }`}>
                          {isResolved ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                          {flag.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => void quickToggle(flag)}
                            disabled={busyId === flag.id}
                            className={`p-1.5 rounded-lg border transition-all disabled:opacity-40 ${
                              isResolved
                                ? "text-blue-500 border-blue-100 hover:bg-blue-50"
                                : "text-emerald-600 border-emerald-100 hover:bg-emerald-50"
                            }`}
                            title={isResolved ? "Reopen flag" : "Mark resolved"}
                          >
                            {busyId === flag.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : isResolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                          </button>
                          <button
                            onClick={() => openTarget(flag)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-gold/25 text-[9px] font-black uppercase tracking-wider text-brand-gold hover:bg-brand-gold/5 transition-all"
                          >
                            <Settings2 size={12} />
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SalesFlagModal
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => void load(true)}
      />

      <FlaggedGoodsPdfDialog
        open={pdfOpen}
        flags={flags}
        onClose={() => setPdfOpen(false)}
      />
    </div>
  );
}
