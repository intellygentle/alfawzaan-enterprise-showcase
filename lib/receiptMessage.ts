// lib/receiptMessage.ts — shared verified-receipt WhatsApp message.
// Used by the admin Receipt Outbox and the session-pinned VerifiedOrderCard so
// the wording stays identical no matter which surface sends it.

import { normalizeWhatsAppPhone } from "@/lib/phone";

/** First name from receipt_name → customer_name → "there", capitalized. */
export function receiptFirstName(receiptName?: string | null, customerName?: string | null): string {
  const source = (receiptName || customerName || "there").trim();
  const first = source.split(/\s+/)[0] || "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** The appreciation message that accompanies the verified receipt PDF. */
export function buildVerifiedReceiptMessage(receiptName?: string | null, customerName?: string | null): string {
  const firstName = receiptFirstName(receiptName, customerName);
  return (
    `Hello ${firstName}! 🌟\n\n` +
    `Thank you so much for shopping with Alfawzaan's Enterprise — your order has been verified and confirmed! ✅\n\n` +
    `Your verified receipt is attached. We hope you love your fragrances, and we can't wait to serve you again. 💛\n\n` +
    `— Alfawzaan's Enterprise\nwww.alfawzaanenterprise.ng`
  );
}

/**
 * Open the customer's WhatsApp DM with the verified-receipt message.
 * WhatsApp links cannot pre-attach files — the admin taps attach in the chat;
 * the PDF is already in their downloads.
 * Returns the normalized phone (null when unusable) so callers can warn.
 */
export function openVerifiedReceiptWhatsapp(
  customerPhone: string,
  receiptName?: string | null,
  customerName?: string | null,
): string | null {
  const phone = normalizeWhatsAppPhone(customerPhone || "");
  if (!phone) return null;
  const message = buildVerifiedReceiptMessage(receiptName, customerName);
  window.open(
    `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
  return phone;
}
