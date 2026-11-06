"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreProduct } from "@/lib/types";
import { isStoreSearchQuery, normalizeStoreSearch, type StoreSearchPage } from "@/lib/storefront/search";

interface SearchState {
  query: string;
  products: StoreProduct[];
  nextOffset: number | null;
  offset: number;
  loading: boolean;
  error: boolean;
}

const EMPTY_SEARCH: SearchState = {
  query: "", products: [], nextOffset: null, offset: 0, loading: false, error: false,
};

/** Sold-out goods stay outside the initial catalog and its background refresh. */
export function useStoreSearch(value: string, enabled: boolean) {
  const query = normalizeStoreSearch(value);
  const searchable = enabled && isStoreSearchQuery(query);
  const [state, setState] = useState<SearchState>(EMPTY_SEARCH);
  const controllerRef = useRef<AbortController | null>(null);

  const requestPage = useCallback(async (query: string, offset: number, signal: AbortSignal) => {
    if (signal.aborted) return;
    setState((previous) => ({
      query,
      products: offset > 0 && previous.query === query ? previous.products : [],
      nextOffset: offset > 0 ? previous.nextOffset : null,
      offset,
      loading: true,
      error: false,
    }));

    try {
      const response = await fetch(`/api/store/search?q=${encodeURIComponent(query)}&offset=${offset}`, { signal });
      if (!response.ok) throw new Error("Search failed");
      const page: StoreSearchPage = await response.json();
      if (signal.aborted) return;
      setState((previous) => {
        if (previous.query !== query) return previous;
        const products = offset === 0 ? page.products : Array.from(new Map(
          [...previous.products, ...page.products].map((product) => [product.id, product])
        ).values());
        return { query, products, nextOffset: page.nextOffset, offset, loading: false, error: false };
      });
    } catch {
      if (!signal.aborted) {
        setState((previous) => previous.query === query
          ? { ...previous, loading: false, error: true }
          : previous);
      }
    }
  }, []);

  useEffect(() => {
    if (!searchable) {
      setState(EMPTY_SEARCH);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ ...EMPTY_SEARCH, query, loading: true });
    const timer = setTimeout(() => {
      void requestPage(query, 0, controller.signal);
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
      controllerRef.current = null;
    };
  }, [query, searchable, requestPage]);

  const current = searchable && state.query === query;

  function loadMore() {
    if (!current || state.loading || state.nextOffset === null || !controllerRef.current) return;
    void requestPage(query, state.nextOffset, controllerRef.current.signal);
  }

  function retry() {
    if (!current || state.loading || !controllerRef.current) return;
    void requestPage(query, state.offset, controllerRef.current.signal);
  }

  return {
    products: current ? state.products : [],
    loading: searchable && (!current || state.loading),
    error: current && state.error,
    hasMore: current && state.nextOffset !== null,
    loadMore,
    retry,
  };
}
