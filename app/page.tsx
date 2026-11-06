// app/page.tsx
// Server component: loads the landing page's data (featured products, category
// images, product count, phone numbers) through the shared server-side cache
// (lib/storefront/data.ts) so Supabase is read once per revalidation window
// globally instead of once per visitor, then hands it to the interactive
// client shell.
//
// revalidate=900 (15 min) matches the catalog cache window; inventory/catalog
// caches are also invalidated on demand by admin mutations via
// revalidateStorefront().

import LandingClient from "@/components/Landing/LandingClient";
import {
  getFeaturedProducts,
  getCategoryImageMap,
  getProductCount,
  getStorePhones,
} from "@/lib/storefront/data";

export const revalidate = 900;

export default async function LandingPage() {
  const [featured, categoryImages, productCount] = await Promise.all([
    getFeaturedProducts(15),
    getCategoryImageMap(),
    getProductCount(),
  ]);
  const phones = getStorePhones();

  return (
    <LandingClient
      featured={featured}
      categoryImages={categoryImages}
      productCount={productCount}
      phones={phones}
    />
  );
}
