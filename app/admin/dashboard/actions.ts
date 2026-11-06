"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { revalidateStorefront, INTEGRITY_TAG } from "@/lib/storefront/revalidate";
import { computeIntegrityReport, getCachedIntegrityReport, type IntegrityReport } from "@/lib/admin/integrity";
import { getCachedSalesPulseReport } from "@/lib/admin/salesPulseData";
import type { SalesAnalyticsPeriod, SalesAnalyticsReport } from "@/lib/salesPulse/types";
import { createProduct, updateProduct, deleteProduct, updateProductPrice } from "@/lib/master/catalog";
import { upsertInventory, deductStock, addStockBack, getStockByProduct, syncPriceToOutletInventory } from "@/lib/outlets/inventory";
import { releaseReservation, releaseReservationForItem } from "@/lib/outlets/reservations";
import { globalPriceUpdate, bulkCategoryPriceUpdate } from "@/lib/admin/priceSync";
import { uploadProductImage, deleteProductImage } from "@/lib/admin/upload";
import { createOrder, updateOrderStatus, updateOrderItem, updateOrderTotal } from "@/lib/archive/ledger";
import { validateShelfStock, suggestAlternative } from "@/lib/inventoryLogic";
import { processBulkUpload } from "@/lib/admin/bulkUpload";
import type { BulkProductEntry } from "@/lib/admin/bulkUpload";
import {
  getMasterServer,
  getUnilorinServer,
  getTankeServer,
  getArchiveServer,
} from "@/lib/supabase/server";
import type { ProductSearchResult, StockAdjustmentEntry, OrderSaleEntry, ProductAuditData, Grade } from "@/lib/types";
import { resolveDiscrepancyType, computeRecurrence, type SalesFlag, type SalesFlagType, type FlagHistoryRow } from "@/lib/salesFlags";
import { requireAdminSession } from "@/lib/auth/session";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import {
  createRepresentative,
  getRepresentatives,
  updateRepresentative,
  deleteRepresentative,
  type RepresentativePermissions,
} from "@/lib/representatives";

// ─── PRODUCT ACTIONS ───

export async function addProduct(formData: FormData) {
  await requireAdminSession();
  const name = formData.get('name') as string;
  const category = formData.get('category') as string;
  const description = formData.get('description') as string;
  const price = Number(formData.get('price')) || 0;

  const product = await createProduct({ name, category, description, price });
  revalidatePath('/admin/dashboard');
  revalidateStorefront("catalog");
  return product;
}

export async function syncGlobalPrice(productId: string, newPrice: number, adminId: string) {
  await requireAdminSession();
  const result = await globalPriceUpdate(productId, newPrice, adminId);
  revalidatePath('/admin/dashboard');
  return result;
}

// ─── INVENTORY ACTIONS ───

export async function stockIn(
  outlet: 'unilorin' | 'tanke',
  productId: string,
  grade: 'special' | 'extra' | 'normal',
  quantity: number,
  price: number,
  adminId: string
) {
  await requireAdminSession();
  let canonicalPrice = price;
  if (price > 0) {
    await globalPriceUpdate(productId, price, adminId);
  } else {
    const { data: product, error } = await getMasterServer().from('products').select('price').eq('id', productId).single();
    if (error) throw new Error(`Could not load global product price: ${error.message}`);
    canonicalPrice = Number(product.price ?? 0);
  }
  await upsertInventory(outlet, [{ product_id: productId, grade, quantity, price: canonicalPrice }], adminId);

  revalidatePath('/admin/dashboard');
  return { success: true };
}

export async function recordSale(
  outlet: 'unilorin' | 'tanke',
  productId: string,
  requestedGrade: 'special' | 'extra' | 'normal',
  quantity: number,
  adminId: string,
  forceGrade?: 'special' | 'extra' | 'normal'
) {
  await requireAdminSession();
  // Check stock
  const stock = await getStockByProduct(outlet, productId);
  const stockMap = {
    special: Math.max(0, (stock.find((s: any) => s.grade === 'special')?.quantity ?? 0) - (stock.find((s: any) => s.grade === 'special')?.reserved_quantity ?? 0)),
    extra: Math.max(0, (stock.find((s: any) => s.grade === 'extra')?.quantity ?? 0) - (stock.find((s: any) => s.grade === 'extra')?.reserved_quantity ?? 0)),
    normal: Math.max(0, (stock.find((s: any) => s.grade === 'normal')?.quantity ?? 0) - (stock.find((s: any) => s.grade === 'normal')?.reserved_quantity ?? 0)),
  };
  
  const check = validateShelfStock(stockMap, requestedGrade, quantity);
  
  if (!check.success && !forceGrade) {
    // Return conflict for modal
    return {
      conflict: true,
      message: check.message,
      alternatives: check.alternatives,
      stockMap
    };
  }
  
  const gradeToUse = forceGrade || requestedGrade;
  await deductStock(outlet, productId, gradeToUse, quantity, adminId);
  revalidatePath('/admin/dashboard');
  return { success: true, deductedFrom: gradeToUse };
}

// ─── IMAGE ACTIONS ───

export async function uploadImageAction(
  productId: string,
  file: File,
) {
  await requireAdminSession();
  const formData = new FormData();
  formData.append('productId', productId);
  formData.append('file', file);

  const result = await uploadProductImage(formData);
  revalidatePath('/admin/dashboard');
  return result;
}

// ─── EDIT INVENTORY ACTIONS ───

export async function updateProductName(productId: string, name: string) {
  await requireAdminSession();
  const product = await updateProduct(productId, { name });
  revalidatePath('/admin/dashboard');
  revalidateStorefront("catalog");
  return product;
}

export async function updateProductDescription(productId: string, description: string) {
  await requireAdminSession();
  const product = await updateProduct(productId, { description });
  revalidatePath('/admin/dashboard');
  revalidateStorefront("catalog");
  return product;
}

export async function updateInventoryItem(
  outlet: 'unilorin' | 'tanke',
  productId: string,
  grade: 'special' | 'extra' | 'normal',
  quantity: number,
  price: number,
  adminId: string,
  reason?: string
) {
  await requireAdminSession();
  let canonicalPrice = price;
  if (price > 0) {
    await globalPriceUpdate(productId, price, adminId);
  } else {
    const { data: product, error } = await getMasterServer().from('products').select('price').eq('id', productId).single();
    if (error) throw new Error(`Could not load global product price: ${error.message}`);
    canonicalPrice = Number(product.price ?? 0);
  }
  await upsertInventory(outlet, [{ product_id: productId, grade, quantity, price: canonicalPrice }], adminId, undefined, reason);

  revalidatePath('/admin/dashboard');
  return { success: true };
}

export async function uploadProductImageAction(
  productId: string,
  formData: FormData
) {
  await requireAdminSession();
  formData.append('productId', productId);
  const result = await uploadProductImage(formData);
  // Update the product's base_image_url
  await updateProduct(productId, { base_image_url: result.url });
  revalidatePath('/admin/dashboard');
  revalidateStorefront("catalog");
  return result;
}

// ─── BULK UPLOAD ACTION ───

export async function bulkImportProducts(entries: BulkProductEntry[]) {
  await requireAdminSession();
  const results = await processBulkUpload(entries);
  // revalidatePath is called once by finalizeBulkImport after all chunks complete,
  // not here — calling it per chunk causes mid-import page refreshes.
  return results;
}

export async function finalizeBulkImport() {
  await requireAdminSession();
  revalidatePath('/admin/dashboard');
}

// ─── ORDER ACTIONS ───

export async function settleOrder(orderId: string, newStatus: string) {
  await requireAdminSession();
  // Check order is not already in a final state
  const archive = getArchiveServer();
  const { data: order, error: orderError } = await archive
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    throw new Error('Order not found.');
  }
  if (order.status === 'delivered' || order.status === 'cancelled') {
    throw new Error(`This order is already ${order.status} and cannot be changed.`);
  }

  // Release reservations when cancelling
  if (newStatus === 'cancelled') {
    await releaseReservation(orderId);
  }

  await updateOrderStatus(orderId, newStatus as any);
  revalidatePath('/admin/dashboard');
  revalidatePath('/delivery');
}

/**
 * Remove a single item from a pending order, free the stock it was holding,
 * and recalculate the order total. If no items remain, cancel the order.
 *
 * "Free the stock" means releasing the reservation, and nothing else. A pending
 * order has never had its shelf count deducted — only verifyOrder deducts, and
 * this action refuses any order that is no longer pending — so `quantity` is
 * already correct and must not be written. See step 3.
 */
export async function removeOrderItemAction(
  orderItemId: string,
  adminId: string
): Promise<{ success: boolean; message: string }> {
  await requireAdminSession();
  const archive = getArchiveServer();

  try {
    // 1. Fetch the order item
    const { data: item, error: itemError } = await archive
      .from('order_items')
      .select('*')
      .eq('id', orderItemId)
      .single();

    if (itemError || !item) {
      return { success: false, message: 'Order item not found.' };
    }

    // 2. Fetch the parent order to check status
    const { data: order, error: orderError } = await archive
      .from('orders')
      .select('status')
      .eq('id', item.order_id)
      .single();

    if (orderError || !order) {
      return { success: false, message: 'Parent order not found.' };
    }
    if (order.status !== 'pending') {
      return { success: false, message: `Cannot remove items from a ${order.status} order.` };
    }

    const validOutlets = ['unilorin', 'tanke'] as const;
    const validGrades = ['special', 'extra', 'normal', 'pending'] as const;

    const outlet = item.outlet as string;
    const grade = item.grade as string;
    const quantity = item.quantity as number;
    const productName = item.product_name as string;
    const productId = item.product_id as string;

    if (!validOutlets.includes(outlet as any)) {
      return { success: false, message: `Invalid outlet "${outlet}" on order item.` };
    }
    if (!validGrades.includes(grade as any)) {
      return { success: false, message: `Invalid grade "${grade}" on order item.` };
    }

    // 3. Release this item's reservation. This is the *whole* of the stock
    //    restoration, and it must not be followed by an addStockBack.
    //
    //    Placing an order only raises reserved_quantity. The shelf count
    //    (quantity) is untouched until an admin verifies the order, in
    //    verifyOrder → deductStock. Because this action rejects any order that
    //    is no longer pending (status guard above), nothing has come off the
    //    shelf yet — so adding stock back here would invent units that were
    //    never removed, inflating the shelf count on every removal and letting
    //    the store oversell.
    //
    //    A second reason never to write a shelf from item.grade: that is the
    //    grade the cart asked for, whereas the reservation holds whichever
    //    shelf reserveStock actually picked. They can differ, so such a write
    //    could also land on the wrong grade.
    let releasedGrade: string | null = null;
    try {
      releasedGrade = await releaseReservationForItem(
        outlet as 'unilorin' | 'tanke',
        item.order_id,
        productId
      );
    } catch (releaseErr) {
      // Non-fatal — there may simply be no reservation. If one did exist and
      // this failed, verifying or cancelling the order still releases every
      // reservation it holds. Log it so the failure isn't invisible.
      console.error(
        `[removeOrderItem] Could not release the reservation for ${productId} on order ${item.order_id}:`,
        releaseErr
      );
    }

    // 4. Delete the order item
    const { error: deleteError } = await archive
      .from('order_items')
      .delete()
      .eq('id', orderItemId);

    if (deleteError) throw new Error(`Failed to delete item: ${deleteError.message}`);

    // 5. Check remaining items
    const { data: remainingItems } = await archive
      .from('order_items')
      .select('total_price')
      .eq('order_id', item.order_id);

    if (!remainingItems || remainingItems.length === 0) {
      // No items left — cancel the order
      await archive
        .from('orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', item.order_id);
    } else {
      // Recalculate total
      const newTotal = remainingItems.reduce((sum, ri) => sum + (ri.total_price || 0), 0);
      await archive
        .from('orders')
        .update({ total_amount: newTotal, updated_at: new Date().toISOString() })
        .eq('id', item.order_id);
    }

    // 6. Log to audit — report the shelf the reservation actually held, and say
    //    plainly when nothing was released, so the log never claims a stock
    //    movement that did not happen.
    const stockMsg = releasedGrade
      ? `${quantity} unit(s) freed on the ${releasedGrade} shelf and available to buy again`
      : 'No active reservation was held for this item, so no stock changed';
    await archive.from('audit_logs').insert({
      action: 'ORDER_ITEM_REMOVED',
      product_id: productId,
      details: `Removed "${productName}" (${quantity} × ${grade}${outlet ? ` from ${outlet}` : ''}) from order ${item.order_id.slice(0, 8)}. ${stockMsg}.`,
      admin_id: adminId,
      outlet: outlet || 'unknown',
    });

    revalidatePath('/admin/dashboard');
    revalidatePath('/delivery');

    const restoreMsg = releasedGrade
      ? ` — ${quantity} × ${releasedGrade} is on sale again at ${outlet}`
      : '';
    return {
      success: true,
      message: `"${productName}" removed from order${restoreMsg}.`,
    };
  } catch (err: any) {
    console.error('[removeOrderItem] Failed:', err);
    return { success: false, message: err?.message || 'Failed to remove item.' };
  }
}

export async function deleteStuckOrder(orderId: string) {
  await requireAdminSession();
  // Release any reservations first
  await releaseReservation(orderId);

  // Delete the order and its items
  const archive = getArchiveServer();

  // Delete order items
  const { error: itemsError } = await archive
    .from('order_items')
    .delete()
    .eq('order_id', orderId);

  if (itemsError) throw new Error(`Failed to delete order items: ${itemsError.message}`);

  // Delete the order
  const { error: orderError } = await archive
    .from('orders')
    .delete()
    .eq('id', orderId);

  if (orderError) throw new Error(`Failed to delete order: ${orderError.message}`);

  revalidatePath('/admin/dashboard');
  revalidatePath('/delivery');
  return { success: true };
}

export async function updateOrderItemAction(
  itemId: string,
  updates: {
    quantity?: number;
    unit_price?: number;
    total_price?: number;
  }
) {
  await requireAdminSession();
  const result = await updateOrderItem(itemId, updates);
  revalidatePath('/admin/dashboard');
  return { success: true, item: result };
}

