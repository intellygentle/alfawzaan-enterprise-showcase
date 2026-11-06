"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, MapPin, Loader2, CheckCircle, AlertCircle, Link2 } from "lucide-react";
import { browsePendingRequestsInArea, requestPairWith } from "@/app/delivery/actions";
import DeliveryRequestCard from "./DeliveryRequestCard";

/**
 * The public peer list never carries another customer's address, phone, notes
 * or order details — browsePendingRequestsInArea returns only the fields below.
 */
interface PeerRequest {
  id: string;
  area: string;
  status: string;
  created_at: string;
  preferred_time: string | null;
}

export default function PeerPairingBrowser({
  myRequestId,
  area,
}: {
  myRequestId: string;
  area: string;
}) {
  const [peers, setPeers] = useState<PeerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairingWith, setPairingWith] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairedIds, setPairedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchPeers() {
      setLoading(true);
      try {
        const result = await browsePendingRequestsInArea(area, myRequestId);
        if (result.success) {
          setPeers(result.requests);
        }
      } catch (err) {
        console.error("Failed to fetch peers:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPeers();
  }, [area, myRequestId]);

  const handlePair = async (otherRequestId: string) => {
    setPairingWith(otherRequestId);
    setError(null);
    setSuccess(null);

    try {
      const result = await requestPairWith(myRequestId, otherRequestId);
      if (result.success) {
        setSuccess("Pairing request sent! An admin will review and approve.");
        setPairedIds((prev) => new Set([...prev, otherRequestId]));
      } else {
        setError(result.message || "Failed to create pairing request.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setPairingWith(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-brand-gold/10">
            <Users size={18} className="text-brand-gold" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Peer Delivery Pairing</h3>
            <p className="text-xs text-gray-400">
              Others in <span className="font-bold text-brand-gold">{area}</span> also looking for delivery
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
          <p className="text-xs text-blue-700 font-medium">
            <Link2 size={12} className="inline mr-1" />
            Pair your delivery with someone in the same area to share delivery costs. An admin will review and approve the pairing.
          </p>
        </div>

        {/* Success Message */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 mb-4 text-green-600 bg-green-50 rounded-xl px-4 py-3 text-xs font-medium"
            >
              <CheckCircle size={14} />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 mb-4 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={24} className="animate-spin text-brand-gold" />
            <p className="text-xs text-gray-400 font-medium">Finding peers in {area}...</p>
          </div>
        ) : peers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users size={36} className="text-gray-200 mb-3" />
            <h4 className="text-sm font-bold text-gray-900 mb-1">No other deliveries in {area}</h4>
            <p className="text-xs text-gray-400 max-w-xs">
              There are no other pending delivery requests in your area right now. Check back later or share with friends who might also need delivery.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {peers.map((peer) => {
              const isPaired = pairedIds.has(peer.id);
              const isPairing = pairingWith === peer.id;

              return (
                <DeliveryRequestCard key={peer.id} request={peer} compact>
                  <button
                    onClick={() => handlePair(peer.id)}
                    disabled={isPaired || isPairing}
                    className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                      isPaired
                        ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
                        : "bg-brand-gold text-white hover:bg-brand-gold/80 shadow-sm disabled:opacity-50"
                    }`}
                  >
                    {isPaired ? (
                      <><CheckCircle size={13} /> Pair Requested</>
                    ) : isPairing ? (
                      <><Loader2 size={13} className="animate-spin" /> Pairing...</>
                    ) : (
                      <><Link2 size={13} /> Request to Pair</>
                    )}
                  </button>
                </DeliveryRequestCard>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
