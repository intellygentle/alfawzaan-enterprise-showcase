// lib/errors.ts — Standardized error handling utilities

/**
 * Wraps a Supabase error with additional context.
 * Throws an Error with the context prefix and original message.
 */
export function handleSupabaseError(
  error: { message: string; code?: string; details?: string },
  context: string
): never {
  throw new Error(
    `${context}: ${error.message}` +
    (error.details ? ` (${error.details})` : '')
  );
}

/**
 * Standard result type for operations that can fail without throwing.
 */
export type OperationResult<T = void> =
  | { success: true; data?: T; message?: string }
  | { success: false; error: unknown; message: string };
