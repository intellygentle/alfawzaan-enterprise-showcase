"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface AnimatedTabsProps {
  tabs?: Tab[];
  defaultTab?: string;
  className?: string;
  autoRotate?: boolean;
  autoRotateInterval?: number;
}

const AnimatedTabs = ({
  tabs,
  defaultTab,
  className,
  autoRotate = false,
  autoRotateInterval = 3000,
}: AnimatedTabsProps) => {
  const [activeTab, setActiveTab] = useState<string>(
    defaultTab || tabs?.[0]?.id || ""
  );
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const manualClickRef = useRef(false);

  const clearAutoRotate = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoRotate = useCallback(() => {
    if (!autoRotate || !tabs?.length) return;
    clearAutoRotate();
    intervalRef.current = setInterval(() => {
      if (manualClickRef.current) {
        manualClickRef.current = false;
        return;
      }
      setActiveTab((current) => {
        const idx = tabs.findIndex((t) => t.id === current);
        return tabs[(idx + 1) % tabs.length].id;
      });
    }, autoRotateInterval);
  }, [autoRotate, autoRotateInterval, tabs, clearAutoRotate]);

  useEffect(() => {
    if (autoRotate && !isPaused) {
      startAutoRotate();
    }
    return clearAutoRotate;
  }, [autoRotate, isPaused, startAutoRotate, clearAutoRotate]);

  const handleTabClick = (id: string) => {
    setActiveTab(id);
    manualClickRef.current = true;
    if (autoRotate) {
      clearAutoRotate();
      startAutoRotate();
    }
  };

  if (!tabs?.length) return null;

  return (
    <div
      className={cn("w-full flex flex-col gap-3", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Tab bar */}
      <div className="flex gap-1.5 flex-wrap bg-neutral p-1.5 rounded-2xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              "relative px-4 py-2 text-xs font-medium uppercase tracking-widest rounded-xl outline-none transition-colors cursor-pointer",
              activeTab === tab.id
                ? "text-black"
                : "text-white/40 hover:text-white/70"
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="active-tab"
                className="absolute inset-0 bg-[#D4AF37] shadow-sm rounded-xl"
                transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-6 bg-base-100 rounded-2xl border border-base-content/5 min-h-[300px]">
        {tabs.map(
          (tab) =>
            activeTab === tab.id && (
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, scale: 0.98, x: -8, filter: "blur(6px)" }}
                animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.98, x: -8, filter: "blur(6px)" }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab.content}
              </motion.div>
            )
        )}
      </div>
    </div>
  );
};

export { AnimatedTabs };
