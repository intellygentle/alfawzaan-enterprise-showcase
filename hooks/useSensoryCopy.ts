// hooks/useSensoryCopy.ts
// Client hook for fetching AI-generated sensory copy

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ScentNotes {
  top: string;
  heart: string;
  base: string;
}

interface SensoryCopyData {
  copy: string;
  scentNotes: ScentNotes;
  tagline: string;
}

interface UseSensoryCopyResult {
  data: SensoryCopyData | null;
  loading: boolean;
  error: string | null;
}

// Client-side cache to avoid re-fetching during the same session
const clientCache = new Map<string, SensoryCopyData>();

export function useSensoryCopy(
  productName: string | null,
  category?: string
): UseSensoryCopyResult {
  const [data, setData] = useState<SensoryCopyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCopy = useCallback(async (name: string, cat?: string) => {
    // Check client cache first
    const cacheKey = name.toLowerCase().trim();
    const cached = clientCache.get(cacheKey);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    // Abort previous request if still pending
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sensory-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: name, category: cat }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to generate copy");
      }

      const result: SensoryCopyData = await response.json();

      // Cache on client
      clientCache.set(cacheKey, result);

      setData(result);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Failed to generate copy");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!productName) {
      setData(null);
      return;
    }

    fetchCopy(productName, category);

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [productName, category, fetchCopy]);

  return { data, loading, error };
}
