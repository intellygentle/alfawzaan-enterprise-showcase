"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Clock, FileText, Loader2, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { submitDeliveryRequest } from "@/app/delivery/actions";

const COMMON_AREAS = [
  "Oke-Odo",
  "Challenge",
  "University Gate",
  "Tanke",
  "Pipeline",
  "Sawmill",
  "Emir's Palace",
  "Post Office",
  "Gerin Alimi",
  "Zango",
  "Fate",
  "Adewole",
  "Oloje",
  "Basin",
  "Other",
];

export default function DeliveryRequestForm({
  orderId,
  phoneNumber,
  onSuccess,
  onBack,
}: {
  orderId: string;
  phoneNumber: string;
  onSuccess: (requestId: string, area: string) => void;
  onBack: () => void;
}) {
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [customArea, setCustomArea] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedArea = area === "Other" ? customArea.trim() : area;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || !selectedArea) return;

    setLoading(true);
    setError(null);

    try {
      const result = await submitDeliveryRequest(
        orderId,
        phoneNumber,
        address.trim(),
        selectedArea,
        preferredTime.trim() || undefined,
        notes.trim() || undefined
      );

      if (result.success && result.request) {
        onSuccess(result.request.id, selectedArea);
      } else {
        setError(result.message || "Failed to submit delivery request.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h3 className="font-bold text-gray-900">Delivery Details</h3>
            <p className="text-xs text-gray-400">
              Order #{orderId.slice(0, 8)} · Delivery to: {phoneNumber}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Address */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              <MapPin size={13} />
              Delivery Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter your full delivery address (street, building, landmarks)"
              rows={2}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all resize-none"
            />
          </div>

          {/* Area */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              <MapPin size={13} />
              Area / Neighborhood
            </label>
            <div className="grid grid-cols-3 gap-2">
              {COMMON_AREAS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setArea(a)}
                  className={`px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border ${
                    area === a
                      ? "bg-brand-gold text-white border-brand-gold shadow-md shadow-brand-gold/20"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:border-brand-gold/40 hover:text-gray-700"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            {area === "Other" && (
              <input
                type="text"
                value={customArea}
                onChange={(e) => setCustomArea(e.target.value)}
                placeholder="Enter your area name"
                required
                className="w-full mt-2 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
              />
            )}
          </div>

          {/* Preferred Time */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              <Clock size={13} />
              Preferred Time (optional)
            </label>
            <input
              type="text"
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              placeholder="e.g. Tomorrow morning, After 3pm, Weekend"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
              <FileText size={13} />
              Additional Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions for delivery"
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-medium text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold transition-all resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !address.trim() || !selectedArea}
            className="w-full py-3.5 rounded-xl bg-brand-gold text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold/80 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Submitting...</>
            ) : (
              <><CheckCircle size={16} /> Submit Delivery Request</>
            )}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
