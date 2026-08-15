"use client";

/**
 * The user-facing controls for view settings.
 *
 * Two presentations of one set of preferences:
 *  - `ViewSettingsPanel` — the full control, for a settings page.
 *  - `ViewMenu` — a toolbar popover, so the setting is reachable from the
 *    screen it affects. A density control buried three tabs deep in another
 *    section is one nobody finds while squinting at the dashboard.
 *
 * Both write through the same module, so they stay in step with each other and
 * across tabs without either knowing the other exists.
 */

import { useCallback, useState } from "react";
import {
  Check,
  Columns3,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useViewSettings } from "@/hooks/useViewSettings";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  DENSITIES,
  DENSITY_LABELS,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_STEP,
  WIDTHS,
  WIDTH_LABELS,
  type Density,
} from "@/lib/view-settings";

/* Density gets a glyph rather than a word alone: three stacked rules at three
   spacings say "spacing" faster than the labels do. The bar height is derived
   from the gap — at a fixed height the three compact bars touch and read as
   one thick bar, which is the opposite of the thing being described. */
function DensityGlyph({ density, active }: { density: Density; active: boolean }) {
  const gap = density === "comfortable" ? 5 : density === "cozy" ? 3.6 : 2.6;
  const h = Math.max(1.2, Math.min(2.2, gap - 1.4));
  const color = active ? "currentColor" : "var(--text-tertiary)";
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true" className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x="1"
          y={8 - gap - h / 2 + i * gap}
          width="20"
          height={h}
          rx={h / 2}
          fill={color}
          opacity={active ? 1 : 0.75}
        />
      ))}
    </svg>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return active
    ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff", border: "1px solid transparent" }
    : {
        background: "var(--bg-surface)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-primary)",
      };
}

/* ------------------------------------------------------------------ */
/* Full panel                                                          */
/* ------------------------------------------------------------------ */

