"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { getIntegrityReport, repairPriceDriftFromMaster } from "@/app/admin/dashboard/actions";
import type { IntegrityReport as IntegrityReportData } from "@/lib/admin/integrity";

export default function IntegrityReport() {
  const [report, setReport] = useState<IntegrityReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null);
  const load = useCallback(async (force = false) => {
    setLoading(true); setError(null);
    try { setReport(await getIntegrityReport({ force })); } catch (err) { setError(err instanceof Error ? err.message : "Failed to run integrity check."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function repairPrice(productId: string) {
    if (!window.confirm("Sync both outlet prices to the current Master price?")) return;
    setRepairing(productId); setError(null);
    try { await repairPriceDriftFromMaster(productId); await load(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Price repair failed."); }
    finally { setRepairing(null); }
  }

  const issueLabels: Record<string, string> = {
    orphan_order_item: "Order item with missing product",
    merged_inventory_product: "Inventory still on a merged product",
    findings_truncated: "Findings list truncated",
    item_total_mismatch: "Order total calculation error",
    order_without_items: "Order with no items",
    orphan_reservation: "Reservation with no matching order",
    reservation_status_mismatch: "Reservation status mismatch",
    expired_reservation: "Reservation past its reference timer",
    unknown_inventory_product: "Inventory product missing from catalog",
    price_drift: "Outlet price differs from Master",
    reserved_quantity_mismatch: "Reserved stock count mismatch",
    database_read_failure: "Database data could not be read",
  };
  const formatIssue = (kind: string) => issueLabels[kind] ?? kind.replaceAll("_", " ");
  const shortId = (value?: string) => value ? value.slice(0, 8) : null;

  if (loading && !report) return <div className="bg-white rounded-2xl border border-gray-100 p-12 flex justify-center"><Loader2 className="animate-spin text-brand-gold" /></div>;
  if (error && !report) return <div className="bg-white rounded-2xl border border-red-100 p-8 text-center"><ShieldAlert className="mx-auto text-red-400 mb-3" /><p className="text-sm text-red-600 mb-4">{error}</p><button onClick={() => void load(true)} className="px-4 py-2 rounded-xl bg-brand-gold text-white text-xs font-bold uppercase">Retry</button></div>;
  if (!report) return null;
  const metricEntries = Object.entries(report.metrics);
  return <div className="space-y-5">
    <div className="flex items-center justify-between"><div><h2 className="text-xl font-serif font-bold text-gray-900">Data Integrity Check</h2><p className="text-xs text-gray-400">Read-only cross-database verification. No records are changed. Last result: {new Date(report.generatedAt).toLocaleString()} (cached until data changes or Run Again).</p></div><button onClick={() => void load(true)} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Run Again</button></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{metricEntries.map(([key, value]) => <div key={key} className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-[10px] uppercase tracking-wider text-gray-400">{key.replaceAll("_", " ")}</p><p className="text-2xl font-black text-gray-900 mt-1">{value}</p></div>)}</div>
    {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
     {report.findings.length === 0 ? <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center"><CheckCircle2 className="mx-auto text-emerald-500 mb-2" /><p className="text-sm font-bold text-emerald-700">No integrity findings detected.</p></div> : <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"><div className="px-5 py-4 border-b"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /><h3 className="font-bold">Findings ({report.findings.length})</h3></div><p className="text-xs text-gray-400 mt-1">Each entry explains a possible data problem. Product names are shown first; short IDs are included only for support and investigation.</p></div><div className="divide-y max-h-[600px] overflow-auto">{report.findings.map((finding, index) => { const productId = shortId(finding.productId); const orderId = shortId(finding.orderId); return <div key={`${finding.kind}-${finding.outlet ?? "x"}-${finding.orderId ?? finding.productId ?? "row"}-${index}`} className="px-5 py-4 flex gap-3"><span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${finding.severity === "critical" ? "bg-red-500" : finding.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} /><div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{finding.severity} · {formatIssue(finding.kind)}{finding.outlet ? ` · ${finding.outlet}` : ""}</p>{finding.productId && <p className="text-sm font-bold text-gray-900 mt-1">Product: {finding.productName || "Unknown product"}</p>}<p className="text-xs text-gray-700 mt-1">{finding.message}</p><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400 mt-2">{orderId && <span>Order reference: {orderId}</span>}{productId && <span>Product reference: {productId}</span>}</div>{finding.kind === "price_drift" && finding.productId && <button onClick={() => void repairPrice(finding.productId!)} disabled={repairing === finding.productId} className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-gold text-white text-[10px] font-bold uppercase disabled:opacity-50">{repairing === finding.productId ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync To Master Price</button>}</div></div>; })}</div></div>}
  </div>;
}
