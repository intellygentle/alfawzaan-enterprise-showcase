"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, MapPin, Clock, CheckCircle, XCircle, Loader2, Search, Filter,
  Users, Link2, AlertCircle, ChevronRight, Package
} from "lucide-react";
import { useDeliveryRequests, useDeliveryPairs } from "@/hooks/useDeliveryData";
import {
  adminUpdateDeliveryStatus,
  adminCompleteDelivery,
  adminApprovePair,
  adminRejectPair,
  adminDeletePair,
} from "@/app/admin/dashboard/actions";
import type { DeliveryRequestStatus } from "@/lib/types";

type TabView = "requests" | "pairs";

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  dispatched: "bg-blue-100 text-blue-700",
  delivered: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-600",
  completed: "bg-purple-100 text-purple-700",
};

export default function DeliveryManagement() {
  const [view, setView] = useState<TabView>("requests");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const effectiveStatus = statusFilter === "all" ? undefined : statusFilter;
  const { requests, loading: reqLoading } = useDeliveryRequests(effectiveStatus as any);
  const { pairs, loading: pairsLoading } = useDeliveryPairs(effectiveStatus as any);

  const filteredRequests = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.area.toLowerCase().includes(q) ||
      r.phone_number.includes(q) ||
      r.address.toLowerCase().includes(q) ||
      r.order?.customer_name?.toLowerCase().includes(q) ||
      r.order?.customer_phone?.includes(q) ||
      r.id.slice(0, 8).includes(q)
    );
  });

  const filteredPairs = pairs.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.location.toLowerCase().includes(q) ||
      p.id.slice(0, 8).includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 rounded-xl bg-brand-gold/10">
          <Truck size={20} className="text-brand-gold" />
        </div>
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Delivery Management</h2>
          <p className="text-xs text-gray-400 font-medium">
            Review delivery requests and manage peer delivery pairings
          </p>
        </div>
      </div>

      {/* Tabs + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-2 bg-white p-2 rounded-2xl border border-gray-100">
          {[
            { id: "requests" as TabView, label: "Requests", icon: Package, count: requests.length },
            { id: "pairs" as TabView, label: "Pairs", icon: Users, count: pairs.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                view === tab.id
                  ? "bg-brand-gold text-white shadow-md shadow-brand-gold/20"
                  : "text-gray-400 hover:text-gray-900"
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                view === tab.id ? "bg-white/20" : "bg-gray-100"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Search by area, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-widest text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="dispatched">Dispatched</option>
          <option value="delivered">Delivered</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {view === "requests" && (
          <motion.div
            key="requests"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <DeliveryRequestsList
              requests={filteredRequests}
              loading={reqLoading}
              search={search}
            />
          </motion.div>
        )}

        {view === "pairs" && (
          <motion.div
            key="pairs"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <DeliveryPairsList
              pairs={filteredPairs}
              loading={pairsLoading}
              search={search}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Delivery Requests List ───
function DeliveryRequestsList({
  requests,
  loading,
  search,
}: {
  requests: any[];
  loading: boolean;
  search: string;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusUpdate = async (requestId: string, status: DeliveryRequestStatus, orderId?: string) => {
    setUpdatingId(requestId);
    try {
      if (status === "delivered" && orderId) {
        await adminCompleteDelivery(requestId, orderId, "admin");
      } else {
        await adminUpdateDeliveryStatus(requestId, status, "admin");
      }
      window.location.reload();
    } catch (err: any) {
      console.error("Failed to update delivery status:", err);
      alert(err.message || "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-brand-gold" />
        <p className="text-xs text-gray-400 font-medium">Loading delivery requests...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <Truck size={40} className="text-gray-200 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {search ? "No matching requests" : "No delivery requests"}
        </h3>
        <p className="text-xs text-gray-400 max-w-sm mx-auto">
          {search
            ? `No delivery requests match "${search}".`
            : "No delivery requests have been submitted yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div
          key={req.id}
          className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-brand-gold/20 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <p className="font-bold text-gray-900 text-sm">
                  Request #{req.id.slice(0, 8)}
                </p>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusColors[req.status] || "bg-gray-100 text-gray-500"}`}>
                  {req.status}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(req.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                {req.order_id ? ` · Order #${req.order_id.slice(0, 8)}` : " · Standalone"}
                {req.order && (
                  <>
                    {" · "}<span className="capitalize">{req.order.outlet}</span>
                    {" · "}{req.order.customer_name || req.order.customer_phone}
                  </>
                )}
              </p>
            </div>
            {req.order && (
              <p className="text-sm font-black text-brand-gold">
                ₦{req.order.total_amount.toLocaleString()}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin size={14} className="text-brand-gold shrink-0 mt-0.5" />
              <span>{req.address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={14} className="text-brand-gold" />
              <span className="font-medium">{req.area}</span>
            </div>
            {req.preferred_time && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock size={14} className="text-brand-gold" />
                <span>{req.preferred_time}</span>
              </div>
            )}
          </div>

          {req.notes && (
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-gray-500">{req.notes}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            {req.status === "pending" && (
              <>
                <StatusButton
                  onClick={() => handleStatusUpdate(req.id, "approved")}
                  loading={updatingId === req.id}
                  color="bg-green-500 hover:bg-green-600 text-white"
                  icon={<CheckCircle size={13} />}
                  label="Approve"
                />
                <StatusButton
                  onClick={() => handleStatusUpdate(req.id, "rejected")}
                  loading={updatingId === req.id}
                  color="bg-red-500 hover:bg-red-600 text-white"
                  icon={<XCircle size={13} />}
                  label="Reject"
                />
              </>
            )}
            {req.status === "approved" && (
              <StatusButton
                onClick={() => handleStatusUpdate(req.id, "dispatched")}
                loading={updatingId === req.id}
                color="bg-blue-500 hover:bg-blue-600 text-white"
                icon={<Truck size={13} />}
                label="Mark Dispatched"
              />
            )}
            {(req.status === "dispatched" || req.status === "approved") && (
              <StatusButton
                onClick={() => handleStatusUpdate(req.id, "delivered", req.order_id)}
                loading={updatingId === req.id}
                color="bg-brand-gold hover:bg-brand-gold/80 text-white"
                icon={<Package size={13} />}
                label="Mark Delivered"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Delivery Pairs List ───
function DeliveryPairsList({
  pairs,
  loading,
  search,
}: {
  pairs: any[];
  loading: boolean;
  search: string;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleApprove = async (pairId: string) => {
    setUpdatingId(pairId);
    try {
      await adminApprovePair(pairId, "admin");
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to approve pair.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleReject = async (pairId: string) => {
    setUpdatingId(pairId);
    try {
      await adminRejectPair(pairId, "admin");
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to reject pair.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (pairId: string) => {
    setUpdatingId(pairId);
    try {
      await adminDeletePair(pairId, "admin");
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to delete pair.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={28} className="animate-spin text-brand-gold" />
        <p className="text-xs text-gray-400 font-medium">Loading delivery pairs...</p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <Users size={40} className="text-gray-200 mx-auto mb-3" />
        <h3 className="text-base font-bold text-gray-900 mb-1">
          {search ? "No matching pairs" : "No delivery pairs"}
        </h3>
        <p className="text-xs text-gray-400 max-w-sm mx-auto">
          {search
            ? `No pairs match "${search}".`
            : "No peer delivery pairings have been requested yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div
          key={pair.id}
          className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-brand-gold/20 transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="font-bold text-gray-900 text-sm">
                  Pair #{pair.id.slice(0, 8)}
                </p>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusColors[pair.status] || "bg-gray-100 text-gray-500"}`}>
                  {pair.status}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(pair.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}<MapPin size={10} className="inline" /> {pair.location}
              </p>
            </div>
          </div>

          {/* Paired Requests */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {[pair.request_1, pair.request_2].filter(Boolean).map((req: any, i: number) => (
              <div key={req.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Link2 size={12} className="text-brand-gold" />
                  <p className="text-xs font-bold text-gray-900">
                    Request #{req.id.slice(0, 8)}
                  </p>
                </div>
                <p className="text-[10px] text-gray-500">
                  {req.order?.customer_name || req.phone_number}
                  {req.order_id ? ` · Order #${req.order_id.slice(0, 8)}` : " · Standalone"}
                  {req.order && <> · ₦{req.order.total_amount.toLocaleString()}</>}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  <MapPin size={9} className="inline" /> {req.address}
                </p>
              </div>
            ))}
          </div>

          {pair.admin_notes && (
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 font-medium">{pair.admin_notes}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            {pair.status === "pending" && (
              <>
                <StatusButton
                  onClick={() => handleApprove(pair.id)}
                  loading={updatingId === pair.id}
                  color="bg-green-500 hover:bg-green-600 text-white"
                  icon={<CheckCircle size={13} />}
                  label="Approve Pair"
                />
                <StatusButton
                  onClick={() => handleReject(pair.id)}
                  loading={updatingId === pair.id}
                  color="bg-red-500 hover:bg-red-600 text-white"
                  icon={<XCircle size={13} />}
                  label="Reject"
                />
              </>
            )}
            {pair.status === "approved" && (
              <StatusButton
                onClick={() => handleDelete(pair.id)}
                loading={updatingId === pair.id}
                color="bg-gray-200 hover:bg-gray-300 text-gray-700"
                icon={<XCircle size={13} />}
                label="Remove Pair"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Status Button ───
function StatusButton({
  onClick,
  loading,
  color,
  icon,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  color: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 ${color}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
