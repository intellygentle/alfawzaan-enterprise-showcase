import assert from "node:assert/strict";
import test from "node:test";
import {
  AMBASSADOR_CODE_PATTERN,
  AMBASSADOR_NET_UPCHARGE_NAIRA,
  ambassadorPortalUrl,
  ambassadorPrice,
  ambassadorStoreUrl,
  canonicalAmbassadorCode,
  isFa50ProductName,
  isPaidOrderStatus,
  makeAmbassadorCode,
} from "../../lib/ambassadors";

test("ambassador price follows the +1000 then -500 rule on the stored discount", () => {
  // The real 50ml FA case: ₦6,500 real, ₦4,000 discount → ₦4,500 ambassador.
  assert.equal(ambassadorPrice(6_500, 4_000), 4_500);
  assert.equal(AMBASSADOR_NET_UPCHARGE_NAIRA, 500);
});

test("ambassador price falls back to the assumed discount when none is stored", () => {
  // No base discount: assume the observed ₦2,500 gap, then +1000 -500 = ₦4,500.
  assert.equal(ambassadorPrice(6_500, null), 4_500);
  assert.equal(ambassadorPrice(6_500, undefined), 4_500);
});

test("ambassador price rejects unusable inputs", () => {
  assert.equal(ambassadorPrice(0, 1_000), null);
  assert.equal(ambassadorPrice(Number.NaN, 1_000), null);
  // A base discount equal to or above the real price is ignored; the fallback applies.
  assert.equal(ambassadorPrice(5_000, 5_000), 3_000);
  assert.equal(ambassadorPrice(1_000, 900), null); // 900 + 500 = 1400 ≥ 1000
});

test("isFa50ProductName matches the catalogue's 50ml FA names", () => {
  for (const name of [
    "Ameer al oud 50ml FA",
    "Barakat FA 50ml (White,Red,Satin)",
    "Berries Weekend FA 50ml",
    "Hayati Black 50ml FA",
  ]) {
    assert.equal(isFa50ProductName(name), true, name);
  }
  for (const name of ["Fragrance World 100ml", "Suave FA 100ml", "Lattafa 50ml", "Body Mist"]) {
    assert.equal(isFa50ProductName(name), false, name);
  }
});

test("canonicalAmbassadorCode normalises both forms", () => {
  assert.equal(canonicalAmbassadorCode("amb-7k2p9q"), "AMB-7K2P9Q");
  assert.equal(canonicalAmbassadorCode("7K2P9Q"), "AMB-7K2P9Q");
  assert.equal(canonicalAmbassadorCode("AMB7K2P9Q"), "AMB-7K2P9Q");
  assert.equal(canonicalAmbassadorCode("!!"), null);
  assert.equal(canonicalAmbassadorCode(""), null);
});

test("makeAmbassadorCode produces a well-formed code", () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(makeAmbassadorCode(), AMBASSADOR_CODE_PATTERN);
  }
});

test("ambassadorStoreUrl targets the store with the canonical code", () => {
  assert.equal(
    ambassadorStoreUrl("7k2p9q"),
    "https://www.alfawzaanenterprise.ng/store?ambassador=AMB-7K2P9Q",
  );
  assert.equal(
    ambassadorStoreUrl("AMB-7K2P9Q", "https://example.com/"),
    "https://example.com/store?ambassador=AMB-7K2P9Q",
  );
});

test("ambassadorPortalUrl carries the secret token", () => {
  assert.equal(
    ambassadorPortalUrl("7k2p9q", "abc123"),
    "https://www.alfawzaanenterprise.ng/ambassador/AMB-7K2P9Q?token=abc123",
  );
});

test("isPaidOrderStatus counts only verified money-in statuses", () => {
  assert.equal(isPaidOrderStatus("paid"), true);
  assert.equal(isPaidOrderStatus("shipping"), true);
  assert.equal(isPaidOrderStatus("delivered"), true);
  assert.equal(isPaidOrderStatus("pending"), false);
  assert.equal(isPaidOrderStatus("cancelled"), false);
  assert.equal(isPaidOrderStatus(null), false);
});
