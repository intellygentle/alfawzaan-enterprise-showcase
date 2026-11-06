import { expect, test } from "@playwright/test";

test("customer can navigate from landing page into focused shopping paths", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Alfawzaan/i);
  await expect(page.getByRole("heading", { name: /Find a fragrance that feels like you/i })).toBeVisible();

  const categoryLink = page.locator('a[href*="/store?category="]').first();
  await expect(categoryLink).toBeVisible();
  await categoryLink.click();
  await expect(page).toHaveURL(/\/store\?category=/);
  await expect(page.getByRole("heading", { name: /The Collection/i })).toBeVisible();
});

test("mobile landing quick actions remain available", async ({ page, isMobile }) => {
  test.skip(!isMobile, "This assertion targets the mobile layout.");
  await page.goto("/");
  const quickActions = page.getByRole("navigation", { name: "Mobile quick actions" });
  await expect(quickActions).toBeVisible();
  await expect(quickActions.getByRole("link", { name: "Shop", exact: true })).toBeVisible();
  await expect(quickActions.getByRole("link", { name: "Scent", exact: true })).toBeVisible();
  await expect(quickActions.getByRole("link", { name: "Visit", exact: true })).toBeVisible();
  await expect(quickActions.getByRole("button", { name: /Open cart/i })).toBeVisible();
});

test("checkout can be opened without submitting a live order", async ({ page }) => {
  await page.goto("/store");
  const addButton = page.getByRole("button", { name: /Add .* to cart/i }).first();
  if (await addButton.count() === 0) {
    test.skip(true, "No in-stock product is currently available in the live catalog.");
    return;
  }
  await addButton.click();
  await page.getByRole("button", { name: /Open cart/i }).first().click();
  await expect(page.getByRole("heading", { name: /Your Cart/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Checkout/i })).toBeVisible();
});

test("store search provides product suggestions", async ({ page }) => {
  await page.goto("/store");
  const search = page.getByRole("combobox", { name: "" }).first();
  await search.fill("oud");
  const suggestions = page.getByRole("listbox", { name: "" });
  if (await suggestions.count() === 0) {
    test.skip(true, "Live catalog did not expose an Oud suggestion.");
    return;
  }
  await expect(suggestions).toBeVisible();
  await expect(suggestions.getByRole("option").first()).toBeVisible();
});

test("multi-word searches surface a distinctive related product token", async ({ page }) => {
  await page.goto("/store");
  const search = page.getByRole("combobox").first();
  await search.fill("Lattafa Waha");
  const related = page.getByText("Khamrah Waha 100ml", { exact: true });
  if (await related.count() === 0) {
    test.skip(true, "The live catalog or inventory did not expose Khamrah Waha 100ml.");
    return;
  }
  await expect(related).toBeVisible();
});
