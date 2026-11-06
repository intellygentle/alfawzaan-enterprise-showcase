/* filepath: components/Admin/DuplicateProductResolver.tsx */
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, AlertTriangle, CheckCircle, X, ChevronDown, ChevronRight,
  Merge, Search, Package
} from "lucide-react";
import type { DuplicateGroup } from "@/app/admin/dashboard/actions";

export default function DuplicateProductResolver() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [result, setResult] = useState<{ key: string; success: boolean; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});

  const scanDuplicates = useCallback(async () => {
    setScanning(true);
    setLoading(true);
    setResult(null);

    // Client-side timeout — Vercel Hobby tier functions timeout after 10s
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Scan timed out. The database might have too many products. Try again when the server is less busy, or contact support.")), 25_000)
    );

    try {
      const { findDuplicateProducts } = await import("@/app/admin/dashboard/actions");
      const data = await Promise.race([findDuplicateProducts(), timeout]);
      setGroups(data);
      // Set default survivor selections (first product in each group)
      const defaults: Record<string, string> = {};
      for (const g of data) {
        defaults[g.key] = g.products[0]?.id ?? "";
      }
      setSelections(defaults);
    } catch (err: any) {
      console.error("Failed to scan duplicates:", err);
      setResult({ key: "__scan__", success: false, message: err?.message || "Scan failed" });
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    scanDuplicates();
  }, [scanDuplicates]);

  async function handleMerge(groupKey: string) {
    const survivorId = selections[groupKey];
    const group = groups.find((g) => g.key === groupKey);
    if (!survivorId || !group) return;

    const duplicateIds = group.products.map((p) => p.id).filter((id) => id !== survivorId);
    if (duplicateIds.length === 0) return;
    const survivor = group.products.find((product) => product.id === survivorId);
    const duplicates = group.products.filter((product) => duplicateIds.includes(product.id));
    if (!window.confirm(`Merge ${duplicates.map((product) => product.name).join(", ")} into ${survivor?.name ?? "the selected survivor"}?\n\nUse this only when they are the same physical product. Active reservations and pending orders will block the merge. Historical orders and audits will be preserved.`)) return;

    setMerging(groupKey);
    setResult(null);
    try {
      const { mergeDuplicateProducts } = await import("@/app/admin/dashboard/actions");
      const res = await mergeDuplicateProducts(survivorId, duplicateIds, "admin-duplicate-merge");
      setResult({ key: groupKey, ...res });
      if (res.success) {
        setGroups((prev) => prev.filter((g) => g.key !== groupKey));
        setExpandedGroup(null);
      }
    } catch (err: any) {
      setResult({ key: groupKey, success: false, message: err?.message || "Merge failed" });
    } finally {
      setMerging(null);
    }
  }

  const filtered = groups.filter((g) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      g.displayName.toLowerCase().includes(q) ||
      g.products.some((p) => p.name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600">
            <Merge size={20} />
          </div>
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900">Duplicate Products</h2>
            <p className="text-xs text-gray-400 font-medium">
              Products with similar names — review and merge them
            </p>
          </div>
        </div>

        <button
          onClick={scanDuplicates}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm disabled:opacity-50"
        >
          {scanning ? (
            <><Loader2 size={14} className="animate-spin" /> Scanning...</>
          ) : (
            <><Search size={14} /> Rescan</>
          )}
        </button>
      </div>

      {/* Search */}
      {groups.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Filter groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
          />
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          result.success
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {result.success ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="text-sm font-semibold">{result.success ? 'Merged successfully' : 'Error'}</p>
            <p className="text-xs mt-0.5 opacity-80">{result.message}</p>
          </div>
          <button onClick={() => setResult(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="animate-spin text-brand-gold" />
          <p className="text-xs text-gray-400 font-medium">{scanning ? 'Scanning products...' : 'Loading...'}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          {groups.length === 0 ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No Duplicates Found</h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                All products have unique names. Run a scan anytime to re-check.
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
                <Search size={28} className="text-gray-300" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No Matching Groups</h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">Try a different search term.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-medium text-gray-500 px-1">
            {filtered.length} duplicate group{filtered.length !== 1 ? 's' : ''} found
            {filtered.length !== groups.length && <> (showing {filtered.length} of {groups.length})</>}
          </p>

          {filtered.map((group) => {
            const isExpanded = expandedGroup === group.key;
            const isMerging = merging === group.key;
            const survivorId = selections[group.key] ?? group.products[0]?.id ?? "";

            return (
              <DuplicateGroupCard
                key={group.key}
                group={group}
                isExpanded={isExpanded}
                isMerging={isMerging}
                survivorId={survivorId}
                onToggle={() => setExpandedGroup(isExpanded ? null : group.key)}
                onSelectSurvivor={(id) =>
                  setSelections((prev) => ({ ...prev, [group.key]: id }))
                }
                onMerge={() => handleMerge(group.key)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Individual duplicate group card ─── */
function DuplicateGroupCard({
  group,
  isExpanded,
  isMerging,
  survivorId,
  onToggle,
  onSelectSurvivor,
  onMerge,
}: {
  group: DuplicateGroup;
  isExpanded: boolean;
  isMerging: boolean;
  survivorId: string;
  onToggle: () => void;
  onSelectSurvivor: (id: string) => void;
  onMerge: () => void;
}) {
  const totalStock = { ...group.unilorinStock };
  for (const [grade, qty] of Object.entries(group.tankeStock)) {
    totalStock[grade] = (totalStock[grade] || 0) + qty;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all hover:border-amber-200">
      {/* Group header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-500 shrink-0">
            <Package size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {group.displayName}
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {group.products.length} products · {Object.keys(totalStock).length > 0
                ? Object.entries(totalStock).map(([g, q]) => `${g}: ${q}`).join(', ')
                : 'No stock'}
              {group.totalOrders > 0 && ` · ${group.totalOrders} order(s)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 px-4 sm:px-5 py-4 space-y-4">
              {/* Products list */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Select the product to keep (survivor):
                </p>

                {group.products.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      survivorId === p.id
                        ? 'border-brand-gold bg-brand-gold/5'
                        : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`survivor-${group.key}`}
                      value={p.id}
                      checked={survivorId === p.id}
                      onChange={() => onSelectSurvivor(p.id)}
                      className="w-4 h-4 text-brand-gold focus:ring-brand-gold/30 accent-[#D4AF37]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        ID: {p.id.slice(0, 8)}...
                        {p.category ? ` · ${p.category}` : ''}
                        {p.price ? ` · ₦${p.price.toLocaleString()}` : ''}
                      </p>
                    </div>
                    {survivorId === p.id && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-brand-gold bg-brand-gold/10 px-2 py-1 rounded-lg">
                        Survivor
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {/* Stock comparison */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Unilorin Stock</p>
                  {['special', 'extra', 'normal'].map((g) => (
                    <div key={g} className="flex items-center justify-between py-1">
                      <span className="text-xs capitalize text-gray-600">{g}</span>
                      <span className="text-xs font-bold text-gray-900">{group.unilorinStock[g] ?? 0}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Tanke Stock</p>
                  {['special', 'extra', 'normal'].map((g) => (
                    <div key={g} className="flex items-center justify-between py-1">
                      <span className="text-xs capitalize text-gray-600">{g}</span>
                      <span className="text-xs font-bold text-gray-900">{group.tankeStock[g] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 font-medium">
                  Products marked as duplicates will be <strong>deleted</strong> after merging.
                  All their inventory, order history, and audit logs will be
                  consolidated under the <strong>survivor</strong> product.
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  onClick={onToggle}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={onMerge}
                  disabled={isMerging || !survivorId}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  {isMerging ? (
                    <><Loader2 size={14} className="animate-spin" /> Merging...</>
                  ) : (
                    <><Merge size={14} /> Merge &amp; Consolidate</>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
