"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Heart, Wind } from "lucide-react";
import { SCENT_STORIES, type ScentStory as ScentStoryType } from "@/lib/sensoryCopy";

interface ScentStoryProps {
  productName?: string;
}

export default function ScentStory({ productName }: ScentStoryProps) {
  const [currentStory, setCurrentStory] = useState(0);
  const story = SCENT_STORIES[currentStory];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStory((prev) => (prev + 1) % SCENT_STORIES.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-24 px-6 lg:px-10 bg-[#FAFAFA] relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-16 space-y-4">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37]">
            The Art of Scent
          </span>
          <h2 className="text-4xl md:text-5xl font-serif font-black text-gray-900 italic">
            A Fragrance Tells a Story
          </h2>
          <p className="text-gray-500 font-medium max-w-xl mx-auto">
            Every perfume has three chapters — the opening, the heart, and the memory it leaves behind.
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Top Notes */}
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow group">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-[#D4AF37]/10 rounded-2xl text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-white transition-colors">
                    <Wind size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Top Notes</p>
                    <p className="text-lg font-serif font-bold text-gray-900">{story.topNote}</p>
                  </div>
                </div>
                <p className="text-gray-600 leading-relaxed">{story.topDescription}</p>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">First Impression</p>
                  <p className="text-[11px] text-gray-400 mt-1">What you smell in the first 15 minutes</p>
                </div>
              </div>

              {/* Heart Notes */}
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow group">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-[#D4AF37]/10 rounded-2xl text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-white transition-colors">
                    <Heart size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Heart Notes</p>
                    <p className="text-lg font-serif font-bold text-gray-900">{story.heartNote}</p>
                  </div>
                </div>
                <p className="text-gray-600 leading-relaxed">{story.heartDescription}</p>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">The Soul</p>
                  <p className="text-[11px] text-gray-400 mt-1">The character that emerges after 30 minutes</p>
                </div>
              </div>

              {/* Base Notes */}
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-lg transition-shadow group">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-[#D4AF37]/10 rounded-2xl text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-white transition-colors">
                    <Droplets size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Base Notes</p>
                    <p className="text-lg font-serif font-bold text-gray-900">{story.baseNote}</p>
                  </div>
                </div>
                <p className="text-gray-600 leading-relaxed">{story.baseDescription}</p>
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">The Memory</p>
                  <p className="text-[11px] text-gray-400 mt-1">What lingers for hours — the lasting impression</p>
                </div>
              </div>
            </div>

            {/* Closing narrative */}
            <div className="mt-12 text-center">
              <p className="text-xl md:text-2xl font-serif italic text-gray-700 max-w-2xl mx-auto">
                &ldquo;{story.closing}&rdquo;
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mt-12">
          {SCENT_STORIES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStory(i)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentStory
                  ? "bg-[#D4AF37] w-8"
                  : "bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
