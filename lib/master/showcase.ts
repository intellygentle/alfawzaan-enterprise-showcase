// Kept as "use server" because the admin ShowcaseManager client component calls
// these exports directly, which makes every export a callable endpoint.
// requireStaffSession() is the inner guard (signed-cookie check, no DB read).
// getShowcaseItems stays public on purpose: the landing page's /api/showcase
// route serves it to anonymous visitors from a CDN-cached response.
"use server";

import { getMasterServer } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/session";
import type { ShowcaseItem, ShowcaseCopyUpdate } from "@/lib/types";

/** Fetch active showcase items for the landing page carousel */
export async function getShowcaseItems(): Promise<ShowcaseItem[]> {
  const db = getMasterServer();
  const { data, error } = await db
    .from("sensory_copy")
    .select("id, product_id, product_name, copy, scent_notes_top, scent_notes_heart, scent_notes_base, tagline, showcase_image_url, is_showcase, updated_at")
    .eq("is_showcase", true)
    .order("updated_at", { ascending: false })
    .limit(3);

  if (error) throw new Error(`Failed to fetch showcase items: ${error.message}`);
  return data ?? [];
}

/** Fetch all sensory copy entries for admin selection */
export async function getAllSensoryCopy(): Promise<ShowcaseItem[]> {
  await requireStaffSession();
  const db = getMasterServer();
  const { data, error } = await db
    .from("sensory_copy")
    .select("id, product_id, product_name, copy, scent_notes_top, scent_notes_heart, scent_notes_base, tagline, showcase_image_url, is_showcase, updated_at")
    .order("product_name", { ascending: true });

  if (error) throw new Error(`Failed to fetch sensory copy: ${error.message}`);
  return data ?? [];
}

/** Set a sensory copy entry as a showcase item with an image */
export async function setShowcaseImage(id: string, imageUrl: string): Promise<void> {
  await requireStaffSession();
  const db = getMasterServer();

  // Check how many are already showcased
  const { count } = await db
    .from("sensory_copy")
    .select("id", { count: "exact", head: true })
    .eq("is_showcase", true);

  if (count && count >= 3) {
    throw new Error("Maximum of 3 showcase items reached. Remove one first.");
  }

  await withRetry(
    async () => {
      const { error } = await db
        .from("sensory_copy")
        .update({ showcase_image_url: imageUrl, is_showcase: true, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(`Failed to set showcase image: ${error.message}`);
    },
    { label: "set-showcase-image", retries: 2 }
  );

  revalidatePath("/");
  revalidatePath("/admin/dashboard");
}

/** Remove an item from the showcase */
export async function removeFromShowcase(id: string): Promise<void> {
  await requireStaffSession();
  const db = getMasterServer();
  await db
    .from("sensory_copy")
    .update({ is_showcase: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath("/admin/dashboard");
}

/** Create a new showcase item with sensory copy */
export async function createShowcaseItem(data: {
  product_name: string;
  copy: string;
  showcase_image_url: string;
  tagline?: string;
  scent_notes_top?: string;
  scent_notes_heart?: string;
  scent_notes_base?: string;
}): Promise<ShowcaseItem> {
  await requireStaffSession();
  const db = getMasterServer();

  // Check how many are already showcased
  const { count } = await db
    .from("sensory_copy")
    .select("id", { count: "exact", head: true })
    .eq("is_showcase", true);

  if (count && count >= 3) {
    throw new Error("Maximum of 3 showcase items reached. Remove one first.");
  }

  const result = await withRetry(
    async () => {
      const { data: row, error } = await db
        .from("sensory_copy")
        .insert({
          product_id: data.product_name.toLowerCase().replace(/\s+/g, "-"),
          product_name: data.product_name,
          copy: data.copy,
          showcase_image_url: data.showcase_image_url,
          is_showcase: true,
          tagline: data.tagline || null,
          scent_notes_top: data.scent_notes_top || null,
          scent_notes_heart: data.scent_notes_heart || null,
          scent_notes_base: data.scent_notes_base || null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to create showcase item: ${error.message}`);
      return row;
    },
    { label: "create-showcase-item", retries: 2 }
  );

  revalidatePath("/");
  revalidatePath("/admin/dashboard");
  return result;
}

/** Update the sensory copy text for a showcase item */
export async function updateShowcaseCopy(id: string,  updates: ShowcaseCopyUpdate
): Promise<void> {
  await requireStaffSession();
  const db = getMasterServer();
  await db
    .from("sensory_copy")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/");
  revalidatePath("/admin/dashboard");
}
