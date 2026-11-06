/* filepath: components/Admin/ManualMergeTool.tsx */
"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Search, X, Merge, AlertTriangle, CheckCircle,
  Package, Plus, ChevronDown, ChevronRight,
} from "lucide-react";
import type { ProductStockInfo } from "@/app/admin/dashboard/actions";
import type { ProductSearchResult } from "@/lib/types";

export default function ManualMergeTool() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [stockData, setStockData] = useState<ProductStockInfo[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    setResult(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const { searchProducts } = await import("@/app/admin/dashboard/actions");
      const data = await searchProducts(value);
      // Filter out already-selected products
      setResults(data.filter((p: ProductSearchResult) => !selectedIds.includes(p.id)));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [selectedIds]);

  const debouncedSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(value), 250);
  }, [handleSearch]);

  const addToSelection = useCallback(async (product: ProductSearchResult) => {
    const newIds = [...selectedIds, product.id];
    setSelectedIds(newIds);
    setResults(prev => prev.filter(p => p.id !== product.id));
    setResult(null);

    // Auto-select first added product as survivor if none selected yet
    if (!survivorId) setSurvivorId(product.id);

    // Fetch stock info for this product
    setStockLoading(true);
    try {
      const { getBulkProductStockInfo } = await import("@/app/admin/dashboard/actions");
      const stock = await getBulkProductStockInfo([product.id]);
      setStockData(prev => [...prev, ...stock]);
    } catch {
      // Stock fetch failed silently
    } finally {
      setStockLoading(false);
    }
  }, [selectedIds, survivorId]);

  const removeFromSelection = useCallback((productId: string) => {
    setSelectedIds(prev => prev.filter(id => id !== productId));
    setStockData(prev => prev.filter(s => s.id !== productId));
    setResult(null);

    // If survivor was removed, pick the next one or clear
    if (survivorId === productId) {
      const remaining = selectedIds.filter(id => id !== productId);
      setSurvivorId(remaining.length > 0 ? remaining[0] : null);
    }
  }, [survivorId, selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSurvivorId(null);
    setStockData([]);
    setResult(null);
    setExpandedProduct(null);
  }, []);

  const handleMerge = async () => {
    if (!survivorId || selectedIds.length < 2) return;

    const duplicateIds = selectedIds.filter(id => id !== survivorId);
    const survivor = stockData.find((product) => product.id === survivorId);
    const duplicates = stockData.filter((product) => duplicateIds.includes(product.id));
    if (!window.confirm(`Merge ${duplicates.map((product) => product.name).join(", ")} into ${survivor?.name ?? "the selected survivor"}?\n\nUse this only when they are the same physical product. Active reservations and pending orders will block the merge. Historical orders and audits will be preserved.`)) return;
    setMerging(true);
    setResult(null);

    try {
      const { mergeDuplicateProducts } = await import("@/app/admin/dashboard/actions");
      const res = await mergeDuplicateProducts(survivorId, duplicateIds, "admin-manual-merge");
      setResult(res);
      if (res.success) {
        clearSelection();
        setQuery("");
        setResults([]);
      }
    } catch (err: any) {
      setResult({ success: false, message: err?.message || "Merge failed due to an unexpected error." });
    } finally {
      setMerging(false);
    }
  };

  // Compute combined stock for display
  const getCombinedStock = (productId: string) => {
    const data = stockData.find(s => s.id === productId);
    if (!data) return null;
    const combined: Record<string, number> = {};
    for (const [grade, qty] of Object.entries(data.unilorinStock)) {
      combined[grade] = (combined[grade] || 0) + qty;
    }
    for (const [grade, qty] of Object.entries(data.tankeStock)) {
      combined[grade] = (combined[grade] || 0) + qty;
    }
    return combined;
  };

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-100 text-purple-600">
          <Merge size={20} />
        </div>
        <div>
          <h3 className="text-base font-serif font-bold text-gray-900">Manual Merge</h3>
          <p className="text-xs text-gray-400 font-medium">
            Search products, select the ones you know are duplicates, then merge them
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text"
          placeholder="Search for a product to add to the merge list..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
        />
        {searching && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-gold" />
        )}
      </div>

      {/* Search results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              <div className="px-4 py-2 bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                Results ({results.length})
              </div>
              {results.slice(0, 12).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToSelection(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900 truncate">{p.name}</p>
                    {p.category && (
                      <p className="text-[10px] text-gray-400 uppercase">{p.category}</p>
                    )}
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-xs text-brand-gold font-bold ml-3">
                    <Plus size={14} /> Add
                  </span>
                </button>
              ))}
              {results.length > 12 && (
                <p className="px-4 py-2 text-[10px] text-gray-400 text-center">
                  +{results.length - 12} more results. Refine your search.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected products */}
      {selectedIds.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Selected Products ({selectedIds.length})
            </p>
            <button
              onClick={clearSelection}
              className="text-[10px] font-bold text-red-400 hover:text-red-500 transition-colors uppercase tracking-wider"
            >
              Clear all
            </button>
          </div>

          <div className="divide-y divide-gray-50">
            {selectedIds.map((pid, idx) => {
              const product = stockData.find(s => s.id === pid);
              const stock = getCombinedStock(pid);
              const isSurvivor = survivorId === pid;

              return (
                <div key={pid}>
                  <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
                    {/* Radio for survivor selection */}
                    <input
                      type="radio"
                      name="manual-survivor"
                      checked={isSurvivor}
                      onChange={() => setSurvivorId(pid)}
                      className="w-4 h-4 text-brand-gold focus:ring-brand-gold/30 accent-[#D4AF37] shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {product?.name ?? pid.slice(0, 8) + "..."}
                        </p>
                        {isSurvivor && (
                          <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-lg">
                            Survivor
                          </span>
                        )}
                      </div>
                      {product?.category && (
                        <p className="text-[10px] text-gray-400 uppercase">{product.category}</p>
                      )}
                      {/* Stock summary */}
                      {stock && Object.keys(stock).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {Object.entries(stock).map(([grade, qty]) => (
                            <span
                              key={grade}
                              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                qty > 0 ? "text-gray-600 bg-gray-50" : "text-gray-300 bg-gray-50"
                              }`}
                            >
                              {grade}: {qty}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle expand */}
                      {product && (
                        <button
                          onClick={() => setExpandedProduct(expandedProduct === pid ? null : pid)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
                        >
                          {expandedProduct === pid ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </button>
                      )}

                      {/* Remove */}
                      <button
                        onClick={() => removeFromSelection(pid)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded stock details */}
                  <AnimatePresence>
                    {expandedProduct === pid && product && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 sm:px-5 pb-4">
                          <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Unilorin</p>
                              {["special", "extra", "normal"].map(g => (
                                <div key={g} className="flex justify-between py-0.5 text-[11px]">
                                  <span className="text-gray-500 capitalize">{g}</span>
                                  <span className="font-bold text-gray-900">{product.unilorinStock[g] ?? 0}</span>
                                </div>
                              ))}
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Tanke</p>
                              {["special", "extra", "normal"].map(g => (
                                <div key={g} className="flex justify-between py-0.5 text-[11px]">
                                  <span className="text-gray-500 capitalize">{g}</span>
                                  <span className="font-bold text-gray-900">{product.tankeStock[g] ?? 0}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {product.price && (
                            <p className="text-[11px] text-gray-500 mt-2">
                              Price: <span className="font-bold text-gray-900">₦{product.price.toLocaleString()}</span>
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Stock loading indicator */}
          {stockLoading && (
            <div className="px-5 py-3 flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={12} className="animate-spin text-brand-gold" />
              Loading stock data...
            </div>
          )}

          {/* Warning */}
          <div className="px-4 sm:px-5 py-3 bg-amber-50 border-t border-amber-100 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 font-medium">
              The <strong>survivor</strong> product (marked with radio button) will be kept. All other selected products will be <strong>deleted</strong> after merging. Their inventory, order history, and audit logs will be consolidated under the survivor.
            </p>
          </div>

          {/* Action buttons */}
          <div className="px-4 sm:px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              onClick={clearSelection}
              className="px-4 py-2 rounded-xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all"
            >
              Clear
            </button>
            <button
              onClick={handleMerge}
              disabled={merging || !survivorId || selectedIds.length < 2}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {merging ? (
                <><Loader2 size={14} className="animate-spin" /> Merging...</>
              ) : (
                <><Merge size={14} /> Merge &amp; Consolidate</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${
          result.success
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {result.success ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="text-sm font-semibold">{result.success ? "Merged successfully" : "Error"}</p>
            <p className="text-xs mt-0.5 opacity-80">{result.message}</p>
          </div>
          <button onClick={() => setResult(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={16} />
          </button>
        </div>
      )}

      {/* No results feedback */}
      {query.trim().length >= 2 && !searching && results.length === 0 && selectedIds.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Search size={32} className="text-gray-200 mb-2" />
          <h3 className="text-sm font-bold text-gray-900 mb-1">No Products Found</h3>
          <p className="text-xs text-gray-400 max-w-sm">
            No products match &ldquo;{query}&rdquo;. Try a different search term.
          </p>
        </div>
      )}

      {/* No results feedback (when some already selected) */}
      {query.trim().length >= 2 && !searching && results.length === 0 && selectedIds.length > 0 && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-gray-400 font-medium">
            No more products match &ldquo;{query}&rdquo;. Try a different search term.
          </p>
        </div>
      )}

      {/* Empty state (when no products selected and not searching) */}
      {selectedIds.length === 0 && !query && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
            <Package size={28} className="text-purple-300" />
          </div>
          <h3 className="text-sm font-bold text-gray-900 mb-1">No Products Selected</h3>
          <p className="text-xs text-gray-400 max-w-sm">
            Search for products above and click <strong>Add</strong> to include them in the merge list. Select at least 2 products, choose a survivor, then merge.
          </p>
        </div>
      )}
    </div>
  );
}
