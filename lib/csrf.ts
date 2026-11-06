import { createHmac, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

const CSRF_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

export async function generateCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const signature = createHmac('sha256', CSRF_SECRET)
    .update(token)
    .digest('hex')
    .slice(0, 32);

  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE, `${token}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  });

  return token;
}

export async function validateCsrfToken(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) return false;

  const cookieStore = await cookies();
  const cookie = cookieStore.get(CSRF_COOKIE);
  if (!cookie?.value) return false;

  const [storedToken, storedSig] = cookie.value.split('.');
  if (!storedToken || !storedSig) return false;

  // Verify the token matches
  if (headerToken !== storedToken) return false;

  // Verify the signature
  const expectedSig = createHmac('sha256', CSRF_SECRET)
    .update(storedToken)
    .digest('hex')
    .slice(0, 32);

  return storedSig === expectedSig;
}
