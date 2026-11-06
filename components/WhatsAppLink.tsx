"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import {
  buildUniversalWhatsAppUrl,
  buildWhatsAppUrl,
} from "@/utils/whatsappLinkGenerator";

interface WhatsAppLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Raw phone number — non-digits are stripped. */
  phone: string;
  /** Optional pre-filled message. */
  text?: string;
}

/**
 * An <a> that matches the checkout's WhatsApp send: on phones and touch devices it opens the
 * `whatsapp://` custom scheme so the OS prompts the user to pick WhatsApp or
 * WhatsApp Business; on desktop it falls back to the https link (WhatsApp
 * Web/Desktop). Touch detection keeps mobile browsers using desktop-site mode
 * on the app-link path. The rendered href stays the stable https URL so SSR and
 * hydration always agree.
 */
export function WhatsAppLink({
  phone,
  text = "",
  children,
  onClick,
  ...rest
}: WhatsAppLinkProps) {
  const digits = phone.replace(/\D/g, "");
  const href = buildUniversalWhatsAppUrl(digits, text);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const url = buildWhatsAppUrl(digits, text);
    // On mobile the scheme is `whatsapp://`; intercept and fire it via a real
    // anchor click (most reliable for custom schemes). Desktop uses the https
    // href normally.
    if (url.startsWith("whatsapp://")) {
      e.preventDefault();
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
    onClick?.(e);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