export async function verifyOrder(
  orderId: string,
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    grade: 'special' | 'extra' | 'normal';
    outlet: string;
  }>
) {
  await requireAdminSession();
  // 0. Validate inputs
  const validGrades = ['special', 'extra', 'normal'] as const;
  const validOutlets = ['unilorin', 'tanke'] as const;

  for (const item of items) {
    if (!item.id || !item.product_id) {
      throw new Error('Missing item ID or product ID.');
    }
    if (!Number.isFinite(item.quantity) || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      throw new Error(`Invalid quantity for item ${item.id}: must be a positive integer.`);
    }
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw new Error(`Invalid unit price for item ${item.id}: must be a non-negative number.`);
    }
    if (!Number.isFinite(item.total_price) || item.total_price < 0) {
      throw new Error(`Invalid total price for item ${item.id}: must be a non-negative number.`);
    }
    if (!validGrades.includes(item.grade)) {
      throw new Error(`Invalid grade "${item.grade}" for item ${item.id}.`);
    }
    if (!validOutlets.includes(item.outlet as 'unilorin' | 'tanke')) {
      throw new Error(`Invalid outlet "${item.outlet}" for item ${item.id}.`);
    }
    // Verify total matches quantity × unit price (within ₦1 rounding tolerance)
    const expectedTotal = Math.round(item.quantity * item.unit_price);
    if (Math.abs(item.total_price - expectedTotal) > 1) {
      throw new Error(`Price mismatch for item ${item.id}: total ${item.total_price} ≠ ${item.quantity} × ${item.unit_price}.`);
    }
  }

  // 1. Check order is still pending (prevent double verification)
  const archive = getArchiveServer();
  const { data: order, error: orderCheckError } = await archive
    .from('orders')
    .select('status, outlet')
    .eq('id', orderId)
    .single();

  if (orderCheckError || !order) {
    throw new Error('Order not found.');
  }
  if (order.status !== 'pending') {
    throw new Error(`This order has already been ${order.status}. It cannot be verified again.`);
  }

  // 2. Deduct the stock while the order's reservations are STILL HELD. Nothing
  //    is released until the entire verification has succeeded (step 6).
  //
  //    This used to release every reservation up front, before any deduction,
  //    on the reasoning that reserved_quantity should fall before quantity.
  //    That ordering is wrong in two ways:
  //
  //      a) If any step below failed, the rollback restored `quantity` but
  //         nothing re-created the reservations, and the order stayed pending.
  //         It sat in the verification queue holding nothing, so another
  //         shopper could buy those units out from under it.
  //      b) Between the release and the deduction, `quantity - reserved_quantity`
  //         counted units as free that were already spoken for — an oversell
  //         window on every single verification.
  //
  //    Deducting first fixes both. `deductStock` checks the physical `quantity`,
  //    not `quantity - reserved_quantity`, so a live reservation never blocks
  //    it — in fact the reservation guarantees the units are on the shelf.
  //    While both counts are held the shelf briefly under-reports what is free,
  //    which undersells for a moment rather than overselling: the same
  //    deliberate trade-off releaseReservation makes.
  //
  //    Track successful deductions so we can reverse if ANY step fails.
  const successfulDeductions: Array<{
    outlet: 'unilorin' | 'tanke';
    productId: string;
    grade: 'special' | 'extra' | 'normal';
    quantity: number;
  }> = [];

  try {
    for (const item of items) {
      // Deduct stock from the assigned grade shelf
      await deductStock(
        item.outlet as 'unilorin' | 'tanke',
        item.product_id,
        item.grade,
        item.quantity,
        `order-verify-${orderId.slice(0, 8)}`,
        item.unit_price,
        true,
      );
      successfulDeductions.push({
        outlet: item.outlet as 'unilorin' | 'tanke',
        productId: item.product_id,
        grade: item.grade,
        quantity: item.quantity,
      });
    }

    // 3. Every shelf moved. Only now persist the admin's adjusted values and
    //    assigned grades. Writing them after the deductions rather than
    //    alongside them means a failed deduction leaves the order exactly as
    //    the customer placed it, with no shelf grade stamped onto it.
    for (const item of items) {
      await updateOrderItem(item.id, {
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        grade: item.grade,
      });
    }

    // 4. Recalculate and update the order total
    const newTotal = items.reduce((sum, item) => sum + item.total_price, 0);
    await updateOrderTotal(orderId, newTotal);

    // 5. Mark order as paid (verification complete)
    await updateOrderStatus(orderId, 'paid');
  } catch (err: any) {
    // REVERSE: if ANY step fails (deductStock, updateOrderItem, updateOrderTotal,
    // or updateOrderStatus), roll back all successful stock deductions to prevent
    // permanent stock loss. The order stays pending for retry — and because its
    // reservations were never released, it still holds every unit it was
    // promised and can simply be verified again.
    for (const d of successfulDeductions) {
      try {
        await addStockBack(d.outlet, d.productId, d.grade, d.quantity);
      } catch (reverseErr) {
        console.error(`CRITICAL: Failed to reverse deduct for ${d.productId}:`, reverseErr);
      }
    }
    return {
      success: false,
      message: `Verification failed: ${err.message || 'An unexpected error occurred.'}. All stock deductions have been rolled back and the order still holds its stock. Please try again.`,
    };
  }

  // 6. The order is paid and the shelves are already down, so the holds have
  //    done their job and can go. This deliberately sits OUTSIDE the try/catch
  //    above: a failure before this point must leave the reservations intact,
  //    and a failure here cannot undo a paid order. releaseReservation does not
  //    throw on a partial failure — it writes a RESERVATION_RELEASE_FAILED
  //    audit row per stuck reservation and leaves those units counted as
  //    reserved. That undersells and is visible and correctable, rather than
  //    freeing stock twice, which oversells and is not.
  try {
    const { failed } = await releaseReservation(orderId);
    if (failed > 0) {
      console.error(
        `[verifyOrder] order ${orderId}: verified and paid, but ${failed} reservation(s) ` +
          `could not be returned. Those units are still counted as reserved and need a ` +
          `manual correction — see the RESERVATION_RELEASE_FAILED entries in the audit log.`
      );
    }
  } catch (releaseErr) {
    console.error(
      `[verifyOrder] order ${orderId}: verified and paid, but releasing its reservations ` +
        `threw. Some units may still be counted as reserved:`,
      releaseErr
    );
  }

  // Register the gift code (Extravaganza orders only). This is the moment a
  // printed code goes live: the order is now verified, so scanning the QR
  // resolves to a claimable code on the store's claim card and the code
  // appears in the admin Gift Claims tab. Best-effort — a failure must never
  // fail the verification itself.
  try {
    const { registerGiftCode } = await import("@/lib/archive/giftCodes");
    const { giftCodeForOrderId } = await import("@/lib/gifts");
    const registration = await registerGiftCode(orderId, giftCodeForOrderId(orderId));
    if (registration.registered) {
      console.log(`[verifyOrder] order ${orderId}: gift code ${giftCodeForOrderId(orderId)} registered.`);
    }
  } catch (giftErr) {
    console.error(`[verifyOrder] order ${orderId}: gift registration failed (non-fatal):`, giftErr);
  }

  // Record the human-facing verification event. The stock rows written in step 2
  // carry the machine marker "order-verify-…" so direct-sale reporting can tell
  // automated deductions apart; this row carries the request fingerprint
  // (IP / user agent) so the verification is still traceable even though the
  // admin is a single shared credential with no per-person account to name.
  // Best-effort: a failed audit write must never invalidate a paid order.
  try {
    const requestHeaders = await headers();
    await archive.from('audit_logs').insert({
      action: 'ORDER_VERIFIED',
      outlet: order.outlet ?? 'master',
      admin_id: 'admin-order-verify',
      details: `Order ${orderId.slice(0, 8)} verified and marked paid from ${order.outlet ?? 'an outlet'}.`,
      metadata: {
        order_id: orderId,
        ip: clientIpFromHeaders(requestHeaders),
        user_agent: requestHeaders.get('user-agent') ?? null,
      },
    });
  } catch (auditErr) {
    console.error(`[verifyOrder] order ${orderId}: verification audit write failed (non-fatal):`, auditErr);
  }

  revalidatePath('/admin/dashboard');
  revalidatePath('/delivery');
  return { success: true };
}

// ─── PASSWORD VERIFICATION ───

function verifyProductDeletePassword(password: string): void {
  const expected = process.env.DELETE_PRODUCT_PASSWORD;
  if (!expected) {
    throw new Error("DELETE_PRODUCT_PASSWORD is not configured in environment variables.");
  }
  if (password !== expected) {
    throw new Error("Incorrect product delete password. Action denied.");
  }
}

function verifyClearDatabasePassword(password: string): void {
  const expected = process.env.CLEAR_DATABASE_PASSWORD;
  if (!expected) {
    throw new Error("CLEAR_DATABASE_PASSWORD is not configured in environment variables.");
  }
  if (password !== expected) {
    throw new Error("Incorrect clear database password. Action denied.");
  }
}

// ─── DELETE & CLEAR ACTIONS ───

export async function deleteProductAction(
  productId: string,
  adminId: string,
  location: 'unilorin' | 'tanke' | 'both',
  password: string
) {
  await requireAdminSession();
  verifyProductDeletePassword(password);

  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();

  const outletLabel = location === 'both' ? 'Unilorin & Tanke' : location.charAt(0).toUpperCase() + location.slice(1);

  // 1. Delete stock adjustments (selected outlets)
  if (location === 'unilorin' || location === 'both') {
    await unilorin.from('stock_adjustments').delete().eq('product_id', productId);
  }
  if (location === 'tanke' || location === 'both') {
    await tanke.from('stock_adjustments').delete().eq('product_id', productId);
  }

  // 2. Delete inventory entries (selected outlets)
  if (location === 'unilorin' || location === 'both') {
    await unilorin.from('inventory').delete().eq('product_id', productId);
  }
  if (location === 'tanke' || location === 'both') {
    await tanke.from('inventory').delete().eq('product_id', productId);
  }

  // 3. Delete product images records (selected outlets)
  if (location === 'unilorin' || location === 'both') {
    await unilorin.from('product_images').delete().eq('product_id', productId);
  }
  if (location === 'tanke' || location === 'both') {
    await tanke.from('product_images').delete().eq('product_id', productId);
  }

  // 4. Delete order items referencing this product (archive) — scoped to outlet.
  //    Audit history is deliberately NOT deleted. A routine catalog deletion
  //    must never erase evidence of what previously happened to this product;
  //    PRODUCT_DELETED is appended below instead, exactly as PRODUCT_MERGED is,
  //    so the audit trail stays complete and append-only.
  if (location === 'both') {
    await archive.from('order_items').delete().eq('product_id', productId);
  } else {
    await archive.from('order_items').delete().eq('product_id', productId).eq('outlet', location);
  }

  // 5. Only delete the master product + sensory copy if deleting from both outlets
  if (location === 'both') {
    // Fetch product name first to compute the sensory_copy slug
    const { data: productToDelete } = await master
      .from('products')
      .select('name')
      .eq('id', productId)
      .maybeSingle();

    if (productToDelete?.name) {
      const slug = productToDelete.name.toLowerCase().replace(/\s+/g, '-');
      await master.from('sensory_copy').delete().eq('product_id', slug);
    }

    await master.from('products').delete().eq('id', productId);
  }

  // 6. Log the deletion to audit_logs
  await archive.from('audit_logs').insert({
    action: 'PRODUCT_DELETED',
    product_id: productId,
    details: `Product ${productId} was permanently deleted from ${outletLabel}`,
    admin_id: adminId,
    outlet: location,
  });

  revalidatePath('/admin/dashboard');
  revalidateStorefront("both");
  return { success: true, outlet: location };
}

