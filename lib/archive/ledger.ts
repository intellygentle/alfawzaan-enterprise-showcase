// Deliberately NOT "use server". This module is imported only by server code
// (app/actions/orderActions.ts, app/admin/dashboard/actions.ts,
// app/representative/actions.ts). Marking it "use server" would publish every
// export — including deleteOrder, updateOrderStatus, updateOrderItem and
// updateOrderTotal — as an HTTP endpoint callable without a session.
// Its callers are the authenticated boundary; this stays an internal module.

import { getArchiveServer } from "@/lib/supabase/server";
import type { OrderInput, OrderItemInput } from "@/lib/types";

type CreatedOrder = OrderInput & {
  id: string;
  status?: string;
  existing?: boolean;
};

export async function createOrder(order: OrderInput, items: OrderItemInput[]): Promise<CreatedOrder> {
  if (items.length === 0) throw new Error('An order must contain at least one item.');
  const { data, error } = await getArchiveServer().rpc('create_order_with_items', {
    p_order: order,
    p_items: items,
  });
  if (!error) {
    const result = data as { order?: CreatedOrder; existing?: boolean } | null;
    if (!result?.order?.id) throw new Error('Atomic order creation returned no order.');
    return { ...result.order, existing: result.existing ?? false };
  }

  // Keep the current deployment working until migration 011 is applied. Only
  // fall back when PostgREST explicitly says the RPC is absent; operational or
  // validation errors from an installed RPC must surface rather than risk a
  // duplicate insert.
  const rpcMissing = error.code === 'PGRST202' || /could not find.*create_order_with_items/i.test(error.message);
  if (!rpcMissing) throw new Error(`Atomic order creation failed: ${error.message}`);

  const legacyOrder = { ...order };
  delete legacyOrder.checkout_id;
  const { data: newOrder, error: orderError } = await getArchiveServer()
    .from('orders').insert(legacyOrder).select().single();
  if (orderError || !newOrder) throw new Error(`Order creation failed: ${orderError?.message || 'No order returned'}`);

  const { error: itemsError } = await getArchiveServer()
    .from('order_items')
    .insert(items.map((item) => ({ ...item, order_id: newOrder.id })));
  if (itemsError) {
    const { error: cleanupError } = await getArchiveServer().from('orders').delete().eq('id', newOrder.id);
    if (cleanupError) {
      throw new Error(`Order items failed and parent cleanup failed: ${itemsError.message}; ${cleanupError.message}`);
    }
    throw new Error(`Order items failed; incomplete order was removed: ${itemsError.message}`);
  }
  return newOrder as CreatedOrder;
}

export async function updateOrderStatus(
  orderId: string, 
  status: 'pending' | 'paid' | 'shipping' | 'delivered' | 'cancelled'
) {
  const { data, error } = await getArchiveServer()
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getOrders(status?: string) {
  let query = getArchiveServer()
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });
  
  if (status) query = query.eq('status', status);
  
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAuditLogs(limit = 50) {
  const { data, error } = await getArchiveServer()
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data ?? [];
}

export async function updateOrderItem(
  itemId: string,
  updates: {
    quantity?: number;
    unit_price?: number;
    total_price?: number;
    grade?: string;
  }
) {
  const { data, error } = await getArchiveServer()
    .from('order_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteOrder(orderId: string) {
  // Delete order items first (foreign key constraint)
  const { error: itemsError } = await getArchiveServer()
    .from('order_items')
    .delete()
    .eq('order_id', orderId);

  if (itemsError) throw itemsError;

  // Delete the order
  const { error } = await getArchiveServer()
    .from('orders')
    .delete()
    .eq('id', orderId);

  if (error) throw error;
  return { success: true };
}

export async function updateOrderTotal(orderId: string, total_amount: number) {
  const { data, error } = await getArchiveServer()
    .from('orders')
    .update({ total_amount, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createDeliveryPair(orderId1: string, orderId2: string, location: string) {
  const { data, error } = await getArchiveServer()
    .from('delivery_pairs')
    .insert({ order_id_1: orderId1, order_id_2: orderId2, location })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
