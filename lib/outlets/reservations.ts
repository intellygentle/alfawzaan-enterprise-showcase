// Deliberately NOT "use server". Only server code imports this module
// (placeOrder and the admin/rep action layers). Publishing these exports as
// server actions would let anyone reserve or release stock at will, holding
// inventory hostage without placing an order. The callers are the authenticated
// (or deliberately public, in placeOrder's case) boundary.

import { getOutletDB, getArchiveServer } from "@/lib/supabase/server";
import type { Outlet, Grade } from "@/lib/types";

/**
 * Stamped onto each reservation as `expires_at`, for reference only.
 *
 * Nothing acts on it. Reservations are never expired automatically, so an
 * order stays in pending verification — holding its stock — until an admin
 * verifies or cancels it. Verification is done by hand and routinely takes
 * longer than any timer we could safely pick, and silently cancelling a live
 * order proved worse than holding stock. The dashboard shows how long each
 * order has been waiting so abandoned ones can be spotted and cancelled
 * manually.
 */
const RESERVATION_TTL_MINUTES = 30;

/** How many times to re-read and retry a contended reserved_quantity write. */
const RESERVED_ADJUST_ATTEMPTS = 5;

type ActiveReservation = {
  id: string;
  product_id: string;
  quantity: number;
  assigned_grade: string;
};

/**
 * Apply a *relative* change to an inventory row's reserved_quantity under
 * optimistic concurrency, and report whether it actually landed.
 *
 * Two things make this necessary rather than convenient:
 *
 * 1. Supabase does not report an error when a conditional update matches zero
 *    rows — `error` is null and the write simply didn't happen. Callers that
 *    only checked `error` believed a lost optimistic lock had succeeded.
 * 2. Writing an absolute value computed from an earlier read silently discards
 *    any change another order made in between, which undercounts reserved
 *    stock and oversells.
 *
 * So: re-read, adjust by `delta`, write guarded on the value we read, and
 * confirm via `.select()` that a row matched. On contention, read again and
 * retry rather than assuming.
 */
async function adjustReservedQuantity(
  db: ReturnType<typeof getOutletDB>,
  productId: string,
  grade: string,
  delta: number
): Promise<boolean> {
  for (let attempt = 1; attempt <= RESERVED_ADJUST_ATTEMPTS; attempt++) {
    const { data: current, error: readError } = await db
      .from("inventory")
      .select("reserved_quantity")
      .eq("product_id", productId)
      .eq("grade", grade)
      .maybeSingle();

    // No such shelf row (or an ambiguous duplicate) — there is nothing we can
    // safely adjust, and pretending otherwise is how stock goes missing.
    if (readError || !current) return false;

    const currentReserved = current.reserved_quantity ?? 0;
    const next = Math.max(0, currentReserved + delta);

    const { data: updated, error: updError } = await db
      .from("inventory")
      .update({
        reserved_quantity: next,
        last_updated: new Date().toISOString(),
      })
      .eq("product_id", productId)
      .eq("grade", grade)
      .eq("reserved_quantity", currentReserved) // Optimistic lock
      .select("id");

    if (updError) return false;
    if (updated && updated.length > 0) return true; // Landed.

    // Zero rows matched: someone else moved reserved_quantity between our read
    // and our write. Re-read and try again.
  }

  return false;
}

/**
 * Reserve stock for a pending order. Picks the grade with the most available stock.
 * Uses optimistic concurrency to prevent overselling.
 */
