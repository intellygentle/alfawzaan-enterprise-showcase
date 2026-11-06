"use client";

import { useEffect, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { masterClient, unilorinClient, tankeClient } from "@/lib/supabase/client";
import { resolveActiveDiscount } from "@/lib/types";
import type { StoreProduct } from "@/lib/types";

type SetProducts = React.Dispatch<React.SetStateAction<StoreProduct[]>>;

interface InventoryChange {
  product_id: string;
  grade: string;
  quantity: number;
  reserved_quantity: number;
}

/**
 * Subscribes to real-time inventory changes on both outlet databases.
 * Updates the local products state when stock levels change.
 */
export function useInventorySubscription(
  products: StoreProduct[],
  setProducts: SetProducts
) {
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);
  const applyOutletAvailability = useCallback(
    (outletName: string, productId: string, rows: Array<{ quantity: number; reserved_quantity: number | null }>) => {
      const available = rows.reduce(
        (largest, shelf) => Math.max(largest, Math.max(0, shelf.quantity - (shelf.reserved_quantity ?? 0))),
        0,
      );

      setProducts((prev) => prev.map((product) => {
        if (product.id !== productId) return product;
        const outletStock = { ...product.outletStock };
        if (available <= 0) delete outletStock[outletName];
        else outletStock[outletName] = available;
        return { ...product, outletStock, outlets: Object.keys(outletStock) };
      }));
    },
    [setProducts],
  );

  const refreshProduct = useCallback(async (client: SupabaseClient, outletName: string, productId: string) => {
    const { data, error } = await client
      .from("inventory")
      .select("quantity, reserved_quantity")
      .eq("product_id", productId);
    if (error) {
      console.warn(`[inventory] ${outletName} refresh failed: ${error.message}`);
      return;
    }
    applyOutletAvailability(outletName, productId, data ?? []);
  }, [applyOutletAvailability]);

  const refreshCatalogProduct = useCallback(async (productId: string) => {
    const { data, error } = await masterClient
      .from("products")
      .select("id, name, category, description, base_image_url, price, discount_price, discount_expires_at")
      .eq("id", productId)
      .maybeSingle();
    if (error) {
      console.warn(`[catalog] ${productId} refresh failed: ${error.message}`);
      return;
    }
    setProducts((prev) => {
      if (!data) return prev.filter((product) => product.id !== productId);
      const discount = resolveActiveDiscount(data);
      return prev.map((product) => product.id === productId
        ? {
          ...product,
          name: data.name,
          category: data.category,
          description: data.description ?? undefined,
          price: discount ? discount.discountPrice : Number(data.price ?? 0),
          originalPrice: discount ? Number(data.price ?? 0) : undefined,
          imageUrl: data.base_image_url?.trim() || product.imageUrl,
        }
        : product);
    });
  }, [setProducts]);

  const handleInventoryChange = useCallback(
    async (
      payload: { new: unknown; old: unknown },
      outletName: string,
      client: SupabaseClient,
    ) => {
      const row = (payload.new || payload.old) as InventoryChange | null;
      if (!row || !productsRef.current.some((product) => product.id === row.product_id)) return;

      await refreshProduct(client, outletName, row.product_id);
    },
    [refreshProduct]
  );

  useEffect(() => {
    // Realtime is the primary freshness mechanism. Polling is only a fallback
    // for projects where a publication isn't enabled — it used to run
    // unconditionally every 20s, re-fetching the full catalog and both
    // outlets' inventory per open tab, which pushed the Master project over
    // its Cached Egress quota. Track per-DB subscription health and poll
    // slowly, and only what realtime isn't already covering.
    const realtimeOk = { unilorin: false, tanke: false, master: false };

    // Subscribe to Unilorin inventory changes
    const uChannel = unilorinClient
      .channel("inventory-live-unilorin")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory",
        },
        (payload) => handleInventoryChange(payload, "Unilorin", unilorinClient)
      )
      .subscribe((status) => {
        realtimeOk.unilorin = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") console.log("[inventory] Unilorin realtime connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[inventory] Unilorin realtime unavailable; polling fallback is active");
      });

    // Subscribe to Tanke inventory changes
    const tChannel = tankeClient
      .channel("inventory-live-tanke")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory",
        },
        (payload) => handleInventoryChange(payload, "Tanke", tankeClient)
      )
      .subscribe((status) => {
        realtimeOk.tanke = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") console.log("[inventory] Tanke realtime connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[inventory] Tanke realtime unavailable; polling fallback is active");
      });

    // Master changes carry product names, prices, descriptions, and image URLs.
    const catalogChannel = masterClient
      .channel("catalog-live-master")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          const row = (payload.new || payload.old) as { id?: string } | null;
          if (row?.id && productsRef.current.some((product) => product.id === row.id)) {
            void refreshCatalogProduct(row.id);
          }
        },
      )
      .subscribe((status) => {
        realtimeOk.master = status === "SUBSCRIBED";
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("[catalog] Master realtime unavailable; polling fallback is active");
      });

    // Fallback polling — slow, and only while the matching realtime feed is
    // down. The inventory poll reads each outlet's positive stock in one
    // request rather than .in() with every visible product ID, which built
    // enormous query strings every 20 seconds per visitor.
    const refreshVisibleInventory = async () => {
      for (const [client, outletName] of [[unilorinClient, "Unilorin"], [tankeClient, "Tanke"]] as const) {
        const { data, error } = await client
          .from("inventory")
          .select("product_id, quantity, reserved_quantity")
          .gt("quantity", 0);
        if (error) {
          console.warn(`[inventory] ${outletName} polling unavailable: ${error.message}`);
          continue;
        }
        const byProduct = new Map<string, Array<{ quantity: number; reserved_quantity: number | null }>>();
        for (const row of data ?? []) {
          const rows = byProduct.get(row.product_id) ?? [];
          rows.push(row);
          byProduct.set(row.product_id, rows);
        }
        for (const productId of productsRef.current.map((product) => product.id)) {
          applyOutletAvailability(outletName, productId, byProduct.get(productId) ?? []);
        }
      }
    };
    const refreshVisibleCatalog = async () => {
      const productIds = productsRef.current.map((product) => product.id);
      if (productIds.length === 0) return;
      const byId = new Map<string, { id: string; name: string; category: string; description: string | null; base_image_url: string | null; price: number | null; discount_price: number | null; discount_expires_at: string | null }>();
      for (let offset = 0; offset < productIds.length; offset += 100) {
        const { data, error } = await masterClient
          .from("products")
          .select("id, name, category, description, base_image_url, price, discount_price, discount_expires_at")
          .in("id", productIds.slice(offset, offset + 100));
        if (error) {
          console.warn(`[catalog] polling unavailable: ${error.message}`);
          return;
        }
        for (const product of data ?? []) byId.set(product.id, product);
      }
      setProducts((prev) => prev
        .filter((product) => byId.has(product.id))
        .map((product) => {
          const current = byId.get(product.id);
          if (!current) return product;
          const discount = resolveActiveDiscount(current);
          return {
            ...product,
            name: current.name,
            category: current.category,
            description: current.description ?? undefined,
            price: discount ? discount.discountPrice : Number(current.price ?? 0),
            originalPrice: discount ? Number(current.price ?? 0) : undefined,
            imageUrl: current.base_image_url?.trim() || product.imageUrl,
          };
        }));
    };
    const inventoryTimer = setInterval(() => {
      if (realtimeOk.unilorin && realtimeOk.tanke) return; // realtime is authoritative
      void refreshVisibleInventory();
    }, 60_000);
    const catalogTimer = setInterval(() => {
      if (realtimeOk.master) return;
      void refreshVisibleCatalog();
    }, 300_000);

    return () => {
      unilorinClient.removeChannel(uChannel);
      tankeClient.removeChannel(tChannel);
      masterClient.removeChannel(catalogChannel);
      clearInterval(inventoryTimer);
      clearInterval(catalogTimer);
    };
  }, [products.length, handleInventoryChange, applyOutletAvailability, refreshCatalogProduct, setProducts]);
}
