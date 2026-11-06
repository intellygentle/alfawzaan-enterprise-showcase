// lib/retry.ts — Shared retry utility for network operations

const NETWORK_ERROR_PATTERNS = [
  'fetch failed',
  'network',
  'timeout',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'abort',
  'AbortError',
  'connection',
];

function isNetworkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return NETWORK_ERROR_PATTERNS.some((pattern) =>
    msg.toLowerCase().includes(pattern.toLowerCase())
  );
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    retries?: number;
    baseDelay?: number;
    label?: string;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelay = 1500,
    label = 'operation',
    shouldRetry = isNetworkError,
  } = options;

  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;
      if (shouldRetry(err) && i < retries - 1) {
        const wait = baseDelay * (i + 1);
        console.warn(
          `[${label}] Error (attempt ${i + 1}/${retries}), retrying in ${wait}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
