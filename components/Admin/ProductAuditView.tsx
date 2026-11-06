/* filepath: components/Admin/ProductAuditView.tsx */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Loader2,
  AlertCircle,
  Store,
  MapPin,
  BadgeCheck,
  Clock,
  ArrowUpDown,
  ImageIcon,
  FileText,
  User,
  MessageCircle,
  X,
  Filter,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  searchProducts,
  getProductAudit,
  deleteProductAction,
} from "@/app/admin/dashboard/actions";
import type {
  ProductSearchResult,
  ProductAuditData,
  StockAdjustmentEntry,
  OrderSaleEntry,
} from "@/lib/types";

/* ─────────── helpers ─────────── */

function n(num: number) {
  return `\u20A6${num.toLocaleString()}`;
}

function formatEventDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getDateKey(dateStr: string) {
  return new Date(dateStr).toISOString().split("T")[0];
}

function ago(dateStr: string) {
  return formatEventDate(dateStr);
}

const gradeColors: Record<string, string> = {
  special: "bg-amber-100 text-amber-800 border-amber-200",
  extra: "bg-emerald-100 text-emerald-800 border-emerald-200",
  normal: "bg-blue-100 text-blue-800 border-blue-200",
};

const actionIcons: Record<string, React.ReactNode> = {
  SALE: <ShoppingCart size={16} />,
  ORDER_PLACED: <Clock size={16} />,
  ADJUSTMENT: <ArrowUpDown size={16} />,
  RESTOCK: <Package size={16} />,
  CREATED: <BadgeCheck size={16} />,
  PRICE_SYNC: <TrendingUp size={16} />,
};

const actionColors: Record<string, string> = {
  SALE: "border-l-red-400 bg-red-50/50",
  ORDER_PLACED: "border-l-amber-300 bg-amber-50/30",
  ADJUSTMENT: "border-l-amber-400 bg-amber-50/50",
  RESTOCK: "border-l-emerald-400 bg-emerald-50/50",
  CREATED: "border-l-blue-400 bg-blue-50/50",
  PRICE_SYNC: "border-l-violet-400 bg-violet-50/50",
};

/* ─────────── skeleton ─────────── */

function AuditSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-48 bg-gray-100 rounded-2xl" />
      <div className="h-32 bg-gray-100 rounded-2xl" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* ─────────── main component ─────────── */

