"use client";
 
import { useState, useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { ShoppingBag, Menu, X } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

interface NavigationProps {
  variant: 'landing' | 'store';
}

export function Navigation({ variant }: NavigationProps) {
  const { totalItems, setIsCartOpen } = useCart();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Subtle shadow when scrolled — reinforces the sticky header's elevation
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isHomeActive = pathname === "/";
  const isStoreActive = pathname === "/store";
  const isDeliveryActive = pathname === "/delivery";

  const navLinks = [
    { href: "/", label: "Home", active: isHomeActive },
    { href: "/store", label: "Marketplace", active: isStoreActive },
    { href: "/delivery", label: "Delivery", active: isDeliveryActive },
    { href: "/#boutiques", label: "Directions", active: false },
  ];

  // Hash links (e.g. Directions) smooth-scroll to their section when already on
  // the home page; on other pages the Link navigates to /#section normally.
  const handleNavClick = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    setMobileMenuOpen(false);
    if (href.startsWith("/#")) {
      const id = href.slice(href.indexOf("#") + 1);
      if (pathname === "/") {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const desktopBreak = variant === 'landing' ? 'lg' : 'md';

  const navContent = (
    <>
      {/* Desktop Nav Links */}
      <div className={`hidden ${desktopBreak}:flex items-center gap-6 xl:gap-8 text-[11px] font-bold uppercase tracking-[0.25em]`}>
        {navLinks.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            onClick={handleNavClick(link.href)}
            className="relative group py-1"
          >
            <span
              className={`transition-colors duration-300 ${
                link.active
                  ? "text-[#D4AF37]"
                  : "text-black/70 group-hover:text-black"
              }`}
            >
              {link.label}
            </span>
            {link.active && (
              <motion.span
                layoutId="nav-active"
                className="absolute -bottom-px left-0 right-0 h-px bg-[#D4AF37]"
              />
            )}
            {!link.active && (
              <span className="absolute -bottom-px left-0 right-0 h-px bg-[#D4AF37]/0 group-hover:bg-[#D4AF37]/40 transition-colors duration-300 scale-x-0 group-hover:scale-x-100 origin-center" />
            )}
          </Link>
        ))}
      </div>

      {/* Mobile Menu Button */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`${desktopBreak}:hidden p-2 text-black/70 hover:text-black transition-colors`}
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
      >
        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Cart & CTA */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          aria-label={`Open cart${totalItems > 0 ? `, ${totalItems} item${totalItems === 1 ? "" : "s"}` : ""}`}
          className="relative p-2 text-black/70 hover:text-black transition-all duration-300 hover:scale-105"
        >
          <ShoppingBag size={20} />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-black text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
              {totalItems}
            </span>
          )}
        </button>
        {variant === 'landing' ? (
          <Link href="/store" className="hidden min-[400px]:inline-flex relative overflow-hidden bg-[#D4AF37] text-black border-2 border-[#D4AF37] px-4 lg:px-6 py-2 rounded-full text-[10px] lg:text-[11px] font-bold uppercase tracking-widest transition-all duration-300 hover:bg-[#c9a431] hover:border-[#c9a431] hover:shadow-lg hover:shadow-[#D4AF37]/35">
            <span className="relative z-10">Shop Now</span>
          </Link>
        ) : (
          <Link href="/" className="hidden min-[400px]:inline-flex bg-black/5 border border-black/10 text-black px-3 lg:px-4 py-2 rounded-full text-[9px] lg:text-[10px] font-bold uppercase tracking-widest hover:bg-black hover:text-white hover:border-black transition-all duration-300">
            Back Home
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      <nav
        className={`sticky top-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-2xl border-b border-black/5 transition-shadow duration-300 ${
          scrolled ? "shadow-[0_4px_24px_rgba(18,18,18,0.08)]" : "shadow-none"
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />

        <div className={variant === 'landing' ? 'max-w-[1400px] mx-auto flex justify-between items-center px-4 sm:px-6 lg:px-10 py-3 lg:py-4' : 'max-w-7xl mx-auto flex justify-between items-center px-3 sm:px-6 lg:px-8 py-3 sm:py-3.5'}>
          <Link
            href="/"
            className="text-base sm:text-lg lg:text-2xl font-serif font-extrabold tracking-tighter text-black shrink-0"
          >
            ALFAWZAAN&apos;S<span className="text-brand-gold">.</span>
          </Link>
          {navContent}
        </div>
      </nav>

      {/* Mobile Menu Panel */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-[280px] sm:w-[320px] bg-white shadow-2xl border-l border-black/5"
            >
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-black/5">
                <span className="text-sm font-bold uppercase tracking-widest text-black/40">Menu</span>
                 <button
                   type="button"
                   aria-label="Close menu"
                   onClick={() => setMobileMenuOpen(false)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-5 sm:p-6 space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={handleNavClick(link.href)}
                    className={`block px-5 py-4 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all ${
                      link.active
                        ? "bg-[#D4AF37] text-white shadow-md"
                        : "text-black/70 hover:bg-black/5 hover:text-black"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-4 border-t border-black/5 space-y-3">
                   <Link
                     href="/store"
                     onClick={() => setMobileMenuOpen(false)}
                     className="block w-full py-3.5 text-center bg-[#D4AF37] text-black border-2 border-[#D4AF37] rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-[#c9a431] transition-all"
                   >
                       Shop Now
                   </Link>
                   <Link
                     href="/delivery"
                     onClick={() => setMobileMenuOpen(false)}
                     className="block w-full py-3.5 text-center border border-black/20 bg-white/60 backdrop-blur-sm rounded-2xl text-xs font-bold uppercase tracking-widest text-black/70 hover:text-black hover:border-black/40 hover:bg-white/80 transition-all"
                   >
                       Delivery Info
                   </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
