"use client";

import { useCallback, useEffect, useState } from "react";
import { repGetInventory, repGetOrders } from "@/app/representative/actions";

type RepOrders = Awaited<ReturnType<typeof repGetOrders>>;
type RepInventory = Awaited<ReturnType<typeof repGetInventory>>;

export function useRepOrders(_outlet: string) {
  const [orders, setOrders] = useState<RepOrders>([]);
  const [loading, setLoading] = useState(true);
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await repGetOrders());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchOrders(); }, [fetchOrders]);
  return { orders, loading, refetch: fetchOrders };
}

export function useRepInventory(_outlet: string) {
  const [inventory, setInventory] = useState<RepInventory>([]);
  const [loading, setLoading] = useState(true);
  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      setInventory(await repGetInventory());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchInventory(); }, [fetchInventory]);
  return { inventory, loading, refetch: fetchInventory };
}