export function ViewSettingsPanel({ compactHeadings = false }: { compactHeadings?: boolean }) {
  const { settings, ready, update, reset } = useViewSettings();
  const headingClass = compactHeadings
    ? "text-[13px] font-bold uppercase tracking-wide"
    : "text-[15px] font-bold";

  const setScale = useCallback(
    (next: number) => update({ scale: next }),
    [update],
  );

  return (
    <div className="space-y-5">
      {/* ── Density ─────────────────────────────────────── */}
      <div>
        <h3 className={headingClass} style={{ color: "var(--text-primary)" }}>
          Density
        </h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          How much vertical space each screen spends on padding rather than content.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {DENSITIES.map((d) => {
            const active = ready && settings.density === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => update({ density: d })}
                aria-pressed={active}
                className="flex items-start gap-3 rounded-xl p-3 text-left transition-all hover:brightness-105 focus:outline-none focus-visible:ring-2"
                style={{
                  ...pillStyle(active),
                  ...( { "--tw-ring-color": "var(--accent-cyan)" } as React.CSSProperties ),
                }}
              >
                <span className="mt-0.5">
                  <DensityGlyph density={d} active={active} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold">{DENSITY_LABELS[d].label}</span>
                  <span
                    className="mt-0.5 block text-[11.5px] leading-snug"
                    style={{ color: active ? "rgba(255,255,255,0.86)" : "var(--text-muted)" }}
                  >
                    {DENSITY_LABELS[d].hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scale ───────────────────────────────────────── */}
      <div>
        <h3 className={headingClass} style={{ color: "var(--text-primary)" }}>
          Interface scale
        </h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Resizes text and spacing together, like browser zoom but without shrinking
          the browser&rsquo;s own toolbar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div
            className="flex items-center gap-1 rounded-xl p-1"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
          >
            <button
              type="button"
              onClick={() => setScale(settings.scale - SCALE_STEP)}
              disabled={settings.scale <= MIN_SCALE}
              aria-label="Decrease interface scale"
              className="grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span
              className="min-w-[3.5rem] text-center text-[13px] font-bold tabular-nums"
              style={{ color: "var(--text-primary)" }}
              aria-live="polite"
            >
              {settings.scale}%
            </span>
            <button
              type="button"
              onClick={() => setScale(settings.scale + SCALE_STEP)}
              disabled={settings.scale >= MAX_SCALE}
              aria-label="Increase interface scale"
              className="grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={SCALE_STEP}
            value={settings.scale}
            onChange={(e) => setScale(Number(e.target.value))}
            aria-label="Interface scale"
            className="h-2 min-w-[10rem] flex-1 cursor-pointer appearance-none rounded-full"
            style={{
              accentColor: "var(--accent-cyan)",
              background: "var(--bg-surface-hover)",
              border: "1px solid var(--border-primary)",
            }}
          />
        </div>
      </div>

      {/* ── Content width ───────────────────────────────── */}
      <div>
        <h3 className={headingClass} style={{ color: "var(--text-primary)" }}>
          Content width
        </h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Applies to the dashboards and the console. Marketing pages keep their
          designed column width.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {WIDTHS.map((w) => {
            const active = ready && settings.width === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => update({ width: w })}
                aria-pressed={active}
                title={WIDTH_LABELS[w].hint}
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all focus:outline-none focus-visible:ring-2"
                style={pillStyle(active)}
              >
                {w === "full" ? <Maximize2 className="h-3.5 w-3.5" /> : <Columns3 className="h-3.5 w-3.5" />}
                {WIDTH_LABELS[w].label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all hover:brightness-105"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-primary)",
          color: "var(--text-secondary)",
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar popover                                                     */
/* ------------------------------------------------------------------ */

export function ViewMenu({ label = "View" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const { settings, ready, update, reset } = useViewSettings();
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close, open);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="View settings — density, scale and width"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-all hover:brightness-105"
        style={{
          height: "var(--cv-control-h)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-primary)",
          color: "var(--text-secondary)",
        }}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden lg:inline">{label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="View settings"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="absolute right-0 z-50 mt-2 w-[17rem] rounded-2xl p-3 shadow-lg"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Density
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {DENSITIES.map((d) => {
              const active = ready && settings.density === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => update({ density: d })}
                  aria-pressed={active}
                  className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11.5px] font-semibold transition-all"
                  style={pillStyle(active)}
                >
                  <DensityGlyph density={d} active={active} />
                  {DENSITY_LABELS[d].label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Scale
          </div>
          <div
            className="flex items-center justify-between rounded-lg p-1"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
          >
            <button
              type="button"
              onClick={() => update({ scale: settings.scale - SCALE_STEP })}
              disabled={settings.scale <= MIN_SCALE}
              aria-label="Decrease interface scale"
              className="grid h-7 w-7 place-items-center rounded-md disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="text-[12.5px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {settings.scale}%
            </span>
            <button
              type="button"
              onClick={() => update({ scale: settings.scale + SCALE_STEP })}
              disabled={settings.scale >= MAX_SCALE}
              aria-label="Increase interface scale"
              className="grid h-7 w-7 place-items-center rounded-md disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Width
          </div>
          <div className="flex gap-1.5">
            {WIDTHS.map((w) => {
              const active = ready && settings.width === w;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => update({ width: w })}
                  aria-pressed={active}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-all"
                  style={pillStyle(active)}
                >
                  {active && <Check className="h-3 w-3" />}
                  {WIDTH_LABELS[w].label}
                </button>
              );
            })}
          </div>

          {/*
            Deliberately a reset rather than a link to the settings page: this
            menu carries every setting already, and the settings page lives
            behind the console sign-in, which a staff account with only admin
            access cannot pass. A link that dead-ends for some of its users is
            worse than no link.
          */}
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all hover:brightness-105"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-secondary)",
            }}
          >
            <RotateCcw className="h-3 w-3" /> Reset to defaults
          </button>        </div>
      )}
    </div>
  );
}
