// lib/archive/ambassadorRedemptions.ts — server-only attribution ledger for
// ambassador-linked orders (Archive database). Deliberately NOT "use server":
// writing happens from checkout, reading from the admin actions.
//
// Added by devtools/migrations/020_archive_ambassador_redemptions.sql. The
// record write is best-effort: a missing table or transient failure must never
// fail a customer's order — attribution is reporting, not checkout.

import "server-only";

import { getArchiveServer } from "@/lib/supabase/server";
import { isPaidOrderStatus } from "@/lib/ambassadors";

export interface AmbassadorRedemptionInput {
  orderId: string;
  code: string;
  outlet: string | null;
  totalAmount: number;
  itemCount: number;
}

export interface AmbassadorStats {
  redemptions: number;
  revenue: number;
  lastAt: string | null;
}

function isMissingTable(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return /ambassador_redemptions|relation .* does not exist|PGRST205/i.test(message);
}

/** Record one ambassador-linked order. Never throws for a missing table. */
export async function recordAmbassadorRedemption(entry: AmbassadorRedemptionInput): Promise<void> {
  const { error } = await getArchiveServer().from("ambassador_redemptions").insert({
    order_id: entry.orderId,
    ambassador_code: entry.code,
    outlet: entry.outlet,
    total_amount: entry.totalAmount,
    item_count: entry.itemCount,
  });
  if (error && !isMissingTable(error)) {
    console.error(`[ambassadors] failed to record redemption for ${entry.code}: ${error.message}`);
  }
}

/** Redemption count + revenue per code, for the admin stats cards. */
export async function getAmbassadorStats(codes: string[]): Promise<Record<string, AmbassadorStats>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await getArchiveServer()
    .from("ambassador_redemptions")
    .select("ambassador_code, total_amount, created_at")
    .in("ambassador_code", unique);
  if (error) {
    if (isMissingTable(error)) return {};
    throw new Error(`Failed to read ambassador redemptions: ${error.message}`);
  }

  const stats: Record<string, AmbassadorStats> = {};
  for (const code of unique) stats[code] = { redemptions: 0, revenue: 0, lastAt: null };
  for (const row of (data ?? []) as Array<{ ambassador_code: string; total_amount: number | null; created_at: string }>) {
    const bucket = stats[row.ambassador_code];
    if (!bucket) continue;
    bucket.redemptions += 1;
    bucket.revenue += Number(row.total_amount ?? 0);
    if (!bucket.lastAt || row.created_at > bucket.lastAt) bucket.lastAt = row.created_at;
  }
  return stats;
}

export interface AmbassadorPortalOrder {
  at: string;
  amount: number;
  outlet: string | null;
}

export interface AmbassadorPortalStats {
  /** Orders the admin has verified as paid — what the ambassador is credited. */
  paidCount: number;
  paidRevenue: number;
  /** Placed but not yet verified; never counted as a sale. */
  pendingCount: number;
  cancelledCount: number;
  recentPaid: AmbassadorPortalOrder[];
}

const EMPTY_PORTAL_STATS: AmbassadorPortalStats = {
  paidCount: 0,
  paidRevenue: 0,
  pendingCount: 0,
  cancelledCount: 0,
  recentPaid: [],
};

/**
 * What the ambassador's private portal shows: only orders the admin has
 * verified as paid count. Pending orders are shown as pending and never
 * counted; cancelled ones fall away. No customer names or phone numbers are
 * returned, so the link stays safe to share.
 */
export async function getAmbassadorPortalStats(
  code: string,
  recentLimit = 20,
): Promise<AmbassadorPortalStats> {
  const archive = getArchiveServer();
  const { data, error } = await archive
    .from("ambassador_redemptions")
    .select("order_id, total_amount, outlet, created_at")
    .eq("ambassador_code", code);
  if (error) {
    if (isMissingTable(error)) return EMPTY_PORTAL_STATS;
    throw new Error(`Failed to read ambassador orders: ${error.message}`);
  }
  if (!data || data.length === 0) return EMPTY_PORTAL_STATS;

  const rows = data as Array<{ order_id: string; total_amount: number | null; outlet: string | null; created_at: string }>;
  const orderIds = [...new Set(rows.map((row) => row.order_id))];

  // Status lives on orders, so batch-fetch it (PostgREST URL limits).
  const statusById = new Map<string, string>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data: orders, error: ordersError } = await archive
      .from("orders")
      .select("id, status")
      .in("id", orderIds.slice(i, i + 200));
    if (ordersError) throw new Error(`Failed to read ambassador order statuses: ${ordersError.message}`);
    for (const order of (orders ?? []) as Array<{ id: string; status: string }>) {
      statusById.set(order.id, order.status);
    }
  }

  const result: AmbassadorPortalStats = { ...EMPTY_PORTAL_STATS, recentPaid: [] };
  for (const row of rows) {
    const status = statusById.get(row.order_id);
    if (isPaidOrderStatus(status)) {
      result.paidCount += 1;
      result.paidRevenue += Number(row.total_amount ?? 0);
      result.recentPaid.push({
        at: row.created_at,
        amount: Number(row.total_amount ?? 0),
        outlet: row.outlet,
      });
    } else if (status === "cancelled") {
      result.cancelledCount += 1;
    } else {
      result.pendingCount += 1;
    }
  }
  result.recentPaid.sort((a, b) => (a.at < b.at ? 1 : -1));
  result.recentPaid = result.recentPaid.slice(0, recentLimit);
  return result;
}

/**
 * Delete attribution rows for orders that were never paid and are older than
 * `maxAgeDays`. Keeps the ambassador_portal stats and the table tiny without
 * touching the order/audit ledger — the order row (and its ambassador note)
 * remains the permanent record. Returns how many rows were removed.
 */
export async function pruneStaleAmbassadorRedemptions(maxAgeDays = 7): Promise<number> {
  const archive = getArchiveServer();
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: stale, error } = await archive
    .from("ambassador_redemptions")
    .select("id, order_id")
    .lt("created_at", cutoff);
  if (error) {
    if (isMissingTable(error)) return 0;
    throw new Error(`Failed to scan ambassador redemption rows: ${error.message}`);
  }
  if (!stale || stale.length === 0) return 0;

  const rows = stale as Array<{ id: string; order_id: string }>;
  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const paidIds = new Set<string>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data: orders, error: ordersError } = await archive
      .from("orders")
      .select("id, status")
      .in("id", orderIds.slice(i, i + 200));
    if (ordersError) throw new Error(`Failed to read order statuses for pruning: ${ordersError.message}`);
    for (const order of (orders ?? []) as Array<{ id: string; status: string }>) {
      if (isPaidOrderStatus(order.status)) paidIds.add(order.id);
    }
  }

  const deletable = rows.filter((row) => !paidIds.has(row.order_id)).map((row) => row.id);
  if (deletable.length === 0) return 0;

  for (let i = 0; i < deletable.length; i += 200) {
    const { error: deleteError } = await archive
      .from("ambassador_redemptions")
      .delete()
      .in("id", deletable.slice(i, i + 200));
    if (deleteError) throw new Error(`Failed to prune ambassador redemption rows: ${deleteError.message}`);
  }
  return deletable.length;
}
