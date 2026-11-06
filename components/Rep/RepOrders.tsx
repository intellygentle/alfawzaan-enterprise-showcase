"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, ChevronRight, ShieldAlert, AlertCircle, DollarSign, CheckCircle, Minus, Plus,
} from "lucide-react";
import type { RepresentativePermissions } from "@/lib/representatives";
import { useRepOrders } from "@/hooks/useRepData";
import { repVerifyOrder, repSettleOrder, repGetAvailableGrades } from "@/app/representative/actions";

interface RepOrdersProps {
  outlet: "unilorin" | "tanke";
  permissions: RepresentativePermissions;
  repId: string;
}

export default function RepOrders({ outlet, permissions, repId }: RepOrdersProps) {
  const { orders, loading, refetch } = useRepOrders(outlet);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-serif font-bold text-gray-900">
        Pending Orders — <span className="capitalize">{outlet}</span>
      </h2>
      {loading ? (
        <div className="text-center py-12 text-gray-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading orders...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          No pending orders for {outlet}.
        </div>
      ) : (
        orders.map((order: any) => (
          <OrderCard
            key={order.id}
            order={order}
            permissions={permissions}
            repId={repId}
            onVerified={refetch}
          />
        ))
      )}
    </div>
  );
}

function OrderCard({
  order,
  permissions,
  repId,
  onVerified,
}: {
  order: any;
  permissions: RepresentativePermissions;
  repId: string;
  onVerified: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<any[]>(order.order_items || []);
  const [verifying, setVerifying] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableGrades, setAvailableGrades] = useState<Record<string, { grade: string; quantity: number }[]>>({});
  const [gradesLoading, setGradesLoading] = useState(false);

  useEffect(() => {
    if (expanded && order.order_items?.length > 0) {
      fetchAvailableGrades();
    }
  }, [expanded]);

  const fetchAvailableGrades = async () => {
    setGradesLoading(true);
    try {
      const pairs = new Map<string, string>();
      for (const item of order.order_items || []) {
        const key = `${item.product_id}|${item.outlet}`;
        if (!pairs.has(key)) {
          pairs.set(key, item.outlet);
        }
      }

      const results: Record<string, { grade: string; quantity: number }[]> = {};
      await Promise.all(
        Array.from(pairs.entries()).map(async ([key, _outlet]) => {
          const [productId] = key.split("|");
          results[key] = await repGetAvailableGrades(productId, order.id);
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
    const grades = getAvailableGradesForItem(item);
    if (!grades) return 9999;
    const gradeEntry = grades.find((g: any) => g.grade === item.grade);
    if (gradeEntry) return gradeEntry.quantity;
    // Grade not in available list — may be fully reserved BY THIS ORDER.
    // Allow the item's own quantity as the max since the server will handle
    // the actual stock check (releases reservation before deducting).
    if (item.grade && item.grade !== "pending") return item.quantity;
    return 0;
  };

  const handleItemChange = (index: number, field: "quantity" | "unit_price" | "grade", value: number | string) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item[field] = value;

      if (field === "grade") {
        const grades = availableGrades[`${item.product_id}|${item.outlet}`];
        if (grades) {
          const gradeEntry = grades.find((g: any) => g.grade === value);
          // If the grade has stock, use its quantity. Otherwise fall back to
          // the item's own quantity (stock is reserved by THIS order).
          const maxQty = gradeEntry ? gradeEntry.quantity
            : (value === item.grade && item.grade !== "pending" ? item.quantity : 0);
          if (item.quantity > maxQty && maxQty > 0) {
            item.quantity = maxQty;
          }
        }
      }

      if (field === "quantity" || field === "unit_price" || field === "grade") {
        item.total_price = item.quantity * item.unit_price;
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleVerify = async () => {
    const hasPendingGrade = items.some((item: any) => !item.grade || item.grade === "pending");
    if (hasPendingGrade) {
      setError("Please assign a grade (Special, Extra, or Normal) to every item before verifying.");
      return;
    }

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
      const result = await repVerifyOrder(
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
        onVerified();
      } else {
        setError(result.message || 'Verification failed. Stock could not be deducted. Please check inventory levels and try again.');
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify order.");
    } finally {
      setVerifying(false);
    }
  };

  const handleSettle = async (status: string) => {
    setSettling(true);
    setError(null);
    try {
      await repSettleOrder(order.id, status);
      onVerified();
    } catch (err: any) {
      setError(err.message || "Failed to settle order.");
    } finally {
      setSettling(false);
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

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all">
      {/* Order Header — stacked on mobile, side-by-side on desktop */}
      <div
        className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 mb-1">
            <p className="text-sm sm:text-base font-bold text-gray-900 truncate">Order #{order.id.slice(0, 8)}</p>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider">
              Pending
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            {order.customer_name || order.customer_phone}
            {order.customer_phone && order.customer_name ? ` • ${order.customer_phone}` : ""}
          </p>
          {/* Product names visible without expanding */}
          {order.order_items?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5 sm:mt-2">
              {order.order_items.slice(0, 3).map((item: any, i: number) => (
                <span
                  key={i}
                  className="text-[9px] sm:text-[10px] font-medium text-gray-600 bg-gray-50 border border-gray-100 px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-[100px] sm:max-w-[120px]"
                >
                  {item.product_name}
                </span>
              ))}
              {order.order_items.length > 3 && (
                <span className="text-[9px] sm:text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-1.5 sm:px-2 py-0.5 rounded-md">
                  +{order.order_items.length - 3} more
                </span>
              )}
            </div>
          )}
          <p className="text-sm font-bold mt-1.5 sm:mt-2">
            <span className="text-brand-gold">₦{newTotal.toLocaleString()}</span>
            {hasChanges && editing && (
              <span className="text-[10px] text-gray-400 ml-2 font-normal">(edited)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto sm:ml-4 shrink-0">
          {order.whatsapp_link && (
            <a
              href={order.whatsapp_link}
              onClick={(e) => e.stopPropagation()}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-500 text-white rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-colors shadow-sm"
            >
              WhatsApp
            </a>
          )}
          {permissions.verify_order && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                setEditing(true);
              }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-brand-gold text-white rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-colors shadow-sm"
            >
              Verify
            </button>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
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
              {/* Table Header — hidden on mobile */}
              <div className="hidden sm:flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-gray-400 pb-2 border-b border-gray-50">
                <div className="flex-1">Product</div>
                <div className="w-24 text-center">Grade</div>
                <div className="w-20 text-center">Qty</div>
                <div className="w-24 text-center">Unit Price</div>
                <div className="w-24 text-right">Total</div>
              </div>

              {items.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">No items in this order.</p>
              ) : (
                items.map((item: any, idx: number) => (
                  <div key={item.id || idx}>
                    {/* ─── Mobile Card Layout (redesigned for clarity) ─── */}
                    <div className="sm:hidden bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      {/* Product name header with gold accent */}
                      <div className="border-l-4 border-brand-gold pl-3.5 pr-3 py-2.5 bg-gradient-to-r from-amber-50/60 to-white border-b border-gray-100">
                        <p className="text-[13px] font-bold text-gray-900 leading-snug">{item.product_name}</p>
                      </div>
                      {/* Fields in 2×2 grid — labels above values */}
                      <div className="p-3.5">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          {/* Grade */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Grade</span>
                            {editing ? (
                              gradesLoading ? (
                                <Loader2 size={14} className="animate-spin text-brand-gold" />
                              ) : (
                                <select
                                  value={item.grade === "pending" ? "" : item.grade}
                                  onChange={(e) => handleItemChange(idx, "grade", e.target.value)}
                                  className="w-full text-[11px] font-bold uppercase tracking-wider bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                                >
                                  <option value="" disabled>Select</option>
                                  {(() => {
                                    const avail = getAvailableGradesForItem(item);
                                    let options = avail ? [...avail] : [];
                                    if (item.grade && item.grade !== "pending") {
                                      const alreadyIncluded = options.some((g) => g.grade === item.grade);
                                      if (!alreadyIncluded) {
                                        options.push({ grade: item.grade, quantity: 0 });
                                      }
                                    }
                                    return options.map((g) => {
                                      // If the grade is the order item's own grade and shows 0,
                                      // use the item's quantity instead (stock is reserved by THIS order).
                                      const displayQty = g.quantity > 0 ? g.quantity
                                        : (g.grade === item.grade && item.grade !== "pending" ? item.quantity : 0);
                                      return (
                                        <option key={g.grade} value={g.grade}>
                                          {g.grade.charAt(0).toUpperCase() + g.grade.slice(1)}
                                          {displayQty > 0 ? ` (${displayQty})` : " — out of stock"}
                                        </option>
                                      );
                                    });
                                  })()}
                                </select>
                              )
                            ) : (
                              <span
                                className={`inline-block text-[11px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg ${
                                  item.grade === "pending" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {item.grade === "pending" ? "Unassigned" : item.grade}
                              </span>
                            )}
                          </div>
                          {/* Quantity */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Qty</span>
                            {editing ? (
                              <>
                                <div className="flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
                                  <button type="button" aria-label={`Reduce quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, "quantity", Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1} className="w-9 h-9 flex items-center justify-center text-gray-500 disabled:opacity-25"><Minus size={14} /></button>
                                  <span className="flex-1 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                                  <button type="button" aria-label={`Increase quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, "quantity", Math.min(item.quantity + 1, Math.max(1, getMaxQuantityForItem(item))))} disabled={item.quantity >= getMaxQuantityForItem(item)} className="w-9 h-9 flex items-center justify-center text-gray-500 disabled:opacity-25"><Plus size={14} /></button>
                                </div>
                                {(() => {
                                  const max = getMaxQuantityForItem(item);
                                  return max < 9999 ? <p className="text-[9px] text-gray-400 mt-0.5">max: {max}</p> : null;
                                })()}
                              </>
                            ) : (
                              <span className="block text-sm font-bold text-gray-900">{item.quantity}</span>
                            )}
                          </div>
                          {/* Unit Price */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Price</span>
                            {editing ? (
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">₦</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={item.unit_price}
                                  onChange={(e) => handleItemChange(idx, "unit_price", parseInt(e.target.value) || 0)}
                                  className="w-full text-center text-sm font-bold text-gray-900 bg-white border border-gray-200 rounded-xl pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                                />
                              </div>
                            ) : (
                              <span className="block text-sm font-bold text-gray-900">₦{item.unit_price?.toLocaleString()}</span>
                            )}
                          </div>
                          {/* Total */}
                          <div className="space-y-1">
                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Total</span>
                            <span className="block text-sm font-black text-brand-gold">₦{item.total_price?.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ─── Desktop Horizontal Row ─── */}
                    <div className="hidden sm:flex items-center gap-3 py-3 border-b border-gray-50 last:border-b-0">
                      {/* Product Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{item.product_name}</p>
                      </div>

                      {/* Grade */}
                      <div className="w-24 text-center">
                        {editing ? (
                          <>
                            {gradesLoading ? (
                              <div className="flex items-center justify-center py-1.5">
                                <Loader2 size={12} className="animate-spin text-brand-gold" />
                              </div>
                            ) : (
                              <select
                                value={item.grade === "pending" ? "" : item.grade}
                                onChange={(e) => handleItemChange(idx, "grade", e.target.value)}
                                className="text-[10px] font-black uppercase tracking-wider bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
                              >
                                <option value="" disabled>Select</option>
                                {(() => {
                                  const avail = getAvailableGradesForItem(item);
                                  let options = avail ? [...avail] : [];
                                  if (item.grade && item.grade !== "pending") {
                                    const alreadyIncluded = options.some((g) => g.grade === item.grade);
                                    if (!alreadyIncluded) {
                                      options.push({ grade: item.grade, quantity: 0 });
                                    }
                                  }
                                  return options.map((g) => {
                                    const displayQty = g.quantity > 0 ? g.quantity
                                      : (g.grade === item.grade && item.grade !== "pending" ? item.quantity : 0);
                                    return (
                                      <option key={g.grade} value={g.grade}>
                                        {g.grade.charAt(0).toUpperCase() + g.grade.slice(1)}
                                        {displayQty > 0 ? ` (${displayQty})` : " — out of stock"}
                                      </option>
                                    );
                                  });
                                })()}
                              </select>
                            )}
                          </>
                        ) : (
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg ${
                              item.grade === "pending" ? "bg-amber-100 text-amber-600" : "bg-gray-50 text-gray-400"
                            }`}
                          >
                            {item.grade === "pending" ? "Unassigned" : item.grade}
                          </span>
                        )}
                      </div>

                      {/* Quantity */}
                      <div className="w-20 text-center">
                        {editing ? (
                          <>
                            <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                              <button type="button" aria-label={`Reduce quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, "quantity", Math.max(1, item.quantity - 1))} disabled={item.quantity <= 1} className="w-7 h-8 flex items-center justify-center text-gray-500 disabled:opacity-25"><Minus size={12} /></button>
                              <span className="w-7 text-center text-sm font-bold text-gray-900">{item.quantity}</span>
                              <button type="button" aria-label={`Increase quantity of ${item.product_name}`} onClick={() => handleItemChange(idx, "quantity", Math.min(item.quantity + 1, Math.max(1, getMaxQuantityForItem(item))))} disabled={item.quantity >= getMaxQuantityForItem(item)} className="w-7 h-8 flex items-center justify-center text-gray-500 disabled:opacity-25"><Plus size={12} /></button>
                            </div>
                            {(() => {
                              const max = getMaxQuantityForItem(item);
                              return max < 9999 ? <p className="text-[8px] text-gray-400 mt-0.5">max: {max}</p> : null;
                            })()}
                          </>
                        ) : (
                          <span className="text-sm font-bold text-gray-900">{item.quantity}</span>
                        )}
                      </div>

                      {/* Unit Price */}
                      <div className="w-24 text-center">
                        {editing ? (
                          <div className="relative inline-flex items-center">
                            <span className="absolute left-3 text-gray-400 text-xs font-bold">₦</span>
                            <input
                              type="number"
                              min={0}
                              value={item.unit_price}
                              onChange={(e) => handleItemChange(idx, "unit_price", parseInt(e.target.value) || 0)}
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
                    </div>
                  </div>
                ))
              )}

              {/* Order Total */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <p className="text-xs font-black uppercase tracking-widest text-gray-500">Order Total</p>
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
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setExpanded(false);
                    setEditing(false);
                    setItems(order.order_items || []);
                    setError(null);
                  }}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
                >
                  Cancel
                </button>

                {editing ? (
                  permissions.verify_order && (
                    <button
                      onClick={handleVerify}
                      disabled={verifying}
                      className="px-5 py-2.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {verifying ? (
                        <><Loader2 size={14} className="animate-spin" /> Verifying...</>
                      ) : (
                        <><ShieldAlert size={14} /> Confirm &amp; Verify</>
                      )}
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => setEditing(true)}
                    className="px-5 py-2.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm"
                  >
                    Edit
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
