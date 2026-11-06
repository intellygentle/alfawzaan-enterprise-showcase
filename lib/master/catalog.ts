// Kept as "use server" because admin client components (ProductUploadForm) call
// these directly — which means EVERY export below is a callable HTTP endpoint.
// requireStaffSession() is the inner guard: it verifies a signed admin or
// representative cookie without a database read, so an anonymous caller is
// rejected here even if they learn an action id. The outer action layer
// (app/admin/dashboard/actions.ts, app/representative/actions.ts) still does the
// full active-status and permission check.
"use server";

import { getMasterServer } from "@/lib/supabase/server";
import { withRetry } from "@/lib/retry";
import { requireStaffSession } from "@/lib/auth/session";
import type { ProductInput } from "@/lib/types";

export async function createProduct(data: ProductInput) {
  await requireStaffSession();
  return withRetry(async () => {
    const client = getMasterServer();

    const { data: product, error } = await client
      .from('products')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('[catalog] Supabase error:', error);
      throw new Error(`Master insert failed: ${error.message}`);
    }
    if (!product) {
      throw new Error('Master insert failed: No data returned from database');
    }
    return product;
  });
}

export async function getProducts() {
  await requireStaffSession();
  const client = getMasterServer();
  const { data, error } = await client
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getProductById(id: string) {
  await requireStaffSession();
  const client = getMasterServer();
  const { data, error } = await client
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProduct(id: string, updates: Partial<ProductInput>) {
  await requireStaffSession();
  return withRetry(async () => {
    const client = getMasterServer();
    const { data, error } = await client
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  });
}

export async function findProductByName(name: string) {
  await requireStaffSession();
  return withRetry(async () => {
    const client = getMasterServer();
    const { data, error } = await client
      .from('products')
      .select('*')
      .ilike('name', name.trim())
      .maybeSingle();

    if (error) throw error;
    return data ?? null;
  });
}

export async function deleteProduct(id: string) {
  await requireStaffSession();
  const client = getMasterServer();
  const { error } = await client.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function updateProductPrice(id: string, price: number) {
  await requireStaffSession();
  const client = getMasterServer();
  const { data, error } = await client
    .from('products')
    .update({ price, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, price')
    .single();

  if (error) throw new Error(`Failed to update product price: ${error.message}`);
  return data;
}