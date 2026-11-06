// lib/enrich/enrichProduct.ts
// Enrichment feature has been disabled. All functions are no-ops.

// Deliberately NOT "use server": no importers. Left unguarded it was an
// anonymously callable endpoint that would spend AI quota (and egress) on
// demand, so the directive was removed.

export interface EnrichmentResult {
  description: string;
  scentNotes: { top: string; heart: string; base: string };
  tagline: string;
}

/**
 * Enrichment has been disabled. This function is a no-op.
 * Admin descriptions should be added manually via the admin dashboard.
 */
export async function enrichProduct(
  _productId: string,
  _productName: string,
  _category: string
): Promise<EnrichmentResult | null> {
  return null;
}