export async function clearDatabaseAction(adminId: string, password: string) {
  await requireAdminSession();
  verifyClearDatabasePassword(password);
  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();

  // Master DB: clear products table
  await master.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Unilorin DB: clear inventory, stock_adjustments, product_images
  await unilorin.from('stock_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await unilorin.from('inventory').delete().neq('product_id', '00000000-0000-0000-0000-000000000000');
  await unilorin.from('product_images').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Tanke DB: clear inventory, stock_adjustments, product_images
  await tanke.from('stock_adjustments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await tanke.from('inventory').delete().neq('product_id', '00000000-0000-0000-0000-000000000000');
  await tanke.from('product_images').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Archive DB: clear orders (cascades to order_items and gift_codes) and
  // delivery_pairs. The audit ledger is intentionally preserved: a data reset
  // must not erase the record of what was cleared or who ran the reset. The
  // DATABASE_CLEARED row below is appended on top of the surviving history.
  await archive.from('gift_codes').delete().neq('code', '__none__');
  await archive.from('delivery_pairs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await archive.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Log the clear event
  const clearHeaders = await headers();
  await archive.from('audit_logs').insert({
    action: 'DATABASE_CLEARED',
    details: 'All product, inventory, and order data was cleared from the system (audit ledger retained)',
    admin_id: adminId,
    outlet: 'master',
    metadata: {
      ip: clientIpFromHeaders(clearHeaders),
      user_agent: clearHeaders.get('user-agent') ?? null,
    },
  });

  revalidatePath('/admin/dashboard');
  revalidateStorefront("both");
  return { success: true };
}

// ─── GRADE AVAILABILITY ───

export async function getAvailableGradesForProduct(
  outlet: string,
  productId: string,
  orderId?: string
): Promise<{ grade: string; quantity: number }[]> {
  await requireAdminSession();
  const db = outlet === 'unilorin' ? getUnilorinServer() : getTankeServer();

  const { data, error } = await db
    .from('inventory')
    .select('grade, quantity, reserved_quantity')
    .eq('product_id', productId);

  if (error) throw error;

  // If an orderId is provided, look up how much this specific order reserved
  // on each grade so we can add it back to the "available" count.
  let orderReservedByGrade: Record<string, number> = {};
  if (orderId) {
    const { data: reservations } = await db
      .from("inventory_reservations")
      .select("assigned_grade, quantity")
      .eq("order_id", orderId)
      .eq("product_id", productId)
      .eq("status", "active");

    for (const r of reservations ?? []) {
      orderReservedByGrade[r.assigned_grade] =
        (orderReservedByGrade[r.assigned_grade] || 0) + r.quantity;
    }
  }

  return (data ?? [])
    .filter(item => {
      const otherReserved = (item.reserved_quantity ?? 0) - (orderReservedByGrade[item.grade] || 0);
      return (item.quantity - Math.max(0, otherReserved)) > 0;
    })
    .map(item => {
      const otherReserved = (item.reserved_quantity ?? 0) - (orderReservedByGrade[item.grade] || 0);
      return {
        grade: item.grade,
        quantity: item.quantity - Math.max(0, otherReserved),
      };
    });
}

// ─── PRODUCT AUDIT / SEARCH ACTIONS ───

export async function getProductNamesByIds(productIds: string[]): Promise<Record<string, string>> {
  await requireAdminSession();
  if (productIds.length === 0) return {};
  const master = getMasterServer();
  const uniqueIds = [...new Set(productIds)];
  const { data, error } = await master
    .from('products')
    .select('id, name')
    .in('id', uniqueIds);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    map[row.id] = row.name;
  }
  return map;
}

export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  await requireAdminSession();
  if (!query || query.trim().length < 2) return [];
  const master = getMasterServer();
  const { data, error } = await master
    .from('products')
    .select('id, name, category, base_image_url')
    .ilike('name', `%${query.trim()}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export interface FlagGoodsSearchItem {
  id: string;
  name: string;
  category: string | null;
  base_image_url: string | null;
  stock: Array<{ grade: Grade; quantity: number }>;
}

/**
 * Catalogue search for the Flagged Goods tab: find a product by name and read
 * its current stock in one outlet so an admin can raise a discrepancy flag
 * without waiting for a sale record.
 *
 * Egress note: this runs only on an explicit, debounced search. It reads the
 * master catalogue plus the inventory rows for the matched products, and it
 * never calls or revalidates the cached storefront/overview queries.
 */
export async function searchGoodsForFlagging(
  query: string,
  outlet: 'unilorin' | 'tanke'
): Promise<FlagGoodsSearchItem[]> {
  await requireAdminSession();
  const trimmed = query?.trim() ?? '';
  if (trimmed.length < 2) return [];
  if (!['unilorin', 'tanke'].includes(outlet)) throw new Error('A valid outlet is required.');

  const master = getMasterServer();
  const { data: products, error } = await master
    .from('products')
    .select('id, name, category, base_image_url')
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(20);
  if (error) throw new Error(`Failed to search products: ${error.message}`);
  if (!products || products.length === 0) return [];

  const db = outlet === 'unilorin' ? getUnilorinServer() : getTankeServer();
  const { data: inventory, error: inventoryError } = await db
    .from('inventory')
    .select('product_id, grade, quantity')
    .in('product_id', products.map((product: any) => product.id));
  if (inventoryError) throw new Error(`Failed to load stock for these products: ${inventoryError.message}`);

  const stockByProduct = new Map<string, Map<string, number>>();
  for (const row of (inventory ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    if (!stockByProduct.has(row.product_id)) stockByProduct.set(row.product_id, new Map());
    stockByProduct.get(row.product_id)!.set(row.grade, row.quantity);
  }

  const grades: Grade[] = ['special', 'extra', 'normal'];
  return products.map((product: any) => ({
    id: product.id,
    name: product.name,
    category: product.category ?? null,
    base_image_url: product.base_image_url ?? null,
    stock: grades.map((grade) => ({
      grade,
      quantity: stockByProduct.get(product.id)?.get(grade) ?? 0,
    })),
  }));
}

export async function getProductAudit(productId: string): Promise<ProductAuditData> {
  await requireAdminSession();
  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();
  const { data: aliases, error: aliasError } = await master
    .from('product_aliases')
    .select('alias_product_id')
    .eq('survivor_product_id', productId);
  const aliasTableMissing = aliasError && (/product_aliases|relation .* does not exist|PGRST205/i.test(aliasError.message));
  if (aliasError && !aliasTableMissing) throw new Error(`Failed to load merged product aliases: ${aliasError.message}`);
  const historyProductIds = [productId, ...(aliases ?? []).map((alias) => alias.alias_product_id)];

  // Fetch all data in parallel (allSettled for resilience across 4 DBs)
  const results = await Promise.allSettled([
    master.from('products').select('*').eq('id', productId).maybeSingle(),
    unilorin.from('inventory').select('product_id, grade, quantity, price').eq('product_id', productId),
    tanke.from('inventory').select('product_id, grade, quantity, price').eq('product_id', productId),
    unilorin.from('stock_adjustments').select('*').in('product_id', historyProductIds).order('created_at', { ascending: false }).limit(100),
    tanke.from('stock_adjustments').select('*').in('product_id', historyProductIds).order('created_at', { ascending: false }).limit(100),
    archive
      .from('order_items')
      .select(`
        order_id,
        product_name,
        grade,
        quantity,
        unit_price,
        total_price,
        outlet,
        orders!inner(
          customer_name,
          customer_phone,
          status,
          created_at
        )
      `)
       .in('product_id', historyProductIds)
      .order('order_id', { ascending: false })
      .limit(100),
    archive
      .from('audit_logs')
      .select('*')
       .in('product_id', historyProductIds)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // Helper: safely extract data from a settled result
  const getData = (r: (typeof results)[number]) =>
    r.status === 'fulfilled' && r.value ? (r.value as any).data ?? null : null;

  const product = getData(results[0]) as {
    id: string; name: string; category: string; description: string | null;
    base_image_url: string | null; created_at: string; updated_at: string;
  } | null;
  const uInv = getData(results[1]) as any[] | null;
  const tInv = getData(results[2]) as any[] | null;
  const uAdjustments = getData(results[3]) as any[] | null;
  const tAdjustments = getData(results[4]) as any[] | null;
  const orderItemsRaw = getData(results[5]) as any[] | null;
  const auditLogsRaw = getData(results[6]) as any[] | null;

  // Build inventory maps
  const makeStock = (items: any[] | null) => {
    const map: Record<string, { quantity: number; price: number }> = {
      special: { quantity: 0, price: 0 },
      extra: { quantity: 0, price: 0 },
      normal: { quantity: 0, price: 0 },
    };
    for (const item of items ?? []) {
      if (map[item.grade]) {
        map[item.grade] = { quantity: item.quantity, price: item.price };
      }
    }
    return map;
  };

  const uStock = makeStock(uInv);
  const tStock = makeStock(tInv);

  // Tag adjustments with outlet
  const adjustments: StockAdjustmentEntry[] = [
    ...(uAdjustments ?? []).map((a: any) => ({ ...a, outlet: 'unilorin' as const })),
    ...(tAdjustments ?? []).map((a: any) => ({ ...a, outlet: 'tanke' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Parse order sales
  const orderSales: OrderSaleEntry[] = (orderItemsRaw ?? []).map((item: any) => ({
    order_id: item.order_id,
    product_name: item.product_name,
    grade: item.grade,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
    outlet: item.outlet,
    customer_name: item.orders?.customer_name ?? null,
    customer_phone: item.orders?.customer_phone ?? '',
    order_status: item.orders?.status ?? 'unknown',
    order_created_at: item.orders?.created_at ?? '',
  })).sort((a: OrderSaleEntry, b: OrderSaleEntry) =>
    new Date(b.order_created_at).getTime() - new Date(a.order_created_at).getTime()
  );

  return {
    product: product ?? null,
    inventory: {
      unilorin: {
        special: uStock.special.quantity,
        extra: uStock.extra.quantity,
        normal: uStock.normal.quantity,
      },
      tanke: {
        special: tStock.special.quantity,
        extra: tStock.extra.quantity,
        normal: tStock.normal.quantity,
      },
    },
    stockAdjustments: adjustments,
    orderSales,
    auditLogs: auditLogsRaw ?? [],
  };
}

// ─── REPRESENTATIVE MANAGEMENT ACTIONS ───

export async function getRepresentativesAction() {
  await requireAdminSession();
  return getRepresentatives();
}

export async function createRepresentativeAction(
  username: string,
  password: string,
  displayName: string,
  outlet: 'unilorin' | 'tanke',
  permissions: RepresentativePermissions
) {
  await requireAdminSession();
  const rep = await createRepresentative(username, password, displayName, outlet, permissions);
  revalidatePath('/admin/dashboard');
  return rep;
}

export async function updateRepresentativeAction(
  id: string,
  updates: {
    display_name?: string;
    outlet?: 'unilorin' | 'tanke';
    permissions?: RepresentativePermissions;
    is_active?: boolean;
    password?: string;
  }
) {
  await requireAdminSession();
  const rep = await updateRepresentative(id, updates);
  revalidatePath('/admin/dashboard');
  return rep;
}

export async function deleteRepresentativeAction(id: string) {
  await requireAdminSession();
  await deleteRepresentative(id);
  revalidatePath('/admin/dashboard');
}

// ─── DELIVERY MANAGEMENT ACTIONS ───

import {
  updateDeliveryRequestStatus as updateDeliveryRequestStatusDB,
  updateDeliveryPairStatus as updateDeliveryPairStatusDB,
  deleteDeliveryPair as deleteDeliveryPairDB,
  getDeliveryRequests,
  getDeliveryPairs,
} from "@/lib/archive/delivery";
import type { DeliveryRequestStatus, DeliveryPairStatus } from "@/lib/types";

export async function getAdminDeliveryRequests(status?: DeliveryRequestStatus) {
  await requireAdminSession();
  return getDeliveryRequests(status);
}

export async function getAdminDeliveryPairs(status?: DeliveryPairStatus) {
  await requireAdminSession();
  return getDeliveryPairs(status);
}


// ─── DUPLICATE PRODUCT DETECTION & MERGE ───

interface DuplicateCandidate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  base_image_url: string | null;
  price: number | null;
  created_at: string;
}

export interface DuplicateGroup {
  key: string; // normalized name used for grouping
  displayName: string; // most complete name
  products: DuplicateCandidate[];
  unilorinStock: Record<string, number>; // grade -> total qty across all products
  tankeStock: Record<string, number>;
  totalOrders: number;
}

/**
 * Extract the base name of a product and determine if its original name contains a size suffix.
 *
 * Two products whose names differ only by size suffix (e.g. "Betres" vs "Betres 100ml")
 * are duplicates. Two products with DIFFERENT size suffixes (e.g. "24k 100ML" vs "24K 30ML")
 * are distinct products and should NOT be grouped as duplicates.
 *
 * Returns:
 *  - baseName:      the name with any size suffix stripped (used as grouping key)
 *  - hasSizeSuffix: true if the original name contained a size indicator
 */
function extractBaseName(name: string): { baseName: string; hasSizeSuffix: boolean } {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  // Pattern: optional whitespace + digits + whitespace + volume unit
  // Examples: "100ml", "100 ml", "50ML", "30Ml", "100 mL", "100 MLS", "100 milliliter"
  const sizeRegex = /\s*\d+\s*(?:ml|mls|milliliter|millilitre)s?\b/gi;

  const hasSizeSuffix = sizeRegex.test(lower);
  sizeRegex.lastIndex = 0; // reset global regex state

  // If no digit+ml pattern found, also check for bare "ml" (e.g. "Betres ml")
  if (!hasSizeSuffix) {
    const bareMlRegex = /\s*ml\b/gi;
    const hasBareMl = bareMlRegex.test(lower);
    bareMlRegex.lastIndex = 0;

    if (hasBareMl) {
      const baseName = lower
        .replace(bareMlRegex, '')
        .trim()
        .replace(/\s+/g, ' ');
      return { baseName, hasSizeSuffix: true };
    }
  }

  // Strip the size suffix to derive the base name
  const baseName = lower
    .replace(sizeRegex, '')
    .trim()
    .replace(/\s+/g, ' ');

  return { baseName, hasSizeSuffix };
}

/**
 * Strip common "new" markers from a product name.
 * E.g. "Betres (New)" → "Betres", "[New] Oud Touch" → "Oud Touch",
 * "New Fragrance" → "Fragrance".
 */
function stripNewMarkers(name: string): string {
  return name
    .replace(/\s*\(\s*new\s*\)\s*/gi, ' ')
    .replace(/\s*\[\s*new\s*\]\s*/gi, ' ')
    .replace(/\bnew\b\s*/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Check if a product name contains a "new" marker.
 */
function hasNewMarker(name: string): boolean {
  return /\(\s*new\s*\)/i.test(name) || /\[\s*new\s*\]/i.test(name) || /\bnew\b/i.test(name);
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Find products with similar names and group them for manual review.
 *
 * OPTIMIZED for Vercel free-tier (10s timeout):
 * Fetches ALL data upfront in 4 parallel queries, builds lookup maps
 * in memory, then processes matches with ZERO additional DB roundtrips.
 */
export async function findDuplicateProducts(): Promise<DuplicateGroup[]> {
  await requireAdminSession();
  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();

  // ─── 1. Fetch ALL data upfront (4 parallel queries) ───
  const [prodRes, uInvRes, tInvRes, orderRes] = await Promise.all([
    master
      .from('products')
      .select('id, name, category, description, base_image_url, price, created_at')
      .order('name'),
    unilorin
      .from('inventory')
      .select('product_id, grade, quantity'),
    tanke
      .from('inventory')
      .select('product_id, grade, quantity'),
    archive
      .from('order_items')
      .select('product_id'),
  ]);

  if (prodRes.error) throw new Error(`Failed to fetch products: ${prodRes.error.message}`);
  const products = prodRes.data ?? [];
  if (products.length === 0) return [];

  // ─── 2. Build in-memory lookup maps ───
  // Inventory: product_id -> { grade -> quantity }
  const uInvMap = new Map<string, Record<string, number>>();
  for (const row of (uInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    if (!uInvMap.has(row.product_id)) uInvMap.set(row.product_id, {});
    const stocks = uInvMap.get(row.product_id)!;
    stocks[row.grade] = (stocks[row.grade] || 0) + row.quantity;
  }

  const tInvMap = new Map<string, Record<string, number>>();
  for (const row of (tInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    if (!tInvMap.has(row.product_id)) tInvMap.set(row.product_id, {});
    const stocks = tInvMap.get(row.product_id)!;
    stocks[row.grade] = (stocks[row.grade] || 0) + row.quantity;
  }

  // Products that appear in order_items (set of product_id for quick lookup)
  const orderedProductIds = new Set<string>();
  for (const row of (orderRes.data ?? []) as Array<{ product_id: string }>) {
    orderedProductIds.add(row.product_id);
  }

  // ─── 3. Extract base names & track size suffixes per product ───
  // A product whose name has no size suffix (e.g. "Betres") is a candidate for
  // being a duplicate of a product with a size suffix (e.g. "Betres 100ml").
  // Products with DIFFERENT size suffixes (e.g. "24k 100ML" vs "24K 30ML")
  // are distinct products and should NOT be grouped as duplicates.
  const sizeSuffixMap = new Map<string, boolean>(); // productId -> hasSizeSuffix
  const exactGroups = new Map<string, DuplicateCandidate[]>();
  for (const p of products) {
    const { baseName, hasSizeSuffix } = extractBaseName(p.name);
    if (!baseName) continue;
    sizeSuffixMap.set(p.id, hasSizeSuffix);
    if (!exactGroups.has(baseName)) exactGroups.set(baseName, []);
    exactGroups.get(baseName)!.push(p);
  }

  const groups: DuplicateGroup[] = [];
  const normalizedKeys = Array.from(exactGroups.keys());

  // Helper: compute stock for a set of product IDs from the lookup maps
  function computeStock(productIds: string[]): {
    unilorinStock: Record<string, number>;
    tankeStock: Record<string, number>;
    totalOrders: number;
  } {
    const uStock: Record<string, number> = {};
    const tStock: Record<string, number> = {};
    let orders = 0;

    for (const pid of productIds) {
      const uData = uInvMap.get(pid);
      if (uData) {
        for (const [grade, qty] of Object.entries(uData)) {
          uStock[grade] = (uStock[grade] || 0) + qty;
        }
      }

      const tData = tInvMap.get(pid);
      if (tData) {
        for (const [grade, qty] of Object.entries(tData)) {
          tStock[grade] = (tStock[grade] || 0) + qty;
        }
      }

      if (orderedProductIds.has(pid)) orders++;
    }

    return { unilorinStock: uStock, tankeStock: tStock, totalOrders: orders };
  }

  // ─── 4. Process exact matches (same base name, 2+ products) ───
  // Only include a group if at least one product LACKS a size suffix.
  // If every product already has a size suffix (e.g. "24k 100ML" + "24K 30ML"),
  // they are different sizes of the same fragrance line — NOT duplicates.
  for (const key of normalizedKeys) {
    const group = exactGroups.get(key)!;
    if (group.length < 2) continue;

    // Skip if every product in the group has a size suffix in its name
    const allHaveSizes = group.every(p => sizeSuffixMap.get(p.id) === true);
    if (allHaveSizes) continue;

    const productIds = group.map(p => p.id);
    const stock = computeStock(productIds);
    const displayName = group.reduce((a, b) => a.name.length >= b.name.length ? a : b).name;

    groups.push({
      key,
      displayName,
      products: group,
      ...stock,
    });
  }

  // ─── 5. Process fuzzy matches (Levenshtein) between remaining single-product groups ───
  const singleProductKeys = normalizedKeys.filter(k => (exactGroups.get(k)?.length ?? 0) === 1);

  // Collect fuzzy pairs first, then build groups in a second pass (avoids mutation during iteration)
  const usedKeys = new Set<string>();
  const fuzzyGroups: { keyA: string; keyB: string; allProducts: DuplicateCandidate[] }[] = [];

  for (let i = 0; i < singleProductKeys.length; i++) {
    const keyA = singleProductKeys[i];
    if (usedKeys.has(keyA)) continue;
    const productsA = exactGroups.get(keyA);
    if (!productsA || productsA.length === 0) continue;

    for (let j = i + 1; j < singleProductKeys.length; j++) {
      const keyB = singleProductKeys[j];
      if (usedKeys.has(keyB)) continue;
      const productsB = exactGroups.get(keyB);
      if (!productsB || productsB.length === 0) continue;

      const dist = levenshtein(keyA, keyB);

      if (dist <= 2) {
        fuzzyGroups.push({
          keyA,
          keyB,
          allProducts: [...productsA, ...productsB],
        });
        usedKeys.add(keyA);
        usedKeys.add(keyB);
        break;
      }
    }
  }

  for (const fg of fuzzyGroups) {
    // Skip if every product in the fuzzy match has a size suffix
    const allHaveSizes = fg.allProducts.every(p => sizeSuffixMap.get(p.id) === true);
    if (allHaveSizes) continue;

    const productIds = fg.allProducts.map(p => p.id);
    const stock = computeStock(productIds);
    const displayName = fg.allProducts.reduce((a, b) => a.name.length >= b.name.length ? a : b).name;

    groups.push({
      key: `${fg.keyA} / ${fg.keyB}`,
      displayName,
      products: fg.allProducts,
      ...stock,
    });
  }

  // ─── 6. Process "new marker + same price" matches ───
  // If two products share the same cleaned name (after stripping both size
  // suffixes and "new" markers) AND the same price, and at least one has a
  // "new" marker in its original name, they are duplicates.
  //
  // This catches cases the size-suffix logic misses, like:
  //   "Betres 100ml" + "Betres (New) 100ml" (both have size suffixes)
  // or products that reached different base names due to the "new" marker.
  const newMarkerGroupMap = new Map<string, DuplicateCandidate[]>();
  const newMarkerDisplayNameMap = new Map<string, string>();

  for (const p of products) {
    const { baseName } = extractBaseName(p.name);
    if (!baseName) continue;

    const cleaned = stripNewMarkers(baseName);
    if (!cleaned) continue;

    const price = p.price ?? 0;
    const groupKey = `${cleaned}|${price}`;

    if (!newMarkerGroupMap.has(groupKey)) {
      newMarkerGroupMap.set(groupKey, []);
      newMarkerDisplayNameMap.set(groupKey, p.name);
    }
    newMarkerGroupMap.get(groupKey)!.push(p);

    // Track the most complete display name
    if (p.name.length > (newMarkerDisplayNameMap.get(groupKey)?.length ?? 0)) {
      newMarkerDisplayNameMap.set(groupKey, p.name);
    }
  }

  for (const [groupKey, nmGroup] of newMarkerGroupMap) {
    if (nmGroup.length < 2) continue;

    // Only flag if at least one product has a "new" marker in its original name
    const hasNew = nmGroup.some(p => hasNewMarker(p.name));
    if (!hasNew) continue;

    const [cleanedName] = groupKey.split('|');

    // Check if this group overlaps with an existing group (e.g. from step 4 or 5)
    const existingGroup = groups.find(g =>
      nmGroup.some(nmP => g.products.some(gP => gP.id === nmP.id))
    );

    if (existingGroup) {
      // Merge any new products into the existing group
      const existingIds = new Set(existingGroup.products.map(p => p.id));
      const newProducts = nmGroup.filter(p => !existingIds.has(p.id));
      if (newProducts.length === 0) continue;

      existingGroup.products.push(...newProducts);
      const allIds = existingGroup.products.map(p => p.id);
      const updatedStock = computeStock(allIds);
      existingGroup.unilorinStock = updatedStock.unilorinStock;
      existingGroup.tankeStock = updatedStock.tankeStock;
      existingGroup.totalOrders = updatedStock.totalOrders;
      existingGroup.displayName = existingGroup.products.reduce((a, b) =>
        a.name.length >= b.name.length ? a : b
      ).name;
    } else {
      // New group — add it
      const productIds = nmGroup.map(p => p.id);
      const stock = computeStock(productIds);

      groups.push({
        key: `${cleanedName}`,
        displayName: newMarkerDisplayNameMap.get(groupKey) ?? cleanedName,
        products: nmGroup,
        ...stock,
      });
    }
  }

  // Sort by display name
  groups.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return groups;
}

/**
 * Merge duplicate products: consolidate all inventory, orders, and audit logs
 * under the survivor product, then delete the duplicates.
 */
export async function mergeDuplicateProducts(
  survivorId: string,
  duplicateIds: string[],
  adminId: string
): Promise<{ success: boolean; message: string }> {
  await requireAdminSession();
  const uniqueDuplicateIds = [...new Set(duplicateIds)].filter((id) => id !== survivorId);
  if (!survivorId || uniqueDuplicateIds.length === 0) {
    return { success: false, message: 'Must provide a survivor product ID and at least one duplicate.' };
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![survivorId, ...uniqueDuplicateIds].every((id) => uuidPattern.test(id))) {
    return { success: false, message: 'One or more product IDs are invalid.' };
  }

  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();

  const workflowId = crypto.randomUUID();
  const allIds = [survivorId, ...uniqueDuplicateIds];
  const outletResults: Record<string, { before?: unknown; result?: unknown }> = {};
  let duplicateSnapshots: Array<Record<string, unknown>> = [];
  let aliasesCreated = false;
  try {
    const [{ data: products, error: productError }, { data: pendingItems, error: pendingError }, ...reservationResults] = await Promise.all([
      master.from('products').select('id, name, category, price, base_image_url').in('id', allIds),
      archive.from('order_items').select('id, product_id, orders!inner(id, status)').in('product_id', allIds).eq('orders.status', 'pending'),
      unilorin.from('inventory_reservations').select('id, product_id').in('product_id', allIds).eq('status', 'active'),
      tanke.from('inventory_reservations').select('id, product_id').in('product_id', allIds).eq('status', 'active'),
    ]);
    if (productError || pendingError) throw new Error(productError?.message || pendingError?.message);
    if ((products ?? []).length !== allIds.length) throw new Error('Every selected product must exist in Master before merging.');
    const activeReservationCount = reservationResults.reduce((sum, result) => {
      if (result.error) throw new Error(result.error.message);
      return sum + (result.data?.length ?? 0);
    }, 0);
    if (activeReservationCount > 0) throw new Error(`Merge blocked: ${activeReservationCount} active reservation(s) reference the selected products.`);
    if ((pendingItems ?? []).length > 0) throw new Error(`Merge blocked: ${(pendingItems ?? []).length} pending order item(s) reference the selected products.`);

    const survivor = (products ?? []).find((product) => product.id === survivorId)!;
    const duplicates = (products ?? []).filter((product) => uniqueDuplicateIds.includes(product.id));
    duplicateSnapshots = duplicates as Array<Record<string, unknown>>;
    const globalPrice = Number(survivor.price ?? 0);
    if (!Number.isFinite(globalPrice) || globalPrice < 0) throw new Error('The survivor has an invalid Master price.');

    const { error: startedError } = await archive.from('audit_logs').insert({
      action: 'PRODUCT_MERGE_STARTED', product_id: survivorId,
      product_name: survivor.name, admin_id: adminId, outlet: 'master',
      details: `Started physical-product merge into ${survivor.name}.`,
      metadata: { workflowId, survivor, duplicates },
    });
    if (startedError) throw new Error(`Could not record merge start: ${startedError.message}`);

    // Establish the Master-authoritative price before inventory is consolidated.
    // The outlet RPC receives the same price so every surviving grade matches.
    await globalPriceUpdate(survivorId, globalPrice, adminId);

    for (const [outlet, db] of [['unilorin', unilorin], ['tanke', tanke]] as const) {
      const { data, error } = await db.rpc('merge_product_inventory', {
        p_survivor_id: survivorId,
        p_duplicate_ids: uniqueDuplicateIds,
        p_global_price: globalPrice,
      });
      if (error) {
        const missingRpc = error.code === 'PGRST202' || /merge_product_inventory/i.test(error.message);
        throw new Error(missingRpc
          ? `Merge is disabled until the atomic merge migration is applied to ${outlet}.`
          : `${outlet} merge failed: ${error.message}`);
      }
      const mergeResult = data as { before?: unknown } | null;
      outletResults[outlet] = { before: mergeResult?.before, result: data };
    }

    const aliasRows = duplicates.map((product) => ({
      alias_product_id: product.id, survivor_product_id: survivorId,
      alias_name: product.name, survivor_name: survivor.name,
      merged_by: adminId, workflow_id: workflowId,
    }));
    const { error: aliasError } = await master.from('product_aliases').upsert(aliasRows, { onConflict: 'alias_product_id' });
    if (aliasError) throw new Error(`Could not preserve product aliases: ${aliasError.message}`);
    aliasesCreated = true;

    // Historical order_items and audit_logs intentionally retain their original
    // product IDs. product_aliases resolves those identities without rewriting evidence.
    const { error: deleteError } = await master.from('products').delete().in('id', uniqueDuplicateIds);
    if (deleteError) throw new Error(`Could not delete duplicate catalog records: ${deleteError.message}`);
    const { error: completedError } = await archive.from('audit_logs').insert({
      action: 'PRODUCT_MERGED', product_id: survivorId, product_name: survivor.name,
      admin_id: adminId, outlet: 'master',
      details: `Merged ${duplicates.map((product) => product.name).join(', ')} into ${survivor.name}. Historical audit and order records were preserved.`,
      metadata: { workflowId, survivor, aliases: duplicates, globalPrice, outletResults },
    });
    if (completedError) console.error(`[mergeDuplicates] Merge ${workflowId} completed but final audit failed:`, completedError);

    revalidatePath('/admin/dashboard'); revalidatePath('/store');
    return { success: true, message: `Merged ${uniqueDuplicateIds.length} alias product(s) into ${survivor.name}. Historical audits were preserved.` };
  } catch (err: any) {
    console.error('[mergeDuplicates] Failed:', err);
    // Each outlet merge captures its complete inventory before-state. Restore
    // every outlet that committed if a later outlet/Master step failed.
    const completedOutlets = Object.entries(outletResults ?? {}) as Array<['unilorin' | 'tanke', { before?: unknown }]>;
    const rollbackResults: Record<string, string> = {};
    for (const [outlet, result] of completedOutlets) {
      if (!result.before) continue;
      const db = outlet === 'unilorin' ? unilorin : tanke;
      const { error: rollbackError } = await db.rpc('restore_merged_product_inventory', {
        p_survivor_id: survivorId, p_duplicate_ids: uniqueDuplicateIds, p_before: result.before,
      });
      rollbackResults[outlet] = rollbackError ? rollbackError.message : 'restored';
    }
    if (aliasesCreated) await master.from('product_aliases').delete().eq('workflow_id', workflowId);
    if (duplicateSnapshots.length > 0) {
      const { data: survivorsStillPresent } = await master.from('products').select('id').in('id', uniqueDuplicateIds);
      const present = new Set((survivorsStillPresent ?? []).map((row) => row.id));
      const missing = duplicateSnapshots.filter((row) => !present.has(String(row.id)));
      if (missing.length > 0) await master.from('products').insert(missing);
    }
    await archive.from('audit_logs').insert({
      action: 'PRODUCT_MERGE_FAILED', product_id: survivorId, admin_id: adminId,
      outlet: 'master', details: err?.message || 'Merge failed.',
      metadata: { workflowId, survivorId, duplicateIds: uniqueDuplicateIds, rollbackResults },
    });
    return { success: false, message: err?.message || 'Merge failed due to an unexpected error.' };
  }
}

export async function adminUpdateDeliveryStatus(
  requestId: string,
  status: DeliveryRequestStatus,
  adminId: string
) {
  await requireAdminSession();
  const request = await updateDeliveryRequestStatusDB(requestId, status);

  // Log to audit
  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: `DELIVERY_${status.toUpperCase()}`,
    details: `Delivery request ${requestId.slice(0, 8)} set to "${status}"`,
    admin_id: adminId,
    outlet: "master",
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/delivery");
  return request;
}

export async function adminCompleteDelivery(
  requestId: string,
  orderId: string,
  adminId: string
) {
  await requireAdminSession();
  // Update delivery request to delivered
  await updateDeliveryRequestStatusDB(requestId, "delivered");

  // Update the parent order to delivered
  await updateOrderStatus(orderId, "delivered");

  // Log to audit
  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DELIVERY_COMPLETED",
    details: `Delivery ${requestId.slice(0, 8)} completed. Order ${orderId.slice(0, 8)} marked as delivered.`,
    admin_id: adminId,
    outlet: "master",
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/delivery");
}

export async function adminApprovePair(
  pairId: string,
  adminId: string
) {
  await requireAdminSession();
  const pair = await updateDeliveryPairStatusDB(pairId, "approved");

  // Also approve both delivery requests
  if (pair.delivery_request_id_1) {
    await updateDeliveryRequestStatusDB(pair.delivery_request_id_1, "approved");
  }
  if (pair.delivery_request_id_2) {
    await updateDeliveryRequestStatusDB(pair.delivery_request_id_2, "approved");
  }

  // Log to audit
  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DELIVERY_PAIR_APPROVED",
    details: `Delivery pair ${pairId.slice(0, 8)} approved`,
    admin_id: adminId,
    outlet: "master",
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/delivery");
  return pair;
}

export async function adminRejectPair(
  pairId: string,
  adminId: string,
  reason?: string
) {
  await requireAdminSession();
  const pair = await updateDeliveryPairStatusDB(pairId, "completed", reason || "Rejected by admin");

  // Log to audit
  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DELIVERY_PAIR_REJECTED",
    details: `Delivery pair ${pairId.slice(0, 8)} rejected${reason ? `: ${reason}` : ""}`,
    admin_id: adminId,
    outlet: "master",
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/delivery");
  return pair;
}

export async function adminDeletePair(
  pairId: string,
  adminId: string
) {
  await requireAdminSession();
  await deleteDeliveryPairDB(pairId);

  // Log to audit
  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DELIVERY_PAIR_DELETED",
    details: `Delivery pair ${pairId.slice(0, 8)} deleted`,
    admin_id: adminId,
    outlet: "master",
  });

  revalidatePath("/admin/dashboard");
  revalidatePath("/delivery");
}

// ─── SALE REVERSAL ───

/**
 * Reverse a previously recorded SALE audit log entry.
 * Adds stock back to the exact grade it was deducted from
 * and logs a SALE_REVERSED entry for full audit transparency.
 */
export async function reverseSaleAction(
  auditLogId: string,
  adminId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  await requireAdminSession();
  const archive = getArchiveServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();

  try {
    // 1. Fetch the audit log entry
    const { data: log, error: logError } = await archive
      .from('audit_logs')
      .select('*')
      .eq('id', auditLogId)
      .single();

    if (logError || !log) {
      return { success: false, message: 'Audit log entry not found.' };
    }

    // 2. Validate it's a SALE entry
    if (log.action !== 'SALE') {
      return { success: false, message: 'Only SALE entries can be reversed.' };
    }

    // 3. Extract sale details — try structured metadata first, fall back to regex for old entries
    let quantity: number, grade: string;

    if (log.metadata?.qty != null && log.metadata?.grade) {
      quantity = log.metadata.qty;
      grade = log.metadata.grade;
    } else {
      const deductMatch = log.details?.match(/Deducted (\d+) from (\w+)/);
      if (!deductMatch) {
        return { success: false, message: 'Could not parse sale details. Manual stock adjustment required.' };
      }
      quantity = parseInt(deductMatch[1]);
      grade = deductMatch[2].toLowerCase();
    }

    if (!['special', 'extra', 'normal'].includes(grade)) {
      return { success: false, message: `Invalid grade "${grade}" in audit log.` };
    }

    const outlet = log.outlet as 'unilorin' | 'tanke';
    if (!['unilorin', 'tanke'].includes(outlet)) {
      return { success: false, message: `Invalid outlet "${outlet}" in audit log.` };
    }

    // 4. Check if this sale has already been reversed
    const { data: existingReversal } = await archive
      .from('audit_logs')
      .select('id')
      .eq('action', 'SALE_REVERSED')
      .eq('product_id', log.product_id)
      .ilike('details', `%reversal of audit log ${auditLogId.slice(0, 8)}%`)
      .maybeSingle();

    if (existingReversal) {
      return { success: false, message: 'This sale has already been reversed.' };
    }

    // 5. Add stock back with optimistic concurrency
    const outletDb = outlet === 'unilorin' ? unilorin : tanke;
    const { data: current } = await outletDb
      .from('inventory')
      .select('quantity')
      .eq('product_id', log.product_id)
      .eq('grade', grade)
      .single();

    if (current) {
      const oldQty = current.quantity;
      const newQty = oldQty + quantity;

      // Optimistic concurrency: lock on current quantity to prevent
      // double-restoration if two reversals overlap
      const { data: updated, error: updError } = await outletDb
        .from('inventory')
        .update({
          quantity: newQty,
          last_updated: new Date().toISOString(),
        })
        .eq('product_id', log.product_id)
        .eq('grade', grade)
        .eq('quantity', oldQty) // Optimistic lock
        .select('quantity');

      if (updError) {
        return { success: false, message: `Failed to restore stock: ${updError.message}. Please try again.` };
      }

      if (!updated || updated.length === 0) {
        // Concurrent modification — another reversal or stock change happened
        // between our read and update. This is rare but possible.
        // Return an error so the admin can retry with fresh data.
        return {
          success: false,
          message: 'Stock was modified by another operation while processing this reversal. Please try again.',
        };
      }
    } else {
      // No existing inventory row — create one
      await outletDb
        .from('inventory')
        .insert({
          product_id: log.product_id,
          grade,
          quantity,
          price: 0,
          last_updated: new Date().toISOString(),
        });
    }

    // 6. Log the reversal
    const reasonText = reason ? ` Reason: ${reason}` : '';
    await archive.from('audit_logs').insert({
      action: 'SALE_REVERSED',
      product_id: log.product_id,
      details: `Reversed sale: added ${quantity} back to ${grade} at ${outlet} (reversal of audit log ${auditLogId.slice(0, 8)}).${reasonText}`,
      admin_id: adminId,
      outlet,
    });

    // Also log a stock_adjustment entry for traceability
    await outletDb.from('stock_adjustments').insert({
      product_id: log.product_id,
      grade,
      old_quantity: current ? current.quantity : 0,
      new_quantity: current ? current.quantity + quantity : quantity,
      reason: `Sale reversal: ${reason || 'No reason provided'}`,
      admin_id: adminId,
    });

    revalidatePath('/admin/dashboard');
    return { success: true, message: `Reversed sale: ${quantity} × ${grade} added back to ${outlet} inventory.` };
  } catch (err: any) {
    console.error('[reverseSale] Failed:', err);
    return { success: false, message: err?.message || 'Reversal failed due to an unexpected error.' };
  }
}

// ─── DAILY SALES TRACKER ───

export interface DailySaleItem {
  product_id: string;
  product_name: string;
  outlet: string;
  grade: string;
  quantity_sold: number;
  unit_price: number;
  total_revenue: number;
  current_stock: number;
  /** Latest discrepancy flag raised against this sold item for the queried date/range. */
  flag?: SalesFlag | null;
}

export interface DailySalesResult {
  items: DailySaleItem[];
  summary: {
    totalRevenue: number;
    totalUnits: number;
    unilorinRevenue: number;
    tankeRevenue: number;
    unilorinUnits: number;
    tankeUnits: number;
  };
  date: string;
}

/**
 * Fetch daily sales for a given date or date range (defaults to today).
 * Sources:
 *   - order_items from verified orders (paid/shipping/delivered) — no double-count risk
 *   - audit_logs SALE entries with admin_id NOT starting with 'order-verify-'
 *     (these are direct sales via RecordSaleForm that bypass orders entirely)
 *
 * For past dates, inventory shows the CURRENT remaining stock (not stock at that date),
 * since we don't have historical inventory snapshots.
 *
 * @param date - Start date string (YYYY-MM-DD). Defaults to today.
 * @param endDate - Optional end date string (YYYY-MM-DD). If provided, fetches sales for the entire range [date, endDate).
 *                  If omitted, defaults to a single day ([date, date + 1 day)).
 */
export async function getDailySales(date?: string, endDate?: string): Promise<DailySalesResult> {
  await requireAdminSession();
  const targetDate = date ? new Date(date + 'T00:00:00') : new Date();
  targetDate.setHours(0, 0, 0, 0);

  let targetEnd: Date;
  if (endDate) {
    targetEnd = new Date(endDate + 'T00:00:00');
    targetEnd.setHours(0, 0, 0, 0);
  } else {
    targetEnd = new Date(targetDate);
    targetEnd.setDate(targetEnd.getDate() + 1);
  }

  const todayStr = targetDate.toISOString();
  const tomorrowStr = targetEnd.toISOString();

  // Date-only bounds (local) used to scope discrepancy flags, which are stored
  // per calendar day rather than per timestamp.
  const toLocalDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const flagStartStr = toLocalDateStr(targetDate);
  const flagEndStr = toLocalDateStr(targetEnd);

  const archive = getArchiveServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();

  // 1. Fetch order_items from verified orders updated today
  const { data: orderItems, error } = await archive
    .from('order_items')
    .select(`
      product_id,
      product_name,
      grade,
      quantity,
      unit_price,
      total_price,
      outlet,
      orders!inner(
        status,
        updated_at
      )
    `)
    .in('orders.status', ['paid', 'shipping', 'delivered'])
    .gte('orders.updated_at', todayStr)
    .lt('orders.updated_at', tomorrowStr);

  if (error) throw new Error(`Failed to fetch daily sales: ${error.message}`);

  // 2. Fetch DIRECT sales from audit_logs (RecordSaleForm bypasses orders).
  //    Order verifications pass admin_id = "order-verify-{orderId}" to deductStock,
  //    so we exclude those to avoid double-counting.
  const { data: auditSales } = await archive
    .from('audit_logs')
    .select('*')
    .eq('action', 'SALE')
    .not('admin_id', 'like', 'order-verify-%')
    .gte('created_at', todayStr)
    .lt('created_at', tomorrowStr);

  // 3. Collect unique product IDs from both sources
  const productIds = new Set<string>();
  for (const item of (orderItems ?? []) as any[]) {
    if (item.product_id) productIds.add(item.product_id);
  }
  for (const log of (auditSales ?? []) as any[]) {
    if (log.product_id) productIds.add(log.product_id);
  }
  const uniqueIds = Array.from(productIds);

  // 4. Fetch current inventory for all products from both outlets
  const [uInvRes, tInvRes] = await Promise.all([
    uniqueIds.length > 0
      ? unilorin.from('inventory').select('product_id, grade, quantity').in('product_id', uniqueIds)
      : { data: [] as any[], error: null },
    uniqueIds.length > 0
      ? tanke.from('inventory').select('product_id, grade, quantity').in('product_id', uniqueIds)
      : { data: [] as any[], error: null },
  ]);

  // Build inventory lookup: key = `${productId}-${grade}-${outlet}` -> quantity
  const inventoryMap = new Map<string, number>();
  for (const row of (uInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    inventoryMap.set(`${row.product_id}-${row.grade}-unilorin`, row.quantity);
  }
  for (const row of (tInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    inventoryMap.set(`${row.product_id}-${row.grade}-tanke`, row.quantity);
  }

  // 5. Group order items by product + outlet + grade
  const grouped = new Map<string, DailySaleItem>();

  for (const item of (orderItems ?? []) as any[]) {
    const key = `${item.product_id}-${item.outlet}-${item.grade}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity_sold += item.quantity;
      existing.total_revenue += (item.total_price ?? (item.quantity * item.unit_price));
    } else {
      const invKey = `${item.product_id}-${item.grade}-${item.outlet}`;
      grouped.set(key, {
        product_id: item.product_id,
        product_name: item.product_name,
        outlet: item.outlet,
        grade: item.grade,
        quantity_sold: item.quantity,
        unit_price: item.unit_price ?? 0,
        total_revenue: item.total_price ?? (item.quantity * item.unit_price),
        current_stock: inventoryMap.get(invKey) ?? 0,
      });
    }
  }

  // 6. Parse direct-sale audit_logs and merge into the grouped map
  for (const log of (auditSales ?? []) as any[]) {
    // Try structured metadata first, fall back to regex for old entries
    let quantity: number, grade: string, outlet: string, unitPrice = 0;

    if (log.metadata?.qty != null && log.metadata?.grade && log.metadata?.outlet) {
      quantity = log.metadata.qty;
      grade = log.metadata.grade;
      outlet = log.metadata.outlet;
      unitPrice = log.metadata.price ?? 0;
    } else {
      const match = log.details?.match(/Deducted (\d+) from (\w+) at (\w+)/i);
      if (!match) continue;
      quantity = parseInt(match[1]);
      grade = match[2].toLowerCase();
      outlet = match[3].toLowerCase();
      const priceMatch = log.details?.match(/@ ₦([\d,]+)/);
      if (priceMatch) {
        unitPrice = parseInt(priceMatch[1].replace(/,/g, ''));
      }
    }

    if (!['special', 'extra', 'normal'].includes(grade)) continue;
    if (!['unilorin', 'tanke'].includes(outlet)) continue;


    const key = `${log.product_id}-${outlet}-${grade}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity_sold += quantity;
      existing.total_revenue += quantity * unitPrice;
    } else {
      grouped.set(key, {
        product_id: log.product_id,
        product_name: log.product_id.slice(0, 8), // resolve after
        outlet,
        grade,
        quantity_sold: quantity,
        unit_price: unitPrice,
        total_revenue: quantity * unitPrice,
        current_stock: inventoryMap.get(`${log.product_id}-${grade}-${outlet}`) ?? 0,
      });
    }
  }

  // 7. Fetch SALE_REVERSED entries (reversals) in the same date range.
  //    These cancel out previously counted sales — subtract their quantities.
  const { data: reversalLogs } = await archive
    .from('audit_logs')
    .select('*')
    .eq('action', 'SALE_REVERSED')
    .gte('created_at', todayStr)
    .lt('created_at', tomorrowStr);

  // Build reversal deductions: key = `${product_id}-${outlet}-${grade}` → quantity
  const reversalMap = new Map<string, number>();
  for (const log of (reversalLogs ?? []) as any[]) {
    // Try structured metadata first, fall back to regex for old entries
    let quantity: number, grade: string, outlet: string;

    if (log.metadata?.qty != null && log.metadata?.grade && log.metadata?.outlet) {
      quantity = log.metadata.qty;
      grade = log.metadata.grade;
      outlet = log.metadata.outlet;
    } else {
      const match = log.details?.match(/added (\d+) back to (\w+) at (\w+)/i);
      if (!match) continue;
      quantity = parseInt(match[1]);
      grade = match[2].toLowerCase();
      outlet = match[3].toLowerCase();
    }

    if (!['special', 'extra', 'normal'].includes(grade)) continue;
    if (!['unilorin', 'tanke'].includes(outlet)) continue;

    const key = `${log.product_id}-${outlet}-${grade}`;
    reversalMap.set(key, (reversalMap.get(key) ?? 0) + quantity);
  }

  // Apply reversals: reduce quantity_sold and total_revenue proportionally
  for (const [key, reversedQty] of reversalMap) {
    const existing = grouped.get(key);
    if (!existing) continue;

    const oldQty = existing.quantity_sold;
    const newQty = Math.max(0, oldQty - reversedQty);
    existing.quantity_sold = newQty;

    if (oldQty > 0) {
      existing.total_revenue = Math.round(existing.total_revenue * (newQty / oldQty));
    } else {
      existing.total_revenue = 0;
    }

    // Remove items fully reversed
    if (newQty <= 0) {
      grouped.delete(key);
    }
  }

  // Resolve product names for audit-only sales (those without order_items)
  const missingNames = Array.from(grouped.values()).filter(i => i.product_name.length <= 8);
  if (missingNames.length > 0) {
    const nameMap = await getProductNamesByIds(missingNames.map(i => i.product_id));
    for (const item of missingNames) {
      if (nameMap[item.product_id]) {
        item.product_name = nameMap[item.product_id];
      }
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => b.total_revenue - a.total_revenue);

  // 8. Attach discrepancy flags to these sales. A flag counts when it was
  //    raised within the queried range OR is still open — an open flag from a
  //    previous day must stay visible so the item is not flagged twice. When
  //    both exist, the open flag wins.
  const { data: flagRows, error: flagError } = await archive
    .from('sales_discrepancy_flags')
    .select('*')
    .or(`and(flag_date.gte.${flagStartStr},flag_date.lt.${flagEndStr}),status.eq.open`)
    .order('flagged_at', { ascending: false });

  if (!flagError && flagRows) {
    const flagMap = new Map<string, SalesFlag>();
    for (const row of flagRows as SalesFlag[]) {
      const key = `${row.product_id}-${row.outlet}-${row.grade}`;
      const existing = flagMap.get(key);
      if (!existing) {
        flagMap.set(key, row);
      } else if (existing.status !== 'open' && row.status === 'open') {
        flagMap.set(key, row);
      }
    }
    for (const item of items) {
      const flag = flagMap.get(`${item.product_id}-${item.outlet}-${item.grade}`);
      if (flag) item.flag = flag;
    }
  }

  // 9. Compute summaries
  let totalRevenue = 0, totalUnits = 0;
  let unilorinRevenue = 0, tankeRevenue = 0;
  let unilorinUnits = 0, tankeUnits = 0;

  for (const item of items) {
    totalRevenue += item.total_revenue;
    totalUnits += item.quantity_sold;
    if (item.outlet === 'unilorin') {
      unilorinRevenue += item.total_revenue;
      unilorinUnits += item.quantity_sold;
    } else {
      tankeRevenue += item.total_revenue;
      tankeUnits += item.quantity_sold;
    }
  }

  return {
    items,
    summary: { totalRevenue, totalUnits, unilorinRevenue, tankeRevenue, unilorinUnits, tankeUnits },
    date: targetDate.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

export interface FlagSalesRecordInput {
  date: string;
  outlet: 'unilorin' | 'tanke';
  productId: string;
  productName?: string;
  grade: Grade;
  onlineRemaining: number;
  physicalRemaining: number;
  note?: string;
}

/**
 * Flag a sold item from a daily sales record when the units remaining online
 * disagree with the units physically counted in the store.
 *
 * The direction ("number less" / "number more") is derived from the two counts
 * rather than trusted from the client.
 *
 * Only ONE open flag may exist per goods item (outlet + product + grade). When
 * the admin flags an item that already has an open flag — even one raised on an
 * earlier sale date — the existing flag is updated in place instead of a second
 * row being created. Resolved flags are kept as history, so a fresh discrepancy
 * after a resolution does create a new flag.
 */
export async function flagSalesRecord(input: FlagSalesRecordInput): Promise<SalesFlag> {
  await requireAdminSession();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.date ?? '')) throw new Error('A valid sale date is required.');
  if (!['unilorin', 'tanke'].includes(input?.outlet)) throw new Error('A valid outlet is required.');
  if (!['special', 'extra', 'normal'].includes(input?.grade)) throw new Error('A valid grade is required.');
  if (!input?.productId) throw new Error('A product is required.');

  const online = Number(input.onlineRemaining);
  const physical = Number(input.physicalRemaining);
  if (!Number.isFinite(online) || online < 0) throw new Error('Remaining online must be a non-negative number.');
  if (!Number.isFinite(physical) || physical < 0) throw new Error('Physical count must be a non-negative number.');

  const onlineRemaining = Math.floor(online);
  const physicalRemaining = Math.floor(physical);
  const discrepancy_type: SalesFlagType = resolveDiscrepancyType(onlineRemaining, physicalRemaining);
  const archive = getArchiveServer();

  // Prior flag history for this goods item. Resolved flags on the very date
  // being (re)flagged are excluded — that row is this flag, not a prior one.
  const { data: history } = await archive
    .from('sales_discrepancy_flags')
    .select('id, flag_date, status, resolved_at, flagged_at')
    .eq('outlet', input.outlet)
    .eq('product_id', input.productId)
    .eq('grade', input.grade)
    .order('flagged_at', { ascending: false });

  const recurrence = computeRecurrence((history ?? []) as FlagHistoryRow[], input.date);

  const coreFields = {
    outlet: input.outlet,
    product_id: input.productId,
    product_name: input.productName?.trim() || null,
    grade: input.grade,
    online_remaining: onlineRemaining,
    physical_remaining: physicalRemaining,
    discrepancy_type,
    note: input.note?.trim() || null,
    status: 'open' as const,
    flagged_at: new Date().toISOString(),
    resolved_at: null,
    resolution_note: null,
  };
  const fields = { ...coreFields, ...recurrence };

  // Migration 024 adds the recurrence columns. Until it is applied, retry the
  // write without them so flagging keeps working in the meantime.
  const missingRecurrenceColumns = (err: { code?: string; message?: string } | null) =>
    !!err && err.code === '42703' &&
    /is_recurrence|recurrence_count|previous_resolved_at|previous_flag_id/.test(err.message ?? '');

  // Re-flagging an item that already has an open flag updates that single flag,
  // keeping the original sale date so the history points at the first detection.
  const { data: existingOpen } = await archive
    .from('sales_discrepancy_flags')
    .select('id')
    .eq('outlet', input.outlet)
    .eq('product_id', input.productId)
    .eq('grade', input.grade)
    .eq('status', 'open')
    .order('flagged_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingOpen) {
    let result = await archive
      .from('sales_discrepancy_flags')
      .update(fields)
      .eq('id', existingOpen.id)
      .select()
      .single();
    if (result.error && missingRecurrenceColumns(result.error)) {
      result = await archive
        .from('sales_discrepancy_flags')
        .update(coreFields)
        .eq('id', existingOpen.id)
        .select()
        .single();
    }
    if (result.error) throw new Error(`Failed to update the existing flag: ${result.error.message}`);
    revalidatePath('/admin/dashboard');
    return result.data as SalesFlag;
  }

  // No open flag: insert, or reopen a resolved flag for the very same sale date.
  let inserted = await archive
    .from('sales_discrepancy_flags')
    .upsert({ ...fields, flag_date: input.date }, { onConflict: 'flag_date,outlet,product_id,grade' })
    .select()
    .single();
  if (inserted.error && missingRecurrenceColumns(inserted.error)) {
    inserted = await archive
      .from('sales_discrepancy_flags')
      .upsert({ ...coreFields, flag_date: input.date }, { onConflict: 'flag_date,outlet,product_id,grade' })
      .select()
      .single();
  }

  if (inserted.error) {
    // A concurrent submission may have created the open flag first; update it.
    if (inserted.error.code === '23505') {
      let raced = await archive
        .from('sales_discrepancy_flags')
        .update(fields)
        .eq('outlet', input.outlet)
        .eq('product_id', input.productId)
        .eq('grade', input.grade)
        .eq('status', 'open')
        .select()
        .single();
      if (raced.error && missingRecurrenceColumns(raced.error)) {
        raced = await archive
          .from('sales_discrepancy_flags')
          .update(coreFields)
          .eq('outlet', input.outlet)
          .eq('product_id', input.productId)
          .eq('grade', input.grade)
          .eq('status', 'open')
          .select()
          .single();
      }
      if (!raced.error && raced.data) {
        revalidatePath('/admin/dashboard');
        return raced.data as SalesFlag;
      }
    }
    throw new Error(`Failed to flag sales record: ${inserted.error.message}`);
  }

  revalidatePath('/admin/dashboard');
  return inserted.data as SalesFlag;
}

/** Mark a discrepancy flag resolved once the counts have been corrected. */
export async function resolveSalesFlag(id: string, resolutionNote?: string): Promise<SalesFlag> {
  await requireAdminSession();
  if (!id) throw new Error('A flag id is required.');

  const { data, error } = await getArchiveServer()
    .from('sales_discrepancy_flags')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_note: resolutionNote?.trim() || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to resolve flag: ${error.message}`);

  revalidatePath('/admin/dashboard');
  return data as SalesFlag;
}

