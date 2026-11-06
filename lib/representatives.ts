import { getMasterServer } from "@/lib/supabase/server";
import { hash, compare } from "bcryptjs";

const SALT_ROUNDS = 10;

export interface RepresentativePermissions {
  stock_in: boolean;
  edit_inventory: boolean;
  record_sale: boolean;
  verify_order: boolean;
  settle_order: boolean;
  update_order_item: boolean;
  add_product: boolean;
  bulk_import: boolean;
  upload_image: boolean;
  view_inventory: boolean;
  view_orders: boolean;
  view_audit_logs: boolean;
  view_product_audit: boolean;
}

export interface Representative {
  id: string;
  username: string;
  display_name: string;
  outlet: 'unilorin' | 'tanke';
  permissions: RepresentativePermissions;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PERMISSIONS: RepresentativePermissions = {
  stock_in: false,
  edit_inventory: false,
  record_sale: true,
  verify_order: true,
  settle_order: true,
  update_order_item: false,
  add_product: false,
  bulk_import: false,
  upload_image: true,
  view_inventory: true,
  view_orders: true,
  view_audit_logs: false,
  view_product_audit: true,
};

export async function createRepresentative(
  username: string,
  password: string,
  displayName: string,
  outlet: 'unilorin' | 'tanke',
  permissions: RepresentativePermissions = DEFAULT_PERMISSIONS
) {
  const client = getMasterServer();
  const passwordHash = await hash(password, SALT_ROUNDS);

  const { data, error } = await client
    .from('representatives')
    .insert({
      username: username.toLowerCase().trim(),
      password_hash: passwordHash,
      display_name: displayName.trim(),
      outlet,
      permissions,
    })
    .select('id, username, display_name, outlet, permissions, is_active, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Username "${username}" is already taken.`);
    }
    throw new Error(`Failed to create representative: ${error.message}`);
  }

  return data as Representative;
}

export async function getRepresentatives() {
  const client = getMasterServer();
  const { data, error } = await client
    .from('representatives')
    .select('id, username, display_name, outlet, permissions, is_active, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch representatives: ${error.message}`);
  return (data ?? []) as Representative[];
}

export async function getRepresentativeById(id: string) {
  const client = getMasterServer();
  const { data, error } = await client
    .from('representatives')
    .select('id, username, display_name, outlet, permissions, is_active, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to fetch representative: ${error.message}`);
  return data as Representative;
}

export async function updateRepresentative(
  id: string,
  updates: {
    display_name?: string;
    outlet?: 'unilorin' | 'tanke';
    permissions?: RepresentativePermissions;
    is_active?: boolean;
    password?: string;
  }
) {
  const client = getMasterServer();
  const payload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  // If password is being updated, hash it
  if (updates.password) {
    payload.password_hash = await hash(updates.password, SALT_ROUNDS);
    delete payload.password;
  }

  const { data, error } = await client
    .from('representatives')
    .update(payload)
    .eq('id', id)
    .select('id, username, display_name, outlet, permissions, is_active, created_at, updated_at')
    .single();

  if (error) throw new Error(`Failed to update representative: ${error.message}`);
  return data as Representative;
}

export async function deleteRepresentative(id: string) {
  const client = getMasterServer();
  const { error } = await client
    .from('representatives')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete representative: ${error.message}`);
}

export async function verifyRepCredentials(username: string, password: string) {
  const client = getMasterServer();
  const { data, error } = await client
    .from('representatives')
    .select('id, username, password_hash, display_name, outlet, permissions, is_active')
    .eq('username', username.toLowerCase().trim())
    .single();

  if (error || !data) {
    return null;
  }

  if (!data.is_active) {
    return null;
  }

  const isValid = await compare(password, data.password_hash);
  if (!isValid) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    display_name: data.display_name,
    outlet: data.outlet,
    permissions: data.permissions as RepresentativePermissions,
  };
}
