"use client";

import { useEffect, useState, useCallback } from "react";
import { getAdminAuditLogs, getAdminLowStock, getAdminLowStockCount, getAdminPendingOrderCount, getAdminPendingOrders, getOpenSalesFlagCount } from "@/app/admin/dashboard/actions";

export interface LowStockItem {
  product_id: string;
  grade: string;
  quantity: number;
  outlet: string;
  products?: { name: string };
}

export function useLowStock(threshold = 3, enabled = true) {
  const [alerts, setAlerts] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      setAlerts(await getAdminLowStock(threshold));
    } catch (err) {
      console.error("Failed to fetch low stock:", err);
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    if (!enabled) return;
    fetchLowStock();
  }, [enabled, fetchLowStock]);

  return { alerts, loading, refetch: fetchLowStock };
}

interface PendingOrder {
  id: string;
  customer_name: string | null;
  customer_phone: string;
  outlet: string;
  total_amount: number;
  whatsapp_link: string;
  status: string;
  notes: string | null;
  created_at: string;
  order_items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    grade: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    outlet: string;
  }>;
}

export function usePendingOrders(enabled = true) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function fetchOrders() {
      setError(null);
      try {
        const data = await getAdminPendingOrders();
        if (!cancelled) setOrders(data);
      } catch (err) {
        // Never leave the Orders tab stuck on "Loading..." when the
        // archive fetch fails.
        console.error("Failed to fetch pending orders:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load pending orders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOrders();
    const interval = setInterval(() => { void fetchOrders(); }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return { orders, loading, error };
}

export function usePendingOrderCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const nextCount = await getAdminPendingOrderCount();
        if (!cancelled) setCount(nextCount);
      } catch (err) {
        // The login gate may still be establishing the session on first render.
        console.error("Failed to fetch pending order count:", err);
      }
    }
    void fetchCount();
    const interval = setInterval(() => { void fetchCount(); }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return count;
}

export function useLowStockCount(threshold = 3) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const nextCount = await getAdminLowStockCount(threshold);
        if (!cancelled) setCount(nextCount);
      } catch (err) {
        console.error("Failed to fetch low-stock count:", err);
      }
    }
    void fetchCount();
    const interval = setInterval(() => { void fetchCount(); }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [threshold]);

  return count;
}

/**
 * Polls the number of open discrepancy flags so the Flagged Goods tab can nag
 * the admin with a badge until the mismatches are resolved.
 */
export function useOpenFlagCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const nextCount = await getOpenSalesFlagCount();
        if (!cancelled) setCount(nextCount);
      } catch (err) {
        console.error("Failed to fetch open flag count:", err);
      }
    }
    void fetchCount();
    const interval = setInterval(() => { void fetchCount(); }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return count;
}

interface AuditLogEntry {
  id: string;
  action: string;
  product_id: string | null;
  details: string | null;
  admin_id: string;
  outlet: string | null;
  created_at: string;
}

export function useAuditLogs(limit = 50, enabled = true) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function fetchLogs() {
      try {
        const data = await getAdminAuditLogs(limit);
        if (!cancelled) setLogs(data);
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
      }
    }
    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [enabled, limit]);
  
  return logs;
}
