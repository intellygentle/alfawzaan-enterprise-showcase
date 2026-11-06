"use server";

import { revalidatePath } from "next/cache";
import { updateOrderStatus, updateOrderItem, updateOrderTotal } from "@/lib/archive/ledger";
import { deductStock, addStockBack, getStockByProduct } from "@/lib/outlets/inventory";
import { releaseReservation } from "@/lib/outlets/reservations";
import { validateShelfStock } from "@/lib/inventoryLogic";
import { uploadProductImage } from "@/lib/admin/upload";
import { updateProduct } from "@/lib/master/catalog";
import {
  getMasterServer,
  getUnilorinServer,
  getTankeServer,
  getArchiveServer,
} from "@/lib/supabase/server";
import {
  requireRepresentativeSession,
  requirePermission,
  type VerifiedRepresentativeSession,
} from "@/lib/auth/session";

// ─── SESSION VERIFICATION ───

type VerifiedRep = VerifiedRepresentativeSession;

const getVerifiedRep = requireRepresentativeSession;

// ─── ORDER ACTIONS ───

export async function repGetOrders() {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "view_orders");

  const archive = getArchiveServer();
  const { data, error } = await archive
    .from("orders")
    .select("*, order_items(*)")
    .eq("status", "pending")
    .eq("outlet", rep.outlet)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
  return data ?? [];
}

export async function repGetInventory() {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "view_inventory");
  const master = getMasterServer();
  const outlet = rep.outlet === "unilorin" ? getUnilorinServer() : getTankeServer();
  const [{ data: products, error: productError }, { data: inventory, error: inventoryError }] = await Promise.all([
    master.from("products").select("id, name, category").order("name"),
    outlet.from("inventory").select("product_id, grade, quantity, price"),
  ]);
  if (productError || inventoryError) {
    throw new Error(`Failed to fetch inventory: ${productError?.message || inventoryError?.message}`);
  }
  const inventoryMap = new Map<string, { special: number; extra: number; normal: number; price: number }>();
  for (const row of inventory ?? []) {
    const stock = inventoryMap.get(row.product_id) ?? { special: 0, extra: 0, normal: 0, price: 0 };
    if (row.grade === "special") stock.special = row.quantity;
    if (row.grade === "extra") stock.extra = row.quantity;
    if (row.grade === "normal") stock.normal = row.quantity;
    stock.price = row.price || stock.price;
    inventoryMap.set(row.product_id, stock);
  }
  return (products ?? []).flatMap((product) => {
    const stock = inventoryMap.get(product.id) ?? { special: 0, extra: 0, normal: 0, price: 0 };
    return (["special", "extra", "normal"] as const).map((grade) => ({
      product_id: product.id,
      grade,
      quantity: stock[grade],
      price: stock.price,
      product_name: product.name,
      category: product.category || "",
    }));
  });
}

export async function repGetTankeExtraProductIds() {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "view_inventory");
  const { data, error } = await getTankeServer()
    .from("inventory").select("product_id").eq("grade", "extra").gt("quantity", 0);
  if (error) throw new Error(`Failed to fetch extra goods: ${error.message}`);
  return [...new Set((data ?? []).map((row) => row.product_id))];
}

