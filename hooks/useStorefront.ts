// hooks/useStorefront.ts
"use client";

import { useEffect, useState } from "react";
import { masterClient, unilorinClient, tankeClient } from "@/lib/supabase/client";
import type { ProductDiscountFields } from "@/lib/types";

// The full-catalog hooks that used to live here (useProducts,
// useRandomFeatured) were removed: they fetched the entire catalog from every
// visitor's browser, which pushed the Master project over its Cached Egress
// quota. That data now flows from the server-side cache in
// lib/storefront/data.ts via page props.

interface Product extends ProductDiscountFields {
  id: string;
  name: string;
  category: string;
  description: string | null;
  base_image_url: string | null;
  price: number;
}

interface ProductWithInventory extends Product {
  unilorin: Array<{ grade: string; quantity: number; price: number }>;
  tanke: Array<{ grade: string; quantity: number; price: number }>;
}

export function useProductWithInventory(productId: string) {
  const [data, setData] = useState<ProductWithInventory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [{ data: product }, { data: uInv }, { data: tInv }] = await Promise.all([
        masterClient.from('products').select('*').eq('id', productId).single(),
        unilorinClient.from('inventory').select('*').eq('product_id', productId),
        tankeClient.from('inventory').select('*').eq('product_id', productId),
      ]);

      setData({
        ...product,
        unilorin: uInv ?? [],
        tanke: tInv ?? []
      });
      setLoading(false);
    }
    fetch();
  }, [productId]);

  return { data, loading };
}
