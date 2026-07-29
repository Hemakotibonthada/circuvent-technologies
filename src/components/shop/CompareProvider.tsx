"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const MAX_COMPARE = 4;

interface CompareContextValue {
  ids: string[];
  has: (id: string) => boolean;
  /** Returns false when the tray is already full so the caller can warn. */
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
  isFull: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const CompareContext = createContext<CompareContextValue | null>(null);
const KEY = "circuvent-compare";

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setIds(parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_COMPARE));
        }
      }
    } catch {
      /* storage unavailable — ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }, [ids, loaded]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback(
    (id: string) => {
      let accepted = true;
      setIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= MAX_COMPARE) {
          accepted = false;
          return prev;
        }
        return [...prev, id];
      });
      return accepted;
    },
    []
  );

  const remove = useCallback((id: string) => setIds((prev) => prev.filter((x) => x !== id)), []);

  const clear = useCallback(() => {
    setIds([]);
    setIsOpen(false);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      has,
      toggle,
      remove,
      clear,
      count: ids.length,
      isFull: ids.length >= MAX_COMPARE,
      isOpen,
      open,
      close,
    }),
    [ids, has, toggle, remove, clear, isOpen, open, close]
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within CompareProvider");
  return ctx;
}