export async function repVerifyOrder(
  orderId: string,
  items: Array<{
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    grade: "special" | "extra" | "normal";
    outlet: string;
  }>
) {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "verify_order");

  // Verify the order belongs to this rep's outlet and is still pending
  const archive = getArchiveServer();
  const { data: order, error: orderError } = await archive
    .from("orders")
    .select("outlet, status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Order not found.");
  }
  if (order.outlet !== rep.outlet) {
    throw new Error("This order does not belong to your outlet.");
  }
  if (order.status !== "pending") {
    throw new Error(`This order has already been ${order.status}. It cannot be verified again.`);
  }

  // Deduct the stock while the order's reservations are STILL HELD. Nothing is
  // released until the whole verification has succeeded (see the tail of this
  // function). Releasing up front — as this used to — meant that if any step
  // below failed, the rollback restored `quantity` but nothing re-created the
  // reservations, leaving a pending order in the queue holding no stock that
  // another shopper could buy out from under it. It also opened an oversell
  // window, because between the release and the deduction the shelf counted
  // units as free that were already spoken for. `deductStock` checks the
  // physical `quantity`, not `quantity - reserved_quantity`, so a live
  // reservation never blocks it. Mirrors verifyOrder in the admin dashboard.
  //
  // Track successful deductions so we can reverse if ANY step fails
  const successfulDeductions: Array<{
    outlet: "unilorin" | "tanke";
    productId: string;
    grade: "special" | "extra" | "normal";
    quantity: number;
  }> = [];

  try {
    for (const item of items) {
      // Deduct stock from the assigned grade shelf
      await deductStock(
        item.outlet as "unilorin" | "tanke",
        item.product_id,
        item.grade,
        item.quantity,
        `rep-verify-${rep.id.slice(0, 8)}`,
        item.unit_price,
        true,
      );
      successfulDeductions.push({
        outlet: item.outlet as "unilorin" | "tanke",
        productId: item.product_id,
        grade: item.grade,
        quantity: item.quantity,
      });
    }

    // Every shelf moved. Only now write the adjusted values & assigned grade,
    // so a failed deduction leaves the order exactly as the customer placed it.
    for (const item of items) {
      await updateOrderItem(item.id, {
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        grade: item.grade,
      });
    }

    // Recalculate and update the order total
    const newTotal = items.reduce((sum, item) => sum + item.total_price, 0);
    await updateOrderTotal(orderId, newTotal);

    // Mark order as paid
    await updateOrderStatus(orderId, "paid");
  } catch (err: any) {
    // REVERSE: if ANY step fails, roll back all successful stock deductions
    // so no stock is lost. The order stays pending — and because its
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

  // Paid and the shelves are already down, so the holds can go. Outside the
  // try/catch on purpose: a failure above must leave the reservations intact,
  // and a failure here cannot undo a paid order. releaseReservation logs a
  // RESERVATION_RELEASE_FAILED audit row for anything it could not return.
  try {
    const { failed } = await releaseReservation(orderId);
    if (failed > 0) {
      console.error(
        `[repVerifyOrder] order ${orderId}: verified and paid, but ${failed} reservation(s) ` +
          `could not be returned. Those units are still counted as reserved and need a ` +
          `manual correction — see the RESERVATION_RELEASE_FAILED entries in the audit log.`
      );
    }
  } catch (releaseErr) {
    console.error(
      `[repVerifyOrder] order ${orderId}: verified and paid, but releasing its reservations ` +
        `threw. Some units may still be counted as reserved:`,
      releaseErr
    );
  }

  revalidatePath("/representative");
  revalidatePath("/delivery");
  return { success: true };
}

export async function repSettleOrder(orderId: string, newStatus: string) {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "settle_order");

  // Verify outlet ownership and check current status
  const archive = getArchiveServer();
  const { data: order, error: orderError } = await archive
    .from("orders")
    .select("outlet, status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error("Order not found.");
  }
  if (order.outlet !== rep.outlet) {
    throw new Error("This order does not belong to your outlet.");
  }
  // Prevent settling orders already in a final state
  if (order.status === "delivered" || order.status === "cancelled") {
    throw new Error(`This order is already ${order.status} and cannot be changed.`);
  }

  // Release reservations when cancelling
  if (newStatus === "cancelled") {
    await releaseReservation(orderId);
  }

  await updateOrderStatus(orderId, newStatus as any);
  revalidatePath("/representative");
  revalidatePath("/delivery");
}

// ─── SALE ACTIONS ───

