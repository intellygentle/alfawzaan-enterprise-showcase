"use client";

import { MapPin, Clock, Package, Truck, CheckCircle, XCircle } from "lucide-react";

interface DeliveryRequestCardProps {
  request: {
    id: string;
    area: string;
    status: string;
    created_at: string;
    preferred_time?: string | null;
    /**
     * Contact and address fields are optional on purpose: the visitor-facing
     * surfaces (peer pairing, active requests) receive a narrowed projection
     * with no address, phone, notes or order details, so that data never
     * reaches an anonymous browser. Admin surfaces still pass full rows and get
     * the full card below.
     */
    order_id?: string | null;
    phone_number?: string | null;
    address?: string | null;
    notes?: string | null;
    order?: {
      id: string;
      customer_name: string | null;
      total_amount: number;
      outlet: string;
    } | null;
  };
  compact?: boolean;
  children?: React.ReactNode;
}

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: {
    color: "bg-amber-100 text-amber-700 border-amber-200",
    icon: <Clock size={12} />,
    label: "Pending Review",
  },
  approved: {
    color: "bg-green-100 text-green-700 border-green-200",
    icon: <CheckCircle size={12} />,
    label: "Approved",
  },
  dispatched: {
    color: "bg-blue-100 text-blue-700 border-blue-200",
    icon: <Truck size={12} />,
    label: "Dispatched",
  },
  delivered: {
    color: "bg-gray-100 text-gray-600 border-gray-200",
    icon: <Package size={12} />,
    label: "Delivered",
  },
  rejected: {
    color: "bg-red-100 text-red-600 border-red-200",
    icon: <XCircle size={12} />,
    label: "Rejected",
  },
};

export default function DeliveryRequestCard({ request, compact = false, children }: DeliveryRequestCardProps) {
  const status = statusConfig[request.status] || statusConfig.pending;

  if (compact) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 hover:border-brand-gold/20 transition-all">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-900">
            Request #{request.id.slice(0, 8)}
          </p>
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${status.color}`}>
            {status.icon} {status.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <MapPin size={12} className="text-brand-gold" />
          <span>{request.area}</span>
        </div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-brand-gold/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-gray-900 text-sm">
            Request #{request.id.slice(0, 8)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(request.created_at).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {request.order && request.order_id && (
              <>
                {" · "}Order #{request.order_id.slice(0, 8)}
                {" · "}
                <span className="capitalize">{request.order.outlet}</span>
              </>
            )}
          </p>
        </div>
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {request.address && (
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <MapPin size={14} className="text-brand-gold shrink-0 mt-0.5" />
            <span>{request.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin size={14} className="text-brand-gold" />
          <span className="font-medium">{request.area}</span>
        </div>
        {request.preferred_time && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock size={14} className="text-brand-gold" />
            <span>{request.preferred_time}</span>
          </div>
        )}
      </div>

      {request.notes && (
        <div className="bg-gray-50 rounded-xl p-3 mb-3">
          <p className="text-xs text-gray-500">{request.notes}</p>
        </div>
      )}

      {request.order && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {request.order.customer_name || "Customer"} · {request.order.total_amount.toLocaleString("en-NG", { style: "currency", currency: "NGN" })}
          </p>
        </div>
      )}

      {children && <div className="mt-3 pt-3 border-t border-gray-100">{children}</div>}
    </div>
  );
}
