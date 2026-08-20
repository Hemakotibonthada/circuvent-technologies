"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, X } from "lucide-react";

/**
 * The time window the incident queue is read through, the way IcM does it.
 *
 * An incident queue with no time control answers only one question — "what is
 * broken now" — and quietly refuses the other one people actually come here
 * for: "what happened during the outage on the 12th". Once a queue has any
 * history in it, scrolling is not a substitute.
 *
 * Presets first, custom second, because almost every real question is "the
 * last day" or "the last week" and making that a two-date form is friction for
 * the common case.
 */

export type IcmRange = {
  /** ISO instant, inclusive. Empty means unbounded. */
  from: string;
  /** ISO instant, inclusive. Empty means unbounded. */
  to: string;
  /** Which preset produced this, or "custom". Kept so the chip can stay lit. */
  preset: PresetId;
};

export type PresetId = "all" | "24h" | "7d" | "30d" | "90d" | "custom";

const PRESETS: { id: PresetId; label: string; hours: number | null }[] = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
  { id: "30d", label: "Last 30 days", hours: 24 * 30 },
  { id: "90d", label: "Last 90 days", hours: 24 * 90 },
  { id: "all", label: "All time", hours: null },
];

export const DEFAULT_RANGE: IcmRange = { from: "", to: "", preset: "all" };

export function rangeFromPreset(id: PresetId, now = Date.now()): IcmRange {
  const p = PRESETS.find((x) => x.id === id);
  if (!p || p.hours === null) return { from: "", to: "", preset: "all" };
  return {
    from: new Date(now - p.hours * 3_600_000).toISOString(),
    to: "",
    preset: id,
  };
}

/**
 * A date input gives a calendar day; the filter needs an instant.
 *
 * The end of the window is the *last* millisecond of the chosen day, not its
 * midnight. Parsing "2026-08-20" and comparing directly excludes everything
 * that happened on the 20th, so picking today as the end date reliably returns
 * nothing — a bug that reads as "there were no incidents" rather than as an
 * off-by-one.
 */
export function dayToInstant(day: string, edge: "start" | "end"): string {
  if (!day) return "";
  const t = Date.parse(edge === "start" ? `${day}T00:00:00` : `${day}T23:59:59.999`);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

function instantToDay(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function rangeLabel(r: IcmRange): string {
  if (r.preset !== "custom") return PRESETS.find((p) => p.id === r.preset)?.label ?? "All time";
  const from = instantToDay(r.from);
  const to = instantToDay(r.to);
  if (from && to) return from === to ? from : `${from} → ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return "All time";
}

export default function IcmRangePicker({
  value,
  onChange,
}: {
  value: IcmRange;
  onChange: (r: IcmRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(() => instantToDay(value.from));
  const [draftTo, setDraftTo] = useState(() => instantToDay(value.to));

  const active = value.preset !== "all" || Boolean(value.from || value.to);

  /*
   * A range whose end precedes its start returns nothing, which looks exactly
   * like a quiet week. Saying so is cheaper than letting somebody conclude
   * there were no incidents.
   */
  const invalid = useMemo(
    () => Boolean(draftFrom && draftTo && Date.parse(draftFrom) > Date.parse(draftTo)),
    [draftFrom, draftTo]
  );

  const applyCustom = () => {
    if (invalid) return;
    const from = dayToInstant(draftFrom, "start");
    const to = dayToInstant(draftTo, "end");
    onChange(from || to ? { from, to, preset: "custom" } : DEFAULT_RANGE);
    setOpen(false);
  };

  const choosePreset = (id: PresetId) => {
    const next = rangeFromPreset(id);
    setDraftFrom(instantToDay(next.from));
    setDraftTo("");
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Time range: ${rangeLabel(value)}`}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
          active
            ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
            : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]"
        }`}
      >
        <CalendarDays className="h-4 w-4" />
        <span className="max-w-[190px] truncate">{rangeLabel(value)}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      {active && (
        <button
          type="button"
          onClick={() => {
            setDraftFrom("");
            setDraftTo("");
            onChange(DEFAULT_RANGE);
          }}
          aria-label="Clear time range"
          title="Clear time range"
          className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-white/15 bg-slate-900 text-slate-400 hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {open && (
        <>
          {/* Click-away. A filter panel that traps the page is worse than one
              that closes when you look elsewhere. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Select a time range"
            className="absolute left-0 top-11 z-50 w-[280px] rounded-xl border border-white/10 bg-[#0d1424] p-2 shadow-2xl"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePreset(p.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  value.preset === p.id
                    ? "bg-sky-500/15 text-sky-200"
                    : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {p.label}
              </button>
            ))}

            <div className="my-2 border-t border-white/10" />

            <div className="px-1 pb-1">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Custom range
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">From</span>
                  <input
                    type="date"
                    value={draftFrom}
                    max={draftTo || undefined}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-200"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">To</span>
                  <input
                    type="date"
                    value={draftTo}
                    min={draftFrom || undefined}
                    onChange={(e) => setDraftTo(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-200"
                  />
                </label>
              </div>

              {invalid && (
                <p role="alert" className="mt-2 text-[11px] text-amber-300">
                  The end date is before the start date, so nothing would match.
                </p>
              )}

              <button
                type="button"
                onClick={applyCustom}
                disabled={invalid}
                className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