/** Reopen a resolved flag (e.g. the discrepancy was found again or resolved by mistake). */
export async function reopenSalesFlag(id: string): Promise<SalesFlag> {
  await requireAdminSession();
  if (!id) throw new Error('A flag id is required.');

  const archive = getArchiveServer();
  const { data: current, error: readError } = await archive
    .from('sales_discrepancy_flags')
    .select('outlet, product_id, grade')
    .eq('id', id)
    .maybeSingle();
  if (readError || !current) throw new Error('Flag not found.');

  // Guard the one-open-flag-per-item rule before hitting the unique index.
  const { data: openPeer } = await archive
    .from('sales_discrepancy_flags')
    .select('id')
    .eq('outlet', current.outlet)
    .eq('product_id', current.product_id)
    .eq('grade', current.grade)
    .eq('status', 'open')
    .neq('id', id)
    .limit(1)
    .maybeSingle();
  if (openPeer) throw new Error('This item already has an open flag. Resolve that one instead.');

  const { data, error } = await archive
    .from('sales_discrepancy_flags')
    .update({ status: 'open', resolved_at: null, resolution_note: null })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to reopen flag: ${error.message}`);

  revalidatePath('/admin/dashboard');
  return data as SalesFlag;
}

export type SalesFlagFilter = 'all' | 'open' | 'resolved';

/** List discrepancy flags for the Flagged Goods manager, newest first. */
export async function getSalesFlags(status: SalesFlagFilter = 'all'): Promise<SalesFlag[]> {
  await requireAdminSession();

  let query = getArchiveServer()
    .from('sales_discrepancy_flags')
    .select('*')
    .order('status', { ascending: true })
    .order('flagged_at', { ascending: false });

  if (status === 'open' || status === 'resolved') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load flagged goods: ${error.message}`);
  return (data ?? []) as SalesFlag[];
}

