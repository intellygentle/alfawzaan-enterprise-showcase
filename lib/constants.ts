// lib/constants.ts — Canonical shared constants

/**
 * All valid product categories. Single source of truth.
 */
export const CATEGORIES = [
  '100MLs',
  '50MLs',
  '30MLs',
  'Miniatures',
  'Naseem Oils',
  'Oils',
  'Body Sprays',
  'Body Mists',
  'Roll-ons',
  'Gift Sets',
  'Home Fragrance',
  'Bakhoor & Incense',
  'Traditional Wear',
  'Islamic Materials',
  'Self Care',
  'Accessories',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Categories prefixed with "All" for UI tab filters.
 */
export const STORE_CATEGORIES = ['All', ...CATEGORIES] as const;

/**
 * Grade priority for display ordering. Higher number = higher priority.
 */
export const GRADE_PRIORITY: Record<string, number> = {
  special: 3,
  extra: 2,
  normal: 1,
};

/**
 * Default admin phone numbers for WhatsApp link generation.
 * Overridden by environment variables when available.
 */
export const ADMIN_PHONES: Record<string, string> = {
  unilorin: process.env.ADMIN_PHONE_UNILORIN || '+2348012345678',
  tanke: process.env.ADMIN_PHONE_TANKE || '+2348023456789',
};

/**
 * Per-store bank account details shown at checkout so customers can pay the
 * exact store they're buying from before sending their order via WhatsApp.
 * Overridden by environment variables when available.
 */
export const STORE_ACCOUNTS: Record<
  string,
  { bank: string; accountName: string; accountNumber: string }
> = {
  unilorin: {
    bank: 'Moniepoint',
    // NOTE: these are shown to customers at checkout, so NEXT_PUBLIC_ is intentional —
    // non-prefixed env vars are not available in client components.
    accountName: process.env.NEXT_PUBLIC_ACCOUNT_NAME_UNILORIN || "Alfawzaan's Enterprise - Alfawzaan's Enterprise",
    accountNumber: process.env.NEXT_PUBLIC_ACCOUNT_NUMBER_UNILORIN || '5021455504',
  },
  tanke: {
    bank: 'Moniepoint',
    accountName: process.env.NEXT_PUBLIC_ACCOUNT_NAME_TANKE || 'Alfawzaan-s Enterprise AbdurRahman Olalekan Ahmed',
    accountNumber: process.env.NEXT_PUBLIC_ACCOUNT_NUMBER_TANKE || '5665723887',
  },
};

/**
 * Public WhatsApp channel. Reward drops are announced here occasionally, so the
 * gift claim card points at it once a code has already been redeemed — the
 * customer's window is gone, but the next drop is not.
 */
export const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCMGDw9Bb5tofFhGg00';

/**
 * Placeholder image path for products without images.
 */
export const PLACEHOLDER_IMAGE = '/6539650.jpg';
