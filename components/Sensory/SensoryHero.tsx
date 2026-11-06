"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Star, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import FloatingParticles from "./FloatingParticles";
import OptimizedImage from "@/components/StoreFront/OptimizedImage";
import { getRandomTagline } from "@/lib/sensoryCopy";
import { useSensoryCopy } from "@/hooks/useSensoryCopy";

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
}

interface SensoryHeroProps {
  products: Product[];
}

export default function SensoryHero({ products }: SensoryHeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tagline, setTagline] = useState(getRandomTagline());
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  const currentProduct = products[currentIndex];

  // Fetch AI-generated sensory copy for current product
  const { data: sensoryData, loading: sensoryLoading } = useSensoryCopy(
    currentProduct?.name || null,
    currentProduct?.category
  );

  // Auto-rotate products
  useEffect(() => {
    if (products.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % products.length);
      setTagline(getRandomTagline());
      setDisplayedText("");
      setIsTyping(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [products.length]);

  // Update tagline when AI copy arrives
  useEffect(() => {
    if (sensoryData?.tagline) {
      setTagline(sensoryData.tagline);
      setDisplayedText("");
      setIsTyping(true);
    }
  }, [sensoryData?.tagline]);

  // Typewriter effect for tagline
  useEffect(() => {
    if (!isTyping) return;

    let i = 0;
    const timer = setInterval(() => {
      if (i < tagline.length) {
        setDisplayedText(tagline.slice(0, i + 1));
        i++;
      } else {
        setIsTyping(false);
        clearInterval(timer);
      }
    }, 30);

    return () => clearInterval(timer);
  }, [tagline, isTyping]);

  if (products.length === 0) return null;

  return (
    <section className="relative min-h-screen pt-24 flex items-center overflow-hidden">
      {/* Floating particles background */}
      <FloatingParticles count={25} />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center relative z-10">
        {/* Left Content */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-8 pt-10 lg:pt-0"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5"
          >
            <Sparkles size={14} className="text-[#D4AF37]" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#D4AF37]">
              Premium Fragrances
            </span>
          </motion.div>

          {/* Main Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl sm:text-6xl xl:text-[5.5rem] font-serif font-black text-gray-900 leading-[0.95] tracking-tight"
          >
            Discover the <br />
            <span className="text-[#D4AF37] italic">art</span> of <br />fragrance.
          </motion.h1>

          {/* Typewriter Tagline */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="min-h-[4rem] flex items-start"
          >
            {sensoryLoading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Crafting your sensory experience...</span>
              </div>
            ) : (
              <p className="text-lg md:text-xl text-gray-600 font-medium leading-relaxed max-w-md">
                {displayedText}
                {isTyping && (
                  <span className="inline-block w-0.5 h-6 bg-[#D4AF37] ml-1 animate-pulse" />
                )}
              </p>
            )}
          </motion.div>

          {/* AI-Generated Sensory Copy */}
          {sensoryData?.copy && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-2xl p-4 max-w-md"
            >
              <p className="text-sm text-gray-600 italic leading-relaxed">
                &ldquo;{sensoryData.copy}&rdquo;
              </p>
              {sensoryData.scentNotes && (
                <div className="mt-3 flex gap-3 text-[10px] font-bold uppercase tracking-widest text-[#D4AF37]">
                  <span>{sensoryData.scentNotes.top}</span>
                  <span>·</span>
                  <span>{sensoryData.scentNotes.heart}</span>
                  <span>·</span>
                  <span>{sensoryData.scentNotes.base}</span>
                </div>
              )}
            </motion.div>
          )}

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link href="/store">
              <button className="bg-[#D4AF37] text-black px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest shadow-lg shadow-[#D4AF37]/30 hover:shadow-[#D4AF37]/50 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 group">
                Explore Collection
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </Link>
            <Link href="/store">
              <button className="border border-gray-200 text-gray-900 px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">
                View All Products
              </button>
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex items-center gap-8 pt-4"
          >
            <div>
              <p className="text-2xl font-black text-gray-900">2,000+</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                Happy Clients
              </p>
            </div>
            <div className="w-px h-10 bg-gray-200" />
            <div>
              <p className="text-2xl font-black text-gray-900">500+</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                Products
              </p>
            </div>
            <div className="w-px h-10 bg-gray-200" />
            <div>
              <p className="text-2xl font-black text-gray-900">2</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                Locations
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Right — Rotating Product Showcase */}
        <div className="relative hidden lg:block h-[650px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 rounded-[3rem] overflow-hidden shadow-2xl shadow-[#D4AF37]/10"
            >
              <OptimizedImage
                src={currentProduct.imageUrl || "/6539650.jpg"}
                alt={currentProduct.name}
                sizes="650px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

              {/* Product Info Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] mb-2">
                    {currentProduct.category}
                  </p>
                  <h3 className="text-2xl font-serif font-bold mb-2">
                    {currentProduct.name}
                  </h3>
                  <p className="text-xl font-black text-[#D4AF37]">
                    ₦{currentProduct.price.toLocaleString()}
                  </p>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Floating Review Card */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -left-12 bottom-24 bg-white p-5 rounded-3xl shadow-xl border border-gray-100 max-w-[200px] z-20"
          >
            <div className="flex items-center gap-1 mb-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={12}
                  className="fill-[#D4AF37] text-[#D4AF37]"
                />
              ))}
            </div>
            <p className="text-xs font-bold text-gray-900 leading-snug">
              &ldquo;The best fragrance collection in Ilorin.&rdquo;
            </p>
            <p className="text-[10px] text-gray-400 mt-2 font-medium">
              — Verified Buyer
            </p>
          </motion.div>

          {/* Product Counter */}
          <div className="absolute -right-6 top-20 bg-[#D4AF37] text-white p-4 rounded-2xl shadow-lg shadow-[#D4AF37]/30 z-20">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1">
              Featured
            </p>
            <p className="text-sm font-bold">{currentIndex + 1} / {products.length}</p>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Scroll to explore
        </p>
        <div className="w-6 h-10 rounded-full border-2 border-gray-300 flex justify-center pt-2">
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
          />
        </div>
      </motion.div>
    </section>
  );
}
