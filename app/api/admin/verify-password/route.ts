import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { checkRateLimit, clientIpFromHeaders, isRateLimited, recordAttempt } from '@/lib/rate-limit';
import { generateCsrfToken } from '@/lib/csrf';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SESSION_COOKIE = 'admin_session';
const ATTEMPT_COOKIE = 'rl_admin';
const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Constant-time password comparison.
 *
 * Hashing both sides with the same key gives equal-length digests, so
 * timingSafeEqual can never throw and the comparison leaks neither the length
 * of the configured password nor how many leading characters a guess got right.
 */
function passwordMatches(candidate: string, expected: string): boolean {
  const key = SESSION_SECRET || 'alfawzaan-password-compare';
  const candidateDigest = createHmac('sha256', key).update(candidate).digest();
  const expectedDigest = createHmac('sha256', key).update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function POST(request: Request) {
  try {
    // ─── Primary gate: in-process counter, keyed by client IP ───
    // The cookie limiter below is only advisory: a script that never sends the
    // cookie back starts from zero on every attempt, so it cannot be the only
    // brute-force defence on a single shared admin password. This gate lives in
    // the server process and costs no database reads.
    const ip = clientIpFromHeaders(request.headers);
    const ipGateKey = `login:admin:${ip}`;
    const ipGate = isRateLimited(ipGateKey, MAX_ATTEMPTS_PER_WINDOW);
    if (ipGate.limited) {
      return NextResponse.json(
        { valid: false, error: `Too many attempts. Try again in about ${ipGate.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    // ─── Secondary gate: cookie counter (defence in depth) ───
    const { limited, setCookie } = checkRateLimit(request, 'admin');

    if (limited) {
      const response = NextResponse.json(
        { valid: false, error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }

    const body = await request.json();
    const { password } = body;

    if (!ADMIN_PASSWORD || !SESSION_SECRET) {
      return NextResponse.json(
        { valid: false, error: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    if (typeof password !== 'string' || !passwordMatches(password, ADMIN_PASSWORD)) {
      // Only failures consume the budget.
      recordAttempt(ipGateKey, WINDOW_MS);
      const response = NextResponse.json(
        { valid: false, error: 'Invalid password' },
        { status: 401 }
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }

    // Create signed session token
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', SESSION_SECRET)
      .update(timestamp)
      .digest('hex');

    const token = `${timestamp}.${signature}`;
    const csrfToken = await generateCsrfToken();

    const response = NextResponse.json({ valid: true, csrfToken });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    // A successful login must not consume the attempt budget, otherwise the
    // cookie limiter locks out the legitimate admin after five normal logins.
    response.cookies.set(ATTEMPT_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
