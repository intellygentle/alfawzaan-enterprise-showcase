import assert from "node:assert/strict";
import test from "node:test";
import { getInStockProductIds, mergeInventoryWithProducts } from "../../lib/inventory";
import {
  hasAvailableStock,
  isStoreSearchQuery,
  normalizeStoreSearch,
  productSearchScore,
  relatedStoreSearchFilter,
  storeSearchPattern,
} from "../../lib/storefront/search";

const catalog = ["available", "empty", "reserved", "missing"].map((id) => ({
  id, name: `Amber ${id}`, category: "100MLs", price: 10000, base_image_url: null,
}));
const shelf = (product_id: string, quantity: number, reserved_quantity = 0, grade = "normal") => ({
  product_id, quantity, reserved_quantity, grade, price: 10000,
});
const unilorin = [shelf("available", 6, 2), shelf("empty", 0), shelf("reserved", 3, 3)];
const tanke = [shelf("available", 5, 0, "special"), shelf("available", 2), shelf("reserved", 2, 4)];

test("browsing fetches only products with usable stock, excluding zero, reserved, and missing inventory", () => {
  assert.deepEqual(getInStockProductIds(unilorin, tanke), ["available"]);
  const products = mergeInventoryWithProducts(catalog, unilorin, tanke);
  assert.deepEqual(products.map((product) => product.id), ["available"]);
  // Keep the largest fulfilable shelf, rather than adding incompatible grades.
  assert.deepEqual(products[0].outletStock, { Unilorin: 4, Tanke: 5 });
  assert.equal(products[0].grade, "Special");
  assert.equal(hasAvailableStock(products[0]), true);
  assert.deepEqual(getInStockProductIds([], []), []);
});

test("explicit search retains sold-out goods with no purchasable availability", () => {
  const products = mergeInventoryWithProducts(catalog, unilorin, tanke, { includeOutOfStock: true });
  assert.equal(products.length, 4);
  for (const product of products.slice(1)) {
    assert.deepEqual(product.outlets, []);
    assert.deepEqual(product.outletStock, {});
    assert.equal(hasAvailableStock(product), false);
    assert.equal(product.price, 10000);
    assert.equal(product.imageUrl, "/6539650.jpg");
  }
});

test("restocking either boutique makes a previously sold-out good eligible for browsing", () => {
  const restocked = [...tanke, shelf("empty", 1)];
  assert.deepEqual(getInStockProductIds(unilorin, restocked), ["available", "empty"]);
  const product = mergeInventoryWithProducts(catalog, unilorin, restocked).find((item) => item.id === "empty");
  assert.ok(product);
  assert.deepEqual(product.outletStock, { Tanke: 1 });
});

test("empty, one-character, and wildcard-only searches cannot trigger catalog reads", () => {
  for (const query of ["", "   ", "a", "%", "%%", "__", "**", "[]", "()", "\\"]) {
    assert.equal(isStoreSearchQuery(normalizeStoreSearch(query)), false, query);
  }
  assert.equal(normalizeStoreSearch("  AMBER   Oud  "), "amber oud");
  assert.equal(normalizeStoreSearch("a".repeat(150)).length, 100);
  assert.equal(normalizeStoreSearch("a ".repeat(100)).endsWith(" "), false);
  assert.equal(isStoreSearchQuery(normalizeStoreSearch("  Oud  ")), true);
});

test("search treats SQL wildcards and PostgREST filter punctuation as literal input", () => {
  assert.equal(storeSearchPattern("50%_oud\\"), "%50\\%\\_oud\\\\%");
  const input = 'oud),id.not.is.null,"';
  const filter = relatedStoreSearchFilter(input);
  assert.equal(filter, 'name.ilike."%oud),id.not.is.null,\\\"%",category.ilike."%oud),id.not.is.null,\\\"%",description.ilike."%oud),id.not.is.null,\\\"%"');
  assert.equal(relatedStoreSearchFilter("amber amber "), relatedStoreSearchFilter("amber"));
});

test("related scoring finds distinctive name tokens and handles regex punctuation safely", () => {
  const [product] = mergeInventoryWithProducts(
    [{ ...catalog[0], name: "Khamrah Waha 100ml", description: "A warm fragrance by Lattafa." }],
    unilorin, tanke,
  );
  const unrelated = { ...product, name: "Other fragrance", description: "By Lattafa" };
  assert.ok(productSearchScore(product, "Lattafa Waha") > productSearchScore(unrelated, "Lattafa Waha"));
  for (const query of ["[", "(", "oud.*", "a+b", "\\", "${}"]) {
    assert.doesNotThrow(() => productSearchScore(product, query));
  }
  assert.equal(productSearchScore(product, "waha.*"), 0);
});