export interface FlagHistory {
  count: number;
  lastResolvedAt: string | null;
}

/**
 * Prior resolved-flag history for one goods item. Used by the flag modal to
 * warn the admin that an item they are about to flag has been flagged and
 * corrected before.
 */
export async function getFlagHistory(
  outlet: 'unilorin' | 'tanke',
  productId: string,
  grade: Grade,
): Promise<FlagHistory> {
  await requireAdminSession();
  if (!['unilorin', 'tanke'].includes(outlet)) throw new Error('A valid outlet is required.');
  if (!productId) throw new Error('A product is required.');

  const { data, error } = await getArchiveServer()
    .from('sales_discrepancy_flags')
    .select('id, resolved_at')
    .eq('outlet', outlet)
    .eq('product_id', productId)
    .eq('grade', grade)
    .eq('status', 'resolved')
    .order('resolved_at', { ascending: false });

  if (error) throw new Error(`Failed to load flag history: ${error.message}`);
  return { count: data?.length ?? 0, lastResolvedAt: data?.[0]?.resolved_at ?? null };
}

/** Count of open discrepancy flags — powers the reminder badge on the admin tab. */
export async function getOpenSalesFlagCount(): Promise<number> {
  await requireAdminSession();
  const { count, error } = await getArchiveServer()
    .from('sales_discrepancy_flags')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw new Error(`Failed to count open flags: ${error.message}`);
  return count ?? 0;
}

