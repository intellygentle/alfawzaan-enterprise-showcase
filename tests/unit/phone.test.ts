import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWhatsAppPhone, isValidWhatsAppPhone } from "../../lib/phone";

test("normalizeWhatsAppPhone converts Nigerian local formats", () => {
  assert.equal(normalizeWhatsAppPhone("08031234567"), "2348031234567");
  assert.equal(normalizeWhatsAppPhone("8031234567"), "2348031234567");
  assert.equal(normalizeWhatsAppPhone("+234 803 123 4567"), "2348031234567");
  assert.equal(normalizeWhatsAppPhone("2348031234567"), "2348031234567");
  assert.equal(normalizeWhatsAppPhone("0803-123-4567"), "2348031234567");
});

test("normalizeWhatsAppPhone rejects garbage", () => {
  assert.equal(normalizeWhatsAppPhone(""), null);
  assert.equal(normalizeWhatsAppPhone("   "), null);
  assert.equal(normalizeWhatsAppPhone("12345"), null);          // too short
  assert.equal(normalizeWhatsAppPhone("abcdefghij"), null);     // no digits
});

test("isValidWhatsAppPhone wraps the normalizer", () => {
  assert.ok(isValidWhatsAppPhone("08031234567"));
  assert.ok(!isValidWhatsAppPhone("12345"));
  assert.ok(!isValidWhatsAppPhone(""));
});
