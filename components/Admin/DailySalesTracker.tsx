/* filepath: components/Admin/DailySalesTracker.tsx */
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, RefreshCw, Loader2, TrendingUp, Banknote,
  Store, ShoppingCart, Package, ChevronDown, ChevronUp,
  AlertTriangle, FileText, Clock, Flag, CheckCircle2
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getDailySales, type DailySaleItem, type DailySalesResult } from "@/app/admin/dashboard/actions";
import SalesFlagModal, { type FlagTarget } from "@/components/Admin/SalesFlagModal";
import { downloadReceiptPdf } from "@/lib/receiptPdf";

// ─── Color helpers ───
const GRADE_COLORS: Record<string, string> = {
  special: "text-amber-500 bg-amber-50 border-amber-200",
  extra: "text-blue-500 bg-blue-50 border-blue-200",
  normal: "text-green-500 bg-green-50 border-green-200",
};

const GRADE_DOT: Record<string, string> = {
  special: "bg-amber-400",
  extra: "bg-blue-400",
  normal: "bg-green-400",
};

function formatCurrency(n: number): string {
  return `₦${n.toLocaleString()}`;
}

// ─── Stat Card ───
function StatCard({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border p-5 transition-all hover:shadow-md ${
        accent ? "bg-brand-gold text-white border-brand-gold" : "bg-white border-gray-100"
      }`}
    >
      <div className={`p-2.5 rounded-xl w-fit mb-3 ${
        accent ? "bg-white/20" : "bg-brand-softGray"
      }`}>
        {icon}
      </div>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${
        accent ? "text-white/70" : "text-gray-400"
      }`}>
        {label}
      </p>
      <p className={`text-xl font-black ${
        accent ? "text-white" : "text-gray-900"
      }`}>
        {value}
      </p>
    </motion.div>
  );
}

