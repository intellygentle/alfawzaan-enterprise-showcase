import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '@/app/actions/getSupabaseConfig';

function createSafeClient(url: string, key: string, name: string) {
  const missing: string[] = [];
  if (!url) missing.push(`SUPABASE_URL_${name.toUpperCase()}`);
  if (!key) missing.push(`SUPABASE_ANON_KEY_${name.toUpperCase()}`);
  if (missing.length) {
    throw new Error(`Missing env var${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  return createClient(url, key);
}

let _master: SupabaseClient | null = null;
let _unilorin: SupabaseClient | null = null;
let _tanke: SupabaseClient | null = null;
let _archive: SupabaseClient | null = null;
let _ready = false;
let _initPromise: Promise<void> | null = null;

const MAX_ATTEMPTS = 2;
const BASE_DELAY_MS = 1000;

/**
 * Per-attempt budget for the getSupabaseConfig round-trip.
 *
 * The action itself only reads process.env, but the fetch that invokes it can
 * stall indefinitely on a cold start or a flaky mobile connection — and a
 * stalled fetch never rejects, so without this the retry below never engages
 * and SupabaseProvider sits on its spinner with no way out.
 *
 * Deliberately generous: this request hands back a few strings, so anything
 * past 15s is a real fault rather than a slow connection. Showing a shopper on
 * patchy mobile data a "check your internet" screen while their connection was
 * merely slow is worse than making them wait. Bounded is the win here, not
 * fast.
 *
 * Worst case to the error screen: 15s + 1s backoff + 15s = 31s.
 */
const CONFIG_TIMEOUT_MS = 15_000;

/**
 * Reject after `ms` if `promise` hasn't settled. This abandons the response
 * but cannot cancel the request — server actions don't accept an AbortSignal.
 * Acceptable for a one-shot config fetch.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Retry wrapper with exponential backoff.
 * Transient network hiccups are common on cold starts / deploys — this
 * avoids surfacing a scary error screen for something that resolves on
 * the next request.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[supabase] ${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms…`,
          err,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

export async function initSupabaseClients() {
  if (_ready) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const { urls, anonKeys } = await withRetry(
        () =>
          withTimeout(
            getSupabaseConfig(),
            CONFIG_TIMEOUT_MS,
            'Connection timed out. Please check your internet connection and try again.',
          ),
        'getSupabaseConfig',
      );

      // Construct all four before committing any of them to module scope.
      // A partial assignment would let a later init() call short-circuit on a
      // half-populated set and mount the app with null clients, turning one
      // clear error screen into scattered "not initialized yet" crashes.
      const master = createSafeClient(urls.master, anonKeys.master, 'Master');
      const unilorin = createSafeClient(urls.unilorin, anonKeys.unilorin, 'Unilorin');
      const tanke = createSafeClient(urls.tanke, anonKeys.tanke, 'Tanke');
      const archive = createSafeClient(urls.archive, anonKeys.archive, 'Archive');

      _master = master;
      _unilorin = unilorin;
      _tanke = tanke;
      _archive = archive;
      _ready = true;
    } catch (err) {
      _initPromise = null;
      throw err;
    }
  })();
  return _initPromise;
}

function lazyProxy(getClient: () => SupabaseClient | null, name: string): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      const client = getClient();
      if (!client) throw new Error(`Supabase "${name}" not initialized yet.`);
      const value = (client as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === 'function') return value.bind(client);
      return value;
    },
  });
}

export const masterClient = lazyProxy(() => _master, 'Master');
export const unilorinClient = lazyProxy(() => _unilorin, 'Unilorin');
export const tankeClient = lazyProxy(() => _tanke, 'Tanke');
export const archiveClient = lazyProxy(() => _archive, 'Archive');

export const getOutletClient = (outlet: 'unilorin' | 'tanke') =>
  outlet === 'unilorin' ? unilorinClient : tankeClient;
