import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks dev-only assets for non-localhost origins by default.
  // Keep the LAN address usable for testing on phones and other devices.
  allowedDevOrigins: ["192.168.71.224"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    // Serve modern formats (AVIF first, then WebP). Vercel's optimizer
    // negotiates via the browser's Accept header and falls back to the
    // original file for old clients, so this only ever shrinks bytes.
    formats: ["image/avif", "image/webp"],
    // Product images live at immutable, timestamped Supabase Storage URLs (see
    // lib/admin/upload.ts — every upload gets a fresh path, upsert: false). The
    // optimizer's default 60s TTL re-fetched each original from Supabase
    // constantly, re-counting Cached Egress on every expiry. Caching optimized
    // variants for a year means Supabase is read once per image, not per expiry.
    minimumCacheTTL: 31536000,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      // Supabase Storage product images (all four projects) — needed so
      // next/image can optimize them through Vercel's CDN, keeping image
      // bytes off the Supabase Cached Egress meter.
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [{
      // Public assets are content-fixed and change only on redeploy, so let the
      // browser and CDN keep them locally for a year — repeat visits then cost
      // the origin zero bytes. This covers /public imagery, the logo, the hero
      // video, and font files; Next already does the same for /_next/static.
      source: "/:all*(svg|jpg|jpeg|png|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|mp4|webm)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    }, {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        // Force HTTPS on every future visit, including the cookie that carries
        // the staff session. Ignored over plain HTTP, honoured once Vercel
        // serves the site over TLS.
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' https: wss:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
            "upgrade-insecure-requests",
          ].join("; "),
        },
      ],
    }];
  },
};

export default nextConfig;
