// contexts/CartContext.tsx

"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, ArrowRight, Check } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { usePathname } from "next/navigation";
export type { CartItem };

type CartContextType = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "selectedOutlet">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number, maxQuantity?: number) => void;
  updateOutlet: (id: string, outlet: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  showToast: boolean;
  toastProduct: string | null;
};

const CartContext = createContext<CartContextType | undefined>(undefined);
const CART_STORAGE_KEY = "alfawzaan-cart-v1";

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" &&
    typeof item.productId === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 &&
    typeof item.quantity === "number" && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100 &&
    typeof item.grade === "string" &&
    typeof item.category === "string" &&
    typeof item.imageUrl === "string" &&
    Array.isArray(item.outlets) && item.outlets.every((outlet) => typeof outlet === "string") &&
    (item.selectedOutlet === null || typeof item.selectedOutlet === "string");
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastProduct, setToastProduct] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // The cart is browser-only state restored after hydration.
          setItems(parsed.filter(isCartItem).slice(0, 50));
        }
      }
    } catch {
      localStorage.removeItem(CART_STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (items.length === 0) localStorage.removeItem(CART_STORAGE_KEY);
      else localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory cart still works.
    }
  }, [items, hydrated]);

  const addItem = useCallback((newItem: Omit<CartItem, "quantity" | "selectedOutlet">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === newItem.productId && i.grade === newItem.grade);
      if (existing) {
        const availability = newItem.availableStock ?? existing.availableStock;
        const maximum = availability
          ? Math.max(0, ...Object.values(availability))
          : existing.quantity + 1;
        return prev.map((i) =>
          i.productId === newItem.productId && i.grade === newItem.grade
            ? { ...i, availableStock: availability, quantity: Math.min(i.quantity + 1, maximum) }
            : i
        );
      }
      return [...prev, { ...newItem, quantity: 1, selectedOutlet: null }];
    });

    setToastProduct(newItem.name);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number, maxQuantity?: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    const cappedQuantity = maxQuantity == null ? quantity : Math.min(quantity, maxQuantity);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: cappedQuantity } : i)));
  }, []);

  const updateOutlet = useCallback((id: string, outlet: string) => {
    setItems((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      const available = i.availableStock?.[outlet];
      return {
        ...i,
        selectedOutlet: outlet,
        quantity: available == null ? i.quantity : Math.min(i.quantity, Math.max(1, available)),
      };
    }));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const totalPrice = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        updateOutlet,
        clearCart,
        totalItems,
        totalPrice,
        isCartOpen,
        setIsCartOpen,
        showToast,
        toastProduct,
      }}
    >
      {children}
      <CartToast />
      <CartFAB />
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

/* ─── Floating Action Button ───
   Appears as soon as the user selects goods, so the running count is always in
   view without scrolling. Springs in on the first item, bumps its badge as the
   count grows, and disappears when the cart is emptied. */
function CartFAB() {
  const { totalItems, setIsCartOpen } = useCart();
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/xK9mQ2") || pathname.startsWith("/representative") || pathname.startsWith("/rep-hub")) return null;

  return (
    <AnimatePresence>
      {totalItems > 0 && (
        <motion.button
          key="cart-fab"
          initial={{ scale: 0, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0, y: 24, opacity: 0 }}
          transition={{ type: "spring", damping: 17, stiffness: 260 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsCartOpen(true)}
          aria-label={`Open cart, ${totalItems} item${totalItems === 1 ? "" : "s"}`}
          className="fixed bottom-6 right-6 z-50 bg-brand-gold text-black p-4 rounded-full shadow-xl shadow-brand-gold/40 border-2 border-black/40 flex items-center justify-center"
        >
          <ShoppingCart size={24} />
          <motion.span
            key={totalItems}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 400 }}
            className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md"
          >
            {totalItems}
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ─── Toast Notification ─── */
function CartToast() {
  const { showToast, toastProduct, setIsCartOpen } = useCart();
  const pathname = usePathname();

  if (pathname.startsWith("/admin") || pathname.startsWith("/xK9mQ2") || pathname.startsWith("/representative") || pathname.startsWith("/rep-hub")) return null;

  return (
    <AnimatePresence>
      {showToast && (
        <motion.div
          initial={{ opacity: 0, y: 50, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 20, x: "-50%" }}
          className="fixed bottom-24 left-1/2 z-50 max-w-[calc(100vw-2rem)] bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 cursor-pointer"
          onClick={() => setIsCartOpen(true)}
        >
          <div className="bg-brand-gold/20 p-1.5 rounded-full shrink-0">
            <Check size={14} className="text-brand-gold" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold">Added to cart</p>
            <p className="text-[10px] text-gray-400 truncate">{toastProduct}</p>
          </div>
          <ArrowRight size={14} className="text-brand-gold ml-2 shrink-0" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