/** Full flag history for one goods item, newest first — powers the timeline view. */
export async function getFlagTimeline(
  outlet: 'unilorin' | 'tanke',
  productId: string,
  grade: Grade,
): Promise<SalesFlag[]> {
  await requireAdminSession();
  if (!['unilorin', 'tanke'].includes(outlet)) throw new Error('A valid outlet is required.');
  if (!productId) throw new Error('A product is required.');

  const { data, error } = await getArchiveServer()
    .from('sales_discrepancy_flags')
    .select('*')
    .eq('outlet', outlet)
    .eq('product_id', productId)
    .eq('grade', grade)
    .order('flagged_at', { ascending: false });

  if (error) throw new Error(`Failed to load flag timeline: ${error.message}`);
  return (data ?? []) as SalesFlag[];
}

/**
 * One-click correction: set the outlet's online stock for the flagged item to
 * the physically counted number, then resolve the flag. Goes through
 * upsertInventory so the change is written to stock_adjustments and audit_logs
 * like any other manual adjustment.
 */
export async function correctFlagStock(id: string, resolutionNote?: string): Promise<SalesFlag> {
  await requireAdminSession();
  if (!id) throw new Error('A flag id is required.');

  const archive = getArchiveServer();
  const { data: flag, error } = await archive
    .from('sales_discrepancy_flags')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !flag) throw new Error('Flag not found.');
  if (!['unilorin', 'tanke'].includes(flag.outlet)) throw new Error('The flag has an invalid outlet.');
  if (!['special', 'extra', 'normal'].includes(flag.grade)) throw new Error('The flag has an invalid grade.');

  const outlet = flag.outlet as 'unilorin' | 'tanke';
  const grade = flag.grade as Grade;

  // Preserve the existing price/shelf while replacing only the quantity.
  const stock = await getStockByProduct(outlet, flag.product_id);
  const row = (stock as Array<{ grade: string; price?: number; shelf_location?: string | null }>)
    .find((entry) => entry.grade === grade);

  let price = Number(row?.price ?? 0);
  if (!row || price <= 0) {
    const { data: masterProduct, error: masterError } = await getMasterServer()
      .from('products')
      .select('price')
      .eq('id', flag.product_id)
      .maybeSingle();
    if (!masterError && masterProduct) price = Number(masterProduct.price ?? price);
  }

  const reason = `Discrepancy correction — online stock set to physical count (${flag.physical_remaining})`;
  await upsertInventory(
    outlet,
    [{
      product_id: flag.product_id,
      grade,
      quantity: flag.physical_remaining,
      price,
      shelf_location: row?.shelf_location ?? undefined,
    }],
    'admin-flag-correction',
    undefined,
    reason,
  );

  return resolveSalesFlag(
    id,
    resolutionNote?.trim() || `Online stock corrected to physical count (${flag.physical_remaining}).`,
  );
}

