// components/StoreFront/OptimizedImage.tsx
// Product photography via Vercel's image optimizer. The optimizer fetches each
// Supabase Storage image once and then serves resized, cached variants from
// Vercel's CDN — moving image bytes off the Master project's Supabase
// "Cached Egress" meter (Free plan: 5 GB/month), where every visitor's direct
// <img> download previously counted.
//
// Never-broken guarantee: rendering falls back in stages.
//   Stage 0: next/image (optimized, CDN-cached)
//   Stage 1: plain <img> with the original URL (optimizer failed, source fine)
//   Stage 2: plain <img> with fallbackSrc (source itself is broken)
// blob:/data: URLs (client-side previews) skip straight to a plain <img>.
"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface OptimizedImageProps {
  src: string;
  alt: string;
  /** Sizing for the positioned wrapper that next/image fills. */
  containerClassName?: string;
  /** Classes for the underlying img element (object-cover etc.). */
  className?: string;
  /** Responsive sizes hint for the optimizer, e.g. "(max-width: 640px) 50vw, 25vw". */
  sizes?: string;
  /** Final fallback (stage 2) — should be a bundled local asset. */
  fallbackSrc?: string;
  priority?: boolean;
}

export default function OptimizedImage({
  src,
  alt,
  containerClassName = "h-full w-full",
  className = "object-cover",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  fallbackSrc,
  priority = false,
}: OptimizedImageProps) {
  // 0 = optimizer, 1 = plain original, 2 = plain fallback
  const [stage, setStage] = useState(0);
  const skipOptimizer = src.startsWith("blob:") || src.startsWith("data:");
  const effectiveStage = skipOptimizer ? Math.max(stage, 1) : stage;

  if (effectiveStage === 0) {
    return (
      <span className={cn("relative block", containerClassName)}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={className}
          onError={() => setStage(1)}
        />
      </span>
    );
  }

  const plainSrc = effectiveStage === 1 ? src : fallbackSrc ?? src;
  if (effectiveStage === 1 && fallbackSrc) {
    return (
      <span className={cn("relative block", containerClassName)}>
        <img
          src={plainSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={cn("h-full w-full", className)}
          onError={() => setStage(2)}
        />
      </span>
    );
  }

  return (
    <span className={cn("relative block", containerClassName)}>
      <img
        src={plainSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("h-full w-full", className)}
      />
    </span>
  );
}
