import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHmac } from 'crypto';

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SESSION_COOKIE = 'rep_session';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE);

  if (!cookie?.value || !SESSION_SECRET) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const parts = cookie.value.split('.');
    if (parts.length !== 3) {
      return NextResponse.json({ authenticated: false });
    }

    const [timestamp, payloadBase64, signature] = parts;

    // Check expiry (24 hours)
    const createdAt = Number(timestamp);
    const age = Date.now() - createdAt;
    if (!Number.isSafeInteger(createdAt) || age < 0 || age > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ authenticated: false });
    }

    // Verify signature
    const payload = Buffer.from(payloadBase64, 'base64').toString();
    const expectedSig = createHmac('sha256', SESSION_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    if (signature !== expectedSig) {
      return NextResponse.json({ authenticated: false });
    }

    const repData = JSON.parse(payload);
    return NextResponse.json({
      authenticated: true,
      rep: repData,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
