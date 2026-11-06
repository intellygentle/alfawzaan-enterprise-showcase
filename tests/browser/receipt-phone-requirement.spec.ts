// tests/browser/receipt-phone-requirement.spec.ts
// When a visitor toggles "I want a receipt" at checkout, the order flow must
// not proceed without a WhatsApp number — the store sends the VERIFIED
// receipt to that number after verifying, so it is required at order time.
import { test, expect } from "@playwright/test";

test("receipt request makes the WhatsApp number required at checkout", async ({ page }) => {
  await page.goto("/store");

  // Add the first in-stock product to the cart.
  const addToCart = page.getByRole("button", { name: /add .* to cart/i }).first();
  await addToCart.waitFor({ state: "visible", timeout: 30_000 });
  await addToCart.click();

  // Open the cart (navbar button) and expand the checkout panel.
  await page.getByRole("navigation").getByRole("button", { name: /open cart/i }).click();
  await page.getByRole("button", { name: /checkout/i }).click();

  // The item needs a pickup outlet before the per-outlet payment cards (and
  // the receipt toggle) render. Pick the first offered outlet.
  const outletButton = page.getByRole("button", { name: /^select (unilorin|tanke) for /i }).first();
  if (await outletButton.isVisible().catch(() => false)) {
    await outletButton.click();
  }

  // The receipt toggle and phone field live in the expanded panel.
  const receiptToggle = page.getByLabel("I want a receipt");
  await expect(receiptToggle).toBeVisible({ timeout: 10_000 });
  await receiptToggle.check();

  // The phone field is now flagged as required.
  await expect(page.getByPlaceholder("Your WhatsApp number (required)")).toBeVisible();

  // Fill the receiver name but leave the phone empty. The client-side gate
  // must block the send with the WhatsApp-number error BEFORE any order is
  // placed (the "— Sent" success state must not appear).
  await page.getByPlaceholder("Receipt receiver name").fill("Test Customer");
  await page.getByRole("button", { name: /i have paid/i }).first().click();

  // The send button's label is "Send {outlet} order via WhatsApp — ₦…" on
  // wide screens and the shorter "Send {outlet} — ₦…" on mobile.
  const sendButton = page.getByRole("button", { name: /^send .*(order via whatsapp|—)/i }).first();
  await expect(sendButton).toBeVisible();
  await sendButton.click();

  await expect(page.getByText(/enter your whatsapp number/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/— sent/i)).toHaveCount(0);
});

test("phone field is optional when no receipt is requested", async ({ page }) => {
  await page.goto("/store");

  const addToCart = page.getByRole("button", { name: /add .* to cart/i }).first();
  await addToCart.waitFor({ state: "visible", timeout: 30_000 });
  await addToCart.click();

  await page.getByRole("navigation").getByRole("button", { name: /open cart/i }).click();
  await page.getByRole("button", { name: /checkout/i }).click();

  const outletButton = page.getByRole("button", { name: /^select (unilorin|tanke) for /i }).first();
  if (await outletButton.isVisible().catch(() => false)) {
    await outletButton.click();
  }

  // Receipt untoggled → phone stays optional.
  await expect(page.getByPlaceholder("Phone number (optional)")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder("Your WhatsApp number (required)")).toHaveCount(0);
});
