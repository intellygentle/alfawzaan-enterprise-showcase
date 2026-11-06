"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";

interface ShowcaseItem {
  id: string;
  product_name: string;
  copy: string;
  scent_notes_top: string | null;
  scent_notes_heart: string | null;
  scent_notes_base: string | null;
  tagline: string | null;
  showcase_image_url: string | null;
}

export default function ProductShowcaseCarousel() {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShowcase() {
      try {
        const res = await fetch("/api/showcase");
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchShowcase();
  }, []);

  // Don't render if no items
  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="w-6 h-6 border-2 border-[#D4AF37]/30 border-t-[#D4AF37] rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (items.length === 0) return null;

  const current = items[currentIndex];
  const editLabels = ["Curated feature", "Everyday favourite", "Gift-worthy choice", "Evening edit"];
  const currentLabel = editLabels[currentIndex % editLabels.length];
  const scentNotes = [
    current.scent_notes_top && { label: "Top", value: current.scent_notes_top },
    current.scent_notes_heart && { label: "Heart", value: current.scent_notes_heart },
    current.scent_notes_base && { label: "Base", value: current.scent_notes_base },
  ].filter(Boolean) as { label: string; value: string }[];

  const handleNext = () => setCurrentIndex((i) => (i + 1) % items.length);
  const handlePrev = () => setCurrentIndex((i) => (i - 1 + items.length) % items.length);

  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      {/* Desktop layout */}
      <div className="hidden md:flex relative items-center">
        {/* Product image */}
        <div className="w-[420px] h-[420px] rounded-3xl overflow-hidden bg-[#1A1A1A] flex-shrink-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="w-full h-full"
            >
              {current.showcase_image_url ? (
                <OptimizedImage
                  src={current.showcase_image_url}
                  alt={current.product_name}
                  sizes="420px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sparkles className="text-[#D4AF37]/30" size={48} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Copy card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl shadow-black/5 p-8 ml-[-70px] z-10 max-w-xl flex-1 border border-[#D4AF37]/10">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
               {/* Tagline */}
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#8B7355]">
                {currentLabel}
              </p>
              {current.tagline && (
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#D4AF37] mb-4">
                  {current.tagline}
                </p>
              )}

              {/* Sensory copy */}
              <p className="text-[#121212]/70 text-base leading-[1.8] mb-6 font-serif">
                &ldquo;{current.copy}&rdquo;
              </p>

              {/* Product name */}
              <h3 className="text-lg font-serif font-semibold text-[#121212] mb-3">
                {current.product_name}
              </h3>

              {/* Scent notes */}
              {scentNotes.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {scentNotes.map(({ label, value }) => (
                    <div key={label} className="text-[10px] font-medium uppercase tracking-widest">
                      <span className="text-[#D4AF37]/60">{label}</span>{" "}
                      <span className="text-[#121212]/40">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href={`/store?search=${encodeURIComponent(current.product_name)}`} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#121212] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition hover:bg-[#D4AF37] hover:text-black">
                Explore this scent <ArrowRight size={13} />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden max-w-sm mx-auto text-center">
        {/* Product image */}
        <div className="w-full aspect-square bg-[#1A1A1A] rounded-3xl overflow-hidden mb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="w-full h-full"
            >
              {current.showcase_image_url ? (
                <OptimizedImage
                  src={current.showcase_image_url}
                  alt={current.product_name}
                  sizes="(max-width: 640px) 90vw, 420px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sparkles className="text-[#D4AF37]/30" size={48} />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Copy content */}
        <div className="px-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
               {current.tagline && (
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#D4AF37] mb-3">
                  {current.tagline}
                </p>
              )}

              <p className="text-[#121212]/60 text-sm leading-[1.8] mb-5 font-serif">
                &ldquo;{current.copy}&rdquo;
              </p>

              <h3 className="text-lg font-serif font-semibold text-[#121212] mb-3">
                {current.product_name}
              </h3>

              {scentNotes.length > 0 && (
                <div className="flex flex-wrap justify-center gap-3">
                  {scentNotes.map(({ label, value }) => (
                    <div key={label} className="text-[10px] font-medium uppercase tracking-widest">
                      <span className="text-[#D4AF37]/60">{label}</span>{" "}
                      <span className="text-[#121212]/40">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link href={`/store?search=${encodeURIComponent(current.product_name)}`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#121212] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition hover:bg-[#D4AF37] hover:text-black">
                Explore this scent <ArrowRight size={13} />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      {items.length > 1 && (
        <div className="flex justify-center items-center gap-6 mt-10">
          <button
            onClick={handlePrev}
            aria-label="Previous product"
            className="w-10 h-10 rounded-full bg-white/80 border border-[#D4AF37]/10 flex items-center justify-center text-[#121212]/40 hover:text-[#121212] hover:border-[#D4AF37]/30 transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "transition-all duration-500 rounded-full cursor-pointer",
                  i === currentIndex
                    ? "w-6 h-1.5 bg-[#D4AF37]/50"
                    : "w-1.5 h-1.5 bg-[#121212]/15"
                )}
                aria-label={`Go to product ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            aria-label="Next product"
            className="w-10 h-10 rounded-full bg-white/80 border border-[#D4AF37]/10 flex items-center justify-center text-[#121212]/40 hover:text-[#121212] hover:border-[#D4AF37]/30 transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
