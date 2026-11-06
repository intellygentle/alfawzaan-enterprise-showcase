"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Clock, FileText, Phone, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { submitStandaloneDeliveryRequest } from "@/app/delivery/actions";

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

export default function StandaloneDeliveryForm({
  onSuccess,
}: {
  onSuccess: (requestId: string) => void;
}) {
  const [phone, setPhone] = useState("");
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
    if (!phone.trim() || !address.trim() || !selectedArea) return;

    setLoading(true);
    setError(null);

    try {
      const result = await submitStandaloneDeliveryRequest(
        phone.trim(),
        address.trim(),
        selectedArea,
        preferredTime.trim() || undefined,
        notes.trim() || undefined
      );

      if (result.success && result.request) {
        onSuccess(result.request.id);
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
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl p-6 sm:p-8 shadow-lg space-y-6"
    >
      {/* Phone */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#121212] mb-2">
          <Phone size={14} />
          Phone Number
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 08012345678"
          required
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-[#121212] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] transition-all text-sm"
        />
      </div>

      {/* Address */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#121212] mb-2">
          <MapPin size={14} />
          Delivery Address
        </label>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter your full delivery address"
          required
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-[#121212] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] transition-all text-sm resize-none"
        />
      </div>

      {/* Area */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#121212] mb-2">
          <MapPin size={14} />
          Area / Neighborhood
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {COMMON_AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                area === a
                  ? "bg-[#D4AF37] text-white shadow-md"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            className="mt-3 w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-[#121212] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] transition-all text-sm"
          />
        )}
      </div>

      {/* Preferred Time */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#121212] mb-2">
          <Clock size={14} />
          Preferred Time{" "}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={preferredTime}
          onChange={(e) => setPreferredTime(e.target.value)}
          placeholder="e.g. Tomorrow afternoon, Saturday morning"
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-[#121212] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] transition-all text-sm"
        />
      </div>

      {/* Notes */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#121212] mb-2">
          <FileText size={14} />
          Additional Notes{" "}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special instructions for delivery"
          rows={2}
          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 text-[#121212] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 focus:border-[#D4AF37] transition-all text-sm resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm"
        >
          <AlertCircle size={16} />
          {error}
        </motion.div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !phone.trim() || !address.trim() || !selectedArea}
        className="w-full py-3.5 bg-[#121212] hover:bg-[#121212]/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <CheckCircle size={16} />
            Submit Delivery Request
          </>
        )}
      </button>
    </motion.form>
  );
}
