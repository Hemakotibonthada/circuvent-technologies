"use client";

import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import Link from "next/link";

const KEY = "circuvent-cookie-consent";

export type ConsentValue = "all" | "essential";

/** Reads the stored consent (SSR-safe). */
export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "all" || v === "essential" ? v : null;
  } catch {
    return null;
  }
}

/**
 * First-visit cookie consent banner. Persists the choice and broadcasts a
 * `cookie-consent-changed` event so gated features (analytics) can react.
 */
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!getConsent()) {
      const t = setTimeout(() => setShow(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const choose = (v: ConsentValue) => {
    try {
      window.localStorage.setItem(KEY, v);
      window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: v }));
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[9998] mx-auto max-w-3xl rounded-2xl border p-4 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--accent-cyan-muted)" }}>
          <Cookie className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            We use cookies
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            We use essential cookies to run the site and, with your consent, analytics to improve it. See our{" "}
            <Link href="/privacy" className="underline" style={{ color: "var(--accent-cyan-text)" }}>
              Privacy Policy
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => choose("all")}
              className="inline-flex min-h-[44px] items-center rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white"
            >
              Accept all
            </button>
            <button
              onClick={() => choose("essential")}
              className="inline-flex min-h-[44px] items-center rounded-xl border px-4 py-2 text-xs font-medium"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
            >
              Essential only
            </button>
          </div>
        </div>
        <button
          onClick={() => choose("essential")}
          aria-label="Dismiss (essential cookies only)"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
