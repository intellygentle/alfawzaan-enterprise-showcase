"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminInventory as getAdminInventoryAction } from "@/app/admin/dashboard/actions";
import type { AdminInventoryItem } from "@/lib/types";

export type { AdminInventoryItem };

export function useAdminInventory(enabled = true) {
  const [data, setData] = useState<AdminInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const inventory = await getAdminInventoryAction();
      setData(inventory as AdminInventoryItem[]);
    } catch (error) {
      console.error("Failed to fetch admin inventory:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void fetchInventory();
  }, [enabled, fetchInventory]);

  return { data, loading, refetch: fetchInventory };
}
