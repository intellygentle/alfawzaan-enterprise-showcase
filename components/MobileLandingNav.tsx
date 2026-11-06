"use client";

import Link from "next/link";
import { MapPin, ShoppingBag, Sparkles } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export default function MobileLandingNav() {
  const { totalItems, setIsCartOpen } = useCart();

  return (
    <nav aria-label="Mobile quick actions" className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-white/15 bg-[#121212]/95 p-1.5 shadow-2xl backdrop-blur-xl md:hidden">
      <Link href="/store" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[8px] font-bold uppercase tracking-wider text-white/65"><ShoppingBag size={17} className="text-[#D4AF37]" /> Shop</Link>
      <a href="#scent-finder" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[8px] font-bold uppercase tracking-wider text-white/65"><Sparkles size={17} className="text-[#D4AF37]" /> Scent</a>
      <a href="#boutiques" className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[8px] font-bold uppercase tracking-wider text-white/65"><MapPin size={17} className="text-[#D4AF37]" /> Visit</a>
      <button type="button" onClick={() => setIsCartOpen(true)} aria-label={`Open cart, ${totalItems} items`} className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-white/10 text-[8px] font-bold uppercase tracking-wider text-white"><ShoppingBag size={17} className="text-[#D4AF37]" /> Cart{totalItems > 0 && <span className="absolute right-3 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D4AF37] px-1 text-[8px] text-black">{totalItems}</span>}</button>
    </nav>
  );
}
