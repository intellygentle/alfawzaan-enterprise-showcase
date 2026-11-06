// Kept as "use server" because the admin ShowcaseManager client component calls
// uploadProductImage directly, so both exports are callable endpoints.
// requireStaffSession() blocks callers with no signed admin/rep cookie without
// touching the database; the orginating action layer still checks permissions.
"use server";

import {
  getMasterServer,
  getUnilorinServer,
  getTankeServer,
  getArchiveServer,
} from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { requireStaffSession } from "@/lib/auth/session";

const getAccountClient = (accountName: string) => {
  switch (accountName) {
    case "master":
      return getMasterServer();
    case "unilorin":
      return getUnilorinServer();
    case "tanke":
      return getTankeServer();
    case "archive":
      return getArchiveServer();
    default:
      throw new Error(`Unknown storage account: ${accountName}`);
  }
};

/**
 * Upload a product image to the currently active storage pool.
 * Pools are consumed sequentially (Master → Unilorin → Tanke → Archive).
 * When a pool reaches max_size_kb, the next pool is activated automatically.
 *
 * Expected FormData fields:
 *  - productId: string
 *  - file: File
 */
export async function uploadProductImage(formData: FormData) {
  await requireStaffSession();
  const productId = formData.get("productId") as string;
  const file = formData.get("file") as File | null;

  if (!productId || !file || file.size === 0) {
    throw new Error(
      "Missing required upload fields. Ensure productId and an image file are provided."
    );
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be smaller than 5MB.");
  }

  const masterDb = getMasterServer();
  const sizeKb = Math.round(file.size / 1024);

  // ─── 1. Resolve active pool ───
  const { data: pools, error: poolError } = await masterDb
    .from("storage_pools")
    .select("*")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(1);

  if (poolError) {
    throw new Error(`Failed to read storage pool: ${poolError.message}`);
  }

  let activePool = pools?.[0];

  // Fallback: activate the first pool if none are active
  if (!activePool) {
    const { data: fallback } = await masterDb
      .from("storage_pools")
      .select("*")
      .order("priority", { ascending: true })
      .limit(1);

    if (!fallback?.[0]) {
      throw new Error(
        "No storage pools configured. Please run the storage_pools setup SQL in the Master DB."
      );
    }

    activePool = fallback[0];
    await masterDb
      .from("storage_pools")
      .update({ is_active: true })
      .eq("id", activePool.id);
  }

  const db = getAccountClient(activePool.account_name);
  const bucket = activePool.bucket_name;
  const timestamp = Date.now();
  const filePath = `${productId}/${timestamp}.jpg`;

  // ─── 2. Upload with retry ───
  await withRetry(
    async () => {
      const { error: uploadError } = await db.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        const msg = uploadError.message || "";
        if (
          msg.includes("Bucket not found") ||
          msg.includes("bucket") ||
          msg.includes("404")
        ) {
          throw new Error(
            `Storage bucket "${bucket}" was not found in the ${activePool.account_name} Supabase project. ` +
              `Please create it in Supabase Dashboard → Storage → Buckets before uploading images.`
          );
        }
        throw uploadError;
      }
    },
    { label: "image-upload", retries: 3 }
  );

  // ─── 3. Public URL ───
  const { data: urlData } = db.storage.from(bucket).getPublicUrl(filePath);
  if (!urlData?.publicUrl) {
    throw new Error("Failed to get public URL for uploaded image.");
  }

  // ─── 4. Update pool size & rollover if full ───
  const newSize = (activePool.current_size_kb || 0) + sizeKb;
  const isFull = newSize >= (activePool.max_size_kb || 1_048_576);

  const patch: any = { current_size_kb: newSize };
  if (isFull) patch.is_active = false;

  await masterDb
    .from("storage_pools")
    .update(patch)
    .eq("id", activePool.id);

  if (isFull) {
    const { data: nextPool } = await masterDb
      .from("storage_pools")
      .select("*")
      .gt("priority", activePool.priority)
      .order("priority", { ascending: true })
      .limit(1);

    if (nextPool?.[0]) {
      await masterDb
        .from("storage_pools")
        .update({ is_active: true })
        .eq("id", nextPool[0].id);
    }
  }

  return {
    url: urlData.publicUrl,
    filePath,
    sizeKb,
    accountName: activePool.account_name,
  };
}

/**
 * Delete an image from a specific storage account.
 */
export async function deleteProductImage(
  accountName: string,
  filePath: string
) {
  await requireStaffSession();
  const db = getAccountClient(accountName);
  const bucket = "product-images";
  await db.storage.from(bucket).remove([filePath]);
}