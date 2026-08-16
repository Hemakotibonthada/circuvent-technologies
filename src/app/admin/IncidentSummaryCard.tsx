"use client";

import { Sparkles, ShieldCheck } from "lucide-react";
import type { Incident } from "@/lib/icm";
import { summariseIncident } from "@/lib/icm-summary";

/**
 * The card at the top of an incident: what is broken, and what has been tried.
 *
 * Somebody paged at 3am reads this before anything else, so it is placed where
 * IcM places its assistant summary and shaped the same way — "what we know",
 * then "what has been done so far". That ordering is the whole point: the
 * timeline answers both questions eventually, in the wrong order, spread over
 * twenty entries.
 *
 * It says "derived from this incident" rather than carrying IcM's
 * "AI-generated content may be incorrect", because it is not generated. Every
 * line traces to a field or a timeline entry somebody wrote. Borrowing the
 * disclaimer would be as wrong as borrowing the confidence: it would tell a
 * responder to distrust facts that came out of their own record.
 */
export default function IncidentSummaryCard({ incident, now }: { incident: Incident; now: string }) {
  const summary = summariseIncident(incident, now);

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border-accent)", background: "var(--bg-surface)" }}
      aria-label="Incident summary"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} aria-hidden />
        <h3 className="text-sm font-bold cv-text-primary">Summary</h3>
        <span className="ml-auto text-[11px] cv-text-muted">Derived from this incident</span>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">What we know</h4>
          <ul className="mt-2 space-y-1.5">
            {summary.known.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed cv-text-secondary">
                <span aria-hidden style={{ color: "var(--accent-cyan)" }}>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">
            What has been done so far
          </h4>
          {summary.quiet ? (
            /*
             * Said out loud rather than left as an empty column. "Nobody has
             * touched this" is the single most actionable fact about an
             * incident, and an empty list reads as the panel not having loaded.
             */
            <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: "var(--status-warn-text)" }}>
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Nothing has been recorded against this incident since it was filed.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {summary.done.map((line, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed cv-text-secondary">
                  <span aria-hidden className="cv-text-muted">
                    •
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
