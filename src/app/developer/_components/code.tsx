"use client";

/**
 * The small set of presentational pieces every documentation page uses.
 *
 * A client component only because the copy button needs the clipboard; the
 * pages themselves stay server-rendered, so the documentation is in the HTML
 * for anybody reading it without JavaScript and for search engines.
 */

import { useState } from "react";

export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the code is still selectable */
    }
  };
  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span
          className="font-mono text-[11px] uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)" }}
        >
          {label ?? "example"}
        </span>
        <button
          onClick={copy}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition hover:opacity-80"
          style={{ color: copied ? "var(--accent-cyan)" : "var(--text-tertiary)" }}
          aria-label="Copy code"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono" style={{ color: "var(--text-secondary)" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

/**
 * A sampler with one tab per language.
 *
 * Client-side because the tabs are stateful; the first sample renders on the
 * server, so the page is useful before hydration rather than an empty box.
 */
export function SampleTabs({
  samples,
}: {
  samples: { id: string; label: string; lang: string; code: string }[];
}) {
  const [active, setActive] = useState(samples[0]?.id ?? "");
  const current = samples.find((s) => s.id === active) ?? samples[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {samples.map((s) => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className="min-h-[44px] rounded-lg border px-3 text-[13px] font-semibold transition"
            style={{
              borderColor: active === s.id ? "var(--accent-cyan)" : "var(--border-subtle)",
              color: active === s.id ? "var(--accent-cyan-text)" : "var(--text-secondary)",
              background: active === s.id ? "var(--bg-elevated)" : "transparent",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {current && <CodeBlock code={current.code} label={current.lang} />}
    </div>
  );
}
