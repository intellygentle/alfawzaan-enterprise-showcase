// lib/storefront/data.ts
// Server-only cached loaders for the public storefront. Import ONLY from
// server components, route handlers, and server actions — this module reads service keys via
// lib/supabase/server and must never reach the browser.
//
// Why this exists: the storefront used to fetch the full catalog, sensory
// copy, and both outlets' inventory from EVERY visitor's browser, and a 20s
// poll re-fetched it all per open tab. That traffic is what pushed the Master
// project over its Cached Egress quota. These loaders move every read
// server-side behind a shared cache, so Supabase is queried once per
// revalidation window globally instead of once per visitor.

import { unstable_cache } from "next/cache";
import { getMasterServer, getUnilorinServer, getTankeServer } from "@/lib/supabase/server";
import { getInStockProductIds, mergeInventoryWithProducts } from "@/lib/inventory";
import { ADMIN_PHONES, CATEGORIES } from "@/lib/constants";
import { CATALOG_TAG, INVENTORY_TAG } from "@/lib/storefront/revalidate";
import {
  isStoreSearchQuery,
  normalizeStoreSearch,
  relatedStoreSearchFilter,
  storeSearchPattern,
  STORE_SEARCH_PAGE_SIZE,
  type StoreSearchPage,
} from "@/lib/storefront/search";
import type { StoreProduct, ProductDiscountFields } from "@/lib/types";

interface CatalogRow extends ProductDiscountFields {
  id: string;
  name: string;
  category: string;
  description: string | null;
  base_image_url: string | null;
  price: number | null;
  created_at?: string;
}

interface SensoryRow {
  product_name: string;
  tagline: string | null;
  scent_notes_top: string | null;
  scent_notes_heart: string | null;
  scent_notes_base: string | null;
}

interface InventoryRow {
  product_id: string;
  price: number;
  grade: string;
  quantity: number;
  reserved_quantity: number | null;
}

// Only card fields are returned. The default catalog also needs created_at to
// preserve newest-first ordering across bounded ID batches.
const CATALOG_COLUMNS =
  "id, name, category, description, base_image_url, price, discount_price, discount_expires_at";
const CATALOG_BATCH_SIZE = 100;
const SENSORY_BATCH_SIZE = 50;

