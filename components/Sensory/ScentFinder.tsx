"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Flame,
  Heart,
  Snowflake,
  Sun,
  TreePine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import FadeIn from "./FadeIn";

interface MoodOption {
  id: string;
  label: string;
  description: string;
  notes: string;
  icon: LucideIcon;
  color: string;
  glowColor: string;
}

const MOODS: MoodOption[] = [
  {
    id: "fresh",
    label: "Fresh & Clean",
    description: "Like morning dew and ocean air",
    notes: "Citrus · Aquatic · Green Tea",
    icon: Snowflake,
    color: "#38bdf8",
    glowColor: "rgba(56,189,248,0.15)",
  },
  {
    id: "warm",
    label: "Warm & Cozy",
    description: "Like cashmere by the fireplace",
    notes: "Vanilla · Amber · Sandalwood",
    icon: Flame,
    color: "#fb923c",
    glowColor: "rgba(251,146,60,0.15)",
  },
  {
    id: "bold",
    label: "Bold & Confident",
    description: "Magnetic. Unapologetic. Unforgettable.",
    notes: "Oud · Leather · Dark Spices",
    icon: Zap,
    color: "#f43f5e",
    glowColor: "rgba(244,63,94,0.15)",
  },
  {
    id: "floral",
    label: "Romantic & Floral",
    description: "Soft petals and whispered promises",
    notes: "Rose · Jasmine · Peony",
    icon: Heart,
    color: "#f472b6",
    glowColor: "rgba(244,114,182,0.15)",
  },
  {
    id: "energetic",
    label: "Energetic & Vibrant",
    description: "A spark of joy in every spray",
    notes: "Pink Pepper · Grapefruit · Mint",
    icon: Sun,
    color: "#fbbf24",
    glowColor: "rgba(251,191,36,0.15)",
  },
  {
    id: "grounded",
    label: "Grounded & Natural",
    description: "Rooted, calm, and deeply earthy",
    notes: "Patchouli · Vetiver · Cedarwood",
    icon: TreePine,
    color: "#34d399",
    glowColor: "rgba(52,211,153,0.15)",
  },
];

export default function ScentFinder() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  const handleMoodClick = useCallback(
    (moodId: string) => {
      setSelectedId(moodId);
      setIsNavigating(true);

      // Brief delay so the user sees the selection animation before navigating
      setTimeout(() => {
        router.push(`/store?mood=${moodId}`);
      }, 500);
    },
    [router]
  );

  const selectedMood = MOODS.find((m) => m.id === selectedId);

  return (
    <section className="relative py-20 lg:py-28 px-6 lg:px-10 overflow-hidden bg-[#f7f4ee]">
      {/* Decorative background elements */}
      <div
        className="absolute top-[-120px] left-[-120px] w-[400px] h-[400px] rotate-45 pointer-events-none"
        style={{
          border: "1px solid rgba(212, 175, 55, 0.04)",
          borderRadius: "30px",
        }}
      />
      <div
        className="absolute bottom-[-100px] right-[-100px] w-[350px] h-[350px] rotate-45 pointer-events-none"
        style={{
          border: "1px solid rgba(212, 175, 55, 0.04)",
          borderRadius: "30px",
        }}
      />

      <div className="max-w-[1000px] mx-auto relative z-10">
        {/* Section header */}
        <FadeIn>
          <div className="text-center mb-14 space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 justify-center mb-6"
            >
              <span className="h-px w-8 bg-[#D4AF37]/30" />
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-[#D4AF37]/60">
                Find Your Scent
              </span>
              <span className="h-px w-8 bg-[#D4AF37]/30" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-[#121212] tracking-tight"
            >
              Not sure where to start?
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[#121212]/50 text-xs sm:text-sm max-w-md mx-auto leading-relaxed"
            >
              Pick a mood that resonates with you. We&apos;ll guide you to the
              perfect scent.
            </motion.p>
          </div>
        </FadeIn>

        {/* Mood grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {MOODS.map((mood, i) => {
            const isSelected = selectedId === mood.id;

            return (
              <FadeIn key={mood.id} delay={i * 0.06}>
                <motion.button
                  type="button"
                  onClick={() => handleMoodClick(mood.id)}
                  disabled={isNavigating}
                  layout
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className={`
                    relative w-full text-left p-5 sm:p-6 rounded-2xl border cursor-pointer
                    transition-all duration-300 outline-none group
                     bg-white border-black/5 shadow-sm
                    hover:border-black/10
                    ${isSelected ? "ring-2 ring-[#D4AF37]/40 border-[#D4AF37]/30" : ""}
                    ${isNavigating ? "opacity-60 cursor-not-allowed" : ""}
                  `}
                  style={
                    {
                      "--mood-color": mood.color,
                    } as React.CSSProperties
                  }
                >
                  {/* Background gradient on hover */}
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(to bottom, ${mood.color}11, transparent)`,
                    }}
                  />

                  {/* Selection overlay */}
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 rounded-2xl bg-[#D4AF37]/5"
                    />
                  )}

                  {/* Top accent line */}
                  <div
                    className="absolute top-0 left-4 right-4 h-0.5 rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-500"
                    style={{
                      background: `linear-gradient(to right, transparent, ${mood.color}, transparent)`,
                    }}
                  />

                  <div className="relative z-10 space-y-3">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                        isSelected
                          ? "bg-[#D4AF37] text-white shadow-md shadow-[#D4AF37]/20"
                          : "bg-black/5 text-black/40 group-hover:bg-black/5"
                      }`}
                      style={{
                        color: isSelected ? undefined : `var(--mood-color)`,
                      }}
                    >
                      <mood.icon className="w-5 h-5" />
                    </div>

                    {/* Label */}
                    <div>
                      <h3 className="text-sm sm:text-base font-serif font-semibold text-[#121212] transition-colors duration-300">
                        {mood.label}
                      </h3>
                      <p className="text-[11px] text-black/40 mt-0.5 leading-relaxed">
                        {mood.description}
                      </p>
                    </div>

                    {/* Scent notes tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {mood.notes.split(" · ").map((note) => (
                        <span
                          key={note}
                          className={`text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all duration-300 ${
                            isSelected
                              ? "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20"
                              : "bg-black/5 text-black/30 border-black/5 group-hover:bg-black/5 group-hover:text-black/40"
                          }`}
                        >
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Selection indicator dot */}
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className="absolute top-3 right-3 w-3 h-3 rounded-full bg-[#D4AF37] shadow-sm shadow-[#D4AF37]/30"
                    />
                  )}
                </motion.button>
              </FadeIn>
            );
          })}
        </div>

        {/* Navigation overlay */}
        <AnimatePresence>
          {isNavigating && selectedMood && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 sm:p-10 text-center max-w-sm mx-4 shadow-2xl shadow-black/10 border border-[#D4AF37]/10"
              >
                {/* Animated icon */}
                <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mx-auto mb-5">
                  <motion.span
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="text-[#D4AF37] flex items-center justify-center"
                  >
                    <selectedMood.icon className="w-8 h-8" />
                  </motion.span>
                </div>

                <h3 className="text-lg font-serif font-bold text-[#121212] mb-2">
                  {selectedMood.label}
                </h3>
                <p className="text-sm text-black/40 mb-6 leading-relaxed">
                  Finding the perfect scents for your mood...
                </p>

                {/* Progress bar */}
                <div className="w-full h-1 bg-black/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F5E6AD] rounded-full"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