// ─── Sales Table ───
function SalesTable({ items, outlet, totalUnits, totalRevenue, onViewAudit, onFlag, canFlag }: {
  items: DailySaleItem[];
  outlet: string;
  totalUnits: number;
  totalRevenue: number;
  onViewAudit?: (productId: string) => void;
  onFlag?: (item: DailySaleItem) => void;
  canFlag?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [receiverName, setReceiverName] = useState("");

  if (items.length === 0) return null;

  const rowKey = (item: DailySaleItem, index: number) => `${item.product_id}-${item.grade}-${item.outlet}-${index}`;
  const selectedItems = items.filter((item, index) => selectedKeys.has(rowKey(item, index)));
  const selectedRevenue = selectedItems.reduce((sum, item) => sum + item.total_revenue, 0);

  const requestSalesReceipt = () => {
    if (selectedItems.length === 0) return;
    const name = window.prompt("Enter the receiver name for this receipt:", receiverName);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setReceiverName(trimmed);
    void downloadReceiptPdf({
      orderId: `sales-${outlet}-${new Date().toISOString().slice(0, 10)}`,
      customerName: trimmed,
      outlet,
      status: "verified",
      total: selectedRevenue,
      items: selectedItems.map((item) => ({ name: item.product_name, quantity: item.quantity_sold, unitPrice: item.unit_price, totalPrice: item.total_revenue, grade: item.grade })),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            outlet === "unilorin" ? "bg-emerald-50 text-emerald-500" : "bg-violet-50 text-violet-500"
          }`}>
            <Store size={18} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-gray-900 capitalize">{outlet}</h3>
           <p className="text-[10px] text-gray-400 font-medium">
              {totalUnits} unit{totalUnits !== 1 ? "s" : ""} · {formatCurrency(totalRevenue)}
            </p>
           </div>
         </div>
         <div className="flex items-center gap-2"><button type="button" onClick={(event) => { event.stopPropagation(); requestSalesReceipt(); }} disabled={selectedItems.length === 0} className="rounded-lg border border-brand-gold/25 px-2 py-1.5 text-[9px] font-black uppercase tracking-wider text-brand-gold disabled:cursor-not-allowed disabled:opacity-30">Receipt{selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}</button>{expanded ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}</div>
      </button>

      {/* Table */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
               <tr className="border-b border-gray-50">
                 <th className="px-3 py-3 text-center w-10"><input type="checkbox" aria-label={`Select all ${outlet} sales`} checked={selectedItems.length === items.length} onChange={(event) => setSelectedKeys(event.target.checked ? new Set(items.map(rowKey)) : new Set())} className="accent-[#D4AF37]" /></th>
                <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400">Product</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-16">Grade</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-20">Sold</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-20">Remaining</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-24">Flag</th>
                <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 w-24">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                 <tr
                  key={`${item.product_id}-${item.grade}-${idx}`}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/30 transition-colors"
                >
                  <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Select ${item.product_name} sale`} checked={selectedKeys.has(rowKey(item, idx))} onChange={(event) => setSelectedKeys((current) => { const next = new Set(current); if (event.target.checked) next.add(rowKey(item, idx)); else next.delete(rowKey(item, idx)); return next; })} className="accent-[#D4AF37]" /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate max-w-[160px] sm:max-w-[260px]">
                          {item.product_name}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {item.product_id.slice(0, 8)}...
                        </p>
                      </div>
                      <button
                        onClick={() => onViewAudit?.(item.product_id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all shrink-0"
                        title="View audit trail"
                      >
                        <Clock size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${
                      GRADE_COLORS[item.grade] || "text-gray-400 bg-gray-50 border-gray-100"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${GRADE_DOT[item.grade] || "bg-gray-300"}`} />
                      {item.grade}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-bold text-gray-900">{item.quantity_sold}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-sm font-bold ${
                      item.current_stock === 0
                        ? "text-red-500"
                        : item.current_stock <= 3
                          ? "text-amber-500"
                          : "text-gray-900"
                    }`}>
                      {item.current_stock}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {item.flag ? (
                      <button
                        onClick={() => onFlag?.(item)}
                        className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border transition-all ${
                          item.flag.status === 'resolved'
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                            : item.flag.discrepancy_type === 'number_less'
                              ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
                              : item.flag.discrepancy_type === 'number_more'
                                ? 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100'
                                : 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'
                        }`}
                        title="View or resolve this flag"
                      >
                        {item.flag.status === 'resolved' ? <CheckCircle2 size={11} /> : <Flag size={11} />}
                        {item.flag.status === 'resolved'
                          ? 'Resolved'
                          : item.flag.discrepancy_type === 'number_less'
                            ? 'Number less'
                            : item.flag.discrepancy_type === 'number_more'
                              ? 'Number more'
                              : 'Flagged'}
                      </button>
                    ) : canFlag ? (
                      <button
                        onClick={() => onFlag?.(item)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-all"
                        title="Flag a discrepancy in remaining units"
                      >
                        <Flag size={14} />
                      </button>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-black text-brand-gold">{formatCurrency(item.total_revenue)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
               <tr className="border-t-2 border-gray-100 bg-gray-50/50">
                 <td></td><td className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">
                   Total ({items.length} record{items.length !== 1 ? "s" : ""})
                 </td>
                <td></td>
                <td className="text-center text-sm font-black text-gray-900">{totalUnits}</td>
                <td></td>
                 <td></td>
                 <td className="text-right px-5 py-3 text-sm font-black text-brand-gold">{formatCurrency(totalRevenue)}</td>
               </tr>
            </tfoot>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ───
export default function DailySalesTracker({ onViewAudit }: { onViewAudit?: (productId: string) => void }) {
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [data, setData] = useState<DailySalesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfOutletFilter, setPdfOutletFilter] = useState<'all' | 'unilorin' | 'tanke'>('all');
  const [pdfIncludeRevenue, setPdfIncludeRevenue] = useState(true);
  const [pdfIncludeStock, setPdfIncludeStock] = useState(true);
  const [pdfIncludeProductIds, setPdfIncludeProductIds] = useState(false);
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);

  const openFlagModal = useCallback((item: DailySaleItem) => {
    setFlagTarget({
      date: item.flag?.flag_date ?? selectedDate,
      outlet: item.outlet,
      productId: item.product_id,
      productName: item.product_name,
      grade: item.grade,
      quantitySold: item.quantity_sold,
      currentStock: item.current_stock,
      flag: item.flag ?? null,
    });
  }, [selectedDate]);

  const isToday = selectedDate === new Date().toISOString().split("T")[0];
  const isCurrentMonth = selectedMonth === new Date().toISOString().slice(0, 7);

  const fetchData = useCallback(async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (viewMode === 'daily') {
        const result = await getDailySales(selectedDate);
        setData(result);
      } else {
        // Compute month start and end dates
        const monthStart = selectedMonth + '-01';
        const [year, month] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed in constructor, so month gives last day of that month
        const monthEnd = selectedMonth + '-' + String(lastDay).padStart(2, '0');
        // Pass endDate as the day AFTER the last day so the query uses [start, end)
        const nextDay = new Date(year, month - 1, lastDay + 1);
        const endDateStr = nextDay.toISOString().split('T')[0];
        const result = await getDailySales(monthStart, endDateStr);
        setData(result);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load sales data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, selectedMonth, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30 seconds ONLY when viewing today/this month
  useEffect(() => {
    if (viewMode === 'daily' && !isToday) return;
    if (viewMode === 'monthly' && !isCurrentMonth) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData(true);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData, isToday, isCurrentMonth, viewMode]);

  const unilorinItems = data?.items.filter(i => i.outlet === "unilorin") ?? [];
  const tankeItems = data?.items.filter(i => i.outlet === "tanke") ?? [];

  // ─── PDF Generation ───
  const generatePDF = useCallback(() => {
    if (!data || data.items.length === 0) return;

    // Determine which items to include based on the selected outlet filter
    const filteredItems = pdfOutletFilter === 'all'
      ? data.items
      : data.items.filter(i => i.outlet === pdfOutletFilter);

    if (filteredItems.length === 0) return;

    const unilorinItems = filteredItems.filter((i) => i.outlet === "unilorin");
    const tankeItems = filteredItems.filter((i) => i.outlet === "tanke");

    const outletLabel = pdfOutletFilter === 'all'
      ? 'Both Outlets'
      : pdfOutletFilter === 'unilorin'
        ? 'Unilorin Only'
        : 'Tanke Only';

    const totalRevenue = filteredItems.reduce((s, i) => s + i.total_revenue, 0);
    const totalUnits = filteredItems.reduce((s, i) => s + i.quantity_sold, 0);

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const addFooter = () => {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, { align: "center" });
      }
    };

    const reportLabel = viewMode === 'daily' ? 'Daily Sales Report' : 'Monthly Sales Report';

    // ── Title block ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ALFAWZAAN\u2019S ENTERPRISE", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(12);
    doc.setTextColor(212, 175, 55);
    doc.text(reportLabel, pageWidth / 2, 28, { align: "center" });

    doc.setTextColor(100);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    const now = new Date();
    const genDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const genTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    doc.text(`Date: ${data.date}  |  Outlet: ${outletLabel}  |  Generated: ${genDate} at ${genTime}  |  Items: ${filteredItems.length}`, pageWidth / 2, 36, { align: "center" });

    // ── Summary stats ──
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.setFont("helvetica", "bold");
    doc.text("SUMMARY", 14, 48);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(60);

    let summaryLine = `${pdfIncludeRevenue ? `Total Revenue: ₦${totalRevenue.toLocaleString()}  |  ` : ''}Total Units: ${totalUnits}`;
    if (pdfOutletFilter === 'all') {
      const unilorinRev = unilorinItems.reduce((s, i) => s + i.total_revenue, 0);
      const unilorinUnits = unilorinItems.reduce((s, i) => s + i.quantity_sold, 0);
      const tankeRev = tankeItems.reduce((s, i) => s + i.total_revenue, 0);
      const tankeUnits = tankeItems.reduce((s, i) => s + i.quantity_sold, 0);
      summaryLine += pdfIncludeRevenue
        ? `  |  Unilorin: ₦${unilorinRev.toLocaleString()} (${unilorinUnits} units)  |  Tanke: ₦${tankeRev.toLocaleString()} (${tankeUnits} units)`
        : `  |  Unilorin: ${unilorinUnits} units  |  Tanke: ${tankeUnits} units`;
    } else if (pdfOutletFilter === 'unilorin') {
      summaryLine += pdfIncludeRevenue ? `  |  Unilorin: ₦${totalRevenue.toLocaleString()} (${totalUnits} units)` : `  |  Unilorin: ${totalUnits} units`;
    } else {
      summaryLine += pdfIncludeRevenue ? `  |  Tanke: ₦${totalRevenue.toLocaleString()} (${totalUnits} units)` : `  |  Tanke: ${totalUnits} units`;
    }
    doc.text(summaryLine, 14, 54);

    let startY = 64;

    // Helper to render an outlet table
    const renderTable = (items: DailySaleItem[], outletName: string) => {
      if (items.length === 0) return startY;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(80);
      doc.text(outletName.toUpperCase(), 14, startY);
      startY += 7;

       const body = items.map((item) => {
         const row = [item.product_name];
         if (pdfIncludeProductIds) row.push(`${item.product_id.slice(0, 8)}...`);
         row.push(item.grade.charAt(0).toUpperCase() + item.grade.slice(1), String(item.quantity_sold));
         if (pdfIncludeStock) row.push(item.current_stock === 0 ? "0 (OUT)" : String(item.current_stock));
         if (pdfIncludeRevenue) row.push(`₦${item.total_revenue.toLocaleString()}`);
         return row;
       });

      // Add total row
      const tblTotalUnits = items.reduce((s, i) => s + i.quantity_sold, 0);
      const tblTotalRev = items.reduce((s, i) => s + i.total_revenue, 0);
       const totalRow = ["TOTAL"];
       if (pdfIncludeProductIds) totalRow.push("");
       totalRow.push("", String(tblTotalUnits));
       if (pdfIncludeStock) totalRow.push("");
       if (pdfIncludeRevenue) totalRow.push(`₦${tblTotalRev.toLocaleString()}`);
       body.push(totalRow);

       const head = ["Product"];
       if (pdfIncludeProductIds) head.push("Reference");
       head.push("Grade", "Sold");
       if (pdfIncludeStock) head.push("Remaining");
       if (pdfIncludeRevenue) head.push("Revenue");

       const columnStyles: Record<number, { cellWidth: number; halign?: "left" | "center" | "right" }> = {
         0: { cellWidth: 58, halign: "left" },
       };
       let columnIndex = 1;
       if (pdfIncludeProductIds) columnStyles[columnIndex++] = { cellWidth: 22, halign: "center" };
       columnStyles[columnIndex++] = { cellWidth: 22, halign: "center" };
       columnStyles[columnIndex++] = { cellWidth: 18, halign: "center" };
       if (pdfIncludeStock) columnStyles[columnIndex++] = { cellWidth: 26, halign: "center" };
       if (pdfIncludeRevenue) columnStyles[columnIndex] = { cellWidth: 30, halign: "right" };

      autoTable(doc, {
         head: [head],
        body,
        startY,
         tableWidth: pageWidth - 28,
         margin: { left: 14, right: 14 },
         styles: { fontSize: 8.5, cellPadding: 2.5, fontStyle: "bold", overflow: "linebreak" },
         headStyles: { fillColor: [212, 175, 55], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
         alternateRowStyles: { fillColor: [250, 245, 230] },
         columnStyles,
       });

      return (doc as any).lastAutoTable.finalY + 10;
    };

    startY = renderTable(unilorinItems, "Unilorin");
    startY = renderTable(tankeItems, "Tanke");

    addFooter();

    const fileDate = selectedDate.replace(/-/g, "");
    const outletSuffix = pdfOutletFilter === 'all' ? 'both' : pdfOutletFilter;
    const periodPrefix = viewMode === 'daily' ? 'daily' : 'monthly';
    doc.save(`alfawzaan-${periodPrefix}-sales-${fileDate}-${outletSuffix}.pdf`);
   }, [data, selectedDate, pdfOutletFilter, viewMode, pdfIncludeRevenue, pdfIncludeStock, pdfIncludeProductIds]);

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
        <Loader2 size={32} className="animate-spin text-brand-gold mx-auto mb-4" />
        <p className="text-xs text-gray-400 font-medium">Loading today&apos;s sales...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-100 p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-1">Failed to Load Data</h3>
        <p className="text-xs text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => fetchData()}
          className="px-5 py-2.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  const noSales = data && data.items.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-gold/10 text-brand-gold">
            <BarChart3 size={22} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-serif font-bold text-gray-900">
                {viewMode === 'daily' ? 'Daily Sales' : 'Monthly Sales'}
              </h2>
              {/* View mode toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('daily')}
                  className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'daily'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setViewMode('monthly')}
                  className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest transition-all ${
                    viewMode === 'monthly'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 font-medium">
              {data?.date ?? (viewMode === 'daily' ? 'Select a date' : 'Select a month')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-[10px] text-gray-400 font-medium">
              {data.items.length} item{data.items.length !== 1 ? "s" : ""} sold
            </span>
          )}
          {data && data.items.length > 0 && (
            <div className="flex items-center gap-1.5">
              {/* Outlet selector for PDF */}
              <select
                value={pdfOutletFilter}
                onChange={(e) => setPdfOutletFilter(e.target.value as 'all' | 'unilorin' | 'tanke')}
                className="px-2.5 py-2.5 rounded-xl border border-gray-200 bg-white text-[10px] font-bold uppercase tracking-wider text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all cursor-pointer"
                title="Select outlet(s) for PDF"
              >
                <option value="all">All Stores</option>
                <option value="unilorin">Unilorin</option>
                <option value="tanke">Tanke</option>
              </select>
              <div className="hidden items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 lg:flex">
                <button type="button" onClick={() => setPdfIncludeRevenue((value) => !value)} aria-pressed={pdfIncludeRevenue} className={`rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider ${pdfIncludeRevenue ? 'bg-brand-gold/15 text-brand-gold' : 'text-gray-400'}`}>Revenue</button>
                <button type="button" onClick={() => setPdfIncludeStock((value) => !value)} aria-pressed={pdfIncludeStock} className={`rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider ${pdfIncludeStock ? 'bg-brand-gold/15 text-brand-gold' : 'text-gray-400'}`}>Stock</button>
                <button type="button" onClick={() => setPdfIncludeProductIds((value) => !value)} aria-pressed={pdfIncludeProductIds} className={`rounded-lg px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider ${pdfIncludeProductIds ? 'bg-brand-gold/15 text-brand-gold' : 'text-gray-400'}`}>Refs</button>
              </div>
              <button
                onClick={generatePDF}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm"
              >
                <FileText size={14} />
                PDF
              </button>
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-brand-gold hover:border-brand-gold/30 transition-all disabled:opacity-40"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Date / Month Picker */}
      <div className="flex flex-wrap items-center gap-3">
        {viewMode === 'daily' ? (
          <div className="relative flex-1 sm:flex-none">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
          </div>
        ) : (
          <div className="relative flex-1 sm:flex-none">
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              max={new Date().toISOString().slice(0, 7)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
          </div>
        )}
        {viewMode === 'daily' && !isToday && (
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
            className="px-4 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm shrink-0"
          >
            Back to Today
          </button>
        )}
        {viewMode === 'monthly' && !isCurrentMonth && (
          <button
            onClick={() => setSelectedMonth(new Date().toISOString().slice(0, 7))}
            className="px-4 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm shrink-0"
          >
            Current Month
          </button>
        )}
        {viewMode === 'daily' && !isToday && (
          <span className="text-[10px] text-amber-500 font-medium">
            Showing historical data — inventory is current, not as of this date
          </span>
        )}
        {viewMode === 'monthly' && !isCurrentMonth && (
          <span className="text-[10px] text-amber-500 font-medium">
            Showing historical data — inventory shows current stock, not stock at that time
          </span>
        )}
      </div>

      {/* Summary Stats */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(data.summary.totalRevenue)}
            icon={<TrendingUp size={20} />}
            accent
          />
          <StatCard
            label="Total Units Sold"
            value={data.summary.totalUnits.toLocaleString()}
            icon={<ShoppingCart size={20} />}
          />
          <StatCard
            label="Unilorin"
            value={`${formatCurrency(data.summary.unilorinRevenue)}`}
            icon={<Store size={20} />}
          />
          <StatCard
            label="Tanke"
            value={`${formatCurrency(data.summary.tankeRevenue)}`}
            icon={<Store size={20} />}
          />
        </div>
      )}

      {/* Outlet Breakdowns */}
      {noSales ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-gray-100 p-12 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-brand-softGray flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-brand-gold" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            {viewMode === 'daily' ? 'No Sales Yet Today' : 'No Sales This Month'}
          </h3>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            {viewMode === 'daily'
              ? 'Sales will appear here as orders are verified and products are recorded as sold.'
              : 'No sales were recorded for this month. Try selecting a different month.'}
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <SalesTable
            items={unilorinItems}
            outlet="unilorin"
            totalUnits={data?.summary.unilorinUnits ?? 0}
            totalRevenue={data?.summary.unilorinRevenue ?? 0}
            onViewAudit={onViewAudit}
            onFlag={openFlagModal}
            canFlag={viewMode === 'daily'}
          />
          <SalesTable
            items={tankeItems}
            outlet="tanke"
            totalUnits={data?.summary.tankeUnits ?? 0}
            totalRevenue={data?.summary.tankeRevenue ?? 0}
            onViewAudit={onViewAudit}
            onFlag={openFlagModal}
            canFlag={viewMode === 'daily'}
          />
        </div>
      )}

      <SalesFlagModal
        target={flagTarget}
        onClose={() => setFlagTarget(null)}
        onSaved={() => fetchData(true)}
      />
    </div>
  );
}