export async function reserveStock(
  outlet: Outlet,
  orderId: string,
  productId: string,
  quantity: number
): Promise<{ success: boolean; assignedGrade?: Grade; error?: string }> {
  const db = getOutletDB(outlet);

  // A timed-out checkout may retry after the first request already reserved
  // this item. Return the existing hold instead of incrementing it twice.
  const { data: existingReservation, error: existingError } = await db
    .from("inventory_reservations")
    .select("quantity, assigned_grade")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .eq("status", "active")
    .maybeSingle();
  if (existingError) throw new Error(`Failed to check existing reservation: ${existingError.message}`);
  if (existingReservation) {
    if (existingReservation.quantity !== quantity) {
      return { success: false, error: "This checkout was already submitted with a different quantity." };
    }
    return { success: true, assignedGrade: existingReservation.assigned_grade as Grade };
  }

  // 1. Get all inventory rows for this product
  const { data: rows, error: fetchError } = await db
    .from("inventory")
    .select("grade, quantity, reserved_quantity")
    .eq("product_id", productId);

  if (fetchError) throw new Error(`Failed to check stock: ${fetchError.message}`);
  if (!rows || rows.length === 0) {
    return { success: false, error: "Product not found at this outlet" };
  }

  // 2. Calculate available per grade and pick the best one
  const withAvailable = rows
    .map((r) => ({
      grade: r.grade as Grade,
      available: r.quantity - (r.reserved_quantity ?? 0),
    }))
    .sort((a, b) => b.available - a.available);

  const totalAvailable = withAvailable.reduce((sum, r) => sum + r.available, 0);
  if (totalAvailable < quantity) {
    return { success: false, error: `Only ${totalAvailable} unit(s) available` };
  }

  // 3. Try to reserve against the grade with the most available stock
  for (const candidate of withAvailable) {
    if (candidate.available < quantity) continue;

    // Read current values for this grade
    const current = rows.find((r) => r.grade === candidate.grade);
    if (!current) continue;

    const currentReserved = current.reserved_quantity ?? 0;
    const currentQuantity = current.quantity;

    // Check available again with fresh values
    if (currentQuantity - currentReserved < quantity) continue;

    // Try to update with optimistic concurrency
    const { data: updResult, error: updError } = await db
      .from("inventory")
      .update({
        reserved_quantity: currentReserved + quantity,
        last_updated: new Date().toISOString(),
      })
      .eq("product_id", productId)
      .eq("grade", candidate.grade)
      .eq("reserved_quantity", currentReserved) // Optimistic lock
      .select("id");

    if (updError) continue; // Try next grade
    if (!updResult || updResult.length === 0) continue; // Concurrent modification, try next

    // 4. Insert reservation record
    const expiresAt = new Date(
      Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
    ).toISOString();

    const { error: insertError } = await db.from("inventory_reservations").insert({
      order_id: orderId,
      product_id: productId,
      quantity,
      assigned_grade: candidate.grade,
      status: "active",
      expires_at: expiresAt,
    });

    if (insertError) {
      // Roll the count back relatively, not by restoring the value we read.
      // An absolute write here would erase any reservation another order made
      // between our update above and this rollback.
      const rolledBack = await adjustReservedQuantity(
        db,
        productId,
        candidate.grade,
        -quantity
      );

      if (!rolledBack) {
        console.error(
          `[reserveStock] order ${orderId} at ${outlet}: reservation insert failed and ` +
            `the ${quantity}-unit rollback on the ${candidate.grade} shelf did not apply. ` +
            `Those units are counted as reserved with no reservation row behind them.`
        );
        await getArchiveServer().from("audit_logs").insert({
          action: "RESERVATION_ROLLBACK_FAILED",
          product_id: productId,
          details:
            `Reservation insert failed for order ${orderId.slice(0, 8)} at ${outlet}, and the ` +
            `${quantity}-unit rollback on the ${candidate.grade} shelf did not apply. Those units ` +
            `are still counted as reserved with no reservation behind them — correct the shelf count manually.`,
          outlet,
        });
      }
      continue;
    }

    // 5. Log to audit
    await getArchiveServer().from("audit_logs").insert({
      action: "RESERVATION_CREATED",
      product_id: productId,
      details: `Reserved ${quantity} for order ${orderId.slice(0, 8)} on ${candidate.grade} shelf at ${outlet}`,
      outlet,
    });

    return { success: true, assignedGrade: candidate.grade };
  }

  return { success: false, error: "Failed to reserve stock. Please try again." };
}

/**
 * Release all active reservations for an order.
 * Called when order is verified or cancelled.
 *
 * Each reservation is *claimed* before its stock is touched, and its audit
 * entry reflects what actually happened rather than what was attempted. See
 * the comment on the claim below for why the ordering matters.
 */
