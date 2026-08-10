"use client";

/**
 * Circuvent Console — overlays: modal, drawer, confirm, toasts, command palette.
 *
 * All overlays trap focus, close on Escape, restore focus to the trigger, and
 * lock body scroll while open. They render through a portal so a parent with
 * `overflow: hidden` or a stacking context cannot clip them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { AlertTriangle, Check, Info, Search, X, XCircle } from "lucide-react";
import { Button, SEVERITY } from "./primitives";
import { useOptionalConsoleTheme } from "../theme";
import type { Severity } from "./primitives";

/* ------------------------------------------------------------------ */
/* Portal + scroll lock                                                */
/* ------------------------------------------------------------------ */

function Portal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const theme = useOptionalConsoleTheme();
  // Read during render, not from an effect: React runs child effects before
  // parent ones, so an effect here sees the document before
  // ConsoleThemeProvider has published the theme to it, and a modal that was
  // already open on first paint came out unthemed.
  const themeClass = theme ? `cv-theme cv-${theme.mode} cv-${theme.scheme}` : "";

  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("data-cv-portal", "");
    document.body.appendChild(el);
    setHost(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);

  /*
   * Carry the console's theme classes onto the portal root, and keep them in
   * step when the theme changes while an overlay is open.
   *
   * The portal is a child of body, not of the themed wrapper, so every
   * class-scoped console rule — .cv-theme's radius remap, .cv-neo's raised
   * surfaces, the light-scheme shim — stopped at the portal boundary, and
   * modals were styled by whatever the marketing shell happened to apply.
   */
  useEffect(() => {
    if (!host) return;
    host.className = themeClass;
  }, [host, themeClass]);

  return host ? createPortal(children, host) : null;
}

/** Body scroll lock that survives nested overlays via a reference count. */
let scrollLocks = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    scrollLocks += 1;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks -= 1;
      if (scrollLocks <= 0) {
        scrollLocks = 0;
        document.body.style.overflow = prev;
      }
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Moves focus into an overlay, cycles Tab within it, and returns focus to
 * whatever opened it. Exported because several screens hand-roll their own
 * bottom sheet or palette; they should share this rather than reimplement it.
 */
export function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    // Defer so the element exists after the open transition begins.
    const t = setTimeout(() => (first ?? node)?.focus(), 20);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return ref;
}

export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  useScrollLock(open);
  useEscape(open, onClose);
  const trapRef = useFocusTrap(open);
  if (!open) return null;
  const maxW = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[width];

  return (
    <Portal>
      <div className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div
          ref={trapRef}
          tabIndex={-1}
          className={`cv-card relative flex max-h-[92vh] w-full ${maxW} cv-pop flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl`}
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--cv-border)" }}>
            <div className="min-w-0">
              <h2 className="text-[19px] font-bold" style={{ color: "var(--cv-text)" }}>
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:brightness-125"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--cv-border)" }}>
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

/**
 * Right-hand inspector. Used for device detail, event detail and rule editing
 * so the operator keeps the list context on screen instead of navigating away.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useScrollLock(open);
  useEscape(open, onClose);
  const trapRef = useFocusTrap(open);
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={title}>
        <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
        <div
          ref={trapRef}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-full flex-col shadow-2xl"
          style={{ maxWidth: width, background: "var(--cv-bg)", borderLeft: "1px solid var(--cv-border)", animation: "cvSlideIn 220ms ease-out" }}
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--cv-border)" }}>
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-bold" style={{ color: "var(--cv-text)" }}>
                {title}
              </h2>
              {subtitle && (
                <div className="mt-0.5 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                  {subtitle}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:brightness-125"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="flex flex-wrap gap-2 border-t px-5 py-4" style={{ borderColor: "var(--cv-border)" }}>
              {footer}
            </div>
          )}
        </div>
        <style jsx global>{`
          @keyframes cvSlideIn {
            from {
              transform: translateX(24px);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-cv-portal] * {
              animation: none !important;
            }
          }
        `}</style>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

/**
 * Destructive-action guard. `requirePhrase` forces the operator to type an
 * exact string (a device name, "DELETE", …) before the action unlocks — used
 * for fleet-wide broadcasts and deletions that cannot be undone.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  danger = true,
  requirePhrase,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  requirePhrase?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const locked = Boolean(requirePhrase) && typed.trim() !== requirePhrase;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={locked} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: danger ? SEVERITY.critical.fg : SEVERITY.warning.fg }} />
        <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--cv-text)" }}>
          {body}
        </div>
      </div>
      {requirePhrase && (
        <div className="mt-4">
          <label className="mb-1.5 block text-xs" style={{ color: "var(--cv-muted)" }}>
            Type <b style={{ color: "var(--cv-text)" }}>{requirePhrase}</b> to continue
          </label>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} className="cv-input text-sm" placeholder={requirePhrase} autoFocus />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  tone: Severity;
  title: string;
  body?: string;
}

interface ToastApi {
  push: (t: Omit<Toast, "id">) => void;
  ok: (title: string, body?: string) => void;
  err: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
      setTimeout(() => remove(id), t.tone === "critical" ? 7000 : 4000);
    },
    [remove]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      ok: (title, body) => push({ tone: "ok", title, body }),
      err: (title, body) => push({ tone: "critical", title, body }),
      info: (title, body) => push({ tone: "info", title, body }),
    }),
    [push]
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <Portal>
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[140] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end" aria-live="polite">
          {toasts.map((t) => {
            const Icon = t.tone === "ok" ? Check : t.tone === "critical" ? XCircle : t.tone === "warning" ? AlertTriangle : Info;
            return (
              <div
                key={t.id}
                className="cv-card pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[18px] px-4 py-3.5"
                style={{
                  borderLeft: `3px solid ${SEVERITY[t.tone].fg}`,
                  boxShadow: "var(--cv-shadow-3)",
                  animation: "cvToastIn 200ms ease-out",
                }}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SEVERITY[t.tone].fg }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
                    {t.title}
                  </div>
                  {t.body && (
                    <div className="mt-0.5 text-[13px]" style={{ color: "var(--cv-muted)" }}>
                      {t.body}
                    </div>
                  )}
                </div>
                <button onClick={() => remove(t.id)} aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" style={{ color: "var(--cv-muted)" }} />
                </button>
              </div>
            );
          })}
        </div>
        <style jsx global>{`
          @keyframes cvToastIn {
            from {
              transform: translateY(10px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}</style>
      </Portal>
    </ToastCtx.Provider>
  );
}

/**
 * Toast dispatcher. Falls back to a no-op outside a `ToastHost` so a panel
 * rendered in isolation (or in a test) never throws.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  return (
    ctx ?? {
      push: () => {},
      ok: () => {},
      err: () => {},
      info: () => {},
    }
  );
}

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/* ------------------------------------------------------------------ */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: typeof Info;
  run: () => void;
  keywords?: string;
}

