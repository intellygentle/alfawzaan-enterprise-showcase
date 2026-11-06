/* filepath: utils/whatsappLinkGenerator.ts */

interface CartItem {
  name: string;
  price: number;
  quantity: number;
  location: string;
}

export interface WhatsAppTarget {
  /** Digits-only phone number in international format. */
  phone: string;
  /** Raw (unencoded) message text. */
  text: string;
}

/**
 * A gift-code credit riding on the order. When present the message replaces the
 * plain total with the code, the real price, the amount taken off, and what the
 * customer actually pays — so the representative can tell at a glance that this
 * is a discounted order and check the code before verifying.
 *
 * `amount` is the credit in naira; the item lines keep their real prices, so the
 * "real price" the message shows is the sum of those lines.
 */
export interface WhatsAppDiscount {
  /** Gift or ambassador code the customer is redeeming. */
  code: string;
  /** Naira taken off the order. */
  amount: number;
  /** Heading for the discount block: "GIFT CODE" (default) or "AMBASSADOR". */
  title?: string;
}

/** Build the destination phone number and message body for a WhatsApp order. */
export const buildWhatsAppMessage = (
  items: CartItem[],
  adminPhone: string,
  discount?: WhatsAppDiscount
): WhatsAppTarget => {
  const phone = adminPhone.replace(/\D/g, ""); // Clean the phone number

  // Format the list of items for the message
  const itemsList = items
    .map(
      (item) =>
        `• ${item.quantity} × ${item.name} - ₦${item.price.toLocaleString()} each [Outlet: ${item.location}]`
    )
    .join("\n");

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const summary = discount
    ? `🎁 ${discount.title ?? "GIFT CODE"}: ${discount.code}\n` +
      `Real Price: ₦${total.toLocaleString()}\n` +
      `Discount: −₦${discount.amount.toLocaleString()}\n` +
      `*Price After Discount: ₦${Math.max(0, total - discount.amount).toLocaleString()}*`
    : `*Total Amount: ₦${total.toLocaleString()}*`;

  const text = `Hello Alfawzaan's Enterprise! 🌟\n\nI would like to place an order for:\n${itemsList}\n\n${summary}\n\nAvailable for payment verification?`;

  return { phone, text };
};

/**
 * Universal, device-agnostic link — safe to persist on the order (whatsapp_link)
 * and reopen from any device. Uses the official App Link domain.
 */
export const buildUniversalWhatsAppUrl = (phone: string, text: string): string =>
  `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;

/**
 * Link the customer's device should open.
 *
 * On phones and touch-first devices we use the `whatsapp://` custom scheme so the OS shows its own
 * "Open with" chooser when both WhatsApp and WhatsApp Business are installed.
 * (The https App Links — wa.me / api.whatsapp.com — are verified to the
 * consumer app only, so they always open regular WhatsApp without asking.)
 *
 * Desktop-site mode can replace the mobile user-agent with a desktop one, so
 * user-agent detection alone is not sufficient. Touch capability is included
 * deliberately to keep mobile desktop-site mode on the app-link path.
 * Physical desktop browsers fall back to the https link, which opens WhatsApp
 * Web/Desktop.
 */
export function shouldUseWhatsAppAppLink(
  environment: { userAgent?: string; maxTouchPoints?: number; ontouchstart?: unknown } =
    typeof navigator !== "undefined" ? navigator : {},
): boolean {
  const userAgent = environment.userAgent ?? "";
  const touchCapable = (environment.maxTouchPoints ?? 0) > 0 || "ontouchstart" in environment;
  return /android|iphone|ipad|ipod/i.test(userAgent) || touchCapable;
}

export const buildWhatsAppUrl = (phone: string, text: string): string => {
  const encoded = encodeURIComponent(text);
  if (shouldUseWhatsAppAppLink()) {
    return `whatsapp://send?phone=${phone}&text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`;
};

/**
 * Full order target: phone + message body + the universal URL (persisted on
 * the order). The client uses `phone` + `text` via `buildWhatsAppUrl` so the
 * customer's device decides which WhatsApp app to open.
 */
export const generateWhatsAppLink = (
  items: CartItem[],
  adminPhone: string,
  discount?: WhatsAppDiscount
): WhatsAppTarget & { url: string } => {
  const { phone, text } = buildWhatsAppMessage(items, adminPhone, discount);
  return { phone, text, url: buildUniversalWhatsAppUrl(phone, text) };
};
