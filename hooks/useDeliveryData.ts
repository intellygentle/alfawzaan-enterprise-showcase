"use client";

import { useEffect, useState } from "react";
import { getAdminDeliveryPairs, getAdminDeliveryRequests } from "@/app/admin/dashboard/actions";
import type { DeliveryPairStatus, DeliveryRequestStatus } from "@/lib/types";

type RequestData = Awaited<ReturnType<typeof getAdminDeliveryRequests>>;
type PairData = Awaited<ReturnType<typeof getAdminDeliveryPairs>>;

export function useDeliveryRequests(status?: DeliveryRequestStatus) {
  const [requests, setRequests] = useState<RequestData>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function fetchRequests() {
      setLoading(true);
      try {
        const data = await getAdminDeliveryRequests(status);
        if (!cancelled) setRequests(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchRequests();
    return () => { cancelled = true; };
  }, [status]);
  return { requests, loading };
}

export function useDeliveryPairs(status?: DeliveryPairStatus) {
  const [pairs, setPairs] = useState<PairData>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function fetchPairs() {
      setLoading(true);
      try {
        const data = await getAdminDeliveryPairs(status);
        if (!cancelled) setPairs(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchPairs();
    return () => { cancelled = true; };
  }, [status]);
  return { pairs, loading };
}
