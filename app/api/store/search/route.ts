import { NextRequest, NextResponse } from "next/server";
import { searchStoreProducts } from "@/lib/storefront/data";
import { isStoreSearchQuery, normalizeStoreSearch, STORE_SEARCH_PAGE_SIZE } from "@/lib/storefront/search";

// Database reads are shared through the tagged server cache. Keep HTTP
// responses fresh so catalog/stock invalidation also applies to repeated searches.
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const query = normalizeStoreSearch(request.nextUrl.searchParams.get("q") ?? "");
  if (!isStoreSearchQuery(query)) {
    return NextResponse.json({ products: [], nextOffset: null }, { headers });
  }

  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % STORE_SEARCH_PAGE_SIZE !== 0) {
    return NextResponse.json({ error: "Invalid search page" }, { status: 400, headers });
  }

  try {
    return NextResponse.json(await searchStoreProducts(query, offset), { headers });
  } catch {
    return NextResponse.json({ error: "Unable to search products" }, { status: 500, headers });
  }
}
