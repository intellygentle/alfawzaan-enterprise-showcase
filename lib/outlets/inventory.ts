// Kept as "use server" because an admin client component (ProductUploadForm)
// calls upsertInventory directly, so every export here is a callable endpoint.
// requireStaffSession() rejects a caller without a signed admin/rep cookie
// without reading the database; the outer action layer still performs the full
// permission check. Reads the storefront depends on live in
// lib/storefront/data.ts, not here.
"use server";

import { getOutletDB, getArchiveServer } from "@/lib/supabase/server";
import { revalidateStorefront } from "@/lib/storefront/revalidate";
import { requireStaffSession } from "@/lib/auth/session";
import type { Grade, Outlet, InventoryItem } from "@/lib/types";

export async function getInventory(outlet: Outlet) {
  const db = getOutletDB(outlet);
  const { data, error } = await db
    .from('inventory')
    .select('*')
    .order('product_id');

  if (error) throw error;
  return data ?? [];
}

export async function getLowStock(outlet: Outlet, threshold = 3) {
  const db = getOutletDB(outlet);
  const { data, error } = await db
    .from('inventory')
    .select('*, products(name)')
    .lt('quantity', threshold)
    .order('quantity', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function upsertInventory(
  outlet: Outlet,
  items: InventoryItem[],
  adminId: string,
  adminEmail?: string,
  reason?: string
) {
  await requireStaffSession();
  const db = getOutletDB(outlet);
  if (items.length === 0) return { success: true };

  // ─── 1. Fetch current stock for all products in ONE query ───
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: existing } = await db
    .from('inventory')
    .select('product_id, grade, quantity')
    .in('product_id', productIds);

  const existingMap = new Map(
    (existing ?? []).map(e => [`${e.product_id}-${e.grade}`, e.quantity])
  );

  // ─── 2. Batch upsert all inventory rows in ONE query ───
  const { error: invError } = await db
    .from('inventory')
    .upsert(
      items.map(item => ({
        product_id: item.product_id,
        grade: item.grade,
        quantity: item.quantity,
        price: item.price,
        shelf_location: item.shelf_location,
        last_updated: new Date().toISOString(),
      })),
      { onConflict: 'product_id,grade' }
    );

  if (invError) throw invError;

  // ─── 3. Batch insert all audit adjustments in ONE query ───
    const adjustments = items
    .map(item => {
      const key = `${item.product_id}-${item.grade}`;
      const oldQty = existingMap.get(key) ?? 0;
      if (oldQty === item.quantity) return null;
      return {
        product_id: item.product_id,
        grade: item.grade,
        old_quantity: oldQty,
        new_quantity: item.quantity,
        reason: reason ?? 'Manual stock update',
        admin_id: adminId,
        admin_email: adminEmail,
      };
    })
     .filter((adjustment): adjustment is NonNullable<typeof adjustment> => adjustment !== null);

  if (adjustments.length > 0) {
    // Log stock_adjustments — if this fails, log the error but don't throw
    // because the inventory upsert has already succeeded. Throwing here would
    // make callers think the operation failed, and they might retry — causing
    // a double stock adjustment.
    const { error: adjError } = await db
      .from('stock_adjustments')
      .insert(adjustments);
    if (adjError) {
      console.error(`[upsertInventory] Failed to log stock_adjustment: ${adjError.message}. Inventory was updated but no audit entry was created.`);
    }

    // Also log to audit_logs so adjustments appear in the main activity feed
    const archive = getArchiveServer();
    const reasonText = reason || 'Manual stock update';
    const auditEntries = adjustments.map(adj => ({
      action: 'ADJUSTMENT',
      product_id: adj.product_id,
      details: `${adj.grade}: ${adj.old_quantity} → ${adj.new_quantity} (${reasonText})`,
      admin_id: adminId,
      outlet,
    }));
    const { error: auditError } = await archive
      .from('audit_logs')
      .insert(auditEntries);
    if (auditError) {
      console.error(`[upsertInventory] Failed to log audit entry: ${auditError.message}`);
      // Don't throw — the inventory change itself succeeded
    }
  }

  // Stock levels changed — drop the storefront's cached inventory so shoppers
  // see the new availability on their next load instead of up to 60s later.
  revalidateStorefront("inventory");

  return { success: true };
}

export async function deductStock(
  outlet: Outlet,
  productId: string,
  grade: Grade,
  amount: number,
  adminId: string,
  salePrice?: number,
  allowReservedStock = false,
) {
  await requireStaffSession();
  const db = getOutletDB(outlet);

  // Read current stock
  const { data: current } = await db
    .from('inventory')
    .select('quantity, reserved_quantity')
    .eq('product_id', productId)
    .eq('grade', grade)
    .single();

  const available = current
    ? current.quantity - (allowReservedStock ? 0 : (current.reserved_quantity ?? 0))
    : 0;
  if (!current || available < amount) {
    throw new Error(`Insufficient stock on ${grade} shelf`);
  }

  const newQty = current.quantity - amount;
  const currentReserved = current.reserved_quantity ?? 0;

  // Leave reserved_quantity untouched — releasing reservations is the caller's
  // job, and it must happen AFTER every deduction has succeeded (see verifyOrder).
  //
  // Note the availability check above is against the physical `quantity`, NOT
  // `quantity - reserved_quantity`. That is deliberate: an order's own live
  // reservation must never block the deduction that fulfils it, and holding the
  // reservation across the deduction is what lets a failed verification roll
  // back to a pending order that still owns its stock. Direct sales
  // (recordSale) never create reservations, so there is nothing to release.
  const newReserved = currentReserved;

  // Optimistic concurrency: lock on BOTH quantity AND reserved_quantity
  // to prevent cross-column races with reserveStock (which only updates
  // reserved_quantity with its own lock on that column).
  const { data: updated, error } = await db
    .from('inventory')
    .update({
      quantity: newQty,
      reserved_quantity: newReserved,
      last_updated: new Date().toISOString()
    })
    .eq('product_id', productId)
    .eq('grade', grade)
    .eq('quantity', current.quantity)
    .eq('reserved_quantity', currentReserved)
    .select('quantity');

  if (error) throw error;

  if (!updated || updated.length === 0) {
    throw new Error(
      `Concurrent modification detected for ${grade} shelf. Please retry.`
    );
  }

  const priceInfo = salePrice != null ? ` @ ₦${salePrice.toLocaleString()}` : '';
  await getArchiveServer().from('audit_logs').insert({
    action: 'SALE',
    product_id: productId,
    details: `Deducted ${amount} from ${grade} at ${outlet}${priceInfo}. Remaining: ${newQty}`,
    admin_id: adminId,
    outlet,
    metadata: {
      qty: amount,
      grade,
      outlet,
      ...(salePrice != null ? { price: salePrice } : {}),
    },
  });

  // A sale moved stock — refresh the storefront's cached inventory.
  revalidateStorefront("inventory");

  return { success: true, remaining: newQty };
}

export async function getStockByProduct(outlet: Outlet, productId: string) {
  const db = getOutletDB(outlet);
  const { data, error } = await db
    .from('inventory')
    .select('*')
    .eq('product_id', productId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Re-add stock that was previously deducted — used to reverse partial verification failures.
 * Called when `verifyOrder` fails partway through a multi-item deduct sequence.
 * Logs both a stock_adjustment entry and an audit_log entry for audit transparency.
 */
export async function addStockBack(
  outlet: Outlet,
  productId: string,
  grade: Grade,
  amount: number
) {
  await requireStaffSession();
  const db = getOutletDB(outlet);
  const { data: current } = await db
    .from('inventory')
    .select('quantity')
    .eq('product_id', productId)
    .eq('grade', grade)
    .single();

  if (current) {
    const oldQty = current.quantity;
    const newQty = oldQty + amount;

    // Optimistic concurrency: lock on the current quantity so that if two
    // reversals happen simultaneously, only one succeeds (the other retries
    // or fails gracefully). This prevents double-restoration of stock.
    const { data: updated, error: updateError } = await db
      .from('inventory')
      .update({
        quantity: newQty,
        last_updated: new Date().toISOString(),
      })
      .eq('product_id', productId)
      .eq('grade', grade)
      .eq('quantity', oldQty) // Optimistic lock
      .select('quantity');

    if (updateError) {
      console.error(`[addStockBack] Failed to re-add ${amount} to ${productId} ${grade}:`, updateError);
      return;
    }

    if (!updated || updated.length === 0) {
      // Concurrent modification — the quantity changed between read and update.
      // This is very rare (only during simultaneous verification reversals).
      // Log and silently skip — the other operation already changed the stock,
      // and the reservation/sale that triggered this reversal is still valid.
      console.error(`CRITICAL: [addStockBack] Concurrent modification detected for ${productId} ${grade}. Quantity changed from ${oldQty} while processing reversal — stock was NOT restored and no audit entry was created. Manual check required.`);
      return;
    }

    // Log stock_adjustment entry for granular tracking
    await db.from('stock_adjustments').insert({
      product_id: productId,
      grade,
      old_quantity: oldQty,
      new_quantity: newQty,
      reason: 'Stock restoration (order verification reversal)',
      admin_id: 'system-reversal',
    });

    // Log audit_log entry for visibility in activity feed
    try {
      const archive = getArchiveServer();
      await archive.from('audit_logs').insert({
        action: 'STOCK_RESTORED',
        product_id: productId,
        details: `Restored ${amount} to ${grade} at ${outlet}. Quantity: ${oldQty} → ${newQty}`,
        admin_id: 'system-reversal',
        outlet,
        metadata: {
          qty: amount,
          grade,
          outlet,
        },
      });
    } catch (auditErr) {
      console.error(`[addStockBack] Failed to log audit entry for ${productId}:`, auditErr);
    }

    // Stock was restored — refresh the storefront's cached inventory.
    revalidateStorefront("inventory");
  }
}

/**
 * Syncs a product's price to ALL inventory rows (all grades) at one outlet.
 * Call this after updating products.price to keep inventory prices in sync.
 */
export async function syncPriceToOutletInventory(
  outlet: Outlet,
  productId: string,
  newPrice: number
) {
  await requireStaffSession();
  const db = getOutletDB(outlet);
  const { error } = await db
    .from('inventory')
    .update({ price: newPrice, last_updated: new Date().toISOString() })
    .eq('product_id', productId);

  if (error) throw new Error(`Failed to sync price to ${outlet} inventory: ${error.message}`);
}
