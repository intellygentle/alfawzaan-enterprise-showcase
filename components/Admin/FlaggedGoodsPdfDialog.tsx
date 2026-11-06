/* filepath: components/Admin/FlaggedGoodsPdfDialog.tsx */
"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Download, FileText, Loader2, Store } from "lucide-react";
import {
  filterSalesFlags,
  type SalesFlag,
  type SalesFlagReportOutlet,
  type SalesFlagReportStatus,
} from "@/lib/salesFlags";

const STATUS_OPTIONS: Array<{ value: SalesFlagReportStatus; label: string }> = [
  { value: "open", label: "Open flags" },
  { value: "resolved", label: "Resolved flags" },
  { value: "all", label: "Both" },
];

const OUTLET_OPTIONS: Array<{ value: SalesFlagReportOutlet; label: string }> = [
  { value: "all", label: "Both stores" },
  { value: "unilorin", label: "Unilorin" },
  { value: "tanke", label: "Tanke" },
];

export default function FlaggedGoodsPdfDialog({
  open,
  flags,
  onClose,
}: {
  open: boolean;
  flags: SalesFlag[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<SalesFlagReportStatus>("open");
  const [outlet, setOutlet] = useState<SalesFlagReportOutlet>("all");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => filterSalesFlags(flags, { status, outlet }),
    [flags, status, outlet],
  );

  async function handleDownload() {
    if (selected.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      const { downloadFlaggedGoodsPdf } = await import("@/lib/flaggedGoodsPdf");
      downloadFlaggedGoodsPdf(flags, { status, outlet });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate the report.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !generating) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-brand-gold/10 text-brand-gold">
              <FileText size={16} />
            </span>
            Download flagged goods report
          </DialogTitle>
          <DialogDescription>
            Choose which flags and stores to include. Every flag&apos;s fields, cause note, and resolution note are printed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Status</p>
            <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-0.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  aria-pressed={status === option.value}
                  className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    status === option.value
                      ? "bg-brand-gold text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Store</p>
            <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-0.5">
              {OUTLET_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOutlet(option.value)}
                  aria-pressed={outlet === option.value}
                  className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    outlet === option.value
                      ? "bg-brand-gold text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <Store size={11} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
            selected.length === 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-100 bg-emerald-50 text-emerald-700"
          }`}>
            {selected.length === 0 ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
            <span>
              {selected.length === 0
                ? "No flags match this selection yet."
                : `${selected.length} flag${selected.length === 1 ? "" : "s"} will be included.`}
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-600">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={generating}>
            Cancel
          </Button>
          <Button
            onClick={handleDownload}
            disabled={generating || selected.length === 0}
            className="bg-brand-gold text-white hover:bg-brand-gold/80"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
