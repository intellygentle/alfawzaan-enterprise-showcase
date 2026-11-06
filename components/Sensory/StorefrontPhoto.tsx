// components/Sensory/StorefrontPhoto.tsx
"use client";

import { useEffect, useState, useId } from "react";

interface StorefrontPhotoProps {
  src: string;
  alt: string;
  className?: string;
}

/* ─── Stylized gold-line storefront illustration (placeholder until a real photo exists) ─── */
function StorefrontIllustration({ gradientId }: { gradientId: string }) {
  return (
    <svg
      viewBox="0 0 220 150"
      className="w-32 h-auto"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5E6AD" />
          <stop offset="100%" stopColor="#D4AF37" />
        </linearGradient>
      </defs>
      {/* Facade */}
      <rect x="20" y="14" width="180" height="122" rx="4" fill="none" stroke="rgba(212,175,55,0.45)" strokeWidth="1.5" />
      {/* Sign plaque */}
      <rect x="55" y="24" width="110" height="20" rx="3" fill="rgba(212,175,55,0.08)" stroke="rgba(212,175,55,0.6)" strokeWidth="1" />
      <text x="110" y="38" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" letterSpacing="3" fill={`url(#${gradientId})`}>
        ALFAWZAAN
      </text>
      {/* Awning */}
      <path d="M20 54 h180 v10 h-180 z" fill="rgba(212,175,55,0.12)" stroke="rgba(212,175,55,0.5)" strokeWidth="1" />
      <path
        d="M20 64 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0 q9 9 18 0"
        fill="none"
        stroke="rgba(212,175,55,0.5)"
        strokeWidth="1"
      />
      <path d="M60 54 v10 M100 54 v10 M140 54 v10 M180 54 v10" stroke="rgba(212,175,55,0.3)" strokeWidth="1" />
      {/* Display window */}
      <rect x="34" y="82" width="66" height="40" rx="3" fill="none" stroke="rgba(212,175,55,0.45)" strokeWidth="1.2" />
      <line x1="67" y1="82" x2="67" y2="122" stroke="rgba(212,175,55,0.25)" strokeWidth="1" />
      {/* Perfume bottles in window */}
      <rect x="42" y="98" width="8" height="14" rx="2" fill="rgba(212,175,55,0.35)" />
      <rect x="80" y="100" width="6" height="12" rx="2" fill="rgba(212,175,55,0.25)" />
      {/* Door */}
      <rect x="118" y="82" width="58" height="54" rx="3" fill="none" stroke="rgba(212,175,55,0.45)" strokeWidth="1.2" />
      <circle cx="130" cy="110" r="2" fill="rgba(212,175,55,0.7)" />
      <path d="M118 96 h58" stroke="rgba(212,175,55,0.25)" strokeWidth="1" />
      {/* Base line */}
      <line x1="20" y1="136" x2="200" y2="136" stroke="rgba(212,175,55,0.35)" strokeWidth="1" />
    </svg>
  );
}

export default function StorefrontPhoto({ src, alt, className = "" }: StorefrontPhotoProps) {
  const [ready, setReady] = useState(false);
  const gradientId = useId();

  // Probe for the real storefront photo; keep the stylized placeholder until it exists.
  // Same pattern as the CEO portrait probe — drop a photo at `src` and it auto-appears.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setReady(true);
    img.src = src;
    return () => {
      img.onload = null;
    };
  }, [src]);

  return (
    <div
      className={`relative w-full aspect-[16/9] max-h-[360px] overflow-hidden rounded-2xl border border-[#D4AF37]/15 bg-[#141210] ${className}`}
    >
      {ready ? (
        <>
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#1A1A1A] via-[#141414] to-[#0E0E0E]">
          <StorefrontIllustration gradientId={gradientId} />
          <span className="text-[9px] font-medium uppercase tracking-[0.25em] text-[#D4AF37]/50">
            Storefront photo coming soon
          </span>
        </div>
      )}
    </div>
  );
}
