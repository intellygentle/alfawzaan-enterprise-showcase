/* filepath: components/Admin/SalesFlagModal.tsx */
"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flag,
  Loader2,
  RotateCcw,
  Wrench,
} from "lucide-react";
import {
  flagSalesRecord,
  resolveSalesFlag,
  reopenSalesFlag,
  getFlagHistory,
  getFlagTimeline,
  correctFlagStock,
  type FlagHistory,
} from "@/app/admin/dashboard/actions";
import {
  describeDiscrepancy,
  resolveDiscrepancyType,
  SALES_FLAG_TYPE_LABEL as TYPE_LABEL,
  type SalesFlag,
  type SalesFlagType,
} from "@/lib/salesFlags";
import type { Grade } from "@/lib/types";

export interface FlagTarget {
  date: string;
  outlet: string;
  productId: string;
  productName: string;
  grade: string;
  quantitySold: number;
  currentStock: number;
  flag: SalesFlag | null;
}

const TYPE_STYLE: Record<SalesFlagType, string> = {
  number_less: "text-red-600 bg-red-50 border-red-200",
  number_more: "text-blue-600 bg-blue-50 border-blue-200",
  match: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TypeBadge({ type }: { type: SalesFlagType }) {
  const Icon = type === "number_less" ? ArrowDown : type === "number_more" ? ArrowUp : CheckCircle2;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${TYPE_STYLE[type]}`}>
      <Icon size={12} />
      {TYPE_LABEL[type]}
    </span>
  );
}

export default function SalesFlagModal({
  target,
  onClose,
  onSaved,
}: {
  target: FlagTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [online, setOnline] = useState("0");
  const [physical, setPhysical] = useState("0");
  const [note, setNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFlag, setCurrentFlag] = useState<SalesFlag | null>(null);
  const [history, setHistory] = useState<FlagHistory | null>(null);
  const [timeline, setTimeline] = useState<SalesFlag[]>([]);

  useEffect(() => {
    if (!target) return;
    setError(null);
    setSaving(false);
    setResolutionNote("");
    setCurrentFlag(target.flag);
    setHistory(null);
    setTimeline([]);
    if (target.flag) {
      setOnline(String(target.flag.online_remaining));
      setPhysical(String(target.flag.physical_remaining));
      setNote(target.flag.note ?? "");
      setEditing(false);
    } else {
      setOnline(String(target.currentStock));
      setPhysical(String(target.currentStock));
      setNote("");
      setEditing(true);
    }
    let cancelled = false;
    getFlagHistory(target.outlet as "unilorin" | "tanke", target.productId, target.grade as Grade)
      .then((result) => { if (!cancelled) setHistory(result); })
      .catch(() => { if (!cancelled) setHistory(null); });
    getFlagTimeline(target.outlet as "unilorin" | "tanke", target.productId, target.grade as Grade)
      .then((result) => { if (!cancelled) setTimeline(result); })
      .catch(() => { if (!cancelled) setTimeline([]); });
    return () => { cancelled = true; };
  }, [target]);

  if (!target) return null;

  const flag = currentFlag;
  const repeatCount = flag?.is_recurrence
    ? (flag.recurrence_count ?? 1)
    : (!flag && history ? history.count : 0);
  const previousResolvedAt = flag?.previous_resolved_at ?? history?.lastResolvedAt ?? null;
  const showRepeatBanner = repeatCount > 0;
  const onlineNum = Number(online);
  const physicalNum = Number(physical);
  const countsValid =
    online !== "" && physical !== "" && Number.isFinite(onlineNum) && onlineNum >= 0 && Number.isFinite(physicalNum) && physicalNum >= 0;
  const direction = countsValid ? resolveDiscrepancyType(Math.floor(onlineNum), Math.floor(physicalNum)) : "match";

  async function handleSave() {
    if (!countsValid) {
      setError("Enter non-negative counts for online and physical units.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await flagSalesRecord({
        date: target!.date,
        outlet: target!.outlet as "unilorin" | "tanke",
        productId: target!.productId,
        productName: target!.productName,
        grade: target!.grade as Grade,
        onlineRemaining: Math.floor(onlineNum),
        physicalRemaining: Math.floor(physicalNum),
        note,
      });
      setCurrentFlag(saved);
      setEditing(false);
      setTimeline((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to flag this record.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResolve() {
    if (!flag) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await resolveSalesFlag(flag.id, resolutionNote);
      setCurrentFlag(saved);
      setResolutionNote("");
      setTimeline((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve this flag.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen() {
    if (!flag) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await reopenSalesFlag(flag.id);
      setCurrentFlag(saved);
      setTimeline((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reopen this flag.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCorrect() {
    if (!flag) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await correctFlagStock(flag.id, resolutionNote);
      setCurrentFlag(saved);
      setResolutionNote("");
      setTimeline((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to correct stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`p-1.5 rounded-lg ${flag ? "bg-amber-50 text-amber-500" : "bg-brand-gold/10 text-brand-gold"}`}>
              <Flag size={16} />
            </span>
            {flag ? "Flagged Sales Record" : "Flag Sales Discrepancy"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-gray-900">{target.productName}</p>
              <p className="text-[11px] text-gray-500 capitalize">
                {target.outlet} · {target.grade}
                {target.quantitySold > 0 ? ` · ${target.quantitySold} sold` : ""} · {target.date}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-600">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {showRepeatBanner && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <RotateCcw size={15} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="text-xs text-amber-800">
              <p className="font-black uppercase tracking-wider text-[10px] text-amber-600">Repeat discrepancy</p>
              <p className="mt-0.5">
                This item was flagged and corrected <strong>{repeatCount}</strong> time{repeatCount === 1 ? "" : "s"} before
                {previousResolvedAt ? <> — last resolved <strong>{formatDateTime(previousResolvedAt)}</strong></> : null}.
                {!flag ? " Flagging it again will record a new discrepancy." : ""}
              </p>
            </div>
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="flag-online" className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Remaining online
                </Label>
                <Input
                  id="flag-online"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={online}
                  onChange={(e) => setOnline(e.target.value)}
                  className="h-10 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="flag-physical" className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Physical count
                </Label>
                <Input
                  id="flag-physical"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={physical}
                  onChange={(e) => setPhysical(e.target.value)}
                  className="h-10 text-sm font-bold"
                />
              </div>
            </div>

            {countsValid && (
              <div className="rounded-xl border border-gray-100 bg-brand-softGray/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={direction} />
                  <span className="text-[11px] text-gray-500 font-medium">{describeDiscrepancy(direction, onlineNum, physicalNum)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="flag-note" className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                What might have caused it?
              </Label>
              <textarea
                id="flag-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. two units sold in-store but not recorded, or stock was moved between shelves."
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
              />
            </div>
          </div>
        ) : flag ? (
          <div className="space-y-4">
            <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
              flag.status === "resolved" ? "border-emerald-100 bg-emerald-50" : "border-amber-100 bg-amber-50"
            }`}>
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${
                flag.status === "resolved" ? "text-emerald-600" : "text-amber-600"
              }`}>
                {flag.status === "resolved" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {flag.status === "resolved" ? "Resolved" : "Open"}
              </span>
              <span className="text-[10px] text-gray-400 font-medium">Flagged {formatDateTime(flag.flagged_at)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-gray-100 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Online remaining</p>
                <p className="text-xl font-black text-gray-900 mt-0.5">{flag.online_remaining}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Physical count</p>
                <p className="text-xl font-black text-gray-900 mt-0.5">{flag.physical_remaining}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TypeBadge type={flag.discrepancy_type} />
              <span className="text-[11px] text-gray-500 font-medium">
                {describeDiscrepancy(flag.discrepancy_type, flag.online_remaining, flag.physical_remaining)}
              </span>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Cause note</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{flag.note || <span className="text-gray-300">No note recorded.</span>}</p>
            </div>

            {flag.status === "resolved" ? (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-1">
                  Resolved {formatDateTime(flag.resolved_at)}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {flag.resolution_note || <span className="text-gray-400">No resolution note.</span>}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="flag-resolution" className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Resolution note
                </Label>
                <textarea
                  id="flag-resolution"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={2}
                  placeholder="What was corrected? (optional)"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>
            )}

            {timeline.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                  Flag history ({timeline.length})
                </p>
                <ol className="space-y-2">
                  {timeline.map((entry) => {
                    const resolved = entry.status === "resolved";
                    return (
                      <li key={entry.id} className="flex items-start gap-2">
                        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${resolved ? "bg-emerald-400" : "bg-amber-400"}`} />
                        <div className="min-w-0 flex-1 text-[11px] text-gray-600">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="font-bold text-gray-800">{formatDateTime(entry.flagged_at)}</span>
                            <span className="text-gray-400">
                              online {entry.online_remaining} · physical {entry.physical_remaining}
                            </span>
                            <span className={`font-black uppercase tracking-wider text-[9px] ${resolved ? "text-emerald-600" : "text-amber-600"}`}>
                              {entry.status}
                            </span>
                            {entry.is_recurrence && (
                              <span className="text-[9px] font-black uppercase tracking-wider text-purple-600">repeat</span>
                            )}
                          </div>
                          {entry.note && <p className="mt-0.5 truncate" title={entry.note}>Cause: {entry.note}</p>}
                          {resolved && entry.resolution_note && (
                            <p className="mt-0.5 truncate text-emerald-700" title={entry.resolution_note}>
                              Fix: {entry.resolution_note}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {editing ? (
            <>
              {flag && (
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-brand-gold text-white hover:bg-brand-gold/80"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                {flag ? "Update Flag" : "Flag Record"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditing(true)} disabled={saving}>
                Edit details
              </Button>
              {flag?.status === "resolved" ? (
                <Button variant="outline" onClick={handleReopen} disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Reopen
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleResolve} disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Mark Resolved
                  </Button>
                  <Button onClick={handleCorrect} disabled={saving} className="bg-brand-gold text-white hover:bg-brand-gold/80">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                    Correct to {flag?.physical_remaining}
                  </Button>
                </>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
