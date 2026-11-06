"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Phone, Loader2, MapPin, Package, AlertCircle } from "lucide-react";
import { lookupOrdersByPhone } from "@/app/delivery/actions";

interface OrderData {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  status: string;
  outlet: string;
  total_amount: number;
  created_at: string;
  order_items: any[];
}

interface DeliveryRequestData {
  id: string;
  order_id: string;
  status: string;
  area: string;
}

interface LookupResult {
  orders: OrderData[];
  deliveryRequests: DeliveryRequestData[];
}

export default function DeliveryLookup({
  onOrderSelected,
  onApprovedRequest,
}: {
  onOrderSelected: (order: OrderData, existingRequest: DeliveryRequestData | null) => void;
  onApprovedRequest?: (requestId: string, area: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);

  const handleSearch = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await lookupOrdersByPhone(phone.trim());
      if (!res.success) {
        setError(res.message ?? "No orders found.");
        setResult({ orders: [], deliveryRequests: [] });
        return;
      }
      setResult({ orders: res.orders ?? [], deliveryRequests: res.deliveryRequests ?? [] });
    } catch (err: any) {
      setError(err.message || "Failed to look up orders.");
    } finally {
      setLoading(false);
    }
  };

  const getExistingRequest = (orderId: string): DeliveryRequestData | null => {
    if (!result?.deliveryRequests) return null;
    return result.deliveryRequests.find((r) => r.order_id === orderId) || null;
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    shipping: "bg-blue-100 text-blue-700",
    delivered: "bg-gray-100 text-gray-500",
    cancelled: "bg-red-100 text-red-600",
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-brand-gold/10">
            <Phone size={18} className="text-brand-gold" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Find Your Order</h3>
            <p className="text-xs text-gray-400">Enter the phone number used when placing your order</p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="tel"
              placeholder="e.g. 08012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !phone.trim()}
            className="px-6 py-3 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
            Search
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 mt-4 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {result.orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Package size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-900 mb-1">No orders found</p>
              <p className="text-xs text-gray-400">
                No orders match this phone number. Make sure you enter the number used when ordering.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 px-1">
                {result.orders.length} order{result.orders.length !== 1 ? "s" : ""} found
              </p>
              {result.orders.map((order) => {
                const existingReq = getExistingRequest(order.id);
                const canRequestDelivery = (order.status === "paid" || order.status === "shipping") && !existingReq;
                const itemCount = order.order_items?.length || 0;

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-brand-gold/30 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">
                          Order #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(order.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                          {" · "}{itemCount} item{itemCount !== 1 ? "s" : ""}
                          {" · "}
                          <span className="capitalize">{order.outlet}</span>
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          statusColors[order.status] || "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-brand-gold">
                        ₦{order.total_amount.toLocaleString()}
                      </p>

                      {existingReq ? (
                        existingReq.status === "approved" && onApprovedRequest ? (
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-600 border border-green-200">
                              Approved
                            </span>
                            <button
                              onClick={() => onApprovedRequest(existingReq.id, existingReq.area)}
                              className="px-3 py-1.5 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm"
                            >
                              Browse Peers
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                              existingReq.status === "pending"
                                ? "bg-amber-50 text-amber-600 border border-amber-200"
                                : existingReq.status === "dispatched"
                                ? "bg-blue-50 text-blue-600 border border-blue-200"
                                : existingReq.status === "delivered"
                                ? "bg-gray-50 text-gray-500 border border-gray-200"
                                : existingReq.status === "rejected"
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : "bg-gray-50 text-gray-500 border border-gray-200"
                            }`}
                          >
                            {existingReq.status === "pending" ? "Awaiting Approval" : `Delivery: ${existingReq.status}`}
                          </span>
                        )
                      ) : canRequestDelivery ? (
                        <button
                          onClick={() => onOrderSelected(order, null)}
                          className="px-4 py-2 rounded-xl bg-brand-gold text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-sm"
                        >
                          Request Delivery
                        </button>
                      ) : order.status === "pending" ? (
                        <span className="text-[10px] text-gray-400 font-medium">
                          Awaiting verification
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-medium">
                          Not eligible for delivery
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
