// lib/master/ambassadors.ts — server-only ambassadors + global ambassador
// product set (Master database). Deliberately NOT "use server": these exports
// must not become directly-callable client actions. The authenticated wrappers
// live in app/actions/ambassadorActions.ts.
//
// Two tables, added by devtools/migrations/019_master_ambassadors.sql:
//   ambassadors        — id, name, code, is_active, created_at
//   ambassador_products — product_id (the global set shown on every QR card)
//
// The product set is IMPLICIT by default: while ambassador_products is empty,
// the set is every 50ml FA product (management's default). The first
// removal materialises that default into rows, then edits apply to the rows.

import "server-only";

import { unstable_cache } from "next/cache";
import { getMasterServer } from "@/lib/supabase/server";
import { CATALOG_TAG } from "@/lib/storefront/revalidate";
import { canonicalAmbassadorCode, isFa50ProductName, makeAmbassadorCode } from "@/lib/ambassadors";

export interface AmbassadorRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  /** Invite link to this ambassador's WhatsApp group (buyer posts proof there). */
  whatsapp_group_url: string | null;
  /** Secret gating the read-only portal at /ambassador/CODE?token=... */
  access_token: string;
}

export interface MasterProductPricing {
  id: string;
  name: string;
  price: number | null;
  discount_price: number | null;
}

function isMissingTable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /ambassador|relation .* does not exist|PGRST205/i.test(message);
}

/**
 * Master product pricing (normal + stored discount), shared cache. The
 * ambassador price derives from discount_price, which the resolved storefront
 * catalog drops, so this reads it directly and revalidates with catalog edits.
 */
export const getCachedMasterProducts = unstable_cache(
  async (): Promise<MasterProductPricing[]> => {
    const { data, error } = await getMasterServer()
      .from("products")
      .select("id, name, price, discount_price");
    if (error) throw new Error(`Failed to read Master products: ${error.message}`);
    return (data ?? []) as MasterProductPricing[];
  },
  ["ambassador-master-products-v1"],
  { revalidate: 900, tags: [CATALOG_TAG] },
);

export async function getAmbassadorByCode(code: string): Promise<AmbassadorRow | null> {
  const { data, error } = await getMasterServer()
    .from("ambassadors")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Ambassador lookup failed: ${error.message}`);
  }
  return (data as AmbassadorRow) ?? null;
}

/** Portal access: the code AND its secret token must both match. */
export async function getAmbassadorByAccess(code: string, token: string): Promise<AmbassadorRow | null> {
  if (!token) return null;
  const { data, error } = await getMasterServer()
    .from("ambassadors")
    .select("*")
    .eq("code", code)
    .eq("access_token", token)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Ambassador access lookup failed: ${error.message}`);
  }
  return (data as AmbassadorRow) ?? null;
}

export async function listAmbassadors(): Promise<AmbassadorRow[]> {
  const { data, error } = await getMasterServer()
    .from("ambassadors")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Failed to list ambassadors: ${error.message}`);
  }
  return (data ?? []) as AmbassadorRow[];
}

export async function createAmbassador(name: string, requestedCode?: string): Promise<AmbassadorRow> {
  const master = getMasterServer();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("An ambassador name is required.");

  const explicit = requestedCode?.trim() ? canonicalAmbassadorCode(requestedCode) : null;
  if (requestedCode?.trim() && !explicit) {
    throw new Error("Enter a code like AMB-XXXX (letters and numbers).");
  }

  // Retry only when auto-generating; an explicit duplicate is the admin's error.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = explicit ?? makeAmbassadorCode();
    const { data, error } = await master
      .from("ambassadors")
      .insert({ name: trimmed, code })
      .select()
      .single();

    if (!error) return data as AmbassadorRow;

    if (isMissingTable(error)) {
      throw new Error("The ambassadors table is missing. Apply migration 019_master_ambassadors.sql to the Master database first.");
    }
    if (/duplicate|unique/i.test(error.message)) {
      if (explicit) throw new Error(`Code ${code} is already taken.`);
      continue;
    }
    throw new Error(`Could not create ambassador: ${error.message}`);
  }
  throw new Error("Could not generate a unique ambassador code. Please try again.");
}

export async function updateAmbassador(
  id: string,
  patch: { name?: string; is_active?: boolean; whatsapp_group_url?: string | null },
): Promise<AmbassadorRow> {
  const updates: { name?: string; is_active?: boolean; whatsapp_group_url?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("An ambassador name is required.");
    updates.name = trimmed;
  }
  if (patch.is_active !== undefined) updates.is_active = patch.is_active;
  if (patch.whatsapp_group_url !== undefined) {
    const url = patch.whatsapp_group_url?.trim() || null;
    if (url && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(url)) {
      throw new Error("Enter a WhatsApp group invite link (https://chat.whatsapp.com/...).");
    }
    updates.whatsapp_group_url = url;
  }

  const { data, error } = await getMasterServer()
    .from("ambassadors")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Could not update ambassador: ${error.message}`);
  return data as AmbassadorRow;
}

