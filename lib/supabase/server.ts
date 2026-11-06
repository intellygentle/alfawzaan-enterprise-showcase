// lib/supabase/server.ts
// Server-only utility. NEVER import this into a Client Component.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const CLEAN = (v: string | undefined): string | undefined =>
  v?.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');

const getEnv = (key: string, description: string): string => {
  const raw = process.env[key];
  const value = CLEAN(raw);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Description: ${description}\n` +
      `Please add it to your .env.local file and restart the dev server.`
    );
  }
  return value;
};

const serverClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
};

// Use a sentinel pattern instead of `| null` to avoid TS strict-null issues
const UNINITIALIZED = Symbol('uninitialized');
type ClientRef = SupabaseClient | typeof UNINITIALIZED;

let _masterServer: ClientRef = UNINITIALIZED;
let _unilorinServer: ClientRef = UNINITIALIZED;
let _tankeServer: ClientRef = UNINITIALIZED;
let _archiveServer: ClientRef = UNINITIALIZED;

function assertClient(ref: ClientRef): SupabaseClient {
  if (ref === UNINITIALIZED) {
    throw new Error('Supabase client accessed before initialization');
  }
  return ref;
}

export const getMasterServer = (): SupabaseClient => {
  if (_masterServer === UNINITIALIZED) {
    const url = getEnv('SUPABASE_URL_MASTER', 'Master DB URL');
    const key = getEnv('SUPABASE_SERVICE_KEY_MASTER', 'Master DB Service Role Key');

    _masterServer = createClient(url, key, serverClientOptions);
  }
  return assertClient(_masterServer);
};

export const getUnilorinServer = (): SupabaseClient => {
  if (_unilorinServer === UNINITIALIZED) {
    const url = getEnv('SUPABASE_URL_UNILORIN', 'Unilorin Branch DB URL');
    const key = getEnv('SUPABASE_SERVICE_KEY_UNILORIN', 'Unilorin DB Service Role Key');
    _unilorinServer = createClient(url, key, serverClientOptions);
  }
  return assertClient(_unilorinServer);
};

export const getTankeServer = (): SupabaseClient => {
  if (_tankeServer === UNINITIALIZED) {
    const url = getEnv('SUPABASE_URL_TANKE', 'Tanke Branch DB URL');
    const key = getEnv('SUPABASE_SERVICE_KEY_TANKE', 'Tanke DB Service Role Key');
    _tankeServer = createClient(url, key, serverClientOptions);
  }
  return assertClient(_tankeServer);
};

export const getArchiveServer = (): SupabaseClient => {
  if (_archiveServer === UNINITIALIZED) {
    const url = getEnv('SUPABASE_URL_ARCHIVE', 'Ledger/Archive DB URL');
    const key = getEnv('SUPABASE_SERVICE_KEY_ARCHIVE', 'Archive DB Service Role Key');
    _archiveServer = createClient(url, key, serverClientOptions);
  }
  return assertClient(_archiveServer);
};

export const getOutletDB = (outlet: 'unilorin' | 'tanke') =>
  outlet === 'unilorin' ? getUnilorinServer() : getTankeServer();

