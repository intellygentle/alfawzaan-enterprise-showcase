// components/Sensory/HeroVideo.tsx
// Bandwidth-aware hero video. The source clip is ~6 MB, so it is only fetched
// when the visitor can afford it and is likely to see it:
//   • never on prefers-reduced-motion, Save-Data, or 2g/3g connections,
//   • only once the hero scrolls near the viewport (preload="none"),
//   • a 21 KB WebP poster stands in until the first frame is decodable, and
//     stays if the clip is skipped or fails.
// This keeps the landing page off the video entirely for most mobile and
// metered visitors, moving that egress to zero bytes.
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const POSTER_SRC = "/hero-poster.webp";
// AV1/WebM is ~0.66 MB and served first to browsers that can decode it; the
// fast-start H.264 MP4 (~1.0 MB) is the universal fallback. The explicit AV1
// codec string makes Safari (which reports generic WebM support but not AV1)
// skip straight to the MP4 instead of selecting a clip it cannot play.
const VIDEO_SRC_AV1 = "/hero-background.av1.webm";
const VIDEO_SRC_MP4 = "/hero-background.mp4";

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

function canAffordVideo(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return false;
  // effectiveType is one of 'slow-2g' | '2g' | '3g' | '4g'.
  if (connection?.effectiveType && connection.effectiveType !== "4g") return false;
  return true;
}

export default function HeroVideo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!canAffordVideo()) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEnabled(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;
    video.load();
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
  }, [enabled]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden bg-[#1b1b1b]", className)}>
      <img
        src={POSTER_SRC}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
          playing ? "opacity-0" : "opacity-100",
        )}
      />
      {enabled && (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster={POSTER_SRC}
          onPlaying={() => setPlaying(true)}
          className="relative h-full w-full object-cover"
        >
          <source src={VIDEO_SRC_AV1} type='video/webm; codecs="av01.0.05M.08"' />
          <source src={VIDEO_SRC_MP4} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
