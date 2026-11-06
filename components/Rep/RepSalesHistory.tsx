"use client";

import { useState, useCallback } from "react";
import {
  Calendar, Copy, Printer, Loader2, Search, X, User, Shield,
  FileText, Undo2, AlertTriangle, CheckCircle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { repGetSalesHistory, type SaleRecord } from "@/app/representative/actions";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface RepSalesHistoryProps {
  repId: string;
  repName: string;
}

export default function RepSalesHistory({ repId, repName }: RepSalesHistoryProps) {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reversalResult, setReversalResult] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmReversal, setConfirmReversal] = useState<SaleRecord | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await repGetSalesHistory(startDate, endDate);
      setSales(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch sales history.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const filteredSales = sales.filter((sale) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      sale.product_name.toLowerCase().includes(q) ||
      sale.grade.toLowerCase().includes(q) ||
      sale.performed_by_name.toLowerCase().includes(q)
    );
  });

  const totalQuantity = filteredSales.reduce((sum, s) => sum + s.quantity, 0);
  const totalAmount = filteredSales.reduce((sum, s) => sum + (s.total_amount || 0), 0);

  const handleCopy = async () => {
    const header = `Sales Report: ${startDate} to ${endDate}\n${"=".repeat(70)}`;
    const lines = filteredSales.map((sale) => {
      const time = new Date(sale.created_at).toLocaleTimeString("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const price = sale.sale_price ? `₦${sale.sale_price.toLocaleString()}` : "N/A";
      const total = sale.total_amount ? `₦${sale.total_amount.toLocaleString()}` : "N/A";
      const left = sale.remaining !== null ? `${sale.remaining} left` : "";
      const by = sale.performed_by === "admin" ? "Admin" : "Rep";
      return `${time} | ${sale.product_name} | ${sale.grade} | x${sale.quantity} | ${price} | ${total} | ${left} | ${by}`;
    });
    const footer = `${"=".repeat(70)}\nTotal: ${totalQuantity} items | ₦${totalAmount.toLocaleString()}`;

    const text = [header, ...lines, footer].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateSalesPDF = () => {
    if (filteredSales.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ALFAWZAAN\u2019S ENTERPRISE', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(212, 175, 55);
    doc.text('Sales History Report', pageWidth / 2, 27, { align: 'center' });

    // Date & info
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Period: ${startDate} to ${endDate}  |  Generated: ${dateStr} at ${timeStr}  |  Sales: ${filteredSales.length}`, pageWidth / 2, 34, { align: 'center' });

    // Summary stats
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(`Total Quantity: ${totalQuantity}  |  Total Amount: ₦${totalAmount.toLocaleString()}`, pageWidth / 2, 41, { align: 'center' });

    // Table
    const tableBody = filteredSales.map((sale) => [
      new Date(sale.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
      sale.product_name,
      sale.grade.charAt(0).toUpperCase() + sale.grade.slice(1),
      String(sale.quantity),
      sale.sale_price ? `₦${sale.sale_price.toLocaleString()}` : '—',
      sale.total_amount ? `₦${sale.total_amount.toLocaleString()}` : '—',
      sale.remaining !== null ? String(sale.remaining) : '—',
      sale.performed_by_name || (sale.performed_by === 'admin' ? 'Admin' : 'Rep'),
    ]);

    autoTable(doc, {
      head: [['Time', 'Product', 'Grade', 'Qty', 'Price', 'Total', 'Left', 'By']],
      body: tableBody,
      startY: 46,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [212, 175, 55], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [250, 245, 230] },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 12, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 12, halign: 'center' },
        7: { cellWidth: 16, halign: 'center' },
      },
    });

    // Footer — page numbers
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    doc.save(`alfawzaan-sales-history-${startDate}-to-${endDate}.pdf`);
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sales Report - ${startDate} to ${endDate}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          .subtitle { color: #666; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
          th { background: #f5f5f5; font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
          .total-row { font-weight: bold; border-top: 2px solid #333; }
          .admin-badge { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
          .rep-badge { background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>ALFAWZAAN Sales Report</h1>
        <div class="subtitle">${startDate} to ${endDate} | Generated ${new Date().toLocaleString("en-NG")}</div>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Product</th>
              <th>Grade</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
              <th>Left</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            ${filteredSales
              .map(
                (sale) => `
              <tr>
                <td>${new Date(sale.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>${sale.product_name}</td>
                <td style="text-transform: capitalize">${sale.grade}</td>
                <td>${sale.quantity}</td>
                <td>${sale.sale_price ? "₦" + sale.sale_price.toLocaleString() : "N/A"}</td>
                <td>${sale.total_amount ? "₦" + sale.total_amount.toLocaleString() : "N/A"}</td>
                <td>${sale.remaining !== null ? sale.remaining : "N/A"}</td>
                <td>${sale.performed_by_name} ${sale.performed_by === "admin" ? '<span class="admin-badge">Admin</span>' : '<span class="rep-badge">Rep</span>'}</td>
              </tr>
            `
              )
              .join("")}
            <tr class="total-row">
              <td colspan="3">Total</td>
              <td>${totalQuantity}</td>
              <td></td>
              <td>₦${totalAmount.toLocaleString()}</td>
              <td></td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const fetchSalesForRange = async (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setLoading(true);
    setError(null);
    try {
      const data = await repGetSalesHistory(start, end);
      setSales(data);
    } catch (err: any) {
      setError(err.message || "Failed to fetch sales history.");
    } finally {
      setLoading(false);
    }
  };

  const setToday = () => {
    const today = new Date().toISOString().split("T")[0];
    fetchSalesForRange(today, today);
  };

  const setThisWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - dayOfWeek);
    fetchSalesForRange(start.toISOString().split("T")[0], today.toISOString().split("T")[0]);
  };

  const setThisMonth = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    fetchSalesForRange(start.toISOString().split("T")[0], today.toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-bold text-gray-900">Sales History</h2>
      </div>

      {/* Date Range & Actions */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date Inputs */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">From</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">To</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
              />
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex gap-2">
            <button
              onClick={setToday}
              className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Today
            </button>
            <button
              onClick={setThisWeek}
              className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              This Week
            </button>
            <button
              onClick={setThisMonth}
              className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              This Month
            </button>
          </div>

          {/* Fetch Button */}
          <button
            onClick={fetchSales}
            disabled={loading}
            className="px-5 py-2 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all disabled:opacity-40 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search size={14} />}
            {loading ? "Loading..." : "Fetch Sales"}
          </button>
        </div>

        {/* Copy & Print buttons */}
        {sales.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by product, grade..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Copy size={14} />
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={generateSalesPDF}
                disabled={filteredSales.length === 0}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
              >
                <FileText size={14} />
                Download PDF
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px]">{filteredSales.length}</span>
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Printer size={14} />
                Print
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {/* Sales Table */}
      {sales.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {/* Summary */}
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500">
              {filteredSales.length} sale{filteredSales.length !== 1 ? "s" : ""} found
            </p>
            <div className="flex gap-4 text-xs">
              <span className="text-gray-500">
                Total Qty: <strong className="text-gray-900">{totalQuantity}</strong>
              </span>
              <span className="text-gray-500">
                Total Amount: <strong className="text-brand-gold">₦{totalAmount.toLocaleString()}</strong>
              </span>
            </div>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[90px_1fr_70px_50px_80px_80px_60px_70px_50px] gap-3 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-50">
            <div>Time</div>
            <div>Product</div>
            <div className="text-center">Grade</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
            <div className="text-center">Left</div>
            <div className="text-center">By</div>
            <div className="text-center"></div>
          </div>

          {/* Table Body */}
          {filteredSales.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {search ? "No sales match your filter." : "No sales found for this date range."}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
              {filteredSales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid grid-cols-[90px_1fr_70px_50px_80px_80px_60px_70px_50px] gap-3 px-6 py-3 hover:bg-gray-50/50 transition-colors items-center"
                >
                  <div className="text-xs text-gray-500">
                    {new Date(sale.created_at).toLocaleTimeString("en-NG", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 truncate">{sale.product_name}</p>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold uppercase text-gray-500">{sale.grade}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold text-gray-900">{sale.quantity}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-600">
                      {sale.sale_price ? `₦${sale.sale_price.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-brand-gold">
                      {sale.total_amount ? `₦${sale.total_amount.toLocaleString()}` : "—"}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`text-xs font-bold ${sale.remaining !== null && sale.remaining <= 3 ? "text-red-500" : "text-gray-600"}`}>
                      {sale.remaining !== null ? sale.remaining : "—"}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    {sale.performed_by === "admin" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold uppercase">
                        <Shield size={10} />
                        Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold uppercase">
                        <User size={10} />
                        Rep
                      </span>
                    )}
                  </div>
                  {/* Reverse button */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => setConfirmReversal(sale)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-amber-600 hover:bg-amber-50 transition-all"
                      title="Reverse this sale"
                    >
                      <Undo2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer Total */}
          {filteredSales.length > 0 && (
            <div className="grid grid-cols-[90px_1fr_70px_50px_80px_80px_60px_70px] gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <div className="text-xs font-bold text-gray-500">TOTAL</div>
              <div></div>
              <div></div>
              <div className="text-center">
                <span className="text-sm font-black text-gray-900">{totalQuantity}</span>
              </div>
              <div></div>
              <div className="text-right">
                <span className="text-sm font-black text-brand-gold">₦{totalAmount.toLocaleString()}</span>
              </div>
              <div></div>
              <div></div>
            </div>
          )}
        </div>
      )}

      {/* Empty state when no fetch yet */}
      {sales.length === 0 && !loading && !error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          Select a date range and click "Fetch Sales" to view your sales history.
        </div>
      )}

      {/* ─── Reversal Confirmation Dialog ─── */}
      <Dialog open={!!confirmReversal} onOpenChange={(open) => { if (!open) { setConfirmReversal(null); setReversalReason(""); setReversalResult(null); } }}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-amber-600 flex items-center gap-2">
              <Undo2 size={20} />
              Reverse This Sale?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              This will add the stock back to inventory and record a reversal in the audit log.
            </DialogDescription>
          </DialogHeader>

          {confirmReversal && (
            <div className="space-y-4">
              {/* Sale summary */}
              <div className="bg-amber-50 rounded-xl p-4 space-y-2 border border-amber-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Product</span>
                  <span className="text-sm font-bold text-gray-900">{confirmReversal.product_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Grade</span>
                  <span className="text-sm font-bold capitalize text-gray-900">{confirmReversal.grade}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Quantity</span>
                  <span className="text-sm font-bold text-gray-900">{confirmReversal.quantity}</span>
                </div>
                {confirmReversal.sale_price && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Unit Price</span>
                    <span className="text-sm font-bold text-gray-900">₦{confirmReversal.sale_price.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-amber-200">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Stock to restore</span>
                  <span className="text-sm font-black text-emerald-600">+{confirmReversal.quantity} units</span>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-medium">
                  This action is logged for audit purposes. Only reverse sales that were recorded in error.
                </p>
              </div>

              {/* Reason (optional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Reason <span className="text-gray-300 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <Input
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g., Wrong product selected, customer changed mind..."
                  className="text-sm"
                  autoFocus
                />
              </div>

              {/* Result */}
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
            <Button
              variant="outline"
              onClick={() => { setConfirmReversal(null); setReversalReason(""); setReversalResult(null); }}
              disabled={reversing}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!confirmReversal) return;
                setReversing(true);
                setReversalResult(null);
                try {
                  const { repReverseSaleAction } = await import("@/app/representative/actions");
                  const res = await repReverseSaleAction(confirmReversal.id, reversalReason || undefined);
                  setReversalResult(res);
                  if (res.success) {
                    // Refresh sales data
                    const data = await repGetSalesHistory(startDate, endDate);
                    setSales(data);
                  }
                } catch (err: any) {
                  setReversalResult({ success: false, message: err?.message || "Reversal failed." });
                } finally {
                  setReversing(false);
                }
              }}
              disabled={reversing}
              className="bg-amber-600 text-white hover:bg-amber-700 border-none"
            >
              {reversing ? (
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