export type { SalesAnalyticsProduct, SalesAnalyticsReport, SalesAnalyticsPeriod } from "@/lib/salesPulse/types";

/**
 * Compatibility action for demand rankings. All periods share Sales Pulse's
 * hourly snapshot instead of issuing two uncached Daily Sales scans per click.
 */
export async function getSalesAnalytics(period: SalesAnalyticsPeriod = "month"): Promise<SalesAnalyticsReport> {
  await requireAdminSession();
  if (!["day", "week", "month", "year"].includes(period)) throw new Error("Invalid analytics period.");
  return (await getCachedSalesPulseReport()).sales[period];
}

// ─── MANUAL MERGE TOOL — BULK STOCK LOOKUP ───

export type ProductStockInfo = {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  unilorinStock: Record<string, number>;
  tankeStock: Record<string, number>;
};

export async function getBulkProductStockInfo(productIds: string[]): Promise<ProductStockInfo[]> {
  await requireAdminSession();
  if (productIds.length === 0) return [];

  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();

  const [prodRes, uInvRes, tInvRes] = await Promise.all([
    master.from('products').select('id, name, category, price').in('id', productIds),
    unilorin.from('inventory').select('product_id, grade, quantity').in('product_id', productIds),
    tanke.from('inventory').select('product_id, grade, quantity').in('product_id', productIds),
  ]);

  if (prodRes.error) throw new Error(`Failed to fetch products: ${prodRes.error.message}`);

  // Build stock lookup maps
  const uMap = new Map<string, Record<string, number>>();
  for (const row of (uInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    if (!uMap.has(row.product_id)) uMap.set(row.product_id, {});
    const stocks = uMap.get(row.product_id)!;
    stocks[row.grade] = (stocks[row.grade] || 0) + row.quantity;
  }

  const tMap = new Map<string, Record<string, number>>();
  for (const row of (tInvRes.data ?? []) as Array<{ product_id: string; grade: string; quantity: number }>) {
    if (!tMap.has(row.product_id)) tMap.set(row.product_id, {});
    const stocks = tMap.get(row.product_id)!;
    stocks[row.grade] = (stocks[row.grade] || 0) + row.quantity;
  }

  const products = (prodRes.data ?? []) as Array<{ id: string; name: string; category: string | null; price: number | null }>;

  return products.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    unilorinStock: uMap.get(p.id) || {},
    tankeStock: tMap.get(p.id) || {},
  }));
}

export async function getAdminLowStock(threshold = 3) {
  await requireAdminSession();
  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const [{ data: uRows, error: uError }, { data: tRows, error: tError }] = await Promise.all([
    unilorin.from("inventory").select("product_id, grade, quantity, reserved_quantity").lt("quantity", threshold),
    tanke.from("inventory").select("product_id, grade, quantity, reserved_quantity").lt("quantity", threshold),
  ]);
  if (uError || tError) throw new Error(`Failed to fetch low stock: ${uError?.message || tError?.message}`);
  const rows = [
    ...(uRows ?? []).map((row) => ({ ...row, outlet: "unilorin" })),
    ...(tRows ?? []).map((row) => ({ ...row, outlet: "tanke" })),
  ];
  const ids = [...new Set(rows.map((row) => row.product_id))];
  const { data: products, error: productError } = ids.length
    ? await master.from("products").select("id, name").in("id", ids)
    : { data: [], error: null };
  if (productError) throw new Error(`Failed to fetch low-stock product names: ${productError.message}`);
  const names = new Map((products ?? []).map((product) => [product.id, product.name]));
  return rows.map((row) => ({ ...row, products: { name: names.get(row.product_id) || "Unknown" } }));
}

export async function getAdminLowStockCount(threshold = 3) {
  await requireAdminSession();
  const [unilorin, tanke] = [getUnilorinServer(), getTankeServer()];
  const [{ count: unilorinCount, error: unilorinError }, { count: tankeCount, error: tankeError }] = await Promise.all([
    unilorin.from("inventory").select("product_id", { count: "exact", head: true }).lt("quantity", threshold),
    tanke.from("inventory").select("product_id", { count: "exact", head: true }).lt("quantity", threshold),
  ]);
  if (unilorinError || tankeError) {
    throw new Error(`Failed to fetch low-stock count: ${unilorinError?.message || tankeError?.message}`);
  }
  return (unilorinCount ?? 0) + (tankeCount ?? 0);
}

export async function getAdminPendingOrders() {
  await requireAdminSession();
  const archive = getArchiveServer();
  const { data: orders, error: ordersError } = await archive
    .from("orders")
    .select("id, customer_name, customer_phone, outlet, total_amount, whatsapp_link, status, notes, created_at, receipt_requested, receipt_name")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (ordersError) throw new Error(`Failed to fetch pending orders: ${ordersError.message}`);
  if (!orders?.length) return [];

  const orderIds = orders.map((order) => order.id);
  const { data: items, error: itemsError } = await archive
    .from("order_items")
    .select("id, order_id, product_id, product_name, grade, quantity, unit_price, total_price, outlet")
    .in("order_id", orderIds);
  if (itemsError) throw new Error(`Failed to fetch pending order items: ${itemsError.message}`);

  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }
  return orders.map((order) => ({ ...order, order_items: itemsByOrder.get(order.id) ?? [] }));
}

export async function getAdminPendingOrderCount() {
  await requireAdminSession();
  const { count, error } = await getArchiveServer()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw new Error(`Failed to fetch pending order count: ${error.message}`);
  return count ?? 0;
}

/**
 * Receipt Outbox: every order whose verified receipt still needs to reach the
 * customer's WhatsApp number. The pending list only shows orders BEFORE
 * verification and the session-pinned card disappears on reload, so this is the
 * persistent desk for the send handoff.
 *
 * Two sources, because the Archive order RPC silently dropped
 * receipt_requested until migration 018
 * (devtools/migrations/018_archive_receipt_request_rpc.sql):
 *
 *  1. Orders that requested a receipt at checkout (pending + verified).
 *  2. Verified orders that carry a customer number but no receipt flag — the
 *     receipt requests placed before that fix. They are listed so the admin can
 *     still send the verified receipt today, marked `receiptRequested: false`.
 *
 * Bounded to 100 rows and only minimal fields.
 */
function toOutboxEntry(
  order: {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    receipt_name: string | null;
    outlet: string;
    total_amount: number | null;
    status: string;
    updated_at: string;
  },
  receiptRequested: boolean,
) {
  return {
    id: order.id,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    receiptName: order.receipt_name,
    outlet: order.outlet,
    total: order.total_amount ?? 0,
    status: order.status as "pending" | "paid",
    updatedAt: order.updated_at,
    receiptRequested,
  };
}

/** Rows the outbox may pull in one visit — unchanged from before the two-source
 *  read, so opening the tab can never cost more egress than it used to. */
const RECEIPT_OUTBOX_LIMIT = 100;
/** Ceiling on the recovery source (pre-migration-018 receipt requests). */
const RECEIPT_OUTBOX_RECOVERY_LIMIT = 25;

export async function getReceiptOutbox() {
  await requireAdminSession();
  const archive = getArchiveServer();
  // receipt_requested is deliberately NOT selected: which query returned the row
  // already tells us the flag, so the column would be paid-for bytes we ignore.
  const columns = "id, customer_name, customer_phone, receipt_name, outlet, total_amount, status, updated_at";
  const byId = new Map<string, ReturnType<typeof toOutboxEntry>>();

  const { data: requested, error: requestedError } = await archive
    .from("orders")
    .select(columns)
    .in("status", ["pending", "paid"])
    .eq("receipt_requested", true)
    .order("updated_at", { ascending: false })
    .limit(RECEIPT_OUTBOX_LIMIT);
  if (requestedError) throw new Error(`Failed to fetch the receipt outbox: ${requestedError.message}`);
  for (const order of requested ?? []) {
    byId.set(order.id, toOutboxEntry(order, true));
  }

  // Recovery source: verified orders with a reachable number whose receipt flag
  // the pre-018 RPC dropped. Read only when there is room left under the SAME row
  // budget — the total fetched across both queries never exceeds the limit the
  // single-query version used.
  const remaining = RECEIPT_OUTBOX_LIMIT - byId.size;
  if (remaining > 0) {
    const { data: unflagged, error: unflaggedError } = await archive
      .from("orders")
      .select(columns)
      .eq("status", "paid")
      .eq("receipt_requested", false)
      .neq("customer_phone", "")
      .order("updated_at", { ascending: false })
      .limit(Math.min(RECEIPT_OUTBOX_RECOVERY_LIMIT, remaining));
    if (unflaggedError) throw new Error(`Failed to fetch the receipt outbox: ${unflaggedError.message}`);
    for (const order of unflagged ?? []) {
      // Guard the phone check again in code: the desk is only useful when the
      // row actually carries a number to message.
      if (!order.customer_phone) continue;
      if (!byId.has(order.id)) byId.set(order.id, toOutboxEntry(order, false));
    }
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECEIPT_OUTBOX_LIMIT);
}

export async function getReceiptData(orderId: string) {
  await requireAdminSession();
  const { data, error } = await getArchiveServer().from('orders').select('id, customer_name, receipt_name, outlet, status, total_amount, created_at, order_items(product_name, quantity, unit_price, total_price, grade)').eq('id', orderId).maybeSingle();
  if (error || !data) throw new Error(error?.message || 'Order not found.');
  // Checkout only captures a name when a receipt is requested, so that receiver
  // name is the one the printed verified receipt must show. Falls back to
  // customer_name for staff-recorded orders.
  return { orderId: data.id, customerName: data.receipt_name || data.customer_name, receiptName: data.receipt_name, outlet: data.outlet, status: data.status, total: data.total_amount, createdAt: data.created_at, items: data.order_items ?? [] };
}

export async function getAdminAuditLogs(limit = 50) {
  await requireAdminSession();
  const { data, error } = await getArchiveServer()
    .from("audit_logs")
    .select("id, action, product_id, product_name, details, admin_id, outlet, created_at, metadata")
    .order("created_at", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`Failed to fetch audit logs: ${error.message}`);
  return data ?? [];
}