export async function deleteAmbassador(id: string): Promise<void> {
  const { error } = await getMasterServer().from("ambassadors").delete().eq("id", id);
  if (error) throw new Error(`Could not delete ambassador: ${error.message}`);
}

/** Explicit rows in ambassador_products, or null when the table is absent. */
async function listExplicitProductIds(): Promise<string[] | null> {
  const { data, error } = await getMasterServer()
    .from("ambassador_products")
    .select("product_id");
  if (error) {
    if (isMissingTable(error)) return null;
    throw new Error(`Failed to read the ambassador product set: ${error.message}`);
  }
  return (data ?? []).map((row: { product_id: string }) => row.product_id);
}

/** Management's default: every 50ml FA product. */
export async function defaultAmbassadorProductIds(): Promise<string[]> {
  const products = await getCachedMasterProducts();
  return products.filter((product) => isFa50ProductName(product.name)).map((product) => product.id);
}

/**
 * The active global product set: explicit rows when present, otherwise the
 * 50ml FA defaults. A missing table also falls back to the defaults so the
 * storefront degrades gracefully before the migration is applied.
 */
export async function resolveAmbassadorProductIds(): Promise<string[]> {
  const explicit = await listExplicitProductIds();
  if (explicit === null || explicit.length === 0) return defaultAmbassadorProductIds();
  return explicit;
}

/** Add or remove one product from the global set, materialising defaults first. */
export async function setAmbassadorProduct(productId: string, include: boolean): Promise<void> {
  const master = getMasterServer();

  if (include) {
    const { error } = await master
      .from("ambassador_products")
      .upsert({ product_id: productId }, { onConflict: "product_id" });
    if (error) {
      if (isMissingTable(error)) {
        throw new Error("The ambassador_products table is missing. Apply migration 019_master_ambassadors.sql to the Master database first.");
      }
      throw new Error(`Could not add product to the ambassador set: ${error.message}`);
    }
    return;
  }

  // Removing while the set is still implicit: write the defaults first so the
  // removal sticks, then delete this one.
  const explicit = await listExplicitProductIds();
  if (explicit !== null && explicit.length === 0) {
    const defaults = await defaultAmbassadorProductIds();
    if (defaults.length > 0) {
      const { error: seedError } = await master
        .from("ambassador_products")
        .upsert(defaults.map((id) => ({ product_id: id })), { onConflict: "product_id" });
      if (seedError) throw new Error(`Could not update the ambassador product set: ${seedError.message}`);
    }
  }

  const { error } = await master.from("ambassador_products").delete().eq("product_id", productId);
  if (error) throw new Error(`Could not remove product from the ambassador set: ${error.message}`);
}

/** Clear explicit rows so the set reverts to the 50ml FA defaults. */
export async function resetAmbassadorProducts(): Promise<void> {
  const { error } = await getMasterServer()
    .from("ambassador_products")
    .delete()
    .neq("product_id", "00000000-0000-0000-0000-000000000000");
  if (error && !isMissingTable(error)) {
    throw new Error(`Could not reset the ambassador product set: ${error.message}`);
  }
}
