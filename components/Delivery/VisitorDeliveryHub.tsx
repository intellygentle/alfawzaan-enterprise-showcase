"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Clock, Truck, ArrowLeft, Users } from "lucide-react";
import StandaloneDeliveryForm from "./StandaloneDeliveryForm";
import DeliveryRequestCard from "./DeliveryRequestCard";
import { getApprovedDeliveryRequests } from "@/app/delivery/actions";

type Step = "form" | "success";

export default function VisitorDeliveryHub() {
  const [step, setStep] = useState<Step>("form");
  const [approvedRequests, setApprovedRequests] = useState<any[]>([]);

  useEffect(() => {
    async function fetchApproved() {
      try {
        const result = await getApprovedDeliveryRequests();
        if (result.success) {
          setApprovedRequests(result.requests);
        }
      } catch (err) {
        console.error("Failed to fetch approved requests:", err);
      }
    }
    fetchApproved();
  }, []);

  const handleSuccess = () => {
    setStep("success");
  };

  const handleReset = () => {
    setStep("form");
  };

  return (
    <div className="space-y-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2">
        {[
          { id: "form", label: "Request", icon: Truck },
          { id: "success", label: "Done", icon: CheckCircle },
        ].map((s, i) => {
          const isActive = step === s.id;
          const isPast = step === "success" && s.id === "form";
          return (
            <div key={s.id} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`w-8 h-px ${isPast ? "bg-[#D4AF37]" : "bg-gray-200"}`} />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? "bg-[#D4AF37] text-white shadow-md shadow-[#D4AF37]/20"
                    : isPast
                    ? "bg-[#D4AF37]/10 text-[#D4AF37]"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                <s.icon size={12} />
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {step === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <StandaloneDeliveryForm onSuccess={handleSuccess} />
          </motion.div>
        )}

        {step === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl p-8 text-center shadow-lg">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <Clock size={32} className="text-amber-500" />
              </div>
              <h3 className="text-xl font-serif font-bold text-[#121212] mb-2">
                Request Submitted
              </h3>
              <p className="text-sm text-[#121212]/50 max-w-md mx-auto mb-6">
                Your delivery request has been submitted. An admin will review
                and approve it shortly. Come back later to check the status.
              </p>
              <button
                onClick={handleReset}
                className="px-6 py-2.5 rounded-xl bg-[#121212] text-white text-xs font-bold uppercase tracking-widest hover:bg-[#121212]/80 transition-all shadow-sm"
              >
                <ArrowLeft size={14} className="inline mr-2" />
                Submit Another Request
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approved Delivery Requests */}
      {approvedRequests.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#D4AF37]" />
            <h3 className="text-sm font-bold text-[#121212] uppercase tracking-wider">
              Active Delivery Requests
            </h3>
          </div>
          <div className="grid gap-3">
            {approvedRequests.map((req) => (
              <DeliveryRequestCard key={req.id} request={req} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
