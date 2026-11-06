"use server";

/**
 * Returns Supabase connection config for all four pools.
 *
 * These env vars are deliberately not NEXT_PUBLIC_-prefixed, so the browser
 * reads them through this action instead of having them inlined at build time.
 *
 * The body is synchronous env reads — it cannot be slow. What *can* stall is
 * the client→server round-trip that invokes it, so the timeout lives at the
 * call site: see withTimeout/withRetry in lib/supabase/client.ts.
 */
export async function getSupabaseConfig(): Promise<{
  urls: Record<string, string>;
  anonKeys: Record<string, string>;
}> {
  return {
    urls: {
      master: process.env.SUPABASE_URL_MASTER || '',
      unilorin: process.env.SUPABASE_URL_UNILORIN || '',
      tanke: process.env.SUPABASE_URL_TANKE || '',
      archive: process.env.SUPABASE_URL_ARCHIVE || '',
    },
    anonKeys: {
      master: process.env.SUPABASE_ANON_KEY_MASTER || '',
      unilorin: process.env.SUPABASE_ANON_KEY_UNILORIN || '',
      tanke: process.env.SUPABASE_ANON_KEY_TANKE || '',
      archive: process.env.SUPABASE_ANON_KEY_ARCHIVE || '',
    },
  };
}
