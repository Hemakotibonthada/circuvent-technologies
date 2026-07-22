"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { SHIPPING, type Product } from "@/lib/shop-data";

export interface CartItem {
  id: string;
  slug: string;
  name: string;
  price: number;
  image?: string;
  accent: string;
  icon: string;
  qty: number;
}

interface CartContextValue {
  items: CartItem[];
  add: (product: Product, qty?: number, opts?: { silent?: boolean }) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  shipping: number;
  total: number;
  freeShipOver: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const KEY = "circuvent-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items, loaded]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const add = useCallback<CartContextValue["add"]>((product, qty = 1, opts) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === product.id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: Math.min(99, copy[i].qty + qty) };
        return copy;
      }
      return [
        ...prev,
        {
          id: product.id,
          slug: product.slug,
          name: product.name,
          price: product.price,
          image: product.image,
          accent: product.accent,
          icon: product.icon,
          qty: Math.min(99, Math.max(1, qty)),
        },
      ];
    });
    if (!opts?.silent) setIsOpen(true);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, qty: Math.max(1, Math.min(99, qty)) } : x))
    );
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, x) => s + x.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, x) => s + x.price * x.qty, 0), [items]);
  const shipping = subtotal === 0 || subtotal >= SHIPPING.freeOver ? 0 : SHIPPING.flat;
  const total = subtotal + shipping;

  const value: CartContextValue = {
    items,
    add,
    setQty,
    remove,
    clear,
    count,
    subtotal,
    shipping,
    total,
    freeShipOver: SHIPPING.freeOver,
    isOpen,
    open,
    close,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