export async function getAdminInventory() {
  await requireAdminSession();
  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const [{ data: products, error: productError }, { data: uRows, error: uError }, { data: tRows, error: tError }] = await Promise.all([
    master.from("products").select("id, name, category, description, base_image_url, price").order("created_at", { ascending: false }),
    unilorin.from("inventory").select("product_id, grade, quantity, price"),
    tanke.from("inventory").select("product_id, grade, quantity, price"),
  ]);
  if (productError || uError || tError) throw new Error(`Failed to fetch inventory: ${productError?.message || uError?.message || tError?.message}`);
  const toMap = (rows: typeof uRows) => {
    const map = new Map<string, { special: number; extra: number; normal: number }>();
    for (const row of rows ?? []) {
      const current = map.get(row.product_id) ?? { special: 0, extra: 0, normal: 0 };
      if (row.grade === "special") current.special = row.quantity;
      if (row.grade === "extra") current.extra = row.quantity;
      if (row.grade === "normal") current.normal = row.quantity;
      map.set(row.product_id, current);
    }
    return map;
  };
  const uMap = toMap(uRows);
  const tMap = toMap(tRows);
  return (products ?? []).flatMap((product) => [
    ["Unilorin", uMap.get(product.id) ?? { special: 0, extra: 0, normal: 0 }],
    ["Tanke", tMap.get(product.id) ?? { special: 0, extra: 0, normal: 0 }],
  ].map(([location, stock]) => {
    const typedStock = stock as { special: number; extra: number; normal: number };
    return {
      id: `${product.id}-${String(location).toLowerCase()}`, productId: product.id, name: product.name,
      type: product.category, description: product.description || "", baseImageUrl: product.base_image_url || null,
      ...typedStock, price: product.price || 0,
      total: typedStock.special + typedStock.extra + typedStock.normal, location,
    };
  }));
}

export async function getIntegrityReport(options?: { force?: boolean }): Promise<IntegrityReport> {
  await requireAdminSession();
  if (options?.force) revalidateTag(INTEGRITY_TAG, "max");
  // The scan reads ~5k rows across all four databases, so it is served from the
  // Next cache and recomputed only when a catalog/inventory mutation or an
  // explicit refresh revalidates it. Egress now tracks data changes, not admin
  // tab clicks.
  return options?.force ? computeIntegrityReport() : getCachedIntegrityReport();
}

/**
 * Repairs one product's outlet price drift using the Master catalog price.
 * This is intentionally explicit and separate from the read-only report.
 */
export async function repairPriceDriftFromMaster(productId: string) {
  await requireAdminSession();
  if (!productId) throw new Error("A product is required.");

  const master = getMasterServer();
  const { data: product, error: productError } = await master
    .from("products").select("id, name, price").eq("id", productId).maybeSingle();
  if (productError || !product) throw new Error("Product not found in Master catalog.");
  const price = Number(product.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("Master product has an invalid price.");

  const results: Array<{ outlet: "unilorin" | "tanke"; success: boolean; message?: string }> = [];
  for (const outlet of ["unilorin", "tanke"] as const) {
    try {
      await syncPriceToOutletInventory(outlet, productId, price);
      results.push({ outlet, success: true });
    } catch (error) {
      results.push({ outlet, success: false, message: error instanceof Error ? error.message : "Sync failed" });
    }
  }

  const failed = results.filter((result) => !result.success);
  const archive = getArchiveServer();
  const requestHeaders = await headers();
  const { error: auditError } = await archive.from("audit_logs").insert({
    action: failed.length ? "PRICE_SYNC_PARTIAL" : "PRICE_SYNC_REPAIR",
    product_id: productId,
    product_name: product.name,
    details: `Integrity repair set outlet prices for ${product.name} to ₦${price.toLocaleString()} from Master. ` +
      results.map((result) => `${result.outlet}: ${result.success ? "ok" : result.message}`).join("; "),
    admin_id: "admin-integrity-review",
    outlet: "master",
    metadata: {
      price,
      results,
      // The admin is a shared credential with no per-person account, so the
      // request fingerprint is what makes this repair traceable afterwards.
      ip: clientIpFromHeaders(requestHeaders),
      user_agent: requestHeaders.get("user-agent") ?? null,
    },
  });
  if (auditError) throw new Error(`Price repaired but audit logging failed: ${auditError.message}`);
  if (failed.length) throw new Error(`Price repair partially failed: ${failed.map((result) => `${result.outlet}: ${result.message}`).join("; ")}`);

  revalidatePath("/admin/dashboard");
  revalidateStorefront("catalog");
  revalidatePath("/store");
  // The repair changes price-drift findings — drop the cached report so the
  // Data Health tab reflects the fix without a full re-scan.
  revalidateTag(INTEGRITY_TAG, "max");
  return { success: true, productId, price, results };
}

// ─── DISCOUNT SALES ACTIONS ───

export interface DiscountProduct {
  id: string;
  name: string;
  category: string | null;
  /** Normal (non-discounted) price */
  price: number;
  discountPrice: number | null;
  discountExpiresAt: string | null;
}

const DISCOUNT_COLUMNS = "id, name, category, price, discount_price, discount_expires_at";
const DISCOUNT_MIGRATION_HINT =
  "Discount columns are not installed yet. Run devtools/migrations/016_master_product_discounts.sql " +
  "in the Master Supabase project's SQL Editor, then reload this tab.";

/** Detects a Supabase "column does not exist" error for the discount columns. */
function isMissingDiscountColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST204") {
    return /discount_price|discount_expires_at/i.test(error.message ?? "");
  }
  return /column .*discount_(price|expires_at).* does not exist/i.test(error.message ?? "");
}

export async function getDiscountProducts(): Promise<DiscountProduct[]> {
  await requireAdminSession();
  const master = getMasterServer();
  const { data, error } = await master
    .from("products")
    .select(DISCOUNT_COLUMNS)
    .order("name");
  if (error) {
    if (isMissingDiscountColumnError(error)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to fetch products for discounts: ${error.message}`);
  }
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price ?? 0),
    discountPrice: p.discount_price == null ? null : Number(p.discount_price),
    discountExpiresAt: p.discount_expires_at ?? null,
  }));
}

export async function setProductDiscount(
  productId: string,
  discountPrice: number,
  expiresAt: string,
  adminId: string
): Promise<{ success: true }> {
  await requireAdminSession();
  if (!Number.isFinite(discountPrice) || discountPrice <= 0) {
    throw new Error("Discount price must be a positive amount.");
  }
  const expiryMs = new Date(expiresAt).getTime();
  if (!expiresAt || !Number.isFinite(expiryMs)) {
    throw new Error("A valid expiry date is required.");
  }
  if (expiryMs <= Date.now()) {
    throw new Error("Expiry date must be in the future.");
  }

  const master = getMasterServer();
  const { data: product, error: fetchError } = await master
    .from("products")
    .select("id, name, price")
    .eq("id", productId)
    .maybeSingle();
  if (fetchError) {
    if (isMissingDiscountColumnError(fetchError)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to load product: ${fetchError.message}`);
  }
  if (!product) throw new Error("Product not found in Master catalog.");

  const normalPrice = Number(product.price ?? 0);
  if (discountPrice >= normalPrice) {
    throw new Error(`Discount price (₦${discountPrice.toLocaleString()}) must be lower than the normal price (₦${normalPrice.toLocaleString()}).`);
  }

  const { error: updateError } = await master
    .from("products")
    .update({
      discount_price: discountPrice,
      discount_expires_at: new Date(expiresAt).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (updateError) {
    if (isMissingDiscountColumnError(updateError)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to save discount: ${updateError.message}`);
  }

  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DISCOUNT_SET",
    product_id: productId,
    product_name: product.name,
    details: `Discount set for ${product.name}: ₦${normalPrice.toLocaleString()} → ₦${discountPrice.toLocaleString()} until ${new Date(expiresAt).toLocaleString()}. Reverts automatically after expiry.`,
    admin_id: adminId,
    outlet: "master",
    metadata: { normalPrice, discountPrice, expiresAt },
  });

  revalidatePath("/admin/dashboard");
  revalidateStorefront("catalog");
  revalidatePath("/store");
  revalidatePath("/");
  return { success: true };
}

export async function clearProductDiscount(
  productId: string,
  adminId: string
): Promise<{ success: true }> {
  await requireAdminSession();
  const master = getMasterServer();
  const { data: product, error: fetchError } = await master
    .from("products")
    .select("id, name, price, discount_price, discount_expires_at")
    .eq("id", productId)
    .maybeSingle();
  if (fetchError) {
    if (isMissingDiscountColumnError(fetchError)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to load product: ${fetchError.message}`);
  }
  if (!product) throw new Error("Product not found in Master catalog.");
  if (product.discount_price == null && product.discount_expires_at == null) {
    return { success: true };
  }

  const { error: updateError } = await master
    .from("products")
    .update({
      discount_price: null,
      discount_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (updateError) {
    if (isMissingDiscountColumnError(updateError)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to remove discount: ${updateError.message}`);
  }

  const archive = getArchiveServer();
  await archive.from("audit_logs").insert({
    action: "DISCOUNT_CLEARED",
    product_id: productId,
    product_name: product.name,
    details: `Discount removed for ${product.name}. Price reverted to ₦${Number(product.price ?? 0).toLocaleString()}.`,
    admin_id: adminId,
    outlet: "master",
    metadata: { previousDiscountPrice: product.discount_price, previousExpiry: product.discount_expires_at },
  });

  revalidatePath("/admin/dashboard");
  revalidateStorefront("catalog");
  revalidatePath("/store");
  revalidatePath("/");
  return { success: true };
}

export interface BulkDiscountSkip {
  productId: string;
  name: string;
  reason: string;
}

/**
 * Apply one discount to many products at once (used by the "Bulk by Label"
 * tool in the Discounts tab). Each entry carries its own discount price so
 * the caller can mix fixed amounts and percentage-derived prices.
 *
 * Every product is validated against its current normal price; invalid
 * entries are skipped and reported instead of failing the whole batch.
 * All discounts share the same expiry, so they revert together.
 */
export async function setBulkDiscounts(
  entries: Array<{ productId: string; discountPrice: number }>,
  expiresAt: string,
  adminId: string,
  bulkLabel?: string
): Promise<{ success: true; updated: number; skipped: BulkDiscountSkip[] }> {
  await requireAdminSession();
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Select at least one product.");
  }
  const expiryMs = new Date(expiresAt).getTime();
  if (!expiresAt || !Number.isFinite(expiryMs)) {
    throw new Error("A valid expiry date is required.");
  }
  if (expiryMs <= Date.now()) {
    throw new Error("Expiry date must be in the future.");
  }

  // Last entry wins if the same product appears twice
  const entryMap = new Map<string, number>();
  for (const entry of entries) {
    entryMap.set(entry.productId, Number(entry.discountPrice));
  }

  const master = getMasterServer();
  const { data: products, error: fetchError } = await master
    .from("products")
    .select("id, name, price")
    .in("id", [...entryMap.keys()]);
  if (fetchError) {
    if (isMissingDiscountColumnError(fetchError)) throw new Error(DISCOUNT_MIGRATION_HINT);
    throw new Error(`Failed to load products: ${fetchError.message}`);
  }
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const skipped: BulkDiscountSkip[] = [];
  // Group by discount price so each distinct price is one batched UPDATE
  const valid = new Map<number, Array<{ id: string; name: string; normalPrice: number }>>();

  for (const [productId, discountPrice] of entryMap) {
    const product = byId.get(productId);
    if (!product) {
      skipped.push({ productId, name: productId, reason: "Product not found in Master catalog." });
      continue;
    }
    const normalPrice = Number(product.price ?? 0);
    if (!Number.isFinite(discountPrice) || discountPrice <= 0) {
      skipped.push({ productId, name: product.name, reason: "Discount price must be a positive amount." });
      continue;
    }
    if (discountPrice >= normalPrice) {
      skipped.push({
        productId,
        name: product.name,
        reason: `Discount ₦${discountPrice.toLocaleString()} is not lower than the normal price ₦${normalPrice.toLocaleString()}.`,
      });
      continue;
    }
    const group = valid.get(discountPrice) ?? [];
    group.push({ id: product.id, name: product.name, normalPrice });
    valid.set(discountPrice, group);
  }

  if (valid.size > 0) {
    const expiryIso = new Date(expiresAt).toISOString();
    const nowIso = new Date().toISOString();

    for (const [discountPrice, group] of valid) {
      const { error: updateError } = await master
        .from("products")
        .update({
          discount_price: discountPrice,
          discount_expires_at: expiryIso,
          updated_at: nowIso,
        })
        .in("id", group.map((g) => g.id));
      if (updateError) {
        if (isMissingDiscountColumnError(updateError)) throw new Error(DISCOUNT_MIGRATION_HINT);
        throw new Error(`Failed to save discounts: ${updateError.message}`);
      }
    }

    const label = bulkLabel?.trim() ? ` (bulk label: "${bulkLabel.trim()}")` : "";
    const expiryLabel = new Date(expiryIso).toLocaleString();
    const logs = [...valid.entries()].flatMap(([discountPrice, group]) =>
      group.map((g) => ({
        action: "DISCOUNT_SET",
        product_id: g.id,
        product_name: g.name,
        details: `Discount set for ${g.name}: ₦${g.normalPrice.toLocaleString()} → ₦${discountPrice.toLocaleString()} until ${expiryLabel}. Reverts automatically after expiry.${label}`,
        admin_id: adminId,
        outlet: "master",
        metadata: {
          normalPrice: g.normalPrice,
          discountPrice,
          expiresAt: expiryIso,
          bulk: true,
          bulkLabel: bulkLabel?.trim() ?? null,
        },
      }))
    );
    const archive = getArchiveServer();
    const { error: logError } = await archive.from("audit_logs").insert(logs);
    if (logError) throw new Error(`Discounts saved but audit logging failed: ${logError.message}`);
  }

  revalidatePath("/admin/dashboard");
  revalidateStorefront("catalog");
  revalidatePath("/store");
  revalidatePath("/");
  const updated = [...valid.values()].reduce((sum, group) => sum + group.length, 0);
  return { success: true, updated, skipped };
}