export async function repRecordSale(
  productId: string,
  requestedGrade: "special" | "extra" | "normal",
  quantity: number,
  salePrice: number,
  forceGrade?: "special" | "extra" | "normal"
) {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "record_sale");

  // Check stock
  const stock = await getStockByProduct(rep.outlet, productId);
  const stockMap = {
    special: Math.max(0, (stock.find((s: any) => s.grade === "special")?.quantity ?? 0) - (stock.find((s: any) => s.grade === "special")?.reserved_quantity ?? 0)),
    extra: Math.max(0, (stock.find((s: any) => s.grade === "extra")?.quantity ?? 0) - (stock.find((s: any) => s.grade === "extra")?.reserved_quantity ?? 0)),
    normal: Math.max(0, (stock.find((s: any) => s.grade === "normal")?.quantity ?? 0) - (stock.find((s: any) => s.grade === "normal")?.reserved_quantity ?? 0)),
  };

  const check = validateShelfStock(stockMap, requestedGrade, quantity);

  if (!check.success && !forceGrade) {
    return {
      conflict: true,
      message: check.message,
      alternatives: check.alternatives,
      stockMap,
    };
  }

  const gradeToUse = forceGrade || requestedGrade;
  await deductStock(rep.outlet, productId, gradeToUse, quantity, `rep-${rep.id.slice(0, 8)}`, salePrice);
  revalidatePath("/representative");
  return { success: true, deductedFrom: gradeToUse };
}

// ─── INVENTORY ACTIONS ───

export async function repGetAvailableGrades(productId: string, orderId?: string) {
  const rep = await getVerifiedRep();
  const db = rep.outlet === "unilorin" ? getUnilorinServer() : getTankeServer();

  // Fetch reserved_quantity as well — only show grades with available > 0
  const { data, error } = await db
    .from("inventory")
    .select("grade, quantity, reserved_quantity, price")
    .eq("product_id", productId);

  if (error) throw error;

  // If an orderId is provided, look up how much this specific order reserved
  // on each grade so we can add it back to the "available" count.
  // (The reservation belongs to THIS order, so it should still appear as available.)
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
      // Available = total - reserved, but add back what THIS order reserved
      const otherReserved = (item.reserved_quantity ?? 0) - (orderReservedByGrade[item.grade] || 0);
      return (item.quantity - Math.max(0, otherReserved)) > 0;
    })
    .map(item => {
      const otherReserved = (item.reserved_quantity ?? 0) - (orderReservedByGrade[item.grade] || 0);
      return {
        grade: item.grade,
        quantity: item.quantity - Math.max(0, otherReserved),
        price: item.price,
      };
    });
}

// ─── PRODUCT ACTIONS ───

