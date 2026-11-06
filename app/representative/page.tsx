"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, DollarSign, ShoppingCart, Upload, Clock, Search, X, Loader2, BarChart2, FileText,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import Link from "next/link";
import { RepGate } from "@/components/Rep/RepGate";
import RepOrders from "@/components/Rep/RepOrders";
import RepSalesHistory from "@/components/Rep/RepSalesHistory";
import { useRepInventory } from "@/hooks/useRepData";
import type { RepresentativePermissions } from "@/lib/representatives";
import {
  repSearchProducts,
  repGetProductAudit,
  repRecordSale,
  repUploadImage,
  repGetAvailableGrades,
  repGetTankeExtraProductIds,
} from "./actions";

type Tab = "orders" | "inventory" | "sales" | "history" | "audit" | "images";

interface RepSession {
  id: string;
  name: string;
  outlet: string;
  permissions: RepresentativePermissions;
}

export default function RepresentativePage() {
  return (
    <RepGate>
      {(rep) => <RepDashboard rep={rep} />}
    </RepGate>
  );
}

function RepDashboard({ rep }: { rep: RepSession }) {
  const [activeTab, setActiveTab] = useState<Tab>("orders");

  const tabs: { id: Tab; label: string; icon: typeof Package; permission?: keyof RepresentativePermissions }[] = [
    { id: "orders", label: "Orders", icon: DollarSign, permission: "view_orders" },
    { id: "inventory", label: "Inventory", icon: Package, permission: "view_inventory" },
    { id: "sales", label: "Record Sale", icon: ShoppingCart, permission: "record_sale" },
    { id: "history", label: "Sales History", icon: BarChart2, permission: "record_sale" },
    { id: "audit", label: "Audit Trail", icon: Clock, permission: "view_product_audit" },
    { id: "images", label: "Upload Image", icon: Upload, permission: "upload_image" },
  ];

  const visibleTabs = tabs.filter((t) => !t.permission || rep.permissions[t.permission]);

  return (
    <div className="min-h-screen bg-brand-softGray">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 flex justify-between items-center sticky top-0 z-40">
        <Link href="/" className="text-2xl font-serif font-extrabold tracking-tighter">
          ALFAWZAAN <span className="text-brand-gold">.</span> Store Hub
        </Link>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Tab Navigation */}
        <div className="flex gap-2 bg-white p-2 rounded-2xl border border-gray-100 w-fit flex-wrap">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === tab.id
                  ? "bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                  : "text-gray-400 hover:text-gray-900"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "orders" && rep.permissions.view_orders && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepOrders
                outlet={rep.outlet as "unilorin" | "tanke"}
                permissions={rep.permissions}
                repId={rep.id}
              />
            </motion.div>
          )}

          {activeTab === "inventory" && rep.permissions.view_inventory && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepInventoryTab outlet={rep.outlet as "unilorin" | "tanke"} />
            </motion.div>
          )}

          {activeTab === "sales" && rep.permissions.record_sale && (
            <motion.div
              key="sales"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepRecordSaleTab outlet={rep.outlet as "unilorin" | "tanke"} repId={rep.id} />
            </motion.div>
          )}

          {activeTab === "history" && rep.permissions.record_sale && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepSalesHistory repId={rep.id} repName={rep.name} />
            </motion.div>
          )}

          {activeTab === "audit" && rep.permissions.view_product_audit && (
            <motion.div
              key="audit"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepAuditTab />
            </motion.div>
          )}

          {activeTab === "images" && rep.permissions.upload_image && (
            <motion.div
              key="images"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepImageUploadTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── INVENTORY TAB ───

function RepInventoryTab({ outlet }: { outlet: "unilorin" | "tanke" }) {
  const { inventory, loading } = useRepInventory(outlet);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<'all' | 'special' | 'extra' | 'normal'>('all');
  // Reference list: products that have extra > 0 at Tanke (both stores share the same extra goods)
  const [tankeExtraProductIds, setTankeExtraProductIds] = useState<Set<string>>(new Set());
  const [tankeLoading, setTankeLoading] = useState(true);

  useEffect(() => {
    async function fetchTankeExtraGoods() {
      try {
        setTankeExtraProductIds(new Set(await repGetTankeExtraProductIds()));
      } catch (err) {
        console.error("Failed to fetch Tanke extra goods:", err);
      } finally {
        setTankeLoading(false);
      }
    }
    fetchTankeExtraGoods();
  }, []);

  // ─── Group ALL inventory items first (preserving all grade data) ───
  const grouped = useMemo(() => {
    const map = new Map<string, typeof inventory>();
    for (const item of inventory) {
      const existing = map.get(item.product_id) || [];
      existing.push(item);
      map.set(item.product_id, existing);
    }
    return map;
  }, [inventory]);

  // ─── Filter groups by search (product-level, not item-level) ───
  const searchedGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return grouped;

    const result = new Map(grouped);
    for (const [productId, items] of result) {
      const name = items[0]?.product_name.toLowerCase() || '';

      const matches = words.every((word) =>
        name.includes(word)
      );

      if (!matches) {
        result.delete(productId);
      }
    }
    return result;
  }, [grouped, search]);

  // ─── Grade filter (column visibility + 'extra' product filtering) ───
  const visibleGrouped = useMemo(() => {
    if (gradeFilter !== 'extra' || tankeLoading || tankeExtraProductIds.size === 0) {
      return searchedGrouped;
    }
    // Only keep products that have extra > 0 at Tanke
    const result = new Map(searchedGrouped);
    for (const [productId] of result) {
      if (!tankeExtraProductIds.has(productId)) {
        result.delete(productId);
      }
    }
    return result;
  }, [searchedGrouped, gradeFilter, tankeLoading, tankeExtraProductIds]);

  // ─── Compute out-of-stock products (all grades = 0) ───
  // Uses the FULL inventory, not filtered
  const outOfStock = useMemo(() => {
    const oos: { product_id: string; name: string; category: string }[] = [];
    const byProduct = new Map<string, { name: string; category: string; grades: Record<string, number> }>();
    for (const item of inventory) {
      if (!byProduct.has(item.product_id)) {
        byProduct.set(item.product_id, { name: item.product_name, category: item.category, grades: { special: 0, extra: 0, normal: 0 } });
      }
      const entry = byProduct.get(item.product_id)!;
      entry.grades[item.grade] = item.quantity;
    }
    for (const [productId, entry] of byProduct) {
      const total = entry.grades.special + entry.grades.extra + entry.grades.normal;
      if (total === 0) {
        oos.push({ product_id: productId, name: entry.name, category: entry.category });
      }
    }
    return oos.sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory]);

  function generateRepOutOfStockPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    const outletLabel = outlet.charAt(0).toUpperCase() + outlet.slice(1);
    doc.text('ALFAWZAAN\u2019S ENTERPRISE', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(212, 175, 55);
    doc.text(`Out of Stock Report (${outletLabel})`, pageWidth / 2, 27, { align: 'center' });

    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Location: ${outletLabel}  |  Generated: ${dateStr} at ${timeStr}  |  Items: ${outOfStock.length}`, pageWidth / 2, 34, { align: 'center' });

    const tableBody = outOfStock.map((item) => [
      item.name,
      item.category || '-',
    ]);

    autoTable(doc, {
      head: [['Product', 'Category']],
      body: tableBody,
      startY: 40,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [212, 175, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 245, 230] },
    });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    doc.save(`alfawzaan-out-of-stock-${outlet}.pdf`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold text-gray-900">
          Inventory — <span className="capitalize">{outlet}</span>
        </h2>
        <button
          onClick={generateRepOutOfStockPDF}
          disabled={outOfStock.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
        >
          <FileText size={14} />
          Out of Stock PDF
          {outOfStock.length > 0 && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px]">{outOfStock.length}</span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative max-w-md flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Grade Filter Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {(['all', 'special', 'extra', 'normal'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setGradeFilter(opt)}
                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  gradeFilter === opt
                    ? opt === 'special' ? 'bg-amber-500 text-white'
                      : opt === 'extra' ? 'bg-blue-500 text-white'
                        : opt === 'normal' ? 'bg-green-500 text-white'
                          : 'bg-brand-gold text-white'
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                {opt === 'all' ? 'All' : opt}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
          </div>
          ) : visibleGrouped.size === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {search ? "No products match your search." : "No inventory found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="divide-y divide-gray-50 min-w-[560px]">
            {/* Desktop table header - hidden on mobile */}
            <div className={`hidden sm:grid gap-4 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 ${gradeFilter === 'all' ? 'grid-cols-[1fr_80px_80px_80px_100px]' : 'grid-cols-[1fr_100px_80px]'}`}>
              <div>Product</div>
              {gradeFilter === 'all' ? (
                <>
                  <div className="text-center">Special</div>
                  <div className="text-center">Extra</div>
                  <div className="text-center">Normal</div>
                </>
              ) : (
                <div className={`text-center ${gradeFilter === 'extra' ? 'text-blue-500' : gradeFilter === 'special' ? 'text-amber-500' : 'text-green-500'}`}>
                  {gradeFilter.charAt(0).toUpperCase() + gradeFilter.slice(1)}
                </div>
              )}
              <div className="text-right">Total</div>
            </div>
            {Array.from(visibleGrouped.entries()).map(([productId, items]) => {
              const name = items[0]?.product_name || productId.slice(0, 8);
              const category = items[0]?.category || "";
              const gradeMap: Record<string, number> = { special: 0, extra: 0, normal: 0 };
              for (const item of items) {
                gradeMap[item.grade] = item.quantity;
              }
              const total = gradeMap.special + gradeMap.extra + gradeMap.normal;

              return (
                <div
                  key={productId}
                  className={`grid gap-4 px-6 py-4 hover:bg-gray-50/50 transition-colors ${gradeFilter === 'all' ? 'grid-cols-[1fr_80px_80px_80px_100px]' : 'grid-cols-[1fr_100px_80px]'}`}
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">{name}</p>
                    {category && (
                      <p className="text-[10px] text-gray-400 uppercase">{category}</p>
                    )}
                  </div>
                  {gradeFilter === 'all' ? (
                    <>
                      <div className="text-center">
                        <span className={`text-sm font-bold ${gradeMap.special > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {gradeMap.special}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className={`text-sm font-bold ${gradeMap.extra > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {gradeMap.extra}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className={`text-sm font-bold ${gradeMap.normal > 0 ? "text-gray-900" : "text-gray-300"}`}>
                          {gradeMap.normal}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <span className={`text-sm font-bold ${gradeMap[gradeFilter] > 0 ? "text-gray-900" : "text-gray-300"}`}>
                        {gradeMap[gradeFilter]}
                      </span>
                    </div>
                  )}
                  <div className="text-right">
                    <span className="text-sm font-black text-brand-gold">{total}</span>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RECORD SALE TAB ───

function RepRecordSaleTab({ outlet, repId }: { outlet: "unilorin" | "tanke"; repId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [availableGrades, setAvailableGrades] = useState<{ grade: string; quantity: number; price?: number }[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [grade, setGrade] = useState<"special" | "extra" | "normal">("special");
  const [quantity, setQuantity] = useState(1);
  const [salePrice, setSalePrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [conflict, setConflict] = useState<any>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    setSelectedProduct(null);
    setAvailableGrades([]);
    setSuccess(null);
    setError(null);
    setConflict(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await repSearchProducts(value);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectProduct(product: any) {
    setSelectedProduct(product);
    setResults([]);
    setConflict(null);
    setError(null);
    setSuccess(null);
    setQuantity(1);
    setSalePrice(0);

    // Fetch available grades for this product
    setGradesLoading(true);
    try {
      const grades = await repGetAvailableGrades(product.id);
      setAvailableGrades(grades);
      // Auto-select first available grade and use its price as default
      if (grades.length > 0) {
        setGrade(grades[0].grade as "special" | "extra" | "normal");
        if (grades[0].price) {
          setSalePrice(grades[0].price);
        }
      }
    } catch {
      setAvailableGrades([]);
    } finally {
      setGradesLoading(false);
    }
  }

  async function handleSubmit() {
    if (!selectedProduct) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setConflict(null);

    try {
      const result = await repRecordSale(selectedProduct.id, grade, quantity, salePrice);
      if (result.conflict) {
        setConflict(result);
      } else if (result.success) {
        setSuccess(`Recorded sale: ${quantity} x ${grade} @ ₦${salePrice.toLocaleString()} deducted from ${selectedProduct.name}`);
        setSelectedProduct(null);
        setQuery("");
        setResults([]);
        setQuantity(1);
        setSalePrice(0);
      }
    } catch (err: any) {
      setError(err.message || "Failed to record sale.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForceGrade(forcedGrade: "special" | "extra" | "normal") {
    if (!selectedProduct || !conflict) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);

    try {
      const result = await repRecordSale(selectedProduct.id, grade, quantity, salePrice, forcedGrade);
      if (result.success) {
        setSuccess(`Recorded sale: ${quantity} x ${forcedGrade} @ ₦${salePrice.toLocaleString()} deducted from ${selectedProduct.name}`);
        setSelectedProduct(null);
        setQuery("");
        setResults([]);
        setQuantity(1);
        setSalePrice(0);
      }
    } catch (err: any) {
      setError(err.message || "Failed to record sale.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-serif font-bold text-gray-900">Record Sale</h2>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4 max-w-lg">
        {/* Product Search */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Product</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={selectedProduct ? selectedProduct.name : query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search for a product..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
            />
          </div>
          {results.length > 0 && !selectedProduct && (
            <div className="border border-gray-100 rounded-xl overflow-hidden mt-1">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProduct(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
                >
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  {p.category && <p className="text-[10px] text-gray-400 uppercase">{p.category}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedProduct && (
          <>
            {/* Grade */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Grade</label>
              {gradesLoading ? (
                <div className="flex items-center gap-2 py-2.5">
                  <Loader2 className="w-4 h-4 text-brand-gold animate-spin" />
                  <span className="text-xs text-gray-400">Checking available grades...</span>
                </div>
              ) : availableGrades.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-600 font-medium">
                  No stock available for this product at your outlet.
                </div>
              ) : (
                <div className="flex gap-2">
                  {availableGrades.map((g) => (
                    <button
                      key={g.grade}
                      onClick={() => {
                        setGrade(g.grade as "special" | "extra" | "normal");
                        if (g.price) setSalePrice(g.price);
                      }}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                        grade === g.grade
                          ? "bg-brand-gold text-white border-brand-gold"
                          : "bg-white text-gray-500 border-gray-200 hover:border-brand-gold/50"
                      }`}
                    >
                      {g.grade} ({g.quantity})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity */}
            {availableGrades.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={availableGrades.find((g) => g.grade === grade)?.quantity ?? 1}
                  value={quantity}
                  onChange={(e) => {
                    const max = availableGrades.find((g) => g.grade === grade)?.quantity ?? 1;
                    setQuantity(Math.min(Math.max(1, parseInt(e.target.value) || 1), max));
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                />
                <p className="text-[10px] text-gray-400">
                  Max: {availableGrades.find((g) => g.grade === grade)?.quantity ?? 0} available
                </p>
              </div>
            )}

            {/* Sale Price */}
            {availableGrades.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Sale Amount (₦)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₦</span>
                  <input
                    type="number"
                    min={0}
                    value={salePrice}
                    onChange={(e) => setSalePrice(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                  />
                </div>
                <p className="text-[10px] text-gray-400">
                  Total: ₦{(salePrice * quantity).toLocaleString()}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || availableGrades.length === 0}
              className="w-full py-3 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                "Record Sale"
              )}
            </button>
          </>
        )}

        {/* Conflict Resolution */}
        {conflict && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-bold text-amber-800">{conflict.message}</p>
            <p className="text-xs text-amber-600">Choose an alternative:</p>
            <div className="flex gap-2">
              {conflict.alternatives?.map((alt: string) => (
                <button
                  key={alt}
                  onClick={() => handleForceGrade(alt as any)}
                  className="px-4 py-2 rounded-xl bg-amber-100 text-amber-700 text-xs font-bold uppercase hover:bg-amber-200 transition-colors"
                >
                  Use {alt} ({conflict.stockMap?.[alt] ?? 0} in stock)
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-600 font-medium">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AUDIT TAB ───

function RepAuditTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(value: string) {
    setQuery(value);
    setSelectedProduct(null);
    setAuditData(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await repSearchProducts(value);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function loadAudit(product: any) {
    setSelectedProduct(product);
    setResults([]);
    setLoading(true);
    try {
      const data = await repGetProductAudit(product.id);
      setAuditData(data);
    } catch {
      setAuditData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-serif font-bold text-gray-900">Product Audit Trail</h2>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            value={selectedProduct ? selectedProduct.name : query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search for a product..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
          />
        </div>
        {results.length > 0 && !selectedProduct && (
          <div className="border border-gray-100 rounded-xl overflow-hidden mt-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => loadAudit(p)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0"
              >
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                {p.category && <p className="text-[10px] text-gray-400 uppercase">{p.category}</p>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
        </div>
      )}

      {auditData && !loading && (
        <div className="space-y-4">
          {/* Product Header */}
          {auditData.product && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="text-lg font-serif font-bold text-gray-900">{auditData.product.name}</h3>
              <p className="text-xs text-gray-400 uppercase mt-1">{auditData.product.category}</p>

              {/* Inventory Summary */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                {(["unilorin", "tanke"] as const).map((outlet) => {
                  const stock = auditData.inventory[outlet];
                  return (
                    <div key={outlet} className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs font-bold uppercase tracking-widest text-gray-500 capitalize mb-2">{outlet}</p>
                      <div className="flex gap-3 text-sm">
                        <span>Special: <strong>{stock.special.quantity}</strong></span>
                        <span>Extra: <strong>{stock.extra.quantity}</strong></span>
                        <span>Normal: <strong>{stock.normal.quantity}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h4 className="text-sm font-bold text-gray-900 mb-4">Activity Timeline</h4>
            {auditData.auditLogs.length === 0 && auditData.stockAdjustments.length === 0 && auditData.orderSales.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity recorded.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {auditData.auditLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700">{log.action}</p>
                      <p className="text-[11px] text-gray-400 truncate">{log.details}</p>
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {new Date(log.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {log.admin_id && ` • ${log.admin_id}`}
                      </p>
                    </div>
                  </div>
                ))}
                {auditData.stockAdjustments.map((adj: any) => (
                  <div key={adj.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700 capitalize">{adj.action} — {adj.grade}</p>
                      <p className="text-[11px] text-gray-400">
                        {adj.quantity > 0 ? "+" : ""}{adj.quantity} units
                        {adj.reason && ` • ${adj.reason}`}
                      </p>
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {new Date(adj.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {` • ${adj.outlet}`}
                      </p>
                    </div>
                  </div>
                ))}
                {auditData.orderSales.map((sale: any, idx: number) => (
                  <div key={`${sale.order_id}-${idx}`} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-b-0">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-700">Sale — {sale.grade}</p>
                      <p className="text-[11px] text-gray-400">
                        {sale.quantity} x ₦{sale.unit_price?.toLocaleString()} = ₦{sale.total_price?.toLocaleString()}
                        {sale.customer_name && ` • ${sale.customer_name}`}
                      </p>
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        {new Date(sale.order_created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {` • ${sale.outlet} • ${sale.order_status}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IMAGE UPLOAD TAB ───

function RepImageUploadTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSearch(value: string) {
    setQuery(value);
    setSelectedProduct(null);
    setFile(null);
    setPreview(null);
    setSuccess(null);
    setError(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await repSearchProducts(value);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("File too large. Maximum 5MB.");
      return;
    }
    setFile(f);
    setError(null);
    setPreview(URL.createObjectURL(f));
  }

  async function handleUpload() {
    if (!selectedProduct || !file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await repUploadImage(selectedProduct.id, formData);
      setSuccess(`Image updated for ${selectedProduct.name}. This change applies everywhere.`);
      setFile(null);
      setPreview(null);
      setSelectedProduct(null);
      setQuery("");
      setResults([]);
    } catch (err: any) {
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-serif font-bold text-gray-900">Upload Product Image</h2>
      <p className="text-xs text-gray-400">Image changes apply to all outlets — it&apos;s a shared product image.</p>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-lg space-y-4">
        {/* Product Search */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Product</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              value={selectedProduct ? selectedProduct.name : query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search for a product..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
            />
          </div>
          {results.length > 0 && !selectedProduct && (
            <div className="border border-gray-100 rounded-xl overflow-hidden mt-1">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedProduct(p);
                    setResults([]);
                    setFile(null);
                    setPreview(null);
                    setError(null);
                    setSuccess(null);
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 flex items-center gap-3"
                >
                  {p.base_image_url && (
                    <img src={p.base_image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    {p.category && <p className="text-[10px] text-gray-400 uppercase">{p.category}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedProduct && (
          <>
            {/* Current Image */}
            {selectedProduct.base_image_url && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Current Image</label>
                <img
                  src={selectedProduct.base_image_url}
                  alt={selectedProduct.name}
                  className="w-32 h-32 rounded-xl object-cover border border-gray-100"
                />
              </div>
            )}

            {/* File Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500">New Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-widest file:bg-brand-gold file:text-white hover:file:bg-brand-gold/80"
              />
            </div>

            {/* Preview */}
            {preview && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Preview</label>
                <img src={preview} alt="Preview" className="w-32 h-32 rounded-xl object-cover border border-gray-100" />
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full py-3 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload size={14} /> Upload Image</>
              )}
            </button>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-medium">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-600 font-medium">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}
