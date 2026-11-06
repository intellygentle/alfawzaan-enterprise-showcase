// lib/tinyfish.ts
// TinyFish API client for real-time web search and content fetching

const TINYFISH_BASE = "https://api.search.tinyfish.ai";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

/**
 * Search the web using TinyFish Search API
 * Returns structured search results with titles, snippets, and URLs
 */
export async function tinyfishSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `${TINYFISH_BASE}/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      return [];
    }

    const text = await response.text();
    if (!text || text.length < 10) {
      return [];
    }

    const data = JSON.parse(text);
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * Fetch and render a URL using TinyFish Fetch API
 * Returns clean, token-efficient content (Markdown)
 */
export async function tinyfishFetch(url: string): Promise<string> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return "";
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `${TINYFISH_BASE}/fetch?url=${encodeURIComponent(url)}`,
      {
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return "";
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json") && !contentType.includes("text")) {
      return "";
    }

    const text = await response.text();
    if (!text || text.length < 10) {
      return "";
    }

    const data = JSON.parse(text);
    const content = data.content || data.markdown || data.text || "";

    // Validate content is readable text (not binary/garbled)
    if (typeof content !== "string" || /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 100))) {
      return "";
    }

    return content.slice(0, 2000);
  } catch {
    return "";
  }
}

/**
 * Research a perfume product using TinyFish
 * Combines scent data search + experiential review search for richer AI copy
 */
export async function researchPerfume(productName: string, category: string) {
  // Run two searches in parallel: scent data + experiential reviews
  const [scentResults, reviewResults] = await Promise.all([
    tinyfishSearch(`${productName} perfume fragrance scent notes accords review`),
    tinyfishSearch(`${productName} fragrance review compliments longevity projection`),
  ]);

  const allResults = [...scentResults, ...reviewResults];
  if (allResults.length === 0) {
    return { searchResults: [], fetchedContent: "" };
  }

  // Fetch detailed content from top result of each search (up to 2 fetches)
  const fetchTargets = [
    scentResults[0]?.url,
    reviewResults[0]?.url,
  ].filter(Boolean) as string[];

  // Deduplicate URLs
  const uniqueUrls = [...new Set(fetchTargets)].slice(0, 2);
  const fetchedContents = await Promise.all(
    uniqueUrls.map((url) => tinyfishFetch(url))
  );

  return {
    searchResults: allResults.slice(0, 5),
    fetchedContent: fetchedContents.filter(Boolean).join("\n\n---\n\n").slice(0, 3000),
  };
}
