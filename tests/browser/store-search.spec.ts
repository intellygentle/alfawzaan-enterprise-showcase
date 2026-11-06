import { expect, test } from "@playwright/test";
import type { StoreProduct } from "../../lib/types";

const soldOut: StoreProduct = {
  id: "search-only-fixture",
  name: "Stockprobe Amber",
  category: "100MLs",
  price: 12000,
  grade: "Normal",
  outlets: [],
  outletStock: {},
  imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E",
};

test.beforeEach(async ({ page }) => {
  // These checks exercise search, not photography. Avoid storage egress while
  // rendering the real page's initial in-stock catalog.
  await page.route("**/_next/image?*", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64"),
  }));
});

test("sold-out goods are requested only for a debounced search and disappear when cleared", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/store/search?*", (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({ json: { products: [soldOut], nextOffset: null } });
  });

  await page.goto("/store");
  await expect(page.getByRole("heading", { name: "The Collection" })).toBeVisible();
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("Sort products").selectOption("price-asc");
  await page.getByRole("button", { name: "100MLs", exact: true }).click();
  const search = page.getByPlaceholder("Search perfumes, oils...");
  await search.fill("s");
  await page.waitForTimeout(450);
  await search.fill("   ");
  await page.waitForTimeout(450);
  expect(queries).toEqual([]);

  await search.fill("stockp");
  await search.fill("Stockprobe");
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `${soldOut.name} is out of stock` })).toBeDisabled();
  await expect(page.getByRole("option", { name: /Stockprobe Amber.*Out of stock/i })).toBeVisible();
  expect(queries).toEqual(["stockprobe"]);

  await search.fill("");
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toHaveCount(0);
  await page.waitForTimeout(450);
  expect(queries).toEqual(["stockprobe"]);
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(0);
});

test("search links include sold-out goods and In Stock Only stops further catalog searches", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/store/search?*", (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({ json: { products: [soldOut], nextOffset: null } });
  });
  await page.goto("/store?search=Stockprobe");
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "In Stock Only", exact: true }).click();
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Search perfumes, oils...").fill("Stockprobe Amber");
  await page.waitForTimeout(450);
  expect(queries).toEqual(["stockprobe"]);
  await page.getByRole("button", { name: "In Stock Only", exact: true }).click();
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toBeVisible();
  expect(queries).toEqual(["stockprobe", "stockprobe amber"]);
});

test("additional sold-out matches load only on request and restart at page one for a new search", async ({ page }) => {
  const offsets: number[] = [];
  const firstPage = Array.from({ length: 24 }, (_, index) => ({
    ...soldOut, id: `sold-out-${index}`, name: `Stockprobe ${index + 1}`,
  }));
  await page.route("**/api/store/search?*", (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset"));
    offsets.push(offset);
    return route.fulfill({ json: offset === 0
      ? { products: firstPage, nextOffset: 24 }
      : { products: [firstPage[0], { ...soldOut, name: "Stockprobe 25" }], nextOffset: null },
    });
  });
  await page.goto("/store?search=Stockprobe");
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(24);
  expect(offsets).toEqual([0]);
  await page.getByRole("button", { name: "Load more search results" }).click();
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(25);
  expect(offsets).toEqual([0, 24]);
  await expect(page.getByRole("button", { name: "Load more search results" })).toHaveCount(0);

  await page.getByRole("combobox").fill("");
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(0);
  await page.getByRole("combobox").fill("stockprobe");
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(24);
  expect(offsets).toEqual([0, 24, 0]);
});

test("a late response cannot restore cleared or superseded sold-out results", async ({ page }) => {
  let releaseSlow: () => void = () => {};
  const slowResponse = new Promise<void>((resolve) => { releaseSlow = resolve; });
  await page.route("**/api/store/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "stockprobeslow") await slowResponse;
    await route.fulfill({ json: {
      products: [{ ...soldOut, name: query === "stockprobeslow" ? "Stockprobeslow Amber" : "Stockprobefast Amber" }],
      nextOffset: null,
    } }).catch(() => {}); // The older browser request may already be aborted.
  });
  await page.goto("/store");
  const slowRequest = page.waitForRequest("**/api/store/search?q=stockprobeslow&offset=0");
  await page.getByRole("combobox").fill("stockprobeslow");
  await slowRequest;
  await page.getByRole("combobox").fill("");
  await page.getByRole("combobox").fill("stockprobefast");
  await expect(page.getByRole("heading", { name: "Stockprobefast Amber" })).toBeVisible();
  releaseSlow();
  await page.waitForTimeout(450);
  await expect(page.getByRole("heading", { name: "Stockprobeslow Amber" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Stockprobefast Amber" })).toBeVisible();
  await page.getByRole("combobox").fill("");
  await expect(page.getByRole("button", { name: /is out of stock/i })).toHaveCount(0);
});

test("failed catalog searches offer a retry without claiming the item does not exist", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/store/search?*", (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 500, json: { error: "Unavailable" } })
      : route.fulfill({ json: { products: [soldOut], nextOffset: null } });
  });
  await page.goto("/store?search=Stockprobe");
  const searchError = page.getByRole("alert").filter({ hasText: "Some search results may be missing" });
  await expect(searchError).toBeVisible();
  await expect(page.getByRole("heading", { name: "No products found" })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: soldOut.name, exact: true })).toBeVisible();
  await expect(searchError).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("the search endpoint rejects broad empty searches and invalid pagination", async ({ request }) => {
  for (const query of ["", "   ", "a", "%%", "__", "**"]) {
    const response = await request.get(`/api/store/search?q=${encodeURIComponent(query)}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ products: [], nextOffset: null });
  }
  for (const offset of ["-24", "1", "NaN"]) {
    const response = await request.get(`/api/store/search?q=stockprobe&offset=${offset}`);
    expect(response.status()).toBe(400);
  }
});
