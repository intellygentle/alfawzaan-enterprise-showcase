// lib/phone.ts — WhatsApp phone normalization.
// Customers enter Nigerian numbers in local formats (0801…, 234801…, +234801…);
// WhatsApp links need digits-only international format (234801…).

/**
 * Normalize a phone number to WhatsApp's international digits-only format.
 * Handles Nigerian local conventions and already-international input.
 * Returns null for unrecognizable input.
 *
 * Rules:
 *   0803…        → 234803…        (local → drop leading 0, add 234)
 *   234803…      → 234803…        (already international)
 *   +234803…     → 234803…
 *   803…         → 234803…        (missing leading zero, still local)
 *   <10 digits   → null           (too short to be valid)
 */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let international: string;
  if (digits.startsWith("234")) {
    international = digits;
  } else if (digits.startsWith("0")) {
    international = `234${digits.slice(1)}`;
  } else {
    international = `234${digits}`;
  }

  // Sanity: Nigerian mobile numbers are 234 + 10 digits.
  if (international.length < 12 || international.length > 15) return null;
  return international;
}

/** True when the raw input normalizes to a usable WhatsApp number. */
export function isValidWhatsAppPhone(raw: string): boolean {
  return normalizeWhatsAppPhone(raw) !== null;
}
