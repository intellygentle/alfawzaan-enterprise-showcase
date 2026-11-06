"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Testimonial {
  name: string;
  title: string;
  description: string;
  imageUrl: string;
  instagramUrl?: string;
  whatsappUrl?: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Amina K.",
    title: "Loyal Customer",
    description:
      "The quality of Alfawzaan's 100ML collection is unmatched. Every scent tells a story. I've been a customer for over two years and every purchase feels like unwrapping a gift to myself.",
    imageUrl:
      "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=600&q=80",
    instagramUrl: "#",
    whatsappUrl: "#",
  },
  {
    name: "Ibrahim L.",
    title: "Fragrance Enthusiast",
    description:
      "I found my signature scent here. The special shelf Oud Touch is absolutely divine. The staff really understands fragrance and helped me find exactly what I was looking for.",
    imageUrl:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80",
    instagramUrl: "#",
    whatsappUrl: "#",
  },
  {
    name: "Fatima F.",
    title: "Verified Buyer",
    description:
      "Fast delivery within Unilorin and the packaging feels like unboxing pure luxury. The oils are long-lasting and the compliments don't stop coming. Highly recommend to anyone.",
    imageUrl:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80",
    instagramUrl: "#",
    whatsappUrl: "#",
  },
];

export interface TestimonialCarouselProps {
  className?: string;
}

export function TestimonialCarousel({ className }: TestimonialCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNext = () =>
    setCurrentIndex((index) => (index + 1) % testimonials.length);
  const handlePrevious = () =>
    setCurrentIndex(
      (index) => (index - 1 + testimonials.length) % testimonials.length
    );

  const currentTestimonial = testimonials[currentIndex];

  const socialIcons = [
    {
      icon: Camera,
      url: currentTestimonial.instagramUrl,
      label: "Instagram",
    },
    {
      icon: MessageCircle,
      url: currentTestimonial.whatsappUrl,
      label: "WhatsApp",
    },
  ];

  return (
    <div className={cn("w-full max-w-5xl mx-auto px-4", className)}>
      {/* Desktop layout */}
      <div className="hidden md:flex relative items-center">
        {/* Avatar */}
        <div className="w-[420px] h-[420px] rounded-3xl overflow-hidden bg-base-200 flex-shrink-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTestimonial.imageUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="w-full h-full"
            >
              <Image
                src={currentTestimonial.imageUrl}
                alt={currentTestimonial.name}
                width={420}
                height={420}
                className="w-full h-full object-cover"
                draggable={false}
                priority
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Card */}
        <div className="bg-base-100 rounded-3xl shadow-2xl shadow-black/5 p-8 ml-[-70px] z-10 max-w-xl flex-1 border border-base-content/5">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTestimonial.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={14}
                    className="fill-[#D4AF37] text-[#D4AF37]"
                  />
                ))}
              </div>

              <p className="text-base-content/60 text-base leading-[1.8] mb-8 font-serif">
                &ldquo;{currentTestimonial.description}&rdquo;
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-base-content mb-0.5">
                    {currentTestimonial.name}
                  </h2>
                  <p className="text-xs text-base-content/40 font-medium uppercase tracking-wider">
                    {currentTestimonial.title}
                  </p>
                </div>

                <div className="flex gap-2">
                  {socialIcons.map(({ icon: IconComponent, url, label }) => (
                    <Link
                      key={label}
                      href={url || "#"}
                      className="w-9 h-9 rounded-full bg-base-content/5 flex items-center justify-center text-base-content/30 hover:bg-[#D4AF37] hover:text-black transition-all duration-300"
                      aria-label={label}
                    >
                      <IconComponent className="w-4 h-4" />
                    </Link>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden max-w-sm mx-auto text-center">
        {/* Avatar */}
        <div className="w-full aspect-square bg-base-200 rounded-3xl overflow-hidden mb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTestimonial.imageUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="w-full h-full"
            >
              <Image
                src={currentTestimonial.imageUrl}
                alt={currentTestimonial.name}
                width={400}
                height={400}
                className="w-full h-full object-cover"
                draggable={false}
                priority
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Card content */}
        <div className="px-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTestimonial.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <div className="flex justify-center gap-0.5 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={13}
                    className="fill-[#D4AF37] text-[#D4AF37]"
                  />
                ))}
              </div>

              <p className="text-base-content/50 text-sm leading-[1.8] mb-6 font-serif">
                &ldquo;{currentTestimonial.description}&rdquo;
              </p>

              <h2 className="text-lg font-semibold text-base-content mb-0.5">
                {currentTestimonial.name}
              </h2>
              <p className="text-xs text-base-content/40 font-medium uppercase tracking-wider mb-5">
                {currentTestimonial.title}
              </p>

              <div className="flex justify-center gap-2">
                {socialIcons.map(({ icon: IconComponent, url, label }) => (
                  <Link
                    key={label}
                    href={url || "#"}
                    className="w-9 h-9 rounded-full bg-base-content/5 flex items-center justify-center text-base-content/30 hover:bg-[#D4AF37] hover:text-black transition-all duration-300"
                    aria-label={label}
                  >
                    <IconComponent className="w-4 h-4" />
                  </Link>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex justify-center items-center gap-6 mt-10">
        <button
          onClick={handlePrevious}
          aria-label="Previous testimonial"
          className="w-10 h-10 rounded-full bg-base-100 border border-base-content/10 flex items-center justify-center text-base-content/40 hover:text-base-content hover:border-base-content/20 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex gap-1.5">
          {testimonials.map((_, testimonialIndex) => (
            <button
              key={testimonialIndex}
              onClick={() => setCurrentIndex(testimonialIndex)}
              className={cn(
                "transition-all duration-500 rounded-full cursor-pointer",
                testimonialIndex === currentIndex
                  ? "w-6 h-1.5 bg-[#D4AF37]/50"
                  : "w-1.5 h-1.5 bg-base-content/15"
              )}
              aria-label={`Go to testimonial ${testimonialIndex + 1}`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          aria-label="Next testimonial"
          className="w-10 h-10 rounded-full bg-base-100 border border-base-content/10 flex items-center justify-center text-base-content/40 hover:text-base-content hover:border-base-content/20 transition-all cursor-pointer"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
