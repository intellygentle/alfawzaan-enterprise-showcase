// Deliberately NOT "use server". Imported only by server code
// (app/delivery/actions.ts and app/admin/dashboard/actions.ts), which is where
// the public-vs-admin decision is made per action. As a "use server" module
// every export — including status updates and pairing writes — became an
// HTTP endpoint with no session check of its own.

import { getArchiveServer } from "@/lib/supabase/server";
import type { DeliveryRequestStatus, DeliveryPairStatus } from "@/lib/types";

// ─── CREATE ───

export async function createDeliveryRequest(
  phoneNumber: string,
  address: string,
  area: string,
  orderId?: string,
  preferredTime?: string,
  notes?: string
) {
  const { data, error } = await getArchiveServer()
    .from('delivery_requests')
    .insert({
      order_id: orderId || null,
      phone_number: phoneNumber,
      address,
      area,
      preferred_time: preferredTime || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── READ ───

export async function getDeliveryRequests(status?: DeliveryRequestStatus) {
  let query = getArchiveServer()
    .from('delivery_requests')
    .select(`
      *,
      order:orders!order_id (
        id, customer_name, customer_phone, status, outlet, total_amount
      )
    `)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDeliveryRequestsByPhone(phoneNumber: string) {
  const { data, error } = await getArchiveServer()
    .from('delivery_requests')
    .select(`
      *,
      order:orders!order_id (
        id, customer_name, customer_phone, status, outlet, total_amount
      )
    `)
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPendingRequestsByArea(area: string, excludeRequestId?: string) {
  let query = getArchiveServer()
    .from('delivery_requests')
    .select(`
      *,
      order:orders!order_id (
        id, customer_name, customer_phone, status, outlet, total_amount
      )
    `)
    .eq('area', area)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (excludeRequestId) {
    query = query.neq('id', excludeRequestId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Returns admin-approved delivery requests in a given area.
 * Only requests approved by admin are visible for peer pairing.
 */
/**
 * Public projection for the visitor-facing delivery surfaces.
 *
 * These helpers feed /delivery, which is open to anonymous visitors, and they
 * used to select `*` plus an embedded order (customer_name, customer_phone,
 * total_amount). That published every approved request's home ADDRESS, phone
 * number, free-text notes and the customer's name and spend to anyone loading
 * the page — the peer-pairing and "active requests" cards only ever render the
 * area, status and time, so none of it was needed. Narrowing the projection
 * fixes the leak and cuts the payload (egress) at the same time.
 */
const PUBLIC_DELIVERY_FIELDS = "id, area, status, preferred_time, created_at";

export async function getApprovedRequestsByArea(area: string, excludeRequestId?: string) {
  let query = getArchiveServer()
    .from('delivery_requests')
    .select(PUBLIC_DELIVERY_FIELDS)
    .eq('area', area)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (excludeRequestId) {
    query = query.neq('id', excludeRequestId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDeliveryRequestsByOrderIds(orderIds: string[]) {
  if (orderIds.length === 0) return [];

  const { data, error } = await getArchiveServer()
    .from('delivery_requests')
    .select(`
      *,
      order:orders!order_id (
        id, customer_name, customer_phone, status, outlet, total_amount
      )
    `)
    .in('order_id', orderIds);

  if (error) throw error;
  return data ?? [];
}

export async function getAllApprovedRequests(excludeRequestId?: string) {
  let query = getArchiveServer()
    .from('delivery_requests')
    .select(PUBLIC_DELIVERY_FIELDS)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (excludeRequestId) {
    query = query.neq('id', excludeRequestId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── UPDATE ───

export async function updateDeliveryRequestStatus(
  requestId: string,
  status: DeliveryRequestStatus
) {
  const { data, error } = await getArchiveServer()
    .from('delivery_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDeliveryRequest(
  requestId: string,
  updates: Partial<{
    address: string;
    area: string;
    preferred_time: string;
    status: DeliveryRequestStatus;
    notes: string;
  }>
) {
  const { data, error } = await getArchiveServer()
    .from('delivery_requests')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── DELIVERY PAIRS ───

export async function createDeliveryPairWithRequests(
  orderId1: string,
  orderId2: string,
  location: string,
  deliveryRequestId1?: string,
  deliveryRequestId2?: string,
  adminNotes?: string
) {
  const { data, error } = await getArchiveServer()
    .from('delivery_pairs')
    .insert({
      order_id_1: orderId1,
      order_id_2: orderId2,
      location,
      delivery_request_id_1: deliveryRequestId1 || null,
      delivery_request_id_2: deliveryRequestId2 || null,
      admin_notes: adminNotes || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDeliveryPairs(status?: DeliveryPairStatus) {
  let query = getArchiveServer()
    .from('delivery_pairs')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Enrich pairs with delivery request and order data
  const enriched = await Promise.all(
    data.map(async (pair) => {
      const [req1, req2] = await Promise.all([
        pair.delivery_request_id_1
          ? getArchiveServer()
              .from('delivery_requests')
              .select(`*, order:orders!order_id (id, customer_name, customer_phone, status, outlet, total_amount)`)
              .eq('id', pair.delivery_request_id_1)
              .maybeSingle()
              .then((r) => r.data)
          : Promise.resolve(null),
        pair.delivery_request_id_2
          ? getArchiveServer()
              .from('delivery_requests')
              .select(`*, order:orders!order_id (id, customer_name, customer_phone, status, outlet, total_amount)`)
              .eq('id', pair.delivery_request_id_2)
              .maybeSingle()
              .then((r) => r.data)
          : Promise.resolve(null),
      ]);

      return {
        ...pair,
        request_1: req1,
        request_2: req2,
      };
    })
  );

  return enriched;
}

export async function updateDeliveryPairStatus(
  pairId: string,
  status: DeliveryPairStatus,
  adminNotes?: string
) {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (adminNotes !== undefined) updates.admin_notes = adminNotes;

  const { data, error } = await getArchiveServer()
    .from('delivery_pairs')
    .update(updates)
    .eq('id', pairId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDeliveryPair(pairId: string) {
  const { error } = await getArchiveServer()
    .from('delivery_pairs')
    .delete()
    .eq('id', pairId);

  if (error) throw error;
}

// ─── COUNTS ───

export async function getDeliveryRequestCount(status?: DeliveryRequestStatus) {
  let query = getArchiveServer()
    .from('delivery_requests')
    .select('*', { count: 'exact', head: true });

  if (status) query = query.eq('status', status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
