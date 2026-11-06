// Deliberately NOT "use server": imported only by server code
// (app/admin/dashboard/actions.ts, lib/admin/bulkUpload.ts). globalPriceUpdate
// and bulkCategoryPriceUpdate rewrite every price in the catalog and both
// outlets, so they must never be reachable as anonymous server actions.

import { getMasterServer, getUnilorinServer, getTankeServer, getArchiveServer } from "@/lib/supabase/server";
import { updateProductPrice } from "@/lib/master/catalog";
import { syncPriceToOutletInventory } from "@/lib/outlets/inventory";
import { revalidateStorefront } from "@/lib/storefront/revalidate";

/**
 * Updates price for a product. Sets products.price as the single source of truth,
 * then syncs to ALL inventory rows (all grades, both outlets).
 */
export const globalPriceUpdate = async (
  productId: string,
  newPrice: number,
  adminId: string,
  adminEmail?: string
) => {
  if (!Number.isFinite(newPrice) || newPrice < 0) throw new Error('Price must be a valid non-negative number.');
  const master = getMasterServer();
  const { data: current, error: currentError } = await master.from('products').select('id, price').eq('id', productId).maybeSingle();
  if (currentError || !current) throw new Error(`Could not load product price: ${currentError?.message || 'Product not found'}`);
  const oldPrice = Number(current.price ?? 0);

  try {
    // Master is the global price authority. Both outlet writes use this value.
    await updateProductPrice(productId, newPrice);
    await syncPriceToOutletInventory('unilorin', productId, newPrice);
    await syncPriceToOutletInventory('tanke', productId, newPrice);
  } catch (error) {
    // Best-effort compensation prevents a failed second outlet sync from leaving
    // Master and the two public storefronts permanently divergent.
    try {
      await updateProductPrice(productId, oldPrice);
      await Promise.all([
        syncPriceToOutletInventory('unilorin', productId, oldPrice),
        syncPriceToOutletInventory('tanke', productId, oldPrice),
      ]);
    } catch (rollbackError) {
      throw new Error(`Global price update failed and rollback also failed: ${error instanceof Error ? error.message : 'sync error'}; ${rollbackError instanceof Error ? rollbackError.message : 'rollback error'}`);
    }
    throw error;
  }

  const { error: auditError } = await getArchiveServer().from('audit_logs').insert({
    action: 'PRICE_SYNC', product_id: productId,
    details: `Global price updated from ₦${oldPrice.toLocaleString()} to ₦${newPrice.toLocaleString()} across all outlets and grades`,
    admin_id: adminId, admin_email: adminEmail,
    outlet: 'master', metadata: { oldPrice, newPrice, scope: 'master+unilorin+tanke' },
  });
  if (auditError) throw new Error(`Global price updated but audit logging failed: ${auditError.message}`);

  // The storefront's catalog cache still holds the old price — drop it so the
  // new price shows on the next visit instead of up to 5 minutes later.
  revalidateStorefront("catalog");

  return { success: true, message: `Price synced to ₦${newPrice.toLocaleString()} across all locations` };
};

/**
 * Bulk category price update — e.g., raise all "Body Sprays" by 10%.
 * Updates products.price first, then syncs to all inventory rows.
 */
export const bulkCategoryPriceUpdate = async (
  category: string,
  percentageChange: number,
  adminId: string
) => {
  // Get all products in category from master
  const { data: products } = await getMasterServer()
    .from('products')
    .select('id, price')
    .eq('category', category);

  if (!products?.length) return { success: false, message: "No products found in category" };

  let updated = 0;

  for (const p of products) {
    const newPrice = Math.round((p.price || 0) * (1 + percentageChange / 100));
    await globalPriceUpdate(p.id, newPrice, adminId);
    updated++;
  }

  return { success: true, updated };
};