/** Subsequence match — "dvl" hits "Devices › Latency", like an editor palette. */
function fuzzy(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 1;
  const direct = h.indexOf(n);
  if (direct === 0) return 1000;
  if (direct > 0) return 500 - direct;
  let hi = 0;
  let score = 0;
  for (const ch of n) {
    const idx = h.indexOf(ch, hi);
    if (idx === -1) return 0;
    score += idx === hi ? 3 : 1;
    hi = idx + 1;
  }
  return score;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  useScrollLock(open);
  useEscape(open, onClose);
  // Modal and Drawer both trap focus; the palette did not, so Tab walked out
  // into the page behind it and focus never came back on close.
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: Math.max(fuzzy(q, c.label), fuzzy(q, `${c.group} ${c.label}`), q ? fuzzy(q, c.keywords ?? "") * 0.8 : 0) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.c);
    return scored;
  }, [commands, q]);

  useEffect(() => setCursor(0), [q]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const grouped: { group: string; items: { cmd: Command; idx: number }[] }[] = [];
  results.forEach((cmd, idx) => {
    const g = grouped.find((x) => x.group === cmd.group);
    if (g) g.items.push({ cmd, idx });
    else grouped.push({ group: cmd.group, items: [{ cmd, idx }] });
  });

  const runAt = (i: number) => {
    const c = results[i];
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[150] flex items-start justify-center px-3 pt-[8vh]" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
        <div ref={trapRef} tabIndex={-1} className="cv-card relative flex max-h-[70vh] w-full max-w-xl cv-pop flex-col overflow-hidden rounded-[22px]" style={{ boxShadow: "var(--cv-shadow-3)" }}>
          <div className="flex items-center gap-3 border-b px-4 py-3.5 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[var(--cv-accent)]" style={{ borderColor: "var(--cv-border)" }}>
            <Search className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(results.length - 1, c + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(0, c - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  runAt(cursor);
                }
              }}
              placeholder="Search devices, scenes, pages, actions…"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: "var(--cv-text)" }}
            />
            <kbd className="hidden rounded px-1.5 py-0.5 text-[10px] sm:block" style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}>
              ESC
            </kbd>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
            {results.length === 0 && (
              <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--cv-muted)" }}>
                No matches for “{q}”
              </div>
            )}
            {grouped.map((g) => (
              <div key={g.group}>
                <div className="px-4 pb-1 pt-2 text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
                  {g.group}
                </div>
                {g.items.map(({ cmd, idx }) => {
                  const Icon = cmd.icon;
                  const active = idx === cursor;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={idx}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => runAt(idx)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                      style={{ background: active ? "var(--cv-card-hi)" : "transparent" }}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: active ? "var(--cv-accent-hi)" : "var(--cv-muted)" }} />}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "var(--cv-text)" }}>
                        {cmd.label}
                      </span>
                      {cmd.hint && (
                        <span className="shrink-0 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 border-t px-4 py-2 text-[10px]" style={{ borderColor: "var(--cv-border)", color: "var(--cv-muted)" }}>
            <span>↑↓ navigate</span>
            <span>↵ run</span>
            <span className="ml-auto">{results.length} results</span>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Registers the ⌘K / Ctrl-K accelerator, ignoring presses inside text fields. */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
