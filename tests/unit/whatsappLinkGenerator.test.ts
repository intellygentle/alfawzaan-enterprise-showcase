import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppMessage,
  buildUniversalWhatsAppUrl,
  generateWhatsAppLink,
  shouldUseWhatsAppAppLink,
} from "../../utils/whatsappLinkGenerator";

test("builds a WhatsApp message with cleaned phone, quantities, outlet, and total", () => {
  const result = buildWhatsAppMessage([
    { name: "Oud Royale", price: 12500, quantity: 2, location: "unilorin" },
    { name: "Musk Night", price: 3000, quantity: 1, location: "tanke" },
  ], "+234 801-234-5678");

  assert.equal(result.phone, "2348012345678");
  assert.match(result.text, /2 × Oud Royale/);
  assert.match(result.text, /1 × Musk Night/);
  assert.match(result.text, /Outlet: unilorin/);
  assert.match(result.text, /Total Amount: ₦28,000/);
});

test("creates a universally reopenable encoded WhatsApp URL", () => {
  const url = buildUniversalWhatsAppUrl("2348012345678", "Hello & welcome");
  assert.equal(url, "https://api.whatsapp.com/send?phone=2348012345678&text=Hello%20%26%20welcome");
});

test("a gift order message shows the code, real price, discount, and price after discount", () => {
  const result = buildWhatsAppMessage(
    [{ name: "Barakat FA 50ml", price: 6500, quantity: 1, location: "unilorin" }],
    "+234 801-234-5678",
    { code: "ALF-9F8E7D6C", amount: 2500 },
  );

  assert.match(result.text, /GIFT CODE: ALF-9F8E7D6C/);
  assert.match(result.text, /Real Price: ₦6,500/);
  assert.match(result.text, /Discount: −₦2,500/);
  assert.match(result.text, /Price After Discount: ₦4,000/);
  // The item line keeps the real price so the discount block reconciles it.
  assert.match(result.text, /\u20a66,500 each/);
  // The plain total line must not sit next to the discount block.
  assert.doesNotMatch(result.text, /Total Amount/);
});

test("keeps the plain total when no discount rides along", () => {
  const result = buildWhatsAppMessage(
    [{ name: "Amber", price: 1000, quantity: 2, location: "tanke" }],
    "0800 123 4567",
  );

  assert.match(result.text, /Total Amount: ₦2,000/);
  assert.doesNotMatch(result.text, /GIFT CODE/);
});

test("never prints a negative price after discount", () => {
  const result = buildWhatsAppMessage(
    [{ name: "Sample", price: 1000, quantity: 1, location: "tanke" }],
    "0800 123 4567",
    { code: "ALF-TEST", amount: 2500 },
  );

  assert.match(result.text, /Price After Discount: ₦0/);
  assert.doesNotMatch(result.text, /-\u20a6/);
});

test("generateWhatsAppLink returns matching message and URL", () => {
  const result = generateWhatsAppLink([
    { name: "Amber", price: 1000, quantity: 3, location: "tanke" },
  ], "0800 123 4567");

  assert.equal(result.phone, "08001234567");
  assert.ok(result.url.startsWith("https://api.whatsapp.com/send?phone=08001234567&text="));
  assert.equal(decodeURIComponent(result.url.split("text=")[1]), result.text);
});

test("generateWhatsAppLink carries the discount into the persisted URL", () => {
  const result = generateWhatsAppLink(
    [{ name: "Barakat FA 50ml", price: 6500, quantity: 1, location: "unilorin" }],
    "0800 123 4567",
    { code: "ALF-TEST", amount: 2500 },
  );

  assert.match(result.text, /GIFT CODE: ALF-TEST/);
  assert.match(result.text, /Price After Discount: ₦4,000/);
  assert.equal(decodeURIComponent(result.url.split("text=")[1]), result.text);
});

test("treats mobile desktop-site mode as a touch device", () => {
  assert.equal(shouldUseWhatsAppAppLink({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Mobile",
    maxTouchPoints: 5,
  }), true);
});

test("uses the app chooser path for an iPhone desktop-site user agent", () => {
  assert.equal(shouldUseWhatsAppAppLink({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15",
    maxTouchPoints: 5,
  }), true);
});

test("keeps physical desktop browsers on the WhatsApp web path", () => {
  assert.equal(shouldUseWhatsAppAppLink({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
    maxTouchPoints: 0,
  }), false);
});
