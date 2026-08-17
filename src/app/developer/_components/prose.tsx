import Link from "next/link";
import type { ReactNode } from "react";
import { docNeighbours } from "@/lib/developer-docs";

/** Body copy. */
export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

/**
 * An inline code chip.
 *
 * No background here on purpose: globals.css tints code surfaces from
 * currentColor, so the chip follows the text into whichever theme it lands in.
 * Setting --bg-elevated inline pinned it to white in light mode and put the
 * accent text at 3.68:1.
 */
export function C({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 font-mono text-[13px]"
      style={{ color: "var(--code-accent)" }}
    >
      {children}
    </code>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-10 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
      {children}
    </h2>
  );
}

/**
 * HTTP method colours, at a weight that reads as 11px bold mono.
 *
 * The vivid set (#0e9f6e, #f59e0b) measured 3.24:1 and 2.06:1 on the docs
 * table — these are the labels that tell you whether a call writes or deletes,
 * so they are worth being able to read.
 */
export const METHOD_COLOR: Record<string, string> = {
  GET: "#047857",
  POST: "#1d4ed8",
  PATCH: "#b45309",
  PUT: "#b45309",
  DELETE: "#b91c1c",
};

export function Method({ method }: { method: string }) {
  return (
    <span
      className="font-mono text-[11px] font-bold"
      style={{ color: METHOD_COLOR[method] ?? "var(--text-secondary)" }}
    >
      {method}
    </span>
  );
}

/** A callout for something that will bite if skimmed past. */
export function Note({
  title,
  tone = "info",
  children,
}: {
  title: string;
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  const colour = tone === "warn" ? "#f59e0b" : "var(--accent-cyan)";
  return (
    <div
      className="rounded-xl border-l-4 p-4"
      style={{ borderColor: colour, background: "var(--bg-elevated)" }}
    >
      <div className="mb-1.5 text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
        {title}
      </div>
      <div className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </div>
  );
}

/** Two-column definition rows — used for scopes and webhook events. */
export function DefList({ rows }: { rows: { term: string; body: string }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
      {rows.map((r, i) => (
        <div
          key={r.term}
          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4"
          style={{
            borderTop: i ? "1px solid var(--border-subtle)" : undefined,
            background: "var(--bg-elevated)",
          }}
        >
          <code
            className="w-48 shrink-0 font-mono text-[12.5px] font-bold"
            style={{ color: "var(--code-accent)" }}
          >
            {r.term}
          </code>
          <span className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
            {r.body}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Links to the pages either side of this one.
 *
 * Driven by DOC_PAGES, so adding a page puts it in the reading order without
 * anybody remembering to wire it up.
 */
export function PrevNext({ slug }: { slug: string }) {
  const { prev, next } = docNeighbours(slug);
  if (!prev && !next) return null;
  return (
    <nav
      className="mt-14 flex flex-wrap justify-between gap-3 border-t pt-6"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {prev ? (
        <Link
          href={`/developer/${prev.slug}`}
          className="rounded-lg border px-4 py-2.5 text-[13px] transition hover:opacity-80"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
        >
          ← {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={`/developer/${next.slug}`}
          className="rounded-lg border px-4 py-2.5 text-[13px] font-semibold transition hover:opacity-80"
          style={{ borderColor: "var(--accent-cyan)", color: "var(--accent-cyan-text)" }}
        >
          {next.title} →
        </Link>
      )}
    </nav>
  );
}

/** The heading every documentation page opens with. */
export function DocTitle({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
        {title}
      </h1>
      <p className="mt-2 text-[15px]" style={{ color: "var(--text-tertiary)" }}>
        {blurb}
      </p>
    </header>
  );
}
