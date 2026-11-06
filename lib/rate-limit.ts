// Cookie-based rate limiter for Vercel serverless
// Stores attempt count in a signed cookie so it persists across cold starts
import { createHmac } from 'crypto';

const SECRET = process.env.ADMIN_SESSION_SECRET || '';
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const COOKIE_PREFIX = 'rl_';

interface AttemptData {
  count: number;
  expires: number;
}

function sign(data: string): string {
  return createHmac('sha256', SECRET).update(data).digest('hex').slice(0, 16);
}

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function parseAttemptData(value: string): AttemptData | null {
  try {
    const [payload, signature] = value.split('.');
    if (!payload || !signature) return null;

    if (sign(payload) !== signature) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64').toString()) as AttemptData;
    if (Date.now() > data.expires) return null;
    return data;
  } catch {
    return null;
  }
}

function serializeAttemptData(data: AttemptData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64');
  return `${payload}.${sign(payload)}`;
}

function buildSetCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function checkRateLimit(request: Request, key: string): { limited: boolean; remaining: number; setCookie: string | null } {
  const cookieName = `${COOKIE_PREFIX}${key}`;
  const cookieHeader = request.headers.get('cookie') || '';

  let data: AttemptData = { count: 0, expires: Date.now() + WINDOW_MS };

  const existing = parseCookieValue(cookieHeader, cookieName);
  if (existing) {
    const parsed = parseAttemptData(existing);
    if (parsed) {
      data = parsed;
    }
  }

  data.count++;

  const limited = data.count > MAX_ATTEMPTS;
  const remaining = Math.max(0, MAX_ATTEMPTS - data.count);
  const serialized = serializeAttemptData(data);
  const setCookie = buildSetCookie(cookieName, serialized, Math.ceil(WINDOW_MS / 1000));

  return { limited, remaining, setCookie };
}

export function clearRateLimitCookie(request: Request, key: string): string | null {
  const cookieName = `${COOKIE_PREFIX}${key}`;
  const cookieHeader = request.headers.get('cookie') || '';
  if (!parseCookieValue(cookieHeader, cookieName)) return null;
  return buildSetCookie(cookieName, '', 0);
}

// ─── In-memory fixed-window limiter ───
//
// The cookie limiter above cannot protect a public endpoint: a script simply
// drops the cookie and every attempt starts at zero, so it only slows a
// browser-based attacker. This counter lives in the server process instead,
// keyed by client IP + scope. It costs nothing — no Supabase reads, no extra
// egress — and it protects the quota-limited public paths (checkout, delivery
// requests, order lookup) from being hammered.
//
// On serverless each instance keeps its own window, so the effective limit
// scales with instance count. That is a deliberate trade: perfect global
// limiting needs shared storage, and the point here is to stop scripted abuse
// and egress burn without spending the quota it is protecting.

interface RateWindow {
  count: number;
  resetAt: number;
}

const windows = new Map<string, RateWindow>();
/** Upper bound on tracked keys so hostile traffic cannot grow memory forever. */
const MAX_TRACKED_KEYS = 5_000;

function pruneWindows(now: number): void {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows (real traffic spike): reset rather than grow.
  if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    pruneWindows(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  return {
    limited: existing.count > limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Peek at a window WITHOUT consuming an attempt.
 *
 * Login uses this so a successful sign-in never eats the brute-force budget:
 * the gate is checked first, and only a failed credential attempt is recorded
 * with recordAttempt(). Counting successes would lock the owner out after five
 * normal logins in a quarter of an hour.
 */
export function isRateLimited(
  key: string,
  limit: number,
): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) return { limited: false, retryAfterSeconds: 0 };
  return {
    limited: existing.count >= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Record one counted event (a failed login) in the current window. */
export function recordAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    pruneWindows(now);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
}

/** Client IP for throttling. Vercel populates x-forwarded-for on every request. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