export default function ProductAuditView({ initialProductId }: { initialProductId?: string }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [auditData, setAuditData] = useState<ProductAuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Auto-select a product from an initialProductId prop (e.g. from inventory table)
  useEffect(() => {
    if (!initialProductId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getProductAudit(initialProductId);
        if (cancelled) return;
        setAuditData(data);
        if (data.product) {
          const result: ProductSearchResult = {
            id: data.product.id,
            name: data.product.name,
            category: data.product.category,
            base_image_url: data.product.base_image_url,
          };
          setSelectedProduct(result);
          setQuery(data.product.name);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || "Failed to load audit data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialProductId]);
  const [selectedTimelineType, setSelectedTimelineType] = useState<string>("all");
  const [filterOutlet, setFilterOutlet] = useState<"all" | "unilorin" | "tanke">("all");
  const [filterGrades, setFilterGrades] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLocation, setDeleteLocation] = useState<'unilorin' | 'tanke' | 'both'>('both');
  const [deletePassword, setDeletePassword] = useState('');

  // Click outside to close search results
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchProducts(value);
        setSearchResults(results);
        setShowResults(true);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Select a product and fetch audit data
  const selectProduct = async (product: ProductSearchResult) => {
    setSelectedProduct(product);
    setShowResults(false);
    setQuery(product.name);
    setLoading(true);
    setError(null);

    try {
      const data = await getProductAudit(product.id);
      setAuditData(data);
    } catch (err: any) {
      setError(err.message || "Failed to load audit data");
      console.error("Audit fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const adminId = "admin-audit-delete";
      await deleteProductAction(selectedProduct.id, adminId, deleteLocation, deletePassword);
      setShowDeleteConfirm(false);
      setDeletePassword('');
      clearSelection();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete product.");
    } finally {
      setDeleting(false);
    }
  };

  const clearSelection = () => {
    setSelectedProduct(null);
    setAuditData(null);
    setQuery("");
    setError(null);
    inputRef.current?.focus();
  };

  /* ─── Timeline builder ─── */

  type TimelineEvent = {
    id: string;
    type: string;
    date: string;
    label: string;
    description: string;
    outlet?: string;
    admin?: string;
    grade?: string;
    delta?: number;
  };

  const buildTimeline = (): TimelineEvent[] => {
    if (!auditData) return [];
    const events: TimelineEvent[] = [];

    // Product creation
    if (auditData.product) {
      events.push({
        id: "created",
        type: "CREATED",
        date: auditData.product.created_at,
        label: "Product Created",
        description: `Added to catalog under "${auditData.product.category}"`,
      });
    }

    // Stock adjustments
    for (const adj of auditData.stockAdjustments) {
      const diff = adj.new_quantity - adj.old_quantity;
      events.push({
        id: `adj-${adj.id}`,
        type: diff > 0 ? "RESTOCK" : "ADJUSTMENT",
        date: adj.created_at,
        label: diff > 0 ? "Stock Increased" : "Stock Decreased",
        description: `${adj.grade.charAt(0).toUpperCase() + adj.grade.slice(1)}: ${adj.old_quantity} \u2192 ${adj.new_quantity} (${diff > 0 ? "+" : ""}${diff})`,
        outlet: adj.outlet,
        admin: adj.admin_email || adj.admin_id,
        grade: adj.grade,
        delta: diff,
      });
    }

    // Order sales (per line-item)
    // ── Show verified orders as SALE events (stock actually deducted) ──
    // ── Show pending orders as ORDER_PLACED events (stock only reserved, NOT deducted) ──
    // ── Skip cancelled orders entirely (they were never fulfilled) ──
    for (const sale of auditData.orderSales) {
      if (sale.order_status === 'cancelled') continue;
      const isPending = sale.order_status === 'pending';
      events.push({
        id: `sale-${sale.order_id}-${sale.grade}-${sale.outlet}-${sale.order_created_at}`,
        type: isPending ? "ORDER_PLACED" : "SALE",
        date: sale.order_created_at,
        label: isPending
          ? `${sale.quantity}x ${sale.grade === 'pending' ? 'Unassigned' : sale.grade.charAt(0).toUpperCase() + sale.grade.slice(1)} - ${n(sale.total_price)}`
          : `${sale.quantity}x ${sale.grade.charAt(0).toUpperCase() + sale.grade.slice(1)} - ${n(sale.total_price)}`,
        description: isPending
          ? `Order #${sale.order_id.slice(0, 8)} \u00B7 ${sale.customer_name || sale.customer_phone} \u00B7 ${sale.outlet} \u00B7 Awaiting verification`
          : `Order #${sale.order_id.slice(0, 8)} \u00B7 ${sale.customer_name || sale.customer_phone} \u00B7 ${sale.outlet}`,
        outlet: sale.outlet,
        grade: sale.grade === 'pending' ? undefined : sale.grade,
        delta: isPending ? 0 : -sale.quantity,
      });
    }

    // Audit logs from archive
    for (const log of auditData.auditLogs) {
      events.push({
        id: `log-${log.id}`,
        type: log.action || "EVENT",
        date: log.created_at,
        label: log.action || "Event",
        description: log.details || "",
        outlet: log.outlet,
        admin: log.admin_email,
      });
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events;
  };

  const toggleGrade = (grade: string) => {
    setFilterGrades((prev) => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSelectedTimelineType("all");
    setFilterOutlet("all");
    setFilterGrades(new Set());
    setDateFrom("");
    setDateTo("");
  };

  const hasActiveFilters =
    selectedTimelineType !== "all" ||
    filterOutlet !== "all" ||
    filterGrades.size > 0 ||
    dateFrom !== "" ||
    dateTo !== "";

  const timeline = buildTimeline();
  const filteredTimeline = timeline.filter((e) => {
    // Type filter
    if (selectedTimelineType !== "all" && e.type !== selectedTimelineType) return false;
    // Outlet filter
    if (filterOutlet !== "all" && e.outlet && e.outlet.toLowerCase() !== filterOutlet) return false;
    // Grade filter (multi-select)
    if (filterGrades.size > 0 && e.grade && !filterGrades.has(e.grade)) return false;
    // Date range filter
    if (dateFrom) {
      const eventDate = new Date(e.date).toISOString().split("T")[0];
      if (eventDate < dateFrom) return false;
    }
    if (dateTo) {
      const eventDate = new Date(e.date).toISOString().split("T")[0];
      if (eventDate > dateTo) return false;
    }
    return true;
  });

  /* ─── Stats ─── */

  const verifiedOrderStatuses = ['paid', 'shipping', 'delivered'];
  const verifiedSales = auditData?.orderSales.filter(o => verifiedOrderStatuses.includes(o.order_status)) ?? [];
  const totalSales = verifiedSales.reduce((s, o) => s + o.quantity, 0);
  const totalRevenue = verifiedSales.reduce((s, o) => s + o.total_price, 0);
  const totalAdjustments = auditData?.stockAdjustments.length ?? 0;
  const unilorinTotal = auditData
    ? auditData.inventory.unilorin.special + auditData.inventory.unilorin.extra + auditData.inventory.unilorin.normal
    : 0;
  const tankeTotal = auditData
    ? auditData.inventory.tanke.special + auditData.inventory.tanke.extra + auditData.inventory.tanke.normal
    : 0;

  /* ─────────── types for timeline filter ─────────── */

  const timelineTypes = [
    { value: "all", label: "All Activity" },
    { value: "SALE", label: "Sales" },
    { value: "ORDER_PLACED", label: "Pending Orders" },
    { value: "RESTOCK", label: "Restocks" },
    { value: "ADJUSTMENT", label: "Adjustments" },
    { value: "CREATED", label: "Created" },
    { value: "PRICE_SYNC", label: "Price Syncs" },
  ];

  /* ─────────── render ─────────── */

  return (
    <div className="space-y-8">
      {/* ─── SEARCH BAR ─── */}
      <div ref={searchRef} className="relative max-w-2xl mx-auto">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowResults(true);
            }}
            placeholder="Search any product by name..."
            className="pl-12 pr-12 py-7 text-base rounded-2xl border-gray-200 shadow-sm focus:border-[#D4AF37] focus:ring-[#D4AF37]/20"
          />
          {query && (
            <button
              onClick={clearSelection}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={18} />
            </button>
          )}
          {searching && (
            <Loader2
              size={18}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"
            />
          )}
        </div>

        {/* Autocomplete dropdown */}
        <AnimatePresence>
          {showResults && searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute z-50 mt-2 w-full bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/50 overflow-hidden"
            >
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onClick={() => selectProduct(product)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {product.base_image_url ? (
                      <img
                        src={product.base_image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={18} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      {product.name}
                    </p>
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                      {product.category}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    View Audit
                  </Badge>
                </button>
              ))}
            </motion.div>
          )}

          {showResults && searchResults.length === 0 && !searching && query.length >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute z-50 mt-2 w-full bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-200/50 p-8 text-center"
            >
              <AlertCircle size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-500">
                No products found for &ldquo;{query}&rdquo;
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Try a different search term
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── ERROR STATE ─── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto bg-red-50 border border-red-100 rounded-2xl p-5 flex items-start gap-4"
        >
          <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-800">Failed to load audit data</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
          <button
            onClick={() => selectedProduct && selectProduct(selectedProduct)}
            className="ml-auto text-xs font-bold text-red-700 hover:text-red-900 shrink-0"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* ─── LOADING ─── */}
      {loading && <AuditSkeleton />}

      {/* ─── AUDIT VIEW ─── */}
      {!loading && auditData && auditData.product && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* ── Product Header Card ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-[#D4AF37]/10 to-[#F5E6AD]/10 p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row items-start gap-6">
                {/* Image */}
                <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                  {auditData.product.base_image_url ? (
                    <img
                      src={auditData.product.base_image_url}
                      alt={auditData.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={36} className="text-gray-300" />
                  )}
                </div>

                {/* Info */}                        <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h2 className="text-2xl lg:text-3xl font-serif font-black text-gray-900">
                      {auditData.product.name}
                    </h2>
                    <Badge className="bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 text-[10px] font-black uppercase tracking-widest">
                      {auditData.product.category}
                    </Badge>
                    <button
                      onClick={() => {
                        // Auto-select best location
                        const u = auditData?.inventory.unilorin;
                        const t = auditData?.inventory.tanke;
                        const hasU = u ? u.special + u.extra + u.normal > 0 : false;
                        const hasT = t ? t.special + t.extra + t.normal > 0 : false;
                        if (hasU && hasT) setDeleteLocation('both');
                        else if (hasU) setDeleteLocation('unilorin');
                        else if (hasT) setDeleteLocation('tanke');
                        setShowDeleteConfirm(true);
                      }}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 transition-all"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                  {auditData.product.description && (
                    <p className="text-sm text-gray-500 mb-3 max-w-lg">
                      {auditData.product.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays size={13} />
                      Created {formatEventDate(auditData.product.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} />
                      Updated {ago(auditData.product.updated_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileText size={13} />
                      ID: {auditData.product.id.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 border-t border-gray-100">
              <StatBox
                label="Units Sold"
                value={totalSales.toString()}
                icon={<ShoppingCart size={16} />}
                color="text-red-500"
              />
              <StatBox
                label="Total Revenue"
                value={n(totalRevenue)}
                icon={<TrendingUp size={16} />}
                color="text-emerald-500"
              />
              <StatBox
                label="Adjustments"
                value={totalAdjustments.toString()}
                icon={<ArrowUpDown size={16} />}
                color="text-amber-500"
              />
              <StatBox
                label="In Stock"
                value={`${unilorinTotal + tankeTotal}`}
                icon={<Package size={16} />}
                color="text-blue-500"
              />
            </div>
          </div>

          {/* ── Current Inventory ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:p-8">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Store size={18} className="text-[#D4AF37]" />
              Current Inventory
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Outlet
                    </th>
                    <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Badge className={`${gradeColors.special} text-[9px] px-1.5 py-0 border`}>S</Badge>
                        Special
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Badge className={`${gradeColors.extra} text-[9px] px-1.5 py-0 border`}>E</Badge>
                        Extra
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Badge className={`${gradeColors.normal} text-[9px] px-1.5 py-0 border`}>N</Badge>
                        Normal
                      </span>
                    </th>
                    <th className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <InventoryRow
                    outlet="Unilorin"
            icon={<MapPin size={14} />}
                    data={auditData.inventory.unilorin}
                  />
                  <InventoryRow
                    outlet="Tanke"
            icon={<MapPin size={14} />}
                    data={auditData.inventory.tanke}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Activity Timeline ── */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:p-8">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Clock size={18} className="text-[#D4AF37]" />
                  Activity Timeline
                  <span className="text-xs font-medium text-gray-400 ml-2">
                    ({filteredTimeline.length} events)
                  </span>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-wider ml-2 transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </h3>

                {/* Event type filter pills */}
                <div className="flex flex-wrap gap-1.5">
                  {timelineTypes.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setSelectedTimelineType(t.value)}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                        selectedTimelineType === t.value
                          ? "bg-black text-white shadow-sm"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Second row: outlet, grade, date filters */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Location filter */}
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-gray-400" />
                  {(["all", "unilorin", "tanke"] as const).map((loc) => (
                    <button
                      key={loc}
                      onClick={() => setFilterOutlet(loc)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        filterOutlet === loc
                          ? "bg-brand-gold text-white shadow-sm"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {loc === "all" ? "All Locations" : loc}
                    </button>
                  ))}
                </div>

                {/* Grade filter (multi-select) */}
                <div className="flex items-center gap-1.5">
                  <BadgeCheck size={13} className="text-gray-400" />
                  {["special", "extra", "normal"].map((grade) => (
                    <button
                      key={grade}
                      onClick={() => toggleGrade(grade)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        filterGrades.has(grade)
                          ? grade === "special"
                            ? "bg-amber-500 text-white shadow-sm"
                            : grade === "extra"
                            ? "bg-emerald-500 text-white shadow-sm"
                            : "bg-blue-500 text-white shadow-sm"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {grade}
                    </button>
                  ))}
                </div>

                {/* Date range filter */}
                <div className="flex items-center gap-1.5">
                  <CalendarDays size={13} className="text-gray-400" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    placeholder="From"
                    className="px-2 py-1 rounded-lg text-[11px] text-gray-600 bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                  <span className="text-[10px] text-gray-400">to</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    placeholder="To"
                    className="px-2 py-1 rounded-lg text-[11px] text-gray-600 bg-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
              </div>
            </div>

            {filteredTimeline.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Filter size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm font-medium">No events match this filter</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTimeline.map((event, i) => {
                  const dateKey = getDateKey(event.date);
                  const prevDateKey = i > 0 ? getDateKey(filteredTimeline[i - 1].date) : null;
                  const showDateHeader = dateKey !== prevDateKey;

                  return (
                    <div key={event.id}>
                      {showDateHeader && (
                        <div className="flex items-center gap-3 py-3 mt-2 first:mt-0">
                          <span className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                            {formatDateHeader(event.date)}
                          </span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className={`relative pl-6 py-3 border-l-2 ${
                          actionColors[event.type] || "border-l-gray-200"
                        } rounded-r-xl hover:bg-gray-50/50 transition-colors`}
                      >
                        {/* Timeline dot */}
                        <div className="absolute -left-[9px] top-4 w-4 h-4 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center">
                          <div className={`w-2 h-2 rounded-full ${
                            event.type === "SALE" ? "bg-red-400" :
                            event.type === "ORDER_PLACED" ? "bg-amber-300" :
                            event.type === "RESTOCK" ? "bg-emerald-400" :
                            event.type === "ADJUSTMENT" ? "bg-amber-400" :
                            event.type === "CREATED" ? "bg-blue-400" :
                            "bg-gray-400"
                          }`} />
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                          {/* Left: icon + label + description */}
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <span className={`p-1 rounded-lg shrink-0 mt-0.5 ${
                              event.type === "SALE" ? "bg-red-100 text-red-600" :
                              event.type === "ORDER_PLACED" ? "bg-amber-100 text-amber-600" :
                              event.type === "RESTOCK" ? "bg-emerald-100 text-emerald-600" :
                              event.type === "ADJUSTMENT" ? "bg-amber-100 text-amber-600" :
                              event.type === "CREATED" ? "bg-blue-100 text-blue-600" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {actionIcons[event.type] || <FileText size={16} />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900">
                                {event.label}
                              </p>
                              <p className="text-xs text-gray-500">
                                {event.description}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {event.outlet && (
                                  <span className="text-[10px] capitalize font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                    {event.outlet}
                                  </span>
                                )}
                                {event.grade && (
                                  <Badge
                                    className={`${gradeColors[event.grade] || ""} text-[9px] px-1.5 py-0 border`}
                                  >
                                    {event.grade}
                                  </Badge>
                                )}
                                {event.admin && event.admin !== "bulk-import" && (
                                  <span className="flex items-center gap-1 text-[10px] text-gray-400" title={event.admin}>
                                    <User size={10} />
                                    <span className="truncate max-w-[120px]">{event.admin}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: delta + date */}
                          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0 sm:min-w-[100px]">
                            {event.delta !== undefined && event.delta !== 0 && (
                              <span
                                className={`text-sm font-black ${
                                  event.delta > 0 ? "text-emerald-500" : "text-red-500"
                                }`}
                              >
                                {event.delta > 0 ? "+" : ""}
                                {event.delta}
                              </span>
                            )}
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                              {ago(event.date)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ─── Empty state (no product selected) ─── */}
      {!loading && !selectedProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20 max-w-md mx-auto"
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#D4AF37]/20 to-[#F5E6AD]/20 flex items-center justify-center mx-auto mb-6">
            <Search size={32} className="text-[#D4AF37]" />
          </div>
          <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">
            Product Audit Trail
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Search for any product above to view its complete history — 
            from creation and stock adjustments to sales and price changes. 
            Your single source of truth for every product in the system.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-50 rounded-xl p-4">
              <Package size={20} className="mx-auto text-[#D4AF37] mb-1" />
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Stock</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <ShoppingCart size={20} className="mx-auto text-[#D4AF37] mb-1" />
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Sales</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <Clock size={20} className="mx-auto text-[#D4AF37] mb-1" />
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">History</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Selected product but no audit data ─── */}
      {!loading && !auditData && selectedProduct && !error && (
        <div className="text-center py-16">
          <Loader2 size={32} className="mx-auto text-gray-300 animate-spin mb-4" />
          <p className="text-sm text-gray-500">Loading product data...</p>
        </div>
      )}

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setDeleteError(null); setDeletePassword(''); } }}>
        <DialogContent className="sm:max-w-md bg-white border-red-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-red-600 flex items-center gap-2">
              <Trash2 size={20} />
              Delete Product?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              This action <strong>cannot be undone</strong>. Select where to remove this product.
            </DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-gray-900">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">{selectedProduct.category}</p>
                <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4 mt-3">
                  <li>Inventory and stock adjustments at the selected outlet(s)</li>
                  <li>Product images at the selected outlet(s)</li>
                  <li>Order items and audit logs referencing this product (global)</li>
                  {deleteLocation === 'both' && <li>The product from the master catalog</li>}
                </ul>
              </div>

              {/* Location selector */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Delete from:</p>
                <div className="flex gap-2">
                  {(['unilorin', 'tanke', 'both'] as const).map((loc) => {
                    const hasOutlet = (name: 'unilorin' | 'tanke') => {
                      const inv = auditData?.inventory[name];
                      if (!inv) return false;
                      return inv.special + inv.extra + inv.normal > 0;
                    };
                    const canDelete = loc === 'both'
                      ? hasOutlet('unilorin') && hasOutlet('tanke')
                      : hasOutlet(loc);
                    return (
                      <button
                        key={loc}
                        onClick={() => canDelete && setDeleteLocation(loc)}
                        disabled={!canDelete}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                          !canDelete
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : deleteLocation === loc
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
                        }`}
                        title={!canDelete ? `Product not available at ${loc === 'unilorin' ? 'Unilorin' : loc === 'tanke' ? 'Tanke' : 'both outlets'}` : ''}
                      >
                        {loc === 'unilorin' ? 'Unilorin' : loc === 'tanke' ? 'Tanke' : 'Both'}
                        {!canDelete && ' (N/A)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Password input */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Enter delete password:</p>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Required to confirm deletion"
                  className="text-sm border-red-200 focus:border-red-400 focus:ring-red-400/20"
                  autoFocus
                />
              </div>
            </div>
          )}

          {deleteError && (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
              <AlertCircle size={14} />
              {deleteError}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeleteError(null);
                setDeletePassword('');
              }}
              disabled={deleting}
            >
              <X size={14} /> Cancel
            </Button>
            <Button
              onClick={handleDeleteProduct}
              disabled={deleting || !deletePassword}
              className="bg-red-600 text-white hover:bg-red-700 border-none"
            >
              {deleting ? (
                <><Loader2 size={14} className="animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 size={14} /> Delete{deleteLocation === 'both' ? ' Everywhere' : ` from ${deleteLocation.charAt(0).toUpperCase() + deleteLocation.slice(1)}`}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────── Sub-components ─────────── */

function StatBox({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="px-6 py-5 text-center">
      <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
      <p className="text-xl font-black text-gray-900">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
        {label}
      </p>
    </div>
  );
}

function InventoryRow({
  outlet,
  icon,
  data,
}: {
  outlet: string;
  icon: React.ReactNode;
  data: { special: number; extra: number; normal: number };
}) {
  const total = data.special + data.extra + data.normal;
  return (
    <tr className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 transition-colors">
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-bold text-gray-900">{outlet}</span>
        </div>
      </td>
      <td className="py-4 px-4 text-right">
        <p className="text-sm font-bold text-gray-900">{data.special}</p>
      </td>
      <td className="py-4 px-4 text-right">
        <p className="text-sm font-bold text-gray-900">{data.extra}</p>
      </td>
      <td className="py-4 px-4 text-right">
        <p className="text-sm font-bold text-gray-900">{data.normal}</p>
      </td>
      <td className="py-4 px-4 text-right">
        <span className="text-sm font-black text-gray-900">{total}</span>
      </td>
    </tr>
  );
}
