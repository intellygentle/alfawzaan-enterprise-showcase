"use client";
import { useState, useEffect, useDeferredValue, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Package, DollarSign, ShoppingCart, AlertTriangle,
  Search, Filter, RefreshCw, Upload, X, Loader2, FileText, Clock,
  Trash2, ShieldAlert, ChevronRight, AlertCircle, Users, Sparkles, Truck,
  Undo2, CheckCircle, BarChart3, Minus, TrendingUp, BadgePercent, Gift, Send,
  MessageCircle, QrCode, Flag
} from "lucide-react";
import Link from "next/link";
import ExecutiveMetrics from "@/components/Admin/ExecutiveMetrics";
import InventoryTable from "@/components/Admin/InventoryTable";
import AuditLog from "@/components/Admin/AuditLog";
import RecordSaleForm from "@/components/Admin/RecordSaleForm";
import ProductUploadForm from "@/components/Admin/ProductUploadForm";
import BulkUploadForm from "@/components/Admin/BulkUploadForm";
import RepManagement from "@/components/Admin/RepManagement";
import ShowcaseManager from "@/components/Admin/ShowcaseManager";
import DeliveryManagement from "@/components/Admin/DeliveryManagement";
import ProductAuditView from "@/components/Admin/ProductAuditView";
import DailySalesTracker from "@/components/Admin/DailySalesTracker";
import FlaggedGoodsManager from "@/components/Admin/FlaggedGoodsManager";
import SalesAnalyticsBoard from "@/components/Admin/SalesAnalyticsBoard";
import DiscountManager from "@/components/Admin/DiscountManager";
import GiftClaimsManager from "@/components/Admin/GiftClaimsManager";
import AmbassadorManager from "@/components/Admin/AmbassadorManager";
import ReceiptOutbox from "@/components/Admin/ReceiptOutbox";
import DuplicateProductResolver from "@/components/Admin/DuplicateProductResolver";
import ManualMergeTool from "@/components/Admin/ManualMergeTool";
import IntegrityReport from "@/components/Admin/IntegrityReport";
import { AdminGate } from "@/components/Admin/AdminGate";
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
import { useLowStock, useLowStockCount, usePendingOrderCount, usePendingOrders, useAuditLogs, useOpenFlagCount, type LowStockItem } from "@/hooks/useAdminData";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useAdminInventory } from "@/hooks/useAdminInventory";
import { verifyOrder, getAvailableGradesForProduct, deleteStuckOrder, removeOrderItemAction, getReceiptData } from "@/app/admin/dashboard/actions";
import { downloadReceiptPdf } from "@/lib/receiptPdf";
import { normalizeWhatsAppPhone } from "@/lib/phone";
import { openVerifiedReceiptWhatsapp } from "@/lib/receiptMessage";

