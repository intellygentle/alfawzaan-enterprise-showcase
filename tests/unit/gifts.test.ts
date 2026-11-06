import assert from "node:assert/strict";
import test from "node:test";
import {
  tierOfPrice,
  computeTierTotals,
  dominantTierKey,
  qualifiesForGift,
  giftCreditPrice,
  GIFT_MIN_RECEIPT_TOTAL,
  GIFT_CREDIT_NAIRA,
  orderRefForOrderId,
  giftCodeForOrderId,
  giftCreditAuditDetails,
  giftOrderNote,
  isGiftEligibleProduct,
  parseGiftCode,
  canonicalGiftCode,
  GIFT_CODE_PATTERN,
} from "../../lib/gifts";

test("tierOfPrice applies the receipt's thresholds", () => {
  assert.equal(tierOfPrice(14_999), "normal");
  assert.equal(tierOfPrice(15_000), "extra");
  assert.equal(tierOfPrice(34_999), "extra");
  assert.equal(tierOfPrice(35_000), "special");
  assert.equal(tierOfPrice(0), "normal");
});

test("computeTierTotals sums spend per tier", () => {
  const totals = computeTierTotals([
    { unitPrice: 50_000, quantity: 2 },  // special 100k
    { unitPrice: 20_000, quantity: 1 },  // extra 20k
    { unitPrice: 4_000, quantity: 3 },   // normal 12k
  ]);
  assert.equal(totals.special, 100_000);
  assert.equal(totals.extra, 20_000);
  assert.equal(totals.normal, 12_000);
});

test("dominantTierKey picks the highest-spend tier", () => {
  assert.equal(dominantTierKey([{ unitPrice: 50_000, quantity: 1 }, { unitPrice: 4_000, quantity: 2 }]), "special");
  // 3 × 20k extra (60k) outspends 1 × 50k special.
  assert.equal(dominantTierKey([{ unitPrice: 20_000, quantity: 3 }, { unitPrice: 50_000, quantity: 1 }]), "extra");
  assert.equal(dominantTierKey([{ unitPrice: 4_000, quantity: 1 }]), "normal");
  assert.equal(dominantTierKey([]), null);
});

test("qualifiesForGift requires Extravaganza dominance AND the receipt-total floor", () => {
  // Dominant special + total well above the floor → qualifies.
  assert.ok(qualifiesForGift([{ unitPrice: 100_000, quantity: 1 }, { unitPrice: 27_000, quantity: 1 }]));
  // Dominant extra → never qualifies, even at high totals.
  assert.ok(!qualifiesForGift([{ unitPrice: 27_000, quantity: 3 }, { unitPrice: 5_000, quantity: 1 }]));
  // Special dominance but total just below the floor: a 35k item against 6k
  // of normal spend nets 29k — under GIFT_MIN_RECEIPT_TOTAL (refunds/mixed
  // baskets aside, this mostly guards the rule staying independent).
  assert.ok(!qualifiesForGift([{ unitPrice: 35_000, quantity: 1 }, { unitPrice: -6_000, quantity: 1 }]));
  assert.ok(!qualifiesForGift([]));
  // The floor is the documented ₦30,000.
  assert.equal(GIFT_MIN_RECEIPT_TOTAL, 30_000);
});

test("isGiftEligibleProduct matches the real FA 50ml catalogue spellings", () => {
  assert.ok(isGiftEligibleProduct("Barakat FA 50ml (White,Red,Satin)"));
  assert.ok(isGiftEligibleProduct("Ameer al oud 50ml FA"));
  assert.ok(isGiftEligibleProduct("Berries Weekend FA 50 ML"));
  // Anything that is not an FA 50ml is out of scope for the credit.
  assert.ok(!isGiftEligibleProduct("Fakhr Lattafa White 100ML"));
  assert.ok(!isGiftEligibleProduct("Body Spray FA"));
});

test("giftOrderNote records the code and both prices for the admin card", () => {
  const note = giftOrderNote({ code: "ALF-9F8E7D6C", originalPrice: 6_500, creditPrice: 4_000 });

  assert.match(note, /ALF-9F8E7D6C/);
  assert.match(note, /₦6,500 → ₦4,000/);
  assert.match(note, /₦2,500 credit/);
});

test("giftCreditPrice subtracts the 2500 naira credit from the current price", () => {
  assert.equal(GIFT_CREDIT_NAIRA, 2_500);
  assert.equal(giftCreditPrice(6_500), 4_000);   // the FA 50ml line
  assert.equal(giftCreditPrice(4_000), 1_500);   // already-cheap items
  assert.equal(giftCreditPrice(2_500), 0);       // clamped at zero, never negative
  assert.equal(giftCreditPrice(1_000), 0);
});

test("giftCreditAuditDetails names the product or marks it unspecified", () => {
  assert.equal(giftCreditAuditDetails("Hayati Rose FA 50ml"), "₦2,500 credit applied to Hayati Rose FA 50ml");
  assert.equal(giftCreditAuditDetails(null), "₦2,500 credit applied (product not specified)");
  assert.equal(giftCreditAuditDetails(undefined), "₦2,500 credit applied (product not specified)");
});

test("gift codes derive from the first UUID segment", () => {
  assert.equal(orderRefForOrderId("9f8e7d6c-b5a4-4321-fedc-ba9876543210"), "9F8E7D6C");
  assert.equal(giftCodeForOrderId("9f8e7d6c-b5a4-4321-fedc-ba9876543210"), "ALF-9F8E7D6C");
  // Non-UUID ids fall back to the whole id, capped at 12 chars.
  assert.equal(orderRefForOrderId("DAILY-2026-RECEIPT"), "DAILY");
});

test("parseGiftCode validates and normalizes codes", () => {
  assert.equal(parseGiftCode("alf-9f8e7d6c"), "9F8E7D6C");
  assert.equal(parseGiftCode("  ALF-ABC123  "), "ABC123");
  assert.equal(parseGiftCode("ALF-abc"), null);          // too short
  assert.equal(parseGiftCode("GIFT-ABC12345"), null);    // wrong prefix
  assert.equal(parseGiftCode("ALF-ABC;DROP TABLE"), null); // invalid chars
  assert.equal(parseGiftCode(""), null);
  assert.ok(GIFT_CODE_PATTERN.test("ALF-9F8E7D6C"));
});

test("canonicalGiftCode accepts the QR's code and a bare order reference", () => {
  assert.equal(canonicalGiftCode("ALF-9F8E7D6C"), "ALF-9F8E7D6C");
  assert.equal(canonicalGiftCode("alf-9f8e7d6c"), "ALF-9F8E7D6C");
  assert.equal(canonicalGiftCode("  9f8e7d6c  "), "ALF-9F8E7D6C");
  assert.equal(canonicalGiftCode("ABC123"), "ALF-ABC123");
  assert.equal(canonicalGiftCode("ALF-ABC"), null);        // too short
  assert.equal(canonicalGiftCode("GIFT-ABC12345"), null);  // wrong prefix
  assert.equal(canonicalGiftCode("ALF-ABC;DROP TABLE"), null);
  assert.equal(canonicalGiftCode(""), null);
  // Whatever the ledger keys on must survive parseGiftCode unchanged — that is
  // exactly what placeOrder's status check (and findGiftCode) rely on.
  assert.equal(parseGiftCode(canonicalGiftCode("9F8E7D6C")!), "9F8E7D6C");
  assert.equal(canonicalGiftCode(canonicalGiftCode("9F8E7D6C")!), "ALF-9F8E7D6C");
});
