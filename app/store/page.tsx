// app/store/page.tsx
// Server component: loads the storefront catalog through the shared server-side
// cache (lib/storefront/data.ts) so Supabase is read once per revalidation
// window globally instead of once per visitor, then hands it to the interactive
// client shell.
//
// revalidate=900 keeps the prerendered HTML on ISR: regenerations hit the
// cached loaders (all caches: 15min windows, also invalidated on demand by
// admin mutations via revalidateStorefront()). With the proxy's junk-bot
// block, worst-case egress stays far below the Free plan's 5 GB/month quota.

import type { Metadata } from "next";
import StoreClient from "./StoreClient";
import { getStoreProducts } from "@/lib/storefront/data";

export const revalidate = 900;

// WhatsApp / social link previews for the store URL use the same product-grid
// snapshot as the landing page — regenerated via
// node devtools/scripts/generate-og-image.mjs
export const metadata: Metadata = {
  title: "Shop the Collection | Alfawzaan's Enterprise",
  description: "Browse authentic perfumes, oils, body mists, and gift sets with live Unilorin and Tanke boutique availability.",
  alternates: { canonical: "/store" },
  openGraph: {
    title: "Shop the Collection | Alfawzaan's Enterprise",
    description: "Authentic fragrances with live boutique availability in Ilorin.",
    url: "/store",
    type: "website",
    images: [{ url: "/og-store.jpg", width: 1200, height: 630, alt: "Alfawzaan's Enterprise — the fragrance collection" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shop the Collection | Alfawzaan's Enterprise",
    description: "Authentic fragrances with live boutique availability in Ilorin.",
    images: ["/og-store.jpg"],
  },
};

export default async function StorePage() {
  const initialProducts = await getStoreProducts();
  return <StoreClient initialProducts={initialProducts} />;
}
