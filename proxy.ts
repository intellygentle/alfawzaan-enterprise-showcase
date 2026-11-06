import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET_PATH;
const REP_SECRET = process.env.REP_SECRET_PATH;
const ADMIN_COOKIE = 'admin_session';
const REP_COOKIE = 'rep_session';
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

async function hmacHex(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Bot user agents that offer the storefront no value and only burn quota.
 * Deliberately narrow: Googlebot, Bingbot, and other search crawlers are NOT
 * listed (their visits help SEO), and a missing/empty UA is allowed through
 * because some legitimate in-app browsers and WhatsApp's webview send none.
 * Uptime monitors are matched by name so they can be recognized and blocked
 * without blocking unknown future tools.
 */
const JUNK_BOT_PATTERN = new RegExp(
  [
    // AI/LLM scrapers
    'gptbot', 'chatgpt-user', 'claude-bot', 'claude-web', 'anthropic-ai',
    'ccbot', 'google-extended', 'perplexitybot', 'bytespider', 'diffbot',
    'omgilibot', 'omgili', 'amazonbot', 'applebot-extended', 'cohere-ai',
    // Aggressive SEO/marketing scrapers
    'ahrefsbot', 'semrushbot', 'mj12bot', 'dotbot', 'petalbot', 'backlinkcrawler',
    'mjx-crawler', 'seokicks', 'sistrix', 'findxbot', 'seznambot',
    'b2b bot', 'chrome-lighthouse', 'lighthouse',
    // HTTP clients commonly used by scripts (curl/wc/lynx wget ruby python) —
    // real browsers always identify as Mozilla/Chrome/Safari/Firefox
    'curl/', 'wget', 'python-requests', 'scrapy', 'node-fetch', 'axios/',
    'go-http-client', 'java/', 'okhttp', 'libwww',
    // Known uptime monitors
    'uptimerobot', 'pingdom', 'betteruptime', 'checkhost', 'statuscake',
    // Generic bot markers that never accompany a real browser
    'spider', 'crawl',
  ].join('|'),
  'i',
);

async function verifySession(request: NextRequest, cookieName: string, hasPayload: boolean): Promise<boolean> {
  const cookie = request.cookies.get(cookieName);
  if (!cookie?.value || !SESSION_SECRET) return false;

  try {
    const parts = cookie.value.split('.');
    if (hasPayload && parts.length !== 3) return false;
    if (!hasPayload && parts.length !== 2) return false;

    const timestamp = parts[0];
    if (!timestamp) return false;

    const createdAt = Number(timestamp);
    const age = Date.now() - createdAt;
    if (!Number.isSafeInteger(createdAt) || age < 0 || age > 24 * 60 * 60 * 1000) return false;

    const signature = parts[parts.length - 1];
    const message = hasPayload ? `${timestamp}.${parts[1]}` : timestamp;
    const expectedSig = await hmacHex(message, SESSION_SECRET);
    return signature === expectedSig;
  } catch {
    return false;
  }
}

/**
 * File extensions served straight from /public or the Next asset pipeline.
 *
 * This used to be `pathname.includes('.')`, which skipped any path containing a
 * dot — so a route like /admin/dashboard.v2 would have bypassed the admin gate
 * below entirely. Only real asset extensions are exempt now.
 */
const STATIC_ASSET_PATTERN =
  /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|mjs|mp4|otf|pdf|png|svg|ttf|txt|webmanifest|webm|webp|woff2?|xml)$/i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, images, fonts, etc.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    STATIC_ASSET_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ─── JUNK BOT BLOCK ───
  // Non-search-engine bots hit the storefront every few minutes around the
  // clock. Each hit past the ISR staleness window triggers a regeneration and
  // a fresh Supabase read, which was burning ~100 MB/day of Cached Egress —
  // 60% of the Free plan's 5 GB/month quota — while Vercel Analytics
  // (which filters bots) showed a single human visitor per day.
  // Search engine crawlers stay allowed; analytics beacons never hit pages.
  const userAgent = request.headers.get('user-agent') ?? '';
  if (userAgent && JUNK_BOT_PATTERN.test(userAgent)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // ─── ADMIN SECRET PATH ───
  if (ADMIN_SECRET && (pathname === `/${ADMIN_SECRET}` || pathname.startsWith(`/${ADMIN_SECRET}/`))) {
    const rewritePath = pathname.replace(`/${ADMIN_SECRET}`, '/admin/dashboard') || '/admin/dashboard';
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
  }

  // Block direct access to /admin/dashboard
  if (pathname === '/admin/dashboard' || pathname.startsWith('/admin/dashboard/')) {
    if (!(await verifySession(request, ADMIN_COOKIE, false))) {
      if (!ADMIN_SECRET) return NextResponse.next();
      return NextResponse.redirect(new URL(`/${ADMIN_SECRET}`, request.url));
    }
    return NextResponse.next();
  }

  // ─── REP SECRET PATH ───
  if (REP_SECRET && (pathname === `/${REP_SECRET}` || pathname.startsWith(`/${REP_SECRET}/`))) {
    const rewritePath = pathname.replace(`/${REP_SECRET}`, '/representative') || '/representative';
    const url = request.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
  }

  // Block direct access to /representative
  if (pathname === '/representative' || pathname.startsWith('/representative/')) {
    if (!(await verifySession(request, REP_COOKIE, true))) {
      if (!REP_SECRET) return NextResponse.next();
      return NextResponse.redirect(new URL(`/${REP_SECRET}`, request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|static|favicon.ico).*)'],
};
