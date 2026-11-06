// Shared search rules. This module is safe to import in the browser.
import type { StoreProduct } from "../types";

export const STORE_SEARCH_MIN_LENGTH = 2;
export const STORE_SEARCH_MAX_LENGTH = 100;
export const STORE_SEARCH_PAGE_SIZE = 24;

export interface StoreSearchPage {
  products: StoreProduct[];
  nextOffset: number | null;
}

export function normalizeStoreSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, STORE_SEARCH_MAX_LENGTH).trim().toLowerCase();
}

export function isStoreSearchQuery(query: string): boolean {
  return query.length >= STORE_SEARCH_MIN_LENGTH && /[\p{L}\p{N}]/u.test(query);
}

/** Keep customer input literal instead of letting SQL wildcards fetch the catalog. */
export function storeSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_*]/g, "\\$&")}%`;
}

/** Quoted PostgREST values also protect commas, parentheses, and double quotes. */
export function relatedStoreSearchFilter(query: string): string {
  return Array.from(new Set(query.split(" ").filter(Boolean))).flatMap((term) =>
    ["name", "category", "description"].map((column) =>
      `${column}.ilike.${JSON.stringify(storeSearchPattern(term))}`
    )
  ).join(",");
}

export function hasAvailableStock(product: Pick<StoreProduct, "outletStock">): boolean {
  return Object.values(product.outletStock).some((quantity) => quantity > 0);
}

export function productSearchScore(product: StoreProduct, query: string): number {
  const terms = normalizeStoreSearch(query).split(" ").filter(Boolean);
  const name = product.name.toLowerCase();
  const searchable = [
    product.name,
    product.category,
    product.description,
    product.tagline,
    product.scentNotesTop,
    product.scentNotesHeart,
    product.scentNotesBase,
  ].filter(Boolean).join(" ").toLowerCase();

  return terms.reduce((score, term) => {
    const word = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (name === term) return score + 100;
    if (word.test(name)) return score + 85;
    if (name.startsWith(term)) return score + 60;
    if (name.includes(term)) return score + 40;
    if (word.test(searchable)) return score + 20;
    if (searchable.includes(term)) return score + 8;
    return score;
  }, 0);
}
