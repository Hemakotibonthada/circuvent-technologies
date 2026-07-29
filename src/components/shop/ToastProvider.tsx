"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X, Info, AlertTriangle } from "lucide-react";

type ToastTone = "success" | "info" | "warning";

export interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Pass 0 to keep it until dismissed. */
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLE: Record<ToastTone, { icon: typeof Check; color: string }> = {
  success: { icon: Check, color: "#10b981" },
  info: { icon: Info, color: "var(--accent-cyan)" },
  warning: { icon: AlertTriangle, color: "#f59e0b" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      // Cap the stack so rapid add-to-cart taps never bury the page.
      setToasts((prev) => [...prev.slice(-2), { ...input, id }]);
      const duration = input.duration ?? 4000;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONE_STYLE[t.tone ?? "success"];
            const Icon = tone.icon;
            return (
              <motion.div
                key={t.id}
                layout
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border p-3.5 shadow-lg backdrop-blur-xl"
                style={{
                  background: "var(--bg-glass-strong)",
                  borderColor: "var(--border-primary)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <span
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--accent-cyan-muted)", color: tone.color }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {t.description}
                    </p>
                  )}
                  {t.action &&
                    (t.action.href ? (
                      <Link
                        href={t.action.href}
                        onClick={() => dismiss(t.id)}
                        className="mt-2 inline-block text-xs font-semibold underline underline-offset-2"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {t.action.label}
                      </Link>
                    ) : (
                      <button
                        onClick={() => {
                          t.action?.onClick?.();
                          dismiss(t.id);
                        }}
                        className="mt-2 text-xs font-semibold underline underline-offset-2"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {t.action.label}
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded-lg p-1 transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {/* Screen-reader announcement channel, kept separate from the animated visuals. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {toasts.map((t) => (
          <p key={t.id}>{[t.title, t.description].filter(Boolean).join(". ")}</p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Toasts are optional — components outside the provider degrade to a no-op. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_TOAST;
}

const NOOP_TOAST: ToastContextValue = { toast: () => {}, dismiss: () => {} };
