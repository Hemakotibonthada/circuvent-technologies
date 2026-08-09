"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * A slider you can drag, for values that reach real hardware.
 *
 * The dimmer used a bare <input type="range"> wired straight to send(). Every
 * pixel of a drag fires onChange, so dragging a light from 0 to 100 published
 * around a hundred MQTT commands in under a second -- to an ESP32 that parses
 * each one, writes it to NVS and re-renders its own state. The light stutters,
 * the queue backs up, and the value that finally sticks is whichever message
 * arrived last, not the one you let go on.
 *
 * Fan speed was worse: it was not draggable at all, just a row of numbered
 * buttons.
 *
 * So: track the drag locally, show it immediately, and only send when the
 * gesture settles. `commitMs` covers the case where someone drags and holds
 * without releasing -- the light should follow, just not a hundred times.
 */

export interface SliderProps {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown inside the thumb's tooltip and after the value. */
  unit?: string;
  label: string;
  disabled?: boolean;
  /** Marks drawn on the track, e.g. fan speeds. */
  ticks?: number[];
  /** Labels for tick positions, keyed by value. */
  tickLabels?: Record<number, string>;
  /** How long a drag must pause before the value is sent. */
  commitMs?: number;
  className?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Slider({
  value,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  label,
  disabled = false,
  ticks,
  tickLabels,
  commitMs = 180,
  className = "",
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(value);

  /*
   * While the user is dragging, their finger wins. The moment they stop, the
   * device's own reported value takes over again -- otherwise a slider that
   * was dragged once would ignore the light being turned off from a wall
   * switch, or from another phone.
   */
  useEffect(() => {
    if (!dragging) setLocal(value);
  }, [value, dragging]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const send = useCallback(
    (v: number) => {
      // A non-finite value must never reach a device. It arrives more easily
      // than it looks: an environment without PointerEvent gives clientX as
      // undefined, which turns the whole calculation into NaN and would
      // publish {brightness: null} to an ESP32.
      if (!Number.isFinite(v)) return;
      if (v === lastSent.current) return;
      lastSent.current = v;
      onCommit(v);
    },
    [onCommit]
  );

  const scheduleCommit = useCallback(
    (v: number) => {
      if (!Number.isFinite(v)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => send(v), commitMs);
    },
    [send, commitMs]
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !Number.isFinite(clientX)) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      const ratio = clamp((clientX - r.left) / r.width, 0, 1);
      const raw = min + ratio * (max - min);
      return clamp(Math.round(raw / step) * step, min, max);
    },
    [min, max, step]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const v = valueFromClientX(e.clientX);
    if (v === null) return;
    setLocal(v);
    scheduleCommit(v);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || disabled) return;
    const v = valueFromClientX(e.clientX);
    if (v === null) return;
    setLocal(v);
    scheduleCommit(v);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDragging(false);
    // Send the value the gesture actually ended on, immediately -- waiting out
    // the debounce here is the difference between "responsive" and "laggy".
    if (timer.current) clearTimeout(timer.current);
    send(local);
  };

  /*
   * Keyboard support, which the button row never had. A dimmer that can only
   * be set with a pointer is a dimmer some people cannot set at all.
   */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const big = Math.max(step, Math.round((max - min) / 10));
    const map: Record<string, number> = {
      ArrowRight: step, ArrowUp: step,
      ArrowLeft: -step, ArrowDown: -step,
      PageUp: big, PageDown: -big,
    };
    let next: number | null = null;
    if (e.key in map) next = clamp(local + map[e.key], min, max);
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === null) return;
    e.preventDefault();
    setLocal(next);
    send(next);
  };

  const pct = ((local - min) / Math.max(max - min, 1)) * 100;

  return (
    <div className={`w-full ${className}`}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={local}
        aria-valuetext={`${local}${unit}`}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // touch-none stops the browser treating a horizontal drag as a page
        // scroll, which made the slider almost unusable on a phone.
        className="relative flex min-h-[44px] w-full cursor-pointer touch-none select-none items-center focus:outline-none focus-visible:ring-2"
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        <div ref={trackRef} className="relative h-2 w-full rounded-full" style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: "var(--cv-gradient)" }} />

          {ticks?.map((t) => {
            const tp = ((t - min) / Math.max(max - min, 1)) * 100;
            return (
              <span
                key={t}
                aria-hidden
                className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded"
                style={{ left: `${tp}%`, background: "var(--cv-border)" }}
              />
            );
          })}

          <div
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform"
            style={{
              left: `${pct}%`,
              background: "#fff",
              boxShadow: "var(--cv-shadow-1)",
              transform: `translate(-50%, -50%) scale(${dragging ? 1.15 : 1})`,
            }}
          />
        </div>
      </div>

      {tickLabels && ticks ? (
        <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--cv-muted)" }}>
          {ticks.map((t) => (
            <span key={t}>{tickLabels[t] ?? t}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
