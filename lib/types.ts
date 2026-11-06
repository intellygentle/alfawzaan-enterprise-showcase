// lib/types.ts — Shared type definitions for the entire project

// ─── Core domain types ───
export type Grade = 'special' | 'extra' | 'normal';
export type Outlet = 'unilorin' | 'tanke';
export type OrderStatus = 'pending' | 'paid' | 'shipping' | 'delivered' | 'cancelled';

// ─── Inventory ───
export interface StockCheck {
  special: number;
  extra: number;
  normal: number;
}

export interface InventoryItem {
  product_id: string;
  grade: Grade;
  quantity: number;
  price: number;
  shelf_location?: string;
}

export interface AdminInventoryItem {
  id: string;
  productId: string;
  name: string;
  type: string;
  description: string;
  baseImageUrl: string | null;
  special: number;
  extra: number;
  normal: number;
  price: number;
  total: number;
  location: 'Unilorin' | 'Tanke';
}

// ─── Cart ───
export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  grade: string;
  category: string;
  imageUrl: string;
  outlets: string[];
  selectedOutlet: string | null;
  availableStock?: Record<string, number>;
}

// ─── Storefront ───
export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  description?: string;
  /** Effective price — the active discount price when one is running, otherwise the normal price */
  price: number;
  /** Normal price, present only while a discount is active (for strikethrough display) */
  originalPrice?: number;
  /** When the active discount ends (ISO string) */
  discountExpiresAt?: string;
  grade: 'Special' | 'Extra' | 'Normal';
  outlets: string[];
  outletStock: Record<string, number>;
  imageUrl: string;
  /** Enriched sensory copy — populated from sensory_copy table */
  tagline?: string;
  scentNotesTop?: string;
  scentNotesHeart?: string;
  scentNotesBase?: string;
}

// ─── Discounts ───
/** Raw discount columns carried on the master products row */
export interface ProductDiscountFields {
  discount_price?: number | null;
  discount_expires_at?: string | null;
}

/** Resolved discount state for a product, computed at read time */
export interface ActiveDiscount {
  discountPrice: number;
  expiresAt: string;
}

/**
 * Resolve the raw product discount columns into an active discount.
 * A discount is active only when a positive price below the normal price is
 * set AND the expiry is still in the future. Expired discounts resolve to
 * null, which is how prices automatically revert without a cron job.
 */
export function resolveActiveDiscount(
  product: { price?: number | null } & ProductDiscountFields,
  now: number = Date.now()
): ActiveDiscount | null {
  const normalPrice = Number(product.price ?? 0);
  const discountPrice = Number(product.discount_price ?? 0);
  if (!Number.isFinite(discountPrice) || discountPrice <= 0) return null;
  if (discountPrice >= normalPrice) return null;
  const expiresAt = product.discount_expires_at;
  if (!expiresAt) return null;
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs) || expiryMs <= now) return null;
  return { discountPrice, expiresAt };
}

// ─── Catalog ───
export interface ProductInput {
  name: string;
  description?: string;
  category: string;
  base_image_url?: string;
  price?: number;
}

// ─── Orders ───
export interface OrderInput {
  customer_name?: string;
  customer_phone: string;
  customer_email?: string;
  outlet: Outlet;
  total_amount: number;
  whatsapp_link: string;
  notes?: string;
  checkout_id?: string;
  receipt_requested?: boolean;
  receipt_name?: string;
}

export interface OrderItemInput {
  product_id: string;
  product_name: string;
  grade: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  outlet: string;
}

export interface PlaceOrderInput {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  /** Client-generated key used to make retries safe when a request times out. */
  checkoutId?: string;
  items: PlaceOrderItemInput[];
  receiptRequested?: boolean;
  receiptName?: string;
  /**
   * Gift code a scanning customer is redeeming ("ALF-XXXXXXXX"). Validated
   * server-side in placeOrder, which applies the GIFT_CREDIT_NAIRA credit to
   * the single eligible FA 50ml line — the browser never sends a price.
   */
  giftCode?: string;
  /**
   * Ambassador code from an /store?ambassador=CODE QR link. Validated
   * server-side in placeOrder, which charges the ambassador price for every
   * eligible item from the global ambassador set — the browser never sends a
   * price. Mutually exclusive with giftCode.
   */
  ambassadorCode?: string;
}

export interface PlaceOrderItemInput {
  productId: string;
  productName: string;
  grade: 'pending' | Grade;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  outlet: Outlet;
}

// ─── Audit ───
export interface ProductSearchResult {
  id: string;
  name: string;
  category: string;
  base_image_url: string | null;
}

export interface StockAdjustmentEntry {
  id: string;
  grade: Grade;
  old_quantity: number;
  new_quantity: number;
  reason: string;
  admin_id: string;
  admin_email: string | null;
  created_at: string;
  outlet: Outlet;
}

export interface OrderSaleEntry {
  order_id: string;
  product_name: string;
  grade: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  outlet: string;
  customer_name: string | null;
  customer_phone: string;
  order_status: string;
  order_created_at: string;
}

export interface ProductAuditData {
  product: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    base_image_url: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  inventory: {
    unilorin: { special: number; extra: number; normal: number };
    tanke: { special: number; extra: number; normal: number };
  };
  stockAdjustments: StockAdjustmentEntry[];
  orderSales: OrderSaleEntry[];
  auditLogs: any[];
}

// ─── Showcase ───
export interface ShowcaseItem {
  id: string;
  product_id: string;
  product_name: string;
  copy: string;
  scent_notes_top: string | null;
  scent_notes_heart: string | null;
  scent_notes_base: string | null;
  tagline: string | null;
  showcase_image_url: string | null;
  is_showcase: boolean;
  updated_at: string;
}

export interface ShowcaseCopyUpdate {
  copy?: string;
  tagline?: string;
  scent_notes_top?: string;
  scent_notes_heart?: string;
  scent_notes_base?: string;
}

// ─── Delivery ───
export type DeliveryRequestStatus = 'pending' | 'approved' | 'dispatched' | 'delivered' | 'rejected';
export type DeliveryPairStatus = 'pending' | 'approved' | 'completed';

export interface DeliveryRequestInput {
  orderId?: string;
  phoneNumber: string;
  address: string;
  area: string;
  preferredTime?: string;
  notes?: string;
}

export interface DeliveryRequest {
  id: string;
  order_id: string | null;
  phone_number: string;
  address: string;
  area: string;
  preferred_time: string | null;
  status: DeliveryRequestStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined from orders table (null for standalone requests)
  order?: {
    id: string;
    customer_name: string | null;
    customer_phone: string;
    status: string;
    outlet: string;
    total_amount: number;
  } | null;
  order_items?: OrderItemInput[];
}

export interface DeliveryPair {
  id: string;
  order_id_1: string;
  order_id_2: string;
  location: string;
  status: DeliveryPairStatus;
  delivery_request_id_1: string | null;
  delivery_request_id_2: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  request_1?: DeliveryRequest;
  request_2?: DeliveryRequest;
}