export async function repSearchProducts(query: string) {
  if (!query || query.trim().length < 2) return [];
  const master = getMasterServer();
  const words = query.trim().split(/\s+/).filter(Boolean);

  // Build a query where ALL words must appear somewhere in the name (word-order agnostic)
  let dbQuery = master
    .from("products")
    .select("id, name, category, base_image_url");

  for (const word of words) {
    dbQuery = dbQuery.ilike("name", `%${word}%`);
  }

  const { data, error } = await dbQuery.order("name").limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function repGetProductAudit(productId: string) {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "view_product_audit");

  const master = getMasterServer();
  const unilorin = getUnilorinServer();
  const tanke = getTankeServer();
  const archive = getArchiveServer();

  const results = await Promise.allSettled([
    master.from("products").select("*").eq("id", productId).maybeSingle(),
    unilorin.from("inventory").select("product_id, grade, quantity, price").eq("product_id", productId),
    tanke.from("inventory").select("product_id, grade, quantity, price").eq("product_id", productId),
    unilorin.from("stock_adjustments").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(100),
    tanke.from("stock_adjustments").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(100),
    archive
      .from("order_items")
      .select(`
        order_id, product_name, grade, quantity, unit_price, total_price, outlet,
        orders!inner(customer_name, customer_phone, status, created_at)
      `)
      .eq("product_id", productId)
      .order("order_id", { ascending: false })
      .limit(100),
    archive.from("audit_logs").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(100),
  ]);

  const getData = (r: (typeof results)[number]) =>
    r.status === "fulfilled" && r.value ? (r.value as any).data ?? null : null;

  const product = getData(results[0]);
  const uInv = getData(results[1]) as any[] | null;
  const tInv = getData(results[2]) as any[] | null;
  const uAdjustments = getData(results[3]) as any[] | null;
  const tAdjustments = getData(results[4]) as any[] | null;
  const orderItemsRaw = getData(results[5]) as any[] | null;
  const auditLogsRaw = getData(results[6]) as any[] | null;

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

  const adjustments = [
    ...(uAdjustments ?? []).map((a: any) => ({ ...a, outlet: "unilorin" as const })),
    ...(tAdjustments ?? []).map((a: any) => ({ ...a, outlet: "tanke" as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const orderSales = (orderItemsRaw ?? []).map((item: any) => ({
    order_id: item.order_id,
    product_name: item.product_name,
    grade: item.grade,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
    outlet: item.outlet,
    customer_name: item.orders?.customer_name ?? null,
    customer_phone: item.orders?.customer_phone ?? "",
    order_status: item.orders?.status ?? "unknown",
    order_created_at: item.orders?.created_at ?? "",
  })).sort((a: any, b: any) =>
    new Date(b.order_created_at).getTime() - new Date(a.order_created_at).getTime()
  );

  return {
    product: product ?? null,
    inventory: {
      unilorin: makeStock(uInv),
      tanke: makeStock(tInv),
    },
    stockAdjustments: adjustments,
    orderSales,
    auditLogs: auditLogsRaw ?? [],
  };
}

// ─── SALE REVERSAL ───

export async function repReverseSaleAction(
  auditLogId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "record_sale");

  const archive = getArchiveServer();
  const outletDb = rep.outlet === 'unilorin' ? getUnilorinServer() : getTankeServer();

  try {
    // 1. Fetch the audit log entry
    const { data: log, error: logError } = await archive
      .from('audit_logs')
      .select('*')
      .eq('id', auditLogId)
      .single();

    if (logError || !log) {
      return { success: false, message: 'Sale record not found.' };
    }

    // 2. Validate it's a SALE entry for this rep's outlet
    if (log.action !== 'SALE') {
      return { success: false, message: 'Only recorded sales can be reversed.' };
    }
    if (log.outlet !== rep.outlet) {
      return { success: false, message: 'This sale belongs to a different outlet.' };
    }

    // 3. Extract sale details — try structured metadata first, fall back to regex for old entries
    let quantity: number, grade: string;

    if (log.metadata?.qty != null && log.metadata?.grade) {
      quantity = log.metadata.qty;
      grade = log.metadata.grade;
    } else {
      const deductMatch = log.details?.match(/Deducted (\d+) from (\w+)/);
      if (!deductMatch) {
        return { success: false, message: 'Could not parse sale details. Contact admin for manual correction.' };
      }
      quantity = parseInt(deductMatch[1]);
      grade = deductMatch[2].toLowerCase();
    }

    if (!['special', 'extra', 'normal'].includes(grade)) {
      return { success: false, message: 'Invalid grade data in sale record.' };
    }

    // 4. Check if already reversed
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
        return {
          success: false,
          message: 'Stock was modified by another operation while processing this reversal. Please try again.',
        };
      }
    } else {
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
      details: `Reversed sale: added ${quantity} back to ${grade} at ${rep.outlet} (reversal of audit log ${auditLogId.slice(0, 8)}).${reasonText}`,
      admin_id: `rep-${rep.id.slice(0, 8)}`,
      outlet: rep.outlet,
    });

    // Also log a stock_adjustment
    await outletDb.from('stock_adjustments').insert({
      product_id: log.product_id,
      grade,
      old_quantity: current ? current.quantity : 0,
      new_quantity: current ? current.quantity + quantity : quantity,
      reason: `Sale reversal by ${rep.name}: ${reason || 'No reason provided'}`,
      admin_id: `rep-${rep.id.slice(0, 8)}`,
    });

    revalidatePath('/representative');
    return { success: true, message: `Reversed: ${quantity} × ${grade} added back to inventory.` };
  } catch (err: any) {
    console.error('[repReverseSale] Failed:', err);
    return { success: false, message: err?.message || 'Reversal failed.' };
  }
}

