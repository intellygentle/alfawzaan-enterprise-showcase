import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SESSION_COOKIE = 'admin_session';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE);

  if (!cookie?.value || !SESSION_SECRET) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const [timestamp, signature] = cookie.value.split('.');
    if (!timestamp || !signature) {
      return NextResponse.json({ authenticated: false });
    }

    // Check expiry (24 hours)
    const createdAt = Number(timestamp);
    const age = Date.now() - createdAt;
    if (!Number.isSafeInteger(createdAt) || age < 0 || age > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ authenticated: false });
    }

    // Verify signature
    const expectedSig = createHmac('sha256', SESSION_SECRET)
      .update(timestamp)
      .digest('hex');

    if (signature !== expectedSig) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