// Catalog + sensory copy change rarely (admin edits) — 15 minute window, also
// invalidated on demand via CATALOG_TAG from admin actions (price changes,
// discounts, product uploads), which is what shoppers actually see. The window
// is only the backstop for changes that bypass those actions.
const getCachedCatalogBatch = unstable_cache(
  async (productIds: string[]): Promise<CatalogRow[]> => {
    const { data, error } = await getMasterServer()
      .from("products")
      .select(`${CATALOG_COLUMNS}, created_at`)
      .in("id", productIds)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to fetch catalog: ${error.message}`);
    return (data ?? []) as CatalogRow[];
  },
  ["storefront-in-stock-catalog-batch-v1"],
  { revalidate: 900, tags: [CATALOG_TAG] }
);

const getCachedSensoryBatch = unstable_cache(
  async (productSlugs: string[]): Promise<SensoryRow[]> => {
    const { data, error } = await getMasterServer()
      .from("sensory_copy")
      .select("product_name, tagline, scent_notes_top, scent_notes_heart, scent_notes_base")
      .in("product_id", productSlugs);
    // Sensory copy is decorative enrichment — a read failure must not break
    // the store, so return empty and let the render proceed without it.
    if (error) return [];
    return (data ?? []) as SensoryRow[];
  },
  ["storefront-sensory-batch-v1"],
  { revalidate: 900, tags: [CATALOG_TAG] }
);

// Inventory changes constantly (sales, restocks) — 15 minute window, also
// invalidated on demand via INVENTORY_TAG from stock mutations (upsertInventory,
// deductStock, addStockBack), which is what keeps new visitors current after
// admin stock changes. The window is the backstop for anything that bypasses
// those functions (e.g. customer orders reserving stock); 15 minutes plus the
// junk-bot block keeps total worst-case egress well under the Free plan's
// 5 GB/month quota (bots alone were ~100 MB/day of it).
const getCachedUnilorinInventory = unstable_cache(
  async (): Promise<InventoryRow[]> => {
    const { data, error } = await getUnilorinServer()
      .from("inventory")
      .select("product_id, price, grade, quantity, reserved_quantity")
      .gt("quantity", 0);
    if (error) throw new Error(`Failed to fetch Unilorin inventory: ${error.message}`);
    return (data ?? []) as InventoryRow[];
  },
  ["storefront-inventory-unilorin-v1"],
  { revalidate: 900, tags: [INVENTORY_TAG] }
);

const getCachedTankeInventory = unstable_cache(
  async (): Promise<InventoryRow[]> => {
    const { data, error } = await getTankeServer()
      .from("inventory")
      .select("product_id, price, grade, quantity, reserved_quantity")
      .gt("quantity", 0);
    if (error) throw new Error(`Failed to fetch Tanke inventory: ${error.message}`);
    return (data ?? []) as InventoryRow[];
  },
  ["storefront-inventory-tanke-v1"],
  { revalidate: 900, tags: [INVENTORY_TAG] }
);

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size));
  }
  return result;
}

async function getInStockCatalog(uInv: InventoryRow[], tInv: InventoryRow[]): Promise<CatalogRow[]> {
  // Resolve availability first: sold-out / fully reserved product details and
  // images never enter the default catalog cache or the initial page payload.
  const ids = getInStockProductIds(uInv, tInv);
  const pages = await Promise.all(batches(ids, CATALOG_BATCH_SIZE).map((batch) => getCachedCatalogBatch(batch)));
  return pages.flat().sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id)
  );
}

async function getSensoryForProducts(products: CatalogRow[]): Promise<SensoryRow[]> {
  const slugs = Array.from(new Set(products.map((p) =>
    p.name.toLowerCase().replace(/\s+/g, "-")
  ))).sort();
  const pages = await Promise.all(batches(slugs, SENSORY_BATCH_SIZE).map((batch) => getCachedSensoryBatch(batch)));
  return pages.flat();
}

// Search pages are cached by normalized query + offset, and are never read by
// default browsing. A one-row lookahead keeps responses small without a count
// query; further matches are fetched only when the shopper asks for more.
const getCachedSearchCatalog = unstable_cache(
  async (query: string, offset: number, mode: "name" | "related"): Promise<CatalogRow[]> => {
    let request = getMasterServer().from("products").select(CATALOG_COLUMNS);
    request = mode === "name"
      ? request.ilike("name", storeSearchPattern(query))
      : request.or(relatedStoreSearchFilter(query));
    const { data, error } = await request
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + STORE_SEARCH_PAGE_SIZE);
    if (error) throw new Error(`Failed to search catalog: ${error.message}`);
    return (data ?? []) as CatalogRow[];
  },
  ["storefront-search-catalog-v1"],
  { revalidate: 900, tags: [CATALOG_TAG] }
);

/** Matching catalog products, including sold-out goods, loaded only on search. */
export async function searchStoreProducts(value: string, offset = 0): Promise<StoreSearchPage> {
  const query = normalizeStoreSearch(value);
  if (!isStoreSearchQuery(query)) return { products: [], nextOffset: null };

  // Name matches take precedence over broad description/category matches, so
  // an older exact product cannot be buried behind newer related fragrances.
  const firstNamePage = await getCachedSearchCatalog(query, 0, "name");
  const page = firstNamePage.length > 0
    ? offset === 0 ? firstNamePage : await getCachedSearchCatalog(query, offset, "name")
    : await getCachedSearchCatalog(query, offset, "related");
  const catalog = page.slice(0, STORE_SEARCH_PAGE_SIZE);
  if (catalog.length === 0) return { products: [], nextOffset: null };

  const [sensory, uInv, tInv] = await Promise.all([
    getSensoryForProducts(catalog),
    getCachedUnilorinInventory(),
    getCachedTankeInventory(),
  ]);
  return {
    products: attachSensory(
      mergeInventoryWithProducts(catalog, uInv, tInv, { includeOutOfStock: true }),
      sensory,
    ),
    nextOffset: page.length > STORE_SEARCH_PAGE_SIZE ? offset + STORE_SEARCH_PAGE_SIZE : null,
  };
}

function attachSensory(products: StoreProduct[], sensory: SensoryRow[]): StoreProduct[] {
  const sensoryMap = new Map<string, SensoryRow>();
  for (const row of sensory) {
    sensoryMap.set(row.product_name.toLowerCase().replace(/\s+/g, "-"), row);
  }
  return products.map((p) => {
    const s = sensoryMap.get(p.name.toLowerCase().replace(/\s+/g, "-"));
    return {
      ...p,
      tagline: s?.tagline ?? undefined,
      scentNotesTop: s?.scent_notes_top ?? undefined,
      scentNotesHeart: s?.scent_notes_heart ?? undefined,
      scentNotesBase: s?.scent_notes_base ?? undefined,
    };
  });
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * The full in-stock storefront catalog with sensory enrichment and active
 * discounts already resolved. Backs the /store page.
 */
export async function getStoreProducts(): Promise<StoreProduct[]> {
  const [uInv, tInv] = await Promise.all([
    getCachedUnilorinInventory(),
    getCachedTankeInventory(),
  ]);
  const catalog = await getInStockCatalog(uInv, tInv);
  const sensory = await getSensoryForProducts(catalog);
  const merged = mergeInventoryWithProducts(catalog, uInv, tInv);
  return attachSensory(merged, sensory);
}

/**
 * A deterministic hourly rotating featured set, as the landing page's
 * `useRandomFeatured` hook used to compute client-side — now server-side.
 */
export async function getFeaturedProducts(count: number): Promise<StoreProduct[]> {
  const products = await getStoreProducts();
  const hourlySeed = Math.floor(Date.now() / (1000 * 60 * 60));
  return seededShuffle(products, hourlySeed).slice(0, count);
}

/**
 * One representative image URL per category, for the landing page cards.
 */
export const getCategoryImageMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const [uInv, tInv] = await Promise.all([
      getCachedUnilorinInventory(),
      getCachedTankeInventory(),
    ]);
    const catalog = await getInStockCatalog(uInv, tInv);

    const categoryMap: Record<string, string[]> = {};
    for (const p of catalog) {
      if (p.base_image_url && CATEGORIES.includes(p.category as (typeof CATEGORIES)[number])) {
        if (!categoryMap[p.category]) categoryMap[p.category] = [];
        categoryMap[p.category].push(p.base_image_url);
      }
    }

    const result: Record<string, string> = {};
    for (const cat of CATEGORIES) {
      const images = categoryMap[cat];
      if (images && images.length > 0) {
        result[cat] = images[Math.floor(Math.random() * images.length)];
      }
    }
    return result;
  },
  ["storefront-category-images-v2"],
  { revalidate: 900, tags: [CATALOG_TAG, INVENTORY_TAG] }
);

/**
 * Total catalog size for the landing page stats.
 */
export const getProductCount = unstable_cache(
  async (): Promise<number> => {
    const { count, error } = await getMasterServer()
      .from("products")
      .select("id", { count: "exact", head: true });
    if (error) return 0;
    return count ?? 0;
  },
  ["storefront-product-count-v1"],
  { revalidate: 900, tags: [CATALOG_TAG] }
);

/**
 * Outlet WhatsApp numbers. Env-only — no Supabase read, but server-side it
 * saves the per-visitor server-action round trip the landing page used to make.
 */
export function getStorePhones(): Record<string, string> {
  return ADMIN_PHONES;
}