// ─── IMAGE ACTIONS ───

export async function repUploadImage(productId: string, formData: FormData) {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "upload_image");

  formData.append("productId", productId);
  const result = await uploadProductImage(formData);
  await updateProduct(productId, { base_image_url: result.url });
  revalidatePath("/representative");
  return result;
}

// ─── SALES HISTORY ACTIONS ───

export interface SaleRecord {
  id: string;
  product_id: string;
  product_name: string;
  grade: string;
  quantity: number;
  sale_price: number | null;
  total_amount: number | null;
  remaining: number | null;
  performed_by: "rep" | "admin";
  performed_by_name: string;
  admin_id: string;
  created_at: string;
}

export async function repGetSalesHistory(
  startDate: string,
  endDate: string
): Promise<SaleRecord[]> {
  const rep = await getVerifiedRep();
  requirePermission(rep.permissions, "record_sale");

  const archive = getArchiveServer();
  const master = getMasterServer();

  // Fetch SALE audit logs for this outlet within date range
  const { data: logs, error } = await archive
    .from("audit_logs")
    .select("id, product_id, details, admin_id, created_at")
    .eq("action", "SALE")
    .eq("outlet", rep.outlet)
    .gte("created_at", startDate)
    .lte("created_at", endDate + "T23:59:59.999Z")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch sales: ${error.message}`);
  if (!logs || logs.length === 0) return [];

  // Get unique product IDs and fetch names
  const productIds = [...new Set(logs.map((l) => l.product_id).filter(Boolean))];
  const { data: products } = await master
    .from("products")
    .select("id, name")
    .in("id", productIds);

  const productMap = new Map(products?.map((p) => [p.id, p.name]) || []);

  // Parse details and determine who performed the action
  const sales: SaleRecord[] = logs.map((log) => {
    // Try structured metadata first, fall back to regex for old entries
    const meta = (log as any).metadata;
    let quantity: number, grade: string, salePrice: number | null, remaining: number | null;

    if (meta?.qty != null && meta?.grade) {
      quantity = meta.qty;
      grade = meta.grade;
      salePrice = meta.price ?? null;
      remaining = null; // remaining isn't stored in metadata
    } else {
      const deductMatch = log.details?.match(/Deducted (\d+) from (\w+)/);
      const priceMatch = log.details?.match(/@ ₦([\d,]+)/);
      const remainingMatch = log.details?.match(/Remaining: (\d+)/);
      quantity = deductMatch ? parseInt(deductMatch[1]) : 0;
      grade = deductMatch ? deductMatch[2] : "unknown";
      salePrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : null;
      remaining = remainingMatch ? parseInt(remainingMatch[1]) : null;
    }

    // Determine who performed the action
    const isAdmin = log.admin_id?.startsWith("order-verify-");
    const isRepVerify = log.admin_id?.startsWith("rep-verify-");
    const isRepSale = log.admin_id?.startsWith("rep-");

    let performed_by: "rep" | "admin" = "rep";
    let performed_by_name = rep.name;

    if (isAdmin) {
      performed_by = "admin";
      performed_by_name = "Admin";
    } else if (isRepVerify) {
      performed_by = "rep";
      performed_by_name = rep.name;
    } else if (isRepSale) {
      performed_by = "rep";
      performed_by_name = rep.name;
    }

    return {
      id: log.id,
      product_id: log.product_id,
      product_name: productMap.get(log.product_id) || "Unknown Product",
      grade,
      quantity,
      sale_price: salePrice,
      total_amount: salePrice ? salePrice * quantity : null,
      remaining,
      performed_by,
      performed_by_name,
      admin_id: log.admin_id || "",
      created_at: log.created_at,
    };
  });

  return sales;
}
