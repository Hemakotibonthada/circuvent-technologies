"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

interface ShopDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Constrains the panel width; defaults to a wide product-detail layout. */
  maxWidthClass?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal shell — portalled, focus-trapped, ESC-dismissable and
 * scroll-locked, with focus returned to the trigger on close.
 */
export default function ShopDialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = "max-w-3xl",
}: ShopDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const reduceMotion = useReducedMotion();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown, true);

    // Focus the panel itself so screen readers announce the dialog title first.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = overflow;
      restoreFocusTo.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0"
            style={{ background: "rgba(3, 7, 18, 0.6)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border outline-none sm:rounded-3xl ${maxWidthClass}`}
            style={{
              background: "var(--bg-elevated)",
              borderColor: "var(--border-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-base font-bold sm:text-lg" style={{ color: "var(--text-primary)" }}>
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-0.5 line-clamp-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-colors"
                style={{ borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