export async function releaseReservation(
  orderId: string
): Promise<{ released: number; failed: number }> {
  let released = 0;
  let failed = 0;

  // Find all active reservations for this order across both outlets
  // We need to check both outlet databases
  for (const outlet of ["unilorin", "tanke"] as Outlet[]) {
    const db = getOutletDB(outlet);

    const { data: reservations } = await db
      .from("inventory_reservations")
      .select("id, product_id, quantity, assigned_grade")
      .eq("order_id", orderId)
      .eq("status", "active");

    if (!reservations || reservations.length === 0) continue;

    const succeeded: ActiveReservation[] = [];
    const stuck: ActiveReservation[] = [];

    for (const res of reservations) {
      // Claim the reservation before touching stock.
      //
      // Flipping active → released is the one atomic step that decides who
      // owns this release. Two callers releasing the same order at once (an
      // admin cancelling while verification runs, or a double-click) would
      // otherwise both decrement the same reservation, undercount reserved
      // stock, and oversell.
      //
      // Claiming first means the worst case is stock left counted as reserved,
      // which undersells and is recoverable, rather than stock released twice,
      // which oversells and is not. Without a cross-table transaction one of
      // those two has to be chosen; this is the safer one, and the failure is
      // written to the audit log below so it can be found and corrected.
      const { data: claimed } = await db
        .from("inventory_reservations")
        .update({ status: "released" })
        .eq("id", res.id)
        .eq("status", "active")
        .select("id");

      if (!claimed || claimed.length === 0) continue; // Another caller has it.

      const returned = await adjustReservedQuantity(
        db,
        res.product_id,
        res.assigned_grade,
        -res.quantity
      );

      if (returned) {
        succeeded.push(res);
        released++;
      } else {
        stuck.push(res);
        failed++;
        console.error(
          `[releaseReservation] order ${orderId} at ${outlet}: could not return ` +
            `${res.quantity} × ${res.product_id} to the ${res.assigned_grade} shelf. ` +
            `Reservation ${res.id} is marked released but those units are still ` +
            `counted as reserved and need a manual correction.`
        );
      }
    }

    const archive = getArchiveServer();

    // Log one entry per reservation, each tagged with its product_id so the
    // release shows up on that product's audit page. A single summary row
    // carries no product_id, which made these releases invisible there.
    if (succeeded.length > 0) {
      await archive.from("audit_logs").insert(
        succeeded.map((res) => ({
          action: "RESERVATION_RELEASED",
          product_id: res.product_id,
          details: `Released ${res.quantity} unit(s) from the ${res.assigned_grade} shelf for order ${orderId.slice(0, 8)} at ${outlet}`,
          outlet,
        }))
      );
    }

    // A failed release must never look like a successful one. This is the only
    // record that the shelf count is now wrong, so it has to be written.
    if (stuck.length > 0) {
      await archive.from("audit_logs").insert(
        stuck.map((res) => ({
          action: "RESERVATION_RELEASE_FAILED",
          product_id: res.product_id,
          details:
            `Could not return ${res.quantity} unit(s) to the ${res.assigned_grade} shelf for ` +
            `order ${orderId.slice(0, 8)} at ${outlet}. Those units are still counted as ` +
            `reserved — correct the shelf count manually.`,
          outlet,
        }))
      );
    }
  }

  return { released, failed };
}

/**
 * Release reservation and return the assigned grade for a specific product.
 * Used during verification when admin may assign a different grade.
 *
 * Returns the grade only for reservations this call actually claimed, so the
 * caller is never told a shelf was freed when it wasn't.
 */
export async function releaseReservationForItem(
  outlet: Outlet,
  orderId: string,
  productId: string
): Promise<Grade | null> {
  const db = getOutletDB(outlet);

  const { data: reservations } = await db
    .from("inventory_reservations")
    .select("id, quantity, assigned_grade")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .eq("status", "active");

  if (!reservations || reservations.length === 0) return null;

  let assignedGrade: Grade | null = null;
  const archive = getArchiveServer();

  for (const res of reservations) {
    // Claim before touching stock — same reasoning as releaseReservation.
    const { data: claimed } = await db
      .from("inventory_reservations")
      .update({ status: "released" })
      .eq("id", res.id)
      .eq("status", "active")
      .select("id");

    if (!claimed || claimed.length === 0) continue; // Another caller has it.

    assignedGrade = res.assigned_grade as Grade;

    const returned = await adjustReservedQuantity(
      db,
      productId,
      res.assigned_grade,
      -res.quantity
    );

    if (returned) {
      // Audit, tagged with the product so it appears on that product's page
      await archive.from("audit_logs").insert({
        action: "RESERVATION_RELEASED",
        product_id: productId,
        details: `Released ${res.quantity} unit(s) from the ${res.assigned_grade} shelf for order ${orderId.slice(0, 8)} at ${outlet} (order item edited by admin)`,
        outlet,
      });
    } else {
      console.error(
        `[releaseReservationForItem] order ${orderId} at ${outlet}: could not return ` +
          `${res.quantity} × ${productId} to the ${res.assigned_grade} shelf. Reservation ` +
          `${res.id} is marked released but those units are still counted as reserved.`
      );
      await archive.from("audit_logs").insert({
        action: "RESERVATION_RELEASE_FAILED",
        product_id: productId,
        details:
          `Could not return ${res.quantity} unit(s) to the ${res.assigned_grade} shelf for ` +
          `order ${orderId.slice(0, 8)} at ${outlet}. Those units are still counted as ` +
          `reserved — correct the shelf count manually.`,
        outlet,
      });
    }
  }

  return assignedGrade;
}

/**
 * NOTE: there is deliberately no automatic expiry function here.
 *
 * A previous version swept reservations older than RESERVATION_TTL_MINUTES and
 * cancelled their orders. Because that sweep only ran when the *next* customer
 * placed an order, live orders awaiting manual verification would vanish from
 * the dashboard at an unpredictable moment and silently return their stock.
 * Abandoned orders are now cleared by an admin instead — the dashboard shows
 * how long each has been waiting.
 */