// ─── Tabs ───
type Tab = "inventory" | "upload" | "bulk" | "sales" | "discounts" | "gifts" | "ambassadors" | "receipts" | "orders" | "logs" | "audits" | "lowstock" | "reps" | "showcase" | "deliveries" | "duplicates" | "daily" | "analytics" | "health" | "flags";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("inventory");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lowStockSearch, setLowStockSearch] = useState("");
  const [inventorySearch, setInventorySearch] = useState("");
  const [outletFilter, setOutletFilter] = useState<'all' | 'Unilorin' | 'Tanke'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<'all' | 'special' | 'extra' | 'normal'>('all');
  const [inventoryPage, setInventoryPage] = useState(1);

  const [auditProductId, setAuditProductId] = useState<string | null>(null);

  // ─── Deferred search for responsive mobile typing ───
  // Using useDeferredValue prevents synchronous filtering from blocking the UI
  // thread on every keystroke — the input stays responsive while filtering lags
  // slightly behind (imperceptibly on modern devices).
  const deferredSearch = useDeferredValue(inventorySearch);

  // Low stock filters
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [lowStockOutletFilter, setLowStockOutletFilter] = useState<'all' | 'Unilorin' | 'Tanke'>('all');
  const [lowStockGradeFilter, setLowStockGradeFilter] = useState<'all' | 'special' | 'extra' | 'normal'>('all');
  const [lowStockQtyFilter, setLowStockQtyFilter] = useState<'all' | 'zero' | '1-3' | '4-5' | '6-10'>('all');
  const { alerts: lowStock, loading: lowStockLoading } = useLowStock(lowStockThreshold, activeTab === "lowstock");
  const lowStockCount = useLowStockCount(lowStockThreshold);
  const pendingOrderCount = usePendingOrderCount();
  const openFlagCount = useOpenFlagCount();

  // ─── Low stock filters ───
  const filteredLowStock = lowStock.filter((item: any) => {
    // Search filter
    if (lowStockSearch) {
      const q = lowStockSearch.toLowerCase();
      const name = item.products?.name?.toLowerCase() || "";
      const outlet = item.outlet?.toLowerCase() || "";
      const grade = item.grade?.toLowerCase() || "";
      const qty = item.quantity?.toString() || "";
      if (!name.includes(q) && !outlet.includes(q) && !grade.includes(q) && !qty.includes(q)) return false;
    }
    // Outlet filter
    if (lowStockOutletFilter !== 'all' && item.outlet?.toLowerCase() !== lowStockOutletFilter.toLowerCase()) return false;
    // Grade filter
    if (lowStockGradeFilter !== 'all' && item.grade !== lowStockGradeFilter) return false;
    // Quantity range filter
    if (lowStockQtyFilter !== 'all') {
      const q = item.quantity;
      if (lowStockQtyFilter === 'zero' && q !== 0) return false;
      if (lowStockQtyFilter === '1-3' && (q < 1 || q > 3)) return false;
      if (lowStockQtyFilter === '4-5' && (q < 4 || q > 5)) return false;
      if (lowStockQtyFilter === '6-10' && (q < 6 || q > 10)) return false;
    }
    return true;
  });

  // ─── Low stock PDF generation ───
  function generateLowStockPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ALFAWZAAN\u2019S ENTERPRISE', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(212, 175, 55);
    doc.text('Low Stock Report', pageWidth / 2, 27, { align: 'center' });

    // Date & threshold info
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Generated: ${dateStr} at ${timeStr}  |  Threshold: ${lowStockThreshold} units  |  Items: ${filteredLowStock.length}`, pageWidth / 2, 34, { align: 'center' });

    // Summary stats
    doc.setFontSize(9);
    doc.setTextColor(80);
    const outletCounts: Record<string, number> = {};
    const gradeCounts: Record<string, number> = {};
    for (const item of filteredLowStock) {
      const o = (item.outlet || 'unknown').charAt(0).toUpperCase() + (item.outlet || 'unknown').slice(1);
      outletCounts[o] = (outletCounts[o] || 0) + 1;
      const g = item.grade ? item.grade.charAt(0).toUpperCase() + item.grade.slice(1) : 'Unknown';
      gradeCounts[g] = (gradeCounts[g] || 0) + 1;
    }
    let statLine = '';
    for (const [k, v] of Object.entries(outletCounts)) statLine += `${k}: ${v}  `;
    for (const [k, v] of Object.entries(gradeCounts)) statLine += `| ${k}: ${v}  `;
    doc.text(statLine, 14, 41);

    // Table
    const tableBody = filteredLowStock.map((item: any) => [
      item.products?.name || item.product_id.slice(0, 8) + '...',
      item.outlet ? item.outlet.charAt(0).toUpperCase() + item.outlet.slice(1) : '-',
      item.grade ? item.grade.charAt(0).toUpperCase() + item.grade.slice(1) : '-',
      String(item.quantity),
    ]);

    autoTable(doc, {
      head: [['Product Name', 'Outlet', 'Grade', 'Qty']],
      body: tableBody,
      startY: 45,
      styles: {
        fontSize: 7,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [212, 175, 55],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [250, 245, 230],
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    doc.save('alfawzaan-low-stock-report.pdf');
  }
  const { orders: pendingOrders, loading: ordersLoading, error: ordersError } = usePendingOrders(activeTab === "orders");
  // Orders verified in this session, pinned above the pending list so their
  // send-verified-receipt actions survive the pending-list refresh.
  const [verifiedThisSession, setVerifiedThisSession] = useState<any[]>([]);
  const logs = useAuditLogs(20, activeTab === "logs" || activeTab === "audits");
  const { data: inventoryData, loading: inventoryLoading, refetch: refetchInventory } = useAdminInventory(activeTab === "inventory");

  // Compute total inventory value and total items from actual DB data
  const totalInventoryValue = inventoryData.reduce((sum, item) => {
    return sum + (item.total * item.price);
  }, 0);
  const totalItemsInStock = inventoryData.reduce((sum, item) => sum + item.total, 0);

  // ─── Memoised inventory filtering with deferred search ───
  // useDeferredValue keeps the input responsive on mobile by deferring the
  // expensive filter computation. Minimum 2 characters before filtering kicks in.
  const filteredInventory = useMemo(() => {
    const searchTerm = deferredSearch.trim().toLowerCase();
    const hasSearch = searchTerm.length >= 2;

    return inventoryData.filter((item) => {
      if (outletFilter !== 'all' && item.location !== outletFilter) return false;
      if (gradeFilter !== 'all') {
        if (item[gradeFilter] === 0) return false;
      }
      if (hasSearch) {
        const matchesName = item.name.toLowerCase().includes(searchTerm);
        const matchesCategory = item.type.toLowerCase().includes(searchTerm);
        const matchesOutlet = item.location.toLowerCase().includes(searchTerm);
        if (!matchesName && !matchesCategory && !matchesOutlet) return false;
      }
      return true;
    });
  }, [inventoryData, outletFilter, gradeFilter, deferredSearch]);

  const showFilterBanner = outletFilter !== 'all' || gradeFilter !== 'all' || deferredSearch.trim().length >= 2;
  const inventoryPageSize = 50;
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventory.length / inventoryPageSize));
  const safeInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const paginatedInventory = filteredInventory.slice((safeInventoryPage - 1) * inventoryPageSize, safeInventoryPage * inventoryPageSize);

  return (
    <AdminGate>
    <div className="min-h-screen bg-brand-softGray">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-8 py-4 flex justify-between items-center sticky top-0 z-40">
        <Link href="/" className="text-2xl font-serif font-extrabold tracking-tighter">
          ALFAWZAAN <span className="text-brand-gold">.</span> Admin Hub
        </Link>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20"
        >
          <Plus size={16} /> New Product
        </button>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:p-8 space-y-6 sm:space-y-8">
        {/* Metrics */}
        <ExecutiveMetrics 
          totalValue={totalInventoryValue}
          totalItems={totalItemsInStock}
          lowStockCount={lowStockCount}
          pendingOrders={pendingOrderCount}
        />

        {/* Tab Navigation */}
        <div className="overflow-x-auto pb-1 scrollbar-hide">
          <div className="flex gap-2 bg-white p-2 rounded-2xl border border-gray-100 w-fit min-w-max">
            {([
              { id: "inventory" as Tab, label: "Inventory", icon: Package },
              { id: "daily" as Tab, label: "Daily Sales", icon: BarChart3 },
              { id: "flags" as Tab, label: "Flagged Goods", icon: Flag },
              { id: "upload" as Tab, label: "Upload Product", icon: Upload },
              { id: "bulk" as Tab, label: "Bulk Import", icon: FileText },
              { id: "sales" as Tab, label: "Record Sale", icon: ShoppingCart },
              { id: "discounts" as Tab, label: "Discounts", icon: BadgePercent },
              { id: "gifts" as Tab, label: "Gift Claims", icon: Gift },
              { id: "ambassadors" as Tab, label: "Ambassadors", icon: QrCode },
              { id: "receipts" as Tab, label: "Receipt Outbox", icon: Send },
              { id: "orders" as Tab, label: "Orders", icon: DollarSign },
              { id: "logs" as Tab, label: "Audit Logs", icon: RefreshCw },
              { id: "audits" as Tab, label: "Audit Trail", icon: Clock },
              { id: "lowstock" as Tab, label: "Low Stock", icon: AlertTriangle },
              { id: "reps" as Tab, label: "Reps", icon: Users },
              { id: "showcase" as Tab, label: "Showcase", icon: Sparkles },
              { id: "deliveries" as Tab, label: "Deliveries", icon: Truck },
               { id: "duplicates" as Tab, label: "Duplicates", icon: AlertTriangle },
                { id: "analytics" as Tab, label: "Sales Pulse", icon: TrendingUp },
                { id: "health" as Tab, label: "Data Health", icon: ShieldAlert },
            ]).map((tab) => (
              <button
                key={tab.id}
                aria-label={tab.label}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 lg:gap-2 px-3 lg:px-5 py-2 lg:py-2.5 rounded-xl text-[10px] lg:text-xs font-black uppercase tracking-widest transition-all shrink-0 ${
                  activeTab === tab.id
                    ? "bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                    : "text-gray-400 hover:text-gray-900"
                }`}
              >
                <tab.icon size={12} />
                <span className="hidden xs:inline">{tab.label}</span>
                {tab.id === "flags" && openFlagCount > 0 && (
                  <span
                    className={`ml-1 inline-flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full text-[9px] font-black ${
                      activeTab === tab.id ? "bg-white text-brand-gold" : "bg-red-500 text-white"
                    }`}
                    title={`${openFlagCount} open discrepanc${openFlagCount === 1 ? "y" : "ies"}`}
                  >
                    {openFlagCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "inventory" && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Inventory Table */}
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <h2 className="text-xl font-serif font-bold text-gray-900">Branch Inventory</h2>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                    {/* Search Input — full width on mobile, flex-1 on desktop */}
                    <div className="relative flex-1 sm:max-w-[280px] min-w-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                      <input
                        type="text"
                        inputMode="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        spellCheck={false}
                        autoCorrect="off"
                        placeholder="Search products..."
                        value={inventorySearch}
                        onChange={(e) => { setInventorySearch(e.target.value); setInventoryPage(1); }}
                        className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-base sm:text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                      />
                      {inventorySearch && (
                        <button
                          onClick={() => setInventorySearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {/* Filter controls row — wraps on very narrow screens */}
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
                      {/* Grade Filter Buttons */}
                      <div className="flex items-center gap-1">
                        {(['all', 'special', 'extra', 'normal'] as const).map((opt) => (
                          <button
                            key={opt}
                            onClick={() => { setGradeFilter(opt); setInventoryPage(1); }}
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
                      {/* Out of Stock PDF Buttons */}
                      <div className="flex items-center gap-1">
                        {(['Unilorin', 'Tanke'] as const).map((loc) => {
                          const oosCount = inventoryData.filter((i) => i.location === loc && i.total === 0).length;
                          return (
                            <button
                              key={loc}
                              onClick={() => {
                                const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                                const pageWidth = doc.internal.pageSize.getWidth();
                                const oosItems = inventoryData.filter((i) => i.location === loc && i.total === 0);

                                doc.setFont('helvetica', 'bold');
                                doc.setFontSize(16);
                                doc.text('ALFAWZAAN\u2019S ENTERPRISE', pageWidth / 2, 20, { align: 'center' });
                                doc.setFontSize(10);
                                doc.setTextColor(212, 175, 55);
                                doc.text('Out of Stock Report', pageWidth / 2, 27, { align: 'center' });

                                doc.setTextColor(100);
                                doc.setFontSize(8);
                                doc.setFont('helvetica', 'normal');
                                const now = new Date();
                                const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                                const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                                doc.text(`Location: ${loc}  |  Generated: ${dateStr} at ${timeStr}  |  Items: ${oosItems.length}`, pageWidth / 2, 34, { align: 'center' });

                                const tableBody = oosItems.map((item) => [
                                  item.name,
                                  item.type,
                                  String(item.special),
                                  String(item.extra),
                                  String(item.normal),
                                ]);

                                autoTable(doc, {
                                  head: [['Product', 'Category', 'Special', 'Extra', 'Normal']],
                                  body: tableBody,
                                  startY: 40,
                                  styles: { fontSize: 7, cellPadding: 2 },
                                  headStyles: { fillColor: [212, 175, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                                  alternateRowStyles: { fillColor: [250, 245, 230] },
                                  columnStyles: {
                                    0: { cellWidth: 'auto' },
                                    1: { cellWidth: 35 },
                                    2: { cellWidth: 20, halign: 'center' },
                                    3: { cellWidth: 20, halign: 'center' },
                                    4: { cellWidth: 20, halign: 'center' },
                                  },
                                });

                                const pageCount = doc.getNumberOfPages();
                                for (let i = 1; i <= pageCount; i++) {
                                  doc.setPage(i);
                                  doc.setFontSize(7);
                                  doc.setTextColor(180);
                                  doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
                                }

                                doc.save(`alfawzaan-out-of-stock-${loc.toLowerCase()}.pdf`);
                              }}
                              className="px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all bg-gray-50 text-gray-400 hover:text-red-500 hover:bg-red-50"
                              title={`Download out-of-stock PDF for ${loc}`}
                            >
                              OOS {loc}
                              {oosCount > 0 && (
                                <span className="ml-1 bg-red-100 text-red-500 px-1 py-0 rounded text-[8px]">{oosCount}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {/* Filter Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                          className={`p-2 rounded-xl transition-colors ${
                            outletFilter !== 'all'
                              ? 'text-brand-gold bg-brand-gold/10'
                              : 'text-gray-400 hover:text-brand-gold'
                          }`}
                        >
                          <Filter size={18} />
                        </button>
                        {showFilterDropdown && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
                            <div className="absolute right-0 top-full mt-2 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 min-w-[160px]">
                              {(['all', 'Unilorin', 'Tanke'] as const).map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => { setOutletFilter(opt); setShowFilterDropdown(false); }}
                                  className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                                    outletFilter === opt
                                      ? 'bg-brand-gold text-white'
                                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                                >
                                  {opt === 'all' ? 'All Outlets' : opt}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {showFilterBanner ? (
                  <div className="flex items-center gap-2 mb-4 px-1 text-[11px]">
                    <span className="font-medium text-gray-500">
                      {filteredInventory.length} of {inventoryData.length} item{inventoryData.length !== 1 ? 's' : ''}
                      {outletFilter !== 'all' && <> • <span className="font-bold text-brand-gold">{outletFilter}</span></>}
                      {gradeFilter !== 'all' && (() => {
                        const gradeColors: Record<string, string> = { special: 'text-amber-500', extra: 'text-blue-500', normal: 'text-green-500' };
                        return <> • <span className={'font-bold capitalize ' + (gradeColors[gradeFilter] || '')}>{gradeFilter}</span></>;
                      })()}
                    </span>
                    {(outletFilter !== 'all' || gradeFilter !== 'all' || inventorySearch) && (
                      <button
                        onClick={() => { setOutletFilter('all'); setGradeFilter('all'); setInventorySearch(''); }}
                        className="text-red-400 hover:text-red-500 font-bold uppercase tracking-wider transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                ) : null}

                {inventoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 size={28} className="animate-spin text-brand-gold" />
                    <p className="text-xs text-gray-400 font-medium">Loading inventory...</p>
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Search size={40} className="text-gray-200 mb-3" />
                    <h3 className="text-base font-bold text-gray-900 mb-1">
                      {inventorySearch || outletFilter !== 'all' || gradeFilter !== 'all' ? 'No matching items' : 'No inventory found'}
                    </h3>
                    <p className="text-xs text-gray-400 max-w-sm">
                      {inventorySearch && inventorySearch.trim().length < 2
                        ? 'Type at least 2 characters to search.'
                        : inventorySearch || outletFilter !== 'all' || gradeFilter !== 'all'
                          ? 'Try adjusting your search or filter to see more items.'
                          : 'No products have been stocked yet. Upload a product and add inventory to see it here.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <InventoryTable data={paginatedInventory} onRefetch={refetchInventory} onViewAudit={(productId) => { setAuditProductId(productId); setActiveTab('audits'); }} />
                    {inventoryPageCount > 1 && <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4"><p className="text-[10px] text-gray-400">Showing {(safeInventoryPage - 1) * inventoryPageSize + 1}-{Math.min(safeInventoryPage * inventoryPageSize, filteredInventory.length)} of {filteredInventory.length}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setInventoryPage((page) => Math.max(1, page - 1))} disabled={safeInventoryPage === 1} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 disabled:opacity-30">Previous</button><span className="text-[10px] font-bold text-gray-500">{safeInventoryPage} / {inventoryPageCount}</span><button type="button" onClick={() => setInventoryPage((page) => Math.min(inventoryPageCount, page + 1))} disabled={safeInventoryPage === inventoryPageCount} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 disabled:opacity-30">Next</button></div></div>}
                  </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "upload" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ProductUploadForm />
            </motion.div>
          )}

          {activeTab === "bulk" && (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <BulkUploadForm />
            </motion.div>
          )}

          {activeTab === "sales" && (
            <motion.div
              key="sales"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RecordSaleForm />
            </motion.div>
          )}

          {activeTab === "discounts" && (
            <motion.div
              key="discounts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DiscountManager />
            </motion.div>
          )}

          {activeTab === "receipts" && (
            <motion.div
              key="receipts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ReceiptOutbox />
            </motion.div>
          )}

          {activeTab === "gifts" && (
            <motion.div
              key="gifts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <GiftClaimsManager />
            </motion.div>
          )}

          {activeTab === "ambassadors" && (
            <motion.div
              key="ambassadors"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AmbassadorManager />
            </motion.div>
          )}

          {activeTab === "orders" && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-serif font-bold text-gray-900 mb-4">Pending Orders</h2>
              {/* Orders verified in this session stay pinned at the top with
                  their send-receipt actions — verification no longer yanks
                  them off the page via the pending-list refresh. */}
              {verifiedThisSession.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-green-600 flex items-center gap-2">
                    <CheckCircle size={13} /> Just verified — send receipts below
                  </p>
                  {verifiedThisSession.map((order: any) => (
                    <VerifiedOrderCard key={`verified-${order.id}`} order={order} onDismiss={(id) =>
                      setVerifiedThisSession((prev) => prev.filter((o) => o.id !== id))
                    } />
                  ))}
                </div>
              )}
              {ordersLoading ? (
                <div className="text-center py-12 text-gray-400">Loading orders...</div>
              ) : ordersError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-8 text-center text-sm text-red-600">
                  <p className="font-bold">Pending orders could not be loaded.</p>
                  <p className="mt-1 text-xs text-red-500">{ordersError}</p>
                  <p className="mt-3 text-xs text-red-400">Refresh the page after confirming your admin session is active.</p>
                </div>
              ) : pendingOrders.length === 0 && verifiedThisSession.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                  No pending orders.
                </div>
              ) : (
                pendingOrders.map((order: any) => (
                  <OrderCard key={order.id} order={order} onVerified={(verifiedOrder) =>
                    setVerifiedThisSession((prev) => [verifiedOrder, ...prev.filter((o) => o.id !== verifiedOrder.id)])
                  } />
                ))
              )}
            </motion.div>
          )}

          {activeTab === "logs" && (
            <motion.div
              key="logs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Recent Sales — with reversal */}
              <AdminSalesReversal logs={logs} onRefetch={() => window.location.reload()} />
              <AuditLog logs={logs} />
            </motion.div>
          )}

          {activeTab === "daily" && (
            <motion.div
              key="daily"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DailySalesTracker onViewAudit={(productId) => { setAuditProductId(productId); setActiveTab('audits'); }} />
            </motion.div>
          )}

          {activeTab === "flags" && (
            <motion.div
              key="flags"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <FlaggedGoodsManager />
            </motion.div>
          )}

          {activeTab === "audits" && (
            <motion.div
              key="audits"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ProductAuditView initialProductId={auditProductId ?? undefined} />
            </motion.div>
          )}

          {activeTab === "lowstock" && (
            <motion.div
              key="lowstock"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Low Stock Alert Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-red-100 text-red-500">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-bold text-gray-900">Low Stock Alerts</h2>
                    <p className="text-xs text-gray-400 font-medium">
                      Products with quantities below the threshold
                    </p>
                  </div>
                </div>

                {/* PDF Download Button */}
                <button
                  onClick={generateLowStockPDF}
                  disabled={filteredLowStock.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shrink-0"
                >
                  <FileText size={14} />
                  Download PDF
                  {filteredLowStock.length > 0 && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px]">{filteredLowStock.length}</span>
                  )}
                </button>
              </div>

              {/* ── Filter Bar ── */}
              {lowStock.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-100 p-4 flex flex-wrap items-center gap-3">
                  {/* Threshold Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Threshold:</span>
                    <select
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                      className="text-xs font-bold bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300"
                    >
                      {[1, 2, 3, 5, 10, 20, 50].map((t) => (
                        <option key={t} value={t}>{t} units</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-px h-6 bg-red-100" />

                  {/* Outlet Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Outlet:</span>
                    {(['all', 'Unilorin', 'Tanke'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setLowStockOutletFilter(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                          lowStockOutletFilter === opt
                            ? 'bg-red-600 text-white'
                            : 'text-gray-500 hover:bg-red-50'
                        }`}
                      >
                        {opt === 'all' ? 'All' : opt}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-6 bg-red-100" />

                  {/* Grade Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Grade:</span>
                    {(['all', 'special', 'extra', 'normal'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setLowStockGradeFilter(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all capitalize ${
                          lowStockGradeFilter === opt
                            ? 'bg-red-600 text-white'
                            : 'text-gray-500 hover:bg-red-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-6 bg-red-100" />

                  {/* Quantity Range Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Qty:</span>
                    {(['all', 'zero', '1-3', '4-5', '6-10'] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setLowStockQtyFilter(opt)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                          lowStockQtyFilter === opt
                            ? 'bg-red-600 text-white'
                            : 'text-gray-500 hover:bg-red-50'
                        }`}
                      >
                        {opt === 'all' ? 'All' : opt}
                      </button>
                    ))}
                  </div>

                  {/* Active filter count badge */}
                  {(lowStockOutletFilter !== 'all' || lowStockGradeFilter !== 'all' || lowStockQtyFilter !== 'all') && (
                    <button
                      onClick={() => {
                        setLowStockOutletFilter('all');
                        setLowStockGradeFilter('all');
                        setLowStockQtyFilter('all');
                        setLowStockSearch('');
                      }}
                      className="ml-auto text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-wider transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {lowStockLoading ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <Loader2 size={28} className="animate-spin text-brand-gold mx-auto mb-3" />
                  <p className="text-xs text-gray-400 font-medium">Checking inventory...</p>
                </div>
              ) : lowStock.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <Package size={28} className="text-green-500" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">All Stock Levels Healthy</h3>
                  <p className="text-xs text-gray-400 max-w-xs mx-auto">
                    No products are running low. Your inventory is well-stocked.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-red-100 overflow-hidden">
                  {/* Search */}
                  <div className="p-4 border-b border-red-50">
                    <div className="relative max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search by product name, outlet, or grade..."
                        value={lowStockSearch}
                        onChange={(e) => setLowStockSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-red-200 bg-red-50/30 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-all"
                      />
                      {lowStockSearch && (
                        <button
                          onClick={() => setLowStockSearch("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4 px-1">
                      <AlertTriangle size={14} className="text-red-500" />
                      <p className="text-xs font-bold uppercase tracking-widest text-red-600">
                        {filteredLowStock.length} of {lowStock.length} item{filteredLowStock.length !== 1 ? 's' : ''} below threshold
                      </p>
                    </div>

                    {filteredLowStock.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8 font-medium">
                        No low stock items match your filters
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredLowStock.map((item: any) => (
                          <div key={`${item.outlet}-${item.product_id}-${item.grade}`} className="bg-red-50/50 p-4 rounded-xl border border-red-100 flex justify-between items-center hover:border-red-200 transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-gray-900 truncate">{item.products?.name || item.product_id.slice(0, 8) + '...'}</p>
                              <p className="text-[10px] text-gray-400 uppercase mt-0.5">
                                {item.outlet} 
                                <span className="mx-1">•</span> 
                                <span className="capitalize">{item.grade}</span>
                              </p>
                            </div>
                            <div className="text-right ml-3 shrink-0">
                              <span className="text-lg font-black text-red-500">{item.quantity}</span>
                              <p className="text-[9px] text-gray-400 uppercase tracking-wider">in stock</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "reps" && (
            <motion.div
              key="reps"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <RepManagement />
            </motion.div>
          )}

          {activeTab === "showcase" && (
            <motion.div
              key="showcase"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ShowcaseManager />
            </motion.div>
          )}{ activeTab === "deliveries" && (
            <motion.div
              key="deliveries"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DeliveryManagement />
            </motion.div>
          )}

          {activeTab === "duplicates" && (
            <motion.div
              key="duplicates"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <DuplicatesSection />
            </motion.div>
          )}
          {activeTab === "analytics" && (
            <motion.div key="analytics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <SalesAnalyticsBoard />
            </motion.div>
          )}
          {activeTab === "health" && (
            <motion.div key="health" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <IntegrityReport />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Danger Zone ─── */}
        <div className="border-t border-red-100 pt-6 sm:pt-8 mt-8 sm:mt-12">
          <div className="bg-red-50/50 border border-red-100 rounded-3xl p-4 sm:p-6 lg:p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <ShieldAlert size={24} className="text-red-500" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-serif font-bold text-red-800 mb-1">Danger Zone</h3>
                <p className="text-sm text-red-600 mb-6 max-w-lg">
                  Irreversible actions that affect the entire system. Proceed with extreme caution.
                </p>

                <div className="bg-white rounded-2xl border border-red-100 p-5">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Trash2 size={16} className="text-red-500" />
                        Clear All Database Data
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Removes every product, inventory entry, order, and delivery pair from all 4 databases. 
                        The audit log is preserved as the system record. Your database schema and storage buckets will be preserved.
                      </p>
                    </div>
                    <ClearDatabaseButton />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowUploadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-serif font-bold text-gray-900">Upload New Product</h2>
                <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <ProductUploadForm onSuccess={() => setShowUploadModal(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </AdminGate>
  );
}



/* ─── Clear Database Button + Multi-step Confirmation ─── */
function ClearDatabaseButton() {
  const [step, setStep] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [input, setInput] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    setClearing(true);
    setError(null);
    try {
      const { clearDatabaseAction } = await import("@/app/admin/dashboard/actions");
      await clearDatabaseAction("admin-clear-db", deletePassword);
      setStep(0);
      setInput("");
      setDeletePassword("");
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Failed to clear database.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setStep(1)}
        className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-sm whitespace-nowrap"
      >
        Clear Database
      </button>

      <Dialog open={step > 0} onOpenChange={(open) => { if (!open) { setStep(0); setInput(""); setDeletePassword(""); setError(null); } }}>
        <DialogContent className="sm:max-w-lg bg-white border-red-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-serif font-bold text-red-600 flex items-center gap-2">
              <ShieldAlert size={22} />
              Clear Entire Database?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {step === 1 && "This will permanently delete ALL data across all 4 databases. This action CANNOT be undone."}
              {step === 2 && `Type "DELETE ALL" to confirm. This is irreversible.`}
              {step === 3 && "Final confirmation. Are you absolutely sure?"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {step === 1 && (
              <div className="bg-red-50 rounded-xl p-5 space-y-3">
                <p className="text-sm font-bold text-red-800">The following will be permanently removed:</p>
                <ul className="text-xs text-red-700 space-y-2">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> All products in the master catalog</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> All inventory in Unilorin &amp; Tanke outlets</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> All stock adjustment history</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> All orders, order items, and delivery pairs</li>
                </ul>
                <p className="text-xs text-gray-500 mt-2">Database schema, storage buckets, uploaded images, and the audit log will be preserved.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="bg-red-50 rounded-xl p-5 space-y-4">
                  <div>
                    <p className="text-xs font-bold text-red-700 mb-2">
                      To confirm, type <span className="font-black text-red-600 bg-red-100 px-2 py-0.5 rounded">DELETE ALL</span> below:
                    </p>
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type DELETE ALL"
                      className="text-center text-sm font-bold uppercase tracking-widest border-red-200 focus:border-red-400 focus:ring-red-400/20"
                      autoFocus
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-red-700 mb-2">
                      Enter the delete password:
                    </p>
                    <Input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Required to confirm"
                      className="text-sm border-red-200 focus:border-red-400 focus:ring-red-400/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="bg-red-100 border border-red-200 rounded-xl p-6 text-center">
                <AlertTriangle size={36} className="mx-auto text-red-500 mb-3" />
                <p className="text-sm font-bold text-red-800">This is your last chance.</p>
                <p className="text-xs text-red-600 mt-1">
                  All data across all 4 databases will be permanently deleted. There is no recovery.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setStep(0); setInput(""); setError(null); }}
              disabled={clearing}
            >
              <X size={14} /> Cancel
            </Button>

            {step === 1 && (
              <Button
                onClick={() => setStep(2)}
                className="bg-red-600 text-white hover:bg-red-700 border-none"
              >
                Continue <ChevronRight size={14} />
              </Button>
            )}

            {step === 2 && (
              <Button
                onClick={() => {
                  if (input !== "DELETE ALL") {
                    setError("Please type DELETE ALL exactly to proceed.");
                    return;
                  }
                  if (!deletePassword) {
                    setError("Please enter the delete password.");
                    return;
                  }
                  setError(null);
                  setStep(3);
                }}
                disabled={input !== "DELETE ALL" || !deletePassword}
                className="bg-red-600 text-white hover:bg-red-700 border-none"
              >
                Continue <ChevronRight size={14} />
              </Button>
            )}

            {step === 3 && (
              <Button
                onClick={handleClear}
                disabled={clearing}
                className="bg-red-600 text-white hover:bg-red-700 border-none"
              >
                {clearing ? (
                  <><Loader2 size={14} className="animate-spin" /> Clearing...</>
                ) : (
                  <><Trash2 size={14} /> Delete Everything</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Admin Sales Reversal Section ─── */
function AdminSalesReversal({ logs, onRefetch }: { logs: any[]; onRefetch: () => void }) {
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [confirmReversal, setConfirmReversal] = useState<any | null>(null);
  const [reversalResult, setReversalResult] = useState<{ success: boolean; message: string } | null>(null);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [namesLoading, setNamesLoading] = useState(false);

  // Filter for SALE entries only
  const saleLogs = logs.filter((l) => l.action === "SALE").slice(0, 20);

  // Fetch product names for all sale logs
  useEffect(() => {
    if (saleLogs.length === 0) return;
    const ids = saleLogs.map((l: any) => l.product_id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    let cancelled = false;
    setNamesLoading(true);
    import("@/app/admin/dashboard/actions").then(({ getProductNamesByIds }) => {
      getProductNamesByIds(ids).then((map) => {
        if (!cancelled) { setProductNames(map); setNamesLoading(false); }
      }).catch(() => { if (!cancelled) setNamesLoading(false); });
    }).catch(() => { if (!cancelled) setNamesLoading(false); });
    return () => { cancelled = true; };
  }, [logs]);

  if (saleLogs.length === 0) return null;

  async function handleReverse() {
    if (!confirmReversal) return;
    setReversingId(confirmReversal.id);
    setReversalResult(null);

    try {
      const { reverseSaleAction } = await import("@/app/admin/dashboard/actions");
      const res = await reverseSaleAction(confirmReversal.id, "admin-sale-reversal", reversalReason || undefined);
      setReversalResult(res);
      if (res.success) {
        setTimeout(() => onRefetch(), 1500);
      }
    } catch (err: any) {
      setReversalResult({ success: false, message: err?.message || "Reversal failed." });
    } finally {
      setReversingId(null);
    }
  }

  function parseSaleDetails(details: string) {
    const match = details?.match(/Deducted (\d+) from (\w+) at (\w+)/);
    if (!match) return null;
    return {
      quantity: parseInt(match[1]),
      grade: match[2],
      outlet: match[3],
    };
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
            <Undo2 size={16} />
          </div>
          <div>
            <h3 className="text-base font-serif font-bold text-gray-900">Recent Sales</h3>
            <p className="text-[10px] text-gray-400 font-medium">Last {saleLogs.length} sales — click to reverse</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {saleLogs.map((log: any) => {
          const parsed = parseSaleDetails(log.details || "");
          const isReversing = reversingId === log.id;

          const productName = log.product_id ? productNames[log.product_id] : null;

          return (
            <div key={log.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400 uppercase shrink-0">SALE</span>
                  {namesLoading && !Object.keys(productNames).length ? (
                    <Loader2 size={14} className="animate-spin text-gray-300" />
                  ) : (
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {productName || log.product_id?.slice(0, 8) + '...' || "Unknown"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(log.created_at).toLocaleString("en-NG", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                  {parsed && ` • ${parsed.outlet} • ${parsed.grade}`}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                  {log.details || ""}
                </p>
              </div>
              <button
                onClick={() => {
                  setConfirmReversal(log);
                  setReversalReason("");
                  setReversalResult(null);
                }}
                disabled={isReversing}
                className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-all disabled:opacity-40"
              >
                {isReversing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Undo2 size={12} />
                )}
                Reverse
              </button>
            </div>
          );
        })}
      </div>

      {/* Reversal Confirmation Dialog */}
      <Dialog open={!!confirmReversal} onOpenChange={(open) => { if (!open) { setConfirmReversal(null); setReversalResult(null); } }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-amber-600 flex items-center gap-2">
              <Undo2 size={20} />
              Reverse This Sale?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Stock will be restored and a reversal entry will be logged.
            </DialogDescription>
          </DialogHeader>

          {confirmReversal && (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <p className="text-sm font-bold text-gray-900">{confirmReversal.details || "Sale record"}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {new Date(confirmReversal.created_at).toLocaleString("en-NG", {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-medium">
                  This will add the stock back to inventory. The reversal is logged for full audit transparency.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Reason <span className="text-gray-300 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <Input
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g., Wrong product, customer dispute..."
                  className="text-sm"
                  autoFocus
                />
              </div>

              {reversalResult && (
                <div className={`flex items-start gap-2 p-3 rounded-xl text-xs font-medium ${
                  reversalResult.success
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {reversalResult.success ? <CheckCircle size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                  <span>{reversalResult.message}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setConfirmReversal(null); setReversalResult(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleReverse}
              disabled={reversingId !== null}
              className="bg-amber-600 text-white hover:bg-amber-700 border-none"
            >
              {reversingId ? (
                <><Loader2 size={14} className="animate-spin" /> Reversing...</>
              ) : (
                <><Undo2 size={14} /> Confirm Reversal</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Duplicates Section (extracted to avoid Rules of Hooks violation) ─── */
function DuplicatesSection() {
  const [dupeSubTab, setDupeSubTab] = useState<"auto" | "manual">("auto");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-1.5 p-1 mb-6 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setDupeSubTab("auto")}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            dupeSubTab === "auto"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Auto-Detect
        </button>
        <button
          onClick={() => setDupeSubTab("manual")}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            dupeSubTab === "manual"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Manual Merge
        </button>
      </div>

      <AnimatePresence mode="wait">
        {dupeSubTab === "auto" ? (
          <motion.div
            key="auto-duplicates"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DuplicateProductResolver />
          </motion.div>
        ) : (
          <motion.div
            key="manual-merge"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ManualMergeTool />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Order Card with Inline Editing ─── */
/**
 * How long a pending order has been waiting for verification.
 *
 * Orders are never cancelled automatically, so an abandoned one sits here
 * holding its stock until an admin clears it. This badge is what makes that
 * visible: anything past a day turns orange, past three days turns red.
 */
function waitingFor(
  createdAt: string | null | undefined
): { label: string; tone: string } | null {
  if (!createdAt) return null;
  const placed = new Date(createdAt).getTime();
  if (Number.isNaN(placed)) return null;

  const minutes = Math.max(0, Math.floor((Date.now() - placed) / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label =
    minutes < 1
      ? "just now"
      : minutes < 60
      ? `waiting ${minutes}m`
      : hours < 24
      ? `waiting ${hours}h`
      : `waiting ${days}d`;

  const tone =
    days >= 3
      ? "bg-red-100 text-red-700"
      : hours >= 24
      ? "bg-orange-100 text-orange-700"
      : "bg-gray-100 text-gray-500";

  return { label, tone };
}

function OrderCard({ order, onVerified }: { order: any; onVerified?: (order: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<any[]>(order.order_items || []);
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableGrades, setAvailableGrades] = useState<Record<string, { grade: string; quantity: number }[]>>({});
  const [gradesLoading, setGradesLoading] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  const handleRemoveItem = async (itemId: string, itemName: string) => {
    if (removingItemId) return;
    if (!confirm(`Remove "${itemName}" from this order? The stock it was holding becomes available to buy again.`)) return;
    setRemovingItemId(itemId);
    setError(null);
    try {
      const result = await removeOrderItemAction(itemId, 'admin-order-edit');
      if (result.success) {
        window.location.reload();
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to remove item.');
    } finally {
      setRemovingItemId(null);
    }
  };

  // Fetch available grades when order is expanded
  useEffect(() => {
    if (expanded && order.order_items?.length > 0) {
      fetchAvailableGrades();
    }
  }, [expanded]);

  const fetchAvailableGrades = async () => {
    setGradesLoading(true);
    try {
      // Collect unique (product_id, outlet) pairs
      const pairs = new Map<string, string>();
      for (const item of order.order_items || []) {
        const key = `${item.product_id}|${item.outlet}`;
        if (!pairs.has(key)) {
          pairs.set(key, item.outlet);
        }
      }

      const results: Record<string, { grade: string; quantity: number }[]> = {};
      await Promise.all(
        Array.from(pairs.entries()).map(async ([key, outlet]) => {
          const [productId] = key.split('|');
          results[key] = await getAvailableGradesForProduct(outlet, productId, order.id);
        })
      );
      setAvailableGrades(results);
    } catch (err) {
      console.error("Failed to fetch available grades:", err);
    } finally {
      setGradesLoading(false);
    }
  };

  const getAvailableGradesForItem = (item: any) => {
    const key = `${item.product_id}|${item.outlet}`;
    return availableGrades[key] || null;
  };

  const getMaxQuantityForItem = (item: any): number => {
    // Grade is 'pending' (unassigned) — admin hasn't picked a shelf grade yet.
    // Don't restrict quantity until a grade is chosen.
    if (!item.grade || item.grade === 'pending') return 9999;

    const grades = getAvailableGradesForItem(item);
    if (!grades) return 9999; // No data yet, don't restrict
    const gradeEntry = grades.find((g: any) => g.grade === item.grade);
    if (gradeEntry) return gradeEntry.quantity;
    // Grade not in available list — may be fully reserved BY THIS ORDER.
    // Allow the item's own quantity as the max since the server will handle
    // the actual stock check (releases reservation before deducting).
    return item.quantity;
  };

  const handleItemChange = (index: number, field: 'quantity' | 'unit_price' | 'grade', value: number | string) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item[field] = value;

      // When grade changes, clamp quantity to available stock for the new grade
      if (field === 'grade') {
        const grades = availableGrades[`${item.product_id}|${item.outlet}`];
        if (grades) {
          const gradeEntry = grades.find((g: any) => g.grade === value);
          // If the grade has stock, use its quantity. Otherwise fall back to
          // the item's own quantity (stock is reserved by THIS order).
          const maxQty = gradeEntry ? gradeEntry.quantity
            : (value === item.grade && item.grade !== 'pending' ? item.quantity : 0);
          if (item.quantity > maxQty && maxQty > 0) {
            item.quantity = maxQty;
          }
        }
      }

      // Recalculate total for this item if quantity or price changed
      if (field === 'quantity' || field === 'unit_price' || field === 'grade') {
        item.total_price = item.quantity * item.unit_price;
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleVerify = async () => {
    // Validate: all items must have a real grade assigned
    const hasPendingGrade = items.some((item: any) => !item.grade || item.grade === 'pending');
    if (hasPendingGrade) {
      setError('Please assign a grade (Special, Extra, or Normal) to every item before verifying.');
      return;
    }

    // Validate: no item quantity exceeds available stock
    for (const item of items) {
      const max = getMaxQuantityForItem(item);
      if (max < 9999 && item.quantity > max) {
        setError(`"${item.product_name}" only has ${max} units available on the ${item.grade} shelf. You entered ${item.quantity}.`);
        return;
      }
      if (max === 0) {
        setError(`"${item.product_name}" has no stock on the ${item.grade} shelf. Please select a different grade.`);
        return;
      }
    }

    setVerifying(true);
    setError(null);
    try {
      const result = await verifyOrder(
        order.id,
        items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          grade: item.grade,
          outlet: item.outlet,
        }))
      );
      if (result.success) {
        setExpanded(false);
        setEditing(false);
        // Lift the verified order to the session-pinned list: the card stays
        // visible (as a VerifiedOrderCard) with its send-receipt actions, so
        // the pending-list refresh can no longer swipe the button away.
        if (onVerified) {
          onVerified({
            ...order,
            order_items: items,
            status: "paid",
          });
        }
      } else {
        setError(result.message || 'Verification failed. Stock could not be deducted. Please check inventory levels and try again.');
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify order.");
    } finally {
      setVerifying(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this order permanently? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStuckOrder(order.id);
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "Failed to delete order.");
    } finally {
      setDeleting(false);
    }
  };

  const newTotal = items.reduce((sum: number, item: any) => sum + item.total_price, 0);
  const gradeSummary = Object.entries(items.reduce((summary: Record<string, { units: number; amount: number }>, item: any) => {
    const grade = item.grade || 'pending';
    const current = summary[grade] || { units: 0, amount: 0 };
    summary[grade] = { units: current.units + Number(item.quantity || 0), amount: current.amount + Number(item.total_price || 0) };
    return summary;
  }, {})).sort(([a], [b]) => a === 'pending' ? 1 : b === 'pending' ? -1 : a.localeCompare(b));
  const hasChanges = JSON.stringify(items) !== JSON.stringify(order.order_items || []);
  const waiting = waitingFor(order.created_at);
  /**
   * Download this order's receipt at its CURRENT status. The status is read
   * live from Archive rather than hardcoded to "pending": verifying an order
   * does not remove it from the pending list until the hook refetches, so a
   * fixed "pending" would let this button print a pre-verification receipt —
   * no gift QR, "awaiting verification" pill — for an order that is already
   * verified. A genuinely pending order still prints as pending.
   */
  const downloadOrderReceipt = async () => {
    const receipt = await getReceiptData(order.id);
    await downloadReceiptPdf({
      ...receipt,
      items: receipt.items.map((item) => ({
        name: item.product_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        grade: item.grade,
      })),
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all">
      {/* Order Header - always visible */}
      <div
        className="p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-1">
            <p className="font-bold text-gray-900">Order #{order.id.slice(0, 8)}</p>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider">
              Pending
            </span>
            {/* Customer asked for a receipt at checkout — send the VERIFIED
                receipt to their WhatsApp after verifying. */}
            {order.receipt_requested && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-[9px] font-black uppercase tracking-wider"
                title={`Verified receipt requested — send to ${order.customer_phone || "customer's WhatsApp"} after verifying${order.receipt_name ? ` for ${order.receipt_name}` : ""}`}
              >
                <FileText size={10} />
                Receipt Requested
              </span>
            )}
            {waiting && (
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${waiting.tone}`}
              >
                {waiting.label}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {order.customer_name || order.customer_phone} 
            {order.customer_phone && order.customer_name ? ` • ${order.customer_phone}` : ''}
            {order.outlet ? ` • ${order.outlet.charAt(0).toUpperCase() + order.outlet.slice(1)}` : ''}
          </p>
          {/* Product names visible without expanding */}
          {order.order_items?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {order.order_items.slice(0, 3).map((item: any, i: number) => (
                <span
                  key={i}
                  className="text-[10px] font-medium text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md truncate max-w-[120px]"
                >
                  {item.product_name}
                </span>
              ))}
              {order.order_items.length > 3 && (
                <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-md">
                  +{order.order_items.length - 3} more
                </span>
              )}
            </div>
          )}
          <p className="text-sm font-bold mt-2">
            <span className="text-brand-gold">₦{newTotal.toLocaleString()}</span>
            {hasChanges && editing && (
              <span className="text-[10px] text-gray-400 ml-2 font-normal">(edited)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 ml-0 sm:ml-4 mt-3 sm:mt-0 w-full sm:w-auto">
          {order.whatsapp_link && (
            <a
              href={order.whatsapp_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-3 sm:px-4 py-2 bg-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors shadow-sm"
            >
              WhatsApp
            </a>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(true);
              setEditing(true);
            }}
            className="px-3 sm:px-4 py-2 bg-brand-gold text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-colors shadow-sm"
          >
            Verify
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); void downloadOrderReceipt(); }} title="Download this order's receipt at its current status" className="px-3 py-2 border border-brand-gold/30 text-brand-gold rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/10 transition-colors">
            Receipt
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={deleting}
            aria-label={`Delete order ${order.id.slice(0, 8)}`}
            className="p-2 sm:px-4 sm:py-2 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-colors shadow-sm disabled:opacity-50"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight size={18} className="text-gray-400" />
          </motion.div>
        </div>
      </div>

      {/* Expanded Items Section */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 sm:px-6 py-4 space-y-3">
              {/* The receipt request belongs on the verify card itself, not only
                  in a badge tooltip (tooltips never open on touch devices): this
                  is the receiver and the WhatsApp number the verified receipt
                  must reach once the order below is verified. */}
              {order.receipt_requested && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-brand-gold/30 bg-brand-gold/5 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-brand-gold">
                    <FileText size={12} /> Receipt requested
                  </p>
                  <p className="text-xs text-gray-600">
                    Receiver: <span className="font-bold text-gray-900">{order.receipt_name || order.customer_name || "Customer"}</span>
                  </p>
                  <p className="text-xs text-gray-600">
                    WhatsApp: <span className="font-bold text-gray-900">{order.customer_phone || "not provided"}</span>
                  </p>
                  {order.customer_phone && (
                    <a
                      href={`https://wa.me/${normalizeWhatsAppPhone(order.customer_phone) || ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-black uppercase tracking-widest text-[#25D366] hover:underline"
                    >
                      Open chat
                    </a>
                  )}
                </div>
              )}
              {/* Mobile verification cards avoid forcing a wide desktop table onto
                  narrow phones such as the Samsung S10e. */}
              <div className="sm:hidden space-y-3">
                {items.map((item: any, idx: number) => (
                  <div key={`mobile-${item.id || idx}`} className="rounded-xl border border-gray-200 overflow-hidden bg-gray-50/40">
                    <div className="border-l-4 border-brand-gold bg-amber-50/60 px-3 py-2.5">
                      <p className="text-[13px] font-bold text-gray-900 leading-snug">{item.product_name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-3">
                      <label className="space-y-1">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Grade</span>
                        {editing ? (
                          gradesLoading ? <Loader2 size={14} className="animate-spin text-brand-gold" /> : (
                            <select
                              aria-label={`Grade for ${item.product_name}`}
                              value={item.grade === 'pending' ? '' : item.grade}
                              onChange={(e) => handleItemChange(idx, 'grade', e.target.value)}
                              className="w-full text-[11px] font-bold uppercase bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                            >
                              <option value="" disabled>Select grade</option>
                              {(getAvailableGradesForItem(item) ?? []).map((entry) => (
                                <option key={entry.grade} value={entry.grade}>
                                  {entry.grade.charAt(0).toUpperCase() + entry.grade.slice(1)} ({entry.quantity})
                                </option>
                              ))}
                            </select>
                          )
                        ) : <span className={`inline-block text-[11px] font-black uppercase px-2.5 py-1.5 rounded-lg ${item.grade === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>{item.grade === 'pending' ? 'Unassigned' : item.grade}</span>}
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Quantity</span>
                        {editing ? <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
                          <button type="button" aria-label={`Reduce quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, 'quantity', Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1} className="w-9 h-9 flex items-center justify-center text-gray-500 disabled:opacity-25"><Minus size={14} /></button>
                          <span className="flex-1 text-center text-sm font-bold" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                          <button type="button" aria-label={`Increase quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, 'quantity', Math.min(item.quantity + 1, Math.max(1, getMaxQuantityForItem(item))))} disabled={item.quantity >= getMaxQuantityForItem(item)} className="w-9 h-9 flex items-center justify-center text-gray-500 disabled:opacity-25"><Plus size={14} /></button>
                        </div> : <span className="block text-sm font-bold text-gray-900 py-2">{item.quantity}</span>}
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Unit price</span>
                        {editing ? <input
                          aria-label={`Unit price for ${item.product_name}`}
                          type="number"
                          min={0}
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(idx, 'unit_price', parseInt(e.target.value) || 0)}
                          className="w-full text-center text-sm font-bold bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                        /> : <span className="block text-sm font-bold text-gray-900 py-2">₦{item.unit_price?.toLocaleString()}</span>}
                      </label>
                      <div className="space-y-1">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Line total</span>
                        <span className="block text-sm font-black text-brand-gold py-2">₦{item.total_price?.toLocaleString()}</span>
                      </div>
                    </div>
                    {editing && <button
                      type="button"
                      onClick={() => void handleRemoveItem(item.id, item.product_name)}
                      disabled={removingItemId === item.id}
                      className="w-full border-t border-gray-200 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-red-500 disabled:opacity-40"
                    >{removingItemId === item.id ? 'Removing...' : 'Remove item'}</button>}
                  </div>
                ))}
              </div>
              {/* Table Header */}
              <div className="hidden sm:flex items-center gap-2 sm:gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400 pb-2 border-b border-gray-50 min-w-[520px]">
                <div className="flex-1">Product</div>
                <div className="w-16 sm:w-24 text-center shrink-0">Grade</div>
                <div className="w-14 sm:w-20 text-center shrink-0">Qty</div>
                <div className="w-16 sm:w-24 text-center shrink-0">Price</div>
                <div className="w-16 sm:w-24 text-right shrink-0">Total</div>
                {editing && <div className="w-8 shrink-0"></div>}
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">No items in this order.</p>
              ) : (
                <div className="hidden sm:block">
                {items.map((item: any, idx: number) => (
                  <div
                    key={item.id || idx}
                    className="flex items-center gap-2 sm:gap-3 py-3 border-b border-gray-50 last:border-b-0"
                  >
                    {/* Product Name */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{item.product_name}</p>
                    </div>

                    {/* Grade — only show grades with available stock */}
                    <div className="w-16 sm:w-24 text-center shrink-0">
                      {editing ? (
                        <>
                          {gradesLoading ? (
                            <div className="flex items-center justify-center py-1.5">
                              <Loader2 size={12} className="animate-spin text-brand-gold" />
                            </div>
                          ) : (
                            <select
                              value={item.grade === 'pending' ? '' : item.grade}
                              onChange={(e) => handleItemChange(idx, 'grade', e.target.value)}
                              className="text-[10px] font-black uppercase tracking-wider bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                            >
                              <option value="" disabled>Select</option>
                              {(() => {
                                const avail = getAvailableGradesForItem(item);
                                // Start with available grades from inventory
                                let options = avail ? [...avail] : [];

                                // Always include the currently assigned grade if it's set,
                                // so existing orders with a pre-assigned grade aren't broken
                                if (item.grade && item.grade !== 'pending') {
                                  const alreadyIncluded = options.some(g => g.grade === item.grade);
                                  if (!alreadyIncluded) {
                                    options.push({ grade: item.grade, quantity: 0 });
                                  }
                                }

                                return options.map((g) => {
                                  // If the grade is the order item's own grade and shows 0,
                                  // use the item's quantity instead (stock is reserved by THIS order).
                                  const displayQty = g.quantity > 0 ? g.quantity
                                    : (g.grade === item.grade && item.grade !== 'pending' ? item.quantity : 0);
                                  return (
                                    <option key={g.grade} value={g.grade}>
                                      {g.grade.charAt(0).toUpperCase() + g.grade.slice(1)}
                                      {displayQty > 0 ? ` (${displayQty})` : ' — out of stock'}
                                    </option>
                                  );
                                });
                              })()}
                            </select>
                          )}
                          {!gradesLoading && (() => {
                            const avail = getAvailableGradesForItem(item);
                            if (avail && avail.length === 0) {
                              return (
                                <p className="text-[8px] text-red-400 mt-1 font-bold">No stock</p>
                              );
                            }
                            return null;
                          })()}
                        </>
                      ) : (
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                          item.grade === 'pending'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-gray-50 text-gray-400'
                        }`}>
                          {item.grade === 'pending' ? 'Unassigned' : item.grade}
                        </span>
                      )}
                    </div>

                    {/* Quantity (editable) */}
                    <div className="w-20 text-center">
                      {editing ? (
                        <>
                          <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                            <button type="button" aria-label={`Reduce quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, 'quantity', Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1} className="w-7 h-8 flex items-center justify-center text-gray-500 disabled:opacity-25"><Minus size={12} /></button>
                            <span className="w-7 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                            <button type="button" aria-label={`Increase quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, 'quantity', Math.min(item.quantity + 1, Math.max(1, getMaxQuantityForItem(item))))} disabled={item.quantity >= getMaxQuantityForItem(item)} className="w-7 h-8 flex items-center justify-center text-gray-500 disabled:opacity-25"><Plus size={12} /></button>
                          </div>
                          {(() => {
                            const max = getMaxQuantityForItem(item);
                            return max < 9999 ? (
                              <p className="text-[8px] text-gray-400 mt-0.5">max: {max}</p>
                            ) : null;
                          })()}
                        </>
                      ) : (
                        <span className="text-sm font-bold text-gray-900">{item.quantity}</span>
                      )}
                    </div>

                    {/* Unit Price (editable) */}
                    <div className="w-24 text-center">
                      {editing ? (
                        <div className="relative inline-flex items-center">
                          <span className="absolute left-3 text-gray-400 text-xs font-bold">₦</span>
                          <input
                            type="number"
                            min={0}
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(idx, 'unit_price', parseInt(e.target.value) || 0)}
                            className="w-24 text-center text-sm font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl pl-6 pr-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                          />
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-gray-900">₦{item.unit_price?.toLocaleString()}</span>
                      )}
                    </div>

                    {/* Total */}
                    <div className="w-24 text-right">
                      <span className="text-sm font-black text-brand-gold">₦{item.total_price?.toLocaleString()}</span>
                    </div>

                    {/* Remove button — visible only when editing */}
                    {editing && (
                      <div className="w-8 shrink-0 flex justify-center">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleRemoveItem(item.id, item.product_name);
                          }}
                          disabled={removingItemId === item.id}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40"
                          title={`Remove ${item.product_name} from order`}
                        >
                          {removingItemId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}

              {/* Order Total */}
              <div className="hidden sm:flex items-center justify-between pt-4 border-t border-gray-100 min-w-[520px]">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Order Total</p>
                <p className="text-lg font-black text-brand-gold">₦{newTotal.toLocaleString()}</p>
              </div>
              <div className="sm:hidden flex items-center justify-between pt-3 border-t border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Order total</p>
                <p className="text-lg font-black text-brand-gold">₦{newTotal.toLocaleString()}</p>
              </div>

              <div className="rounded-xl border border-brand-gold/15 bg-brand-gold/5 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">Verification summary by grade</p>
                  <p className="text-[10px] font-bold text-brand-gold">{items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)} total items</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {gradeSummary.map(([grade, summary]) => (
                    <div key={grade} className="flex items-center justify-between rounded-lg bg-white px-3 py-2.5 border border-white/80">
                      <div><p className="text-[10px] font-black uppercase tracking-wider text-gray-700">{grade === 'pending' ? 'Unassigned' : grade}</p><p className="text-[10px] text-gray-400">{summary.units} item{summary.units === 1 ? '' : 's'}</p></div>
                      <p className="text-sm font-black text-brand-gold">₦{summary.amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {order.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-medium">{order.notes}</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-2">
                <button
                  onClick={() => {
                    setExpanded(false);
                    setEditing(false);
                    setItems(order.order_items || []);
                    setError(null);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
                >
                  Cancel
                </button>
                {editing ? (
                  <button
                    onClick={handleVerify}
                    disabled={verifying}
                    className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {verifying ? (
                      <><Loader2 size={14} className="animate-spin" /> Verifying...</>
                    ) : (
                      <><ShieldAlert size={14} /> Confirm &amp; Verify</>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full sm:w-auto justify-center px-5 py-2.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm flex items-center gap-2"
                  >
                    <ShieldAlert size={14} /> Edit &amp; Verify
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * An order verified in this session, pinned above the pending list. When the
 * customer requested a receipt at checkout, this card carries the send flow:
 * download the VERIFIED receipt + open the customer's WhatsApp DM with an
 * appreciation message. Extravaganza orders also surface their gift code so
 * the admin can redeem/track it from the Gift Claims tab.
 */
function VerifiedOrderCard({ order, onDismiss }: { order: any; onDismiss: (id: string) => void }) {
  const downloadVerifiedReceipt = async () => {
    const receipt = await getReceiptData(order.id);
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
  };

  /**
   * Download the verified receipt, then open the customer's WhatsApp DM with
   * an appreciation message. WhatsApp links cannot pre-attach files — the
   * admin taps attach in the chat; the PDF is already in their downloads.
   */
  const sendVerifiedReceipt = async () => {
    await downloadVerifiedReceipt();
    const phone = openVerifiedReceiptWhatsapp(order.customer_phone || "", order.receipt_name, order.customer_name);
    if (!phone) return;
  };

  const customerPhone = normalizeWhatsAppPhone(order.customer_phone || "");
  const items = order.order_items || [];
  const specialSpend = items.reduce(
    (sum: number, item: any) => (Number(item.unit_price) >= 35_000 ? sum + Number(item.unit_price) * Number(item.quantity) : sum),
    0,
  );
  const isExtravaganza = specialSpend > 0;

  return (
    <div className="bg-white rounded-2xl border border-green-200 overflow-hidden">
      <div className="bg-green-50/70 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle size={18} className="text-green-600" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-gray-900">Order #{order.id.slice(0, 8)}</p>
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-wider">
                  Verified
                </span>
                {order.receipt_requested && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-[9px] font-black uppercase tracking-wider">
                    <FileText size={10} />
                    Receipt Requested
                  </span>
                )}
                {isExtravaganza && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider">
                    <Gift size={10} />
                    Gift Code Live
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1 truncate">
                {order.customer_name || order.customer_phone}
                {order.customer_phone ? ` • ${order.customer_phone}` : ""}
                {order.outlet ? ` • ${order.outlet.charAt(0).toUpperCase() + order.outlet.slice(1)}` : ""}
              </p>
              <p className="text-sm font-bold mt-0.5">
                <span className="text-brand-gold">₦{(items.reduce((sum: number, item: any) => sum + Number(item.total_price || 0), 0)).toLocaleString()}</span>
                {isExtravaganza && (
                  <span className="ml-2 text-[10px] text-amber-600 font-bold uppercase tracking-wider">
                    Extravaganza ₦{specialSpend.toLocaleString()}
                  </span>
                )}
              </p>
              {isExtravaganza && (
                <p className="text-[10px] text-gray-400 mt-1">
                  Gift code <span className="font-mono font-bold text-gray-600">ALF-{order.id.split("-")[0].toUpperCase()}</span> is live on the Gift Claims tab
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Any verified order with a reachable number can be sent its
                verified receipt — not only the ones flagged receipt_requested,
                whose flag the Archive RPC dropped before migration 018. */}
            {customerPhone && (
              <button
                type="button"
                onClick={() => void sendVerifiedReceipt()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#25D366] text-white text-[10px] font-black uppercase tracking-widest hover:bg-[#20BD5A] transition-all shadow-md shadow-[#25D366]/20"
              >
                <MessageCircle size={13} />
                Send Verified Receipt
              </button>
            )}
            <button
              type="button"
              onClick={() => void downloadVerifiedReceipt()}
              className="px-4 py-2.5 rounded-xl border border-green-300 bg-white text-green-700 text-[10px] font-black uppercase tracking-widest hover:bg-green-50 transition-all"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => onDismiss(order.id)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-500 text-[10px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
