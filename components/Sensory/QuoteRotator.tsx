"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SENSORY_QUOTES } from "@/lib/sensoryCopy";

export default function QuoteRotator() {
  const [currentQuote, setCurrentQuote] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentQuote((prev) => (prev + 1) % SENSORY_QUOTES.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="py-28 px-6 lg:px-10 bg-base-200">
      <div className="max-w-3xl mx-auto text-center min-h-[160px] flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuote}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <blockquote className="text-2xl md:text-3xl lg:text-4xl font-serif font-normal text-base-content/25 leading-snug italic tracking-tight">
              &ldquo;{SENSORY_QUOTES[currentQuote]}&rdquo;
            </blockquote>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-10">
          {SENSORY_QUOTES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentQuote(i)}
              className={`transition-all duration-500 rounded-full ${
                i === currentQuote
                  ? "w-6 h-1.5 bg-[#D4AF37]/40"
                  : "w-1.5 h-1.5 bg-base-content/15"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
