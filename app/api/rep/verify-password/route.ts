import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { verifyRepCredentials } from '@/lib/representatives';
import { checkRateLimit, clientIpFromHeaders, isRateLimited, recordAttempt } from '@/lib/rate-limit';
import { generateCsrfToken } from '@/lib/csrf';

const SESSION_COOKIE = 'rep_session';
const ATTEMPT_COOKIE = 'rl_rep';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // Primary gate: in-process per-IP counter. The cookie limiter below is
    // bypassable by simply not returning the cookie, so it is now defence in
    // depth rather than the only control. 10/15min leaves room for a boutique
    // sharing one connection while still stopping scripted guessing.
    const ip = clientIpFromHeaders(request.headers);
    const ipGateKey = `login:rep:${ip}`;
    const ipGate = isRateLimited(ipGateKey, MAX_ATTEMPTS_PER_WINDOW);
    if (ipGate.limited) {
      return NextResponse.json(
        { valid: false, error: `Too many attempts. Try again in about ${ipGate.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    const { limited, setCookie } = checkRateLimit(request, 'rep');

    if (limited) {
      const response = NextResponse.json(
        { valid: false, error: 'Too many attempts. Try again later.' },
        { status: 429 }
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }

    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      const response = NextResponse.json(
        { valid: false, error: 'Username and password are required' },
        { status: 400 }
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }

    if (!SESSION_SECRET) {
      return NextResponse.json(
        { valid: false, error: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    const rep = await verifyRepCredentials(username, password);

    if (!rep) {
      // Only failures consume the budget.
      recordAttempt(ipGateKey, WINDOW_MS);
      const response = NextResponse.json(
        { valid: false, error: 'Invalid username or password' },
        { status: 401 }
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }

    // Create signed session token with rep info
    const payload = JSON.stringify({
      id: rep.id,
      name: rep.display_name,
      outlet: rep.outlet,
      permissions: rep.permissions,
    });
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', SESSION_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    const token = `${timestamp}.${Buffer.from(payload).toString('base64')}.${signature}`;
    const csrfToken = await generateCsrfToken();

    const response = NextResponse.json({
      valid: true,
      csrfToken,
      rep: {
        id: rep.id,
        name: rep.display_name,
        outlet: rep.outlet,
        permissions: rep.permissions,
      },
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    // A successful login must not consume the attempt budget.
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
