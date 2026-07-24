"use client";

import { Minus, Plus } from "lucide-react";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] ${className}`}>{children}</div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 mt-6 mb-3">
      {children}
    </div>
  );
}

/** Accessible on/off switch (keyboard + ARIA). */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50"
      style={{ background: checked ? "linear-gradient(135deg,#06b6d4,#8b5cf6)" : "#334155" }}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition"
        style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
      />
    </button>
  );
}

export function ControlRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3.5 mb-2.5">
      <div>
        <div className="text-slate-100 text-[15px] font-medium">{label}</div>
        {hint && <div className="text-slate-500 text-xs mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10"
        aria-label="decrease"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-white font-semibold tabular-nums w-14 text-center">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10"
        aria-label="increase"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
              active ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            style={active ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-center">
      <div className="text-2xl font-extrabold" style={{ color: accent ?? "#fff" }}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500 mt-1">{label}</div>
    </div>
  );
}

export function ScenePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm capitalize border transition ${
        active ? "text-white border-transparent" : "text-slate-300 border-white/10 bg-black/20 hover:bg-white/5"
      }`}
      style={active ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" } : undefined}
    >
      {label}
    </button>
  );
}
