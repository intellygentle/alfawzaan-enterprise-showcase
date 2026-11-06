// lib/admin/bulkUpload.ts
// Server-side logic for bulk-importing products from a CSV/spreadsheet
"use server";

import { createProduct, updateProduct, findProductByName } from "@/lib/master/catalog";
import { upsertInventory, syncPriceToOutletInventory } from "@/lib/outlets/inventory";
import { requireStaffSession } from "@/lib/auth/session";
import { ensureCategory, autoDetectCategory, getCategoryNames } from "@/lib/master/categories";
import { globalPriceUpdate } from "@/lib/admin/priceSync";

export interface BulkProductEntry {
  name: string;
  category: string;
  description?: string;
  price?: number;
  image_url?: string;
  // Outlet-specific inventory quantities
  unilorin_special_qty?: number;
  unilorin_extra_qty?: number;
  unilorin_normal_qty?: number;
  tanke_special_qty?: number;
  tanke_extra_qty?: number;
  tanke_normal_qty?: number;
}

export interface BulkUploadResult {
  row: number;
  productName: string;
  success: boolean;
  error?: string;
}

/**
 * Process a single product entry — used by processBulkUpload for parallel execution.
 */
async function processSingleEntry(
  entry: BulkProductEntry,
  rowNum: number
): Promise<BulkUploadResult> {
  try {
    if (!entry.name) {
      return {
        row: rowNum,
        productName: "(unnamed)",
        success: false,
        error: "Missing required field: name is required.",
      };
    }

    // Auto-create category if it doesn't exist, or auto-detect from product name
    let resolvedCategory = entry.category;
    if (!resolvedCategory) {
      resolvedCategory = await autoDetectCategory(entry.name);
    } else {
      resolvedCategory = await ensureCategory(resolvedCategory);
    }

    // ─── 1. Check if product with same name exists ───
    const trimmedName = entry.name.trim();
    const existingProduct = await findProductByName(trimmedName);

    let productId: string;
    let reason: string;
    let canonicalPrice = entry.price || 0;

    if (existingProduct) {
      productId = existingProduct.id;
      reason = "Bulk stock increase (duplicate name)";
      canonicalPrice = entry.price || existingProduct.price || 0;
      await updateProduct(productId, {
        category: resolvedCategory,
        description: entry.description || existingProduct.description,
        base_image_url: entry.image_url || existingProduct.base_image_url,
      });
      if (entry.price != null && entry.price >= 0) {
        await globalPriceUpdate(productId, entry.price, "bulk-import");
      }
    } else {
      const product = await createProduct({
        name: trimmedName,
        category: resolvedCategory,
        description: entry.description || "",
        price: entry.price || 0,
        base_image_url: entry.image_url || undefined,
      });

      if (!product || !product.id) {
        return {
          row: rowNum,
          productName: entry.name,
          success: false,
          error: "Failed to create product in Master DB.",
        };
      }

      productId = product.id;
      canonicalPrice = Number(product.price ?? entry.price ?? 0);
      reason = "Initial stock (bulk import)";
    }

    // ─── 2. Upsert inventory for both outlets in parallel ───
    const pricedEntry = { ...entry, price: canonicalPrice };
    const unilorinItems = buildInventoryItems(productId, pricedEntry, "unilorin");
    const tankeItems = buildInventoryItems(productId, pricedEntry, "tanke");

    await Promise.all([
      unilorinItems.length > 0
        ? upsertInventory("unilorin", unilorinItems, "bulk-import", undefined, reason)
        : Promise.resolve(),
      tankeItems.length > 0
        ? upsertInventory("tanke", tankeItems, "bulk-import", undefined, reason)
        : Promise.resolve(),
    ]);

    return {
      row: rowNum,
      productName: entry.name,
      success: true,
    };
  } catch (err: any) {
    return {
      row: rowNum,
      productName: entry.name || "(unnamed)",
      success: false,
      error: err?.message || "Unknown error during import.",
    };
  }
}

/**
 * Process a batch of product entries from CSV, creating each product
 * and its corresponding inventory entries in both outlets.
 * Products are processed in parallel batches to significantly speed up
 * imports — the Supabase client handles connection pooling internally.
 */
export async function processBulkUpload(
  entries: BulkProductEntry[]
): Promise<BulkUploadResult[]> {
  // "use server" publishes this export: without the guard, an anonymous caller
  // could create products and inventory in bulk.
  await requireStaffSession();
  const results: BulkUploadResult[] = [];
  const BATCH_SIZE = 3; // process this many products concurrently — safe for Supabase free tier (5-15 connection limit)

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map((entry, idx) => {
      const rowNum = i + idx + 2;
      return processSingleEntry(entry, rowNum).catch((err) => ({
        row: rowNum,
        productName: entry.name || "(unnamed)",
        success: false,
        error: err?.message || "Unexpected error",
      }));
    });

    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (!result.success) {
        console.error(`[BulkUpload] Row ${result.row} "${result.productName}" failed: ${result.error}`);
      }
      results.push(result);
    }
  }

  return results;
}

/**
 * Build inventory item array for a specific outlet based on CSV entry.
 * Uses the single product price for all grades.
 */
function buildInventoryItems(
  productId: string,
  entry: BulkProductEntry,
  outlet: "unilorin" | "tanke"
): { product_id: string; grade: "special" | "extra" | "normal"; quantity: number; price: number }[] {
  const items: { product_id: string; grade: "special" | "extra" | "normal"; quantity: number; price: number }[] = [];
  const grades = ["special", "extra", "normal"] as const;
  const price = entry.price || 0;

  for (const grade of grades) {
    const qtyKey = `${outlet}_${grade}_qty` as keyof BulkProductEntry;
    const quantity = (entry[qtyKey] as number) || 0;

    if (quantity > 0) {
      items.push({
        product_id: productId,
        grade,
        quantity,
        price,
      });
    }
  }

  return items;
}
