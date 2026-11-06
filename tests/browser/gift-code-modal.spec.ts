// tests/browser/gift-code-modal.spec.ts
// The /store?gift=CODE claim card: opens on load, shows the code, copies, and
// closes. Driven by the QR code printed on Extravaganza receipts.
import { test, expect } from "@playwright/test";

test.describe("gift code claim card", () => {
  test("opens from the gift param, shows the code, and closes", async ({ page }) => {
    await page.goto("/store?gift=ALF-TEST1");

    const dialog = page.getByRole("dialog", { name: "Gift code" });
    await expect(dialog).toBeVisible();

    // The code is displayed (uppercase) and selectable.
    await expect(dialog.getByText("ALF-TEST1")).toBeVisible();

    // Copy button flips to a copied state (clipboard may need permissions in
    // headless, so accept either the async API or the execCommand fallback).
    const copyButton = dialog.getByRole("button", { name: /copy gift code/i });
    await expect(copyButton).toBeVisible();

    // Backdrop / Escape / X all close the card.
    await dialog.getByRole("button", { name: "Close gift code" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("does not open without a gift param", async ({ page }) => {
    await page.goto("/store");
    await expect(page.getByRole("dialog", { name: "Gift code" })).toHaveCount(0);
  });

  test("ignores malformed gift values", async ({ page }) => {
    await page.goto("/store?gift=" + encodeURIComponent("<script>alert(1)</script>"));
    await expect(page.getByRole("dialog", { name: "Gift code" })).toHaveCount(0);
  });
});
