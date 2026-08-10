import { useCallback, useEffect, useRef } from "react";

/**
 * Rate-limits a send while keeping the last value.
 *
 * Dragging a slider or a colour pointer produces an event per frame. Firing a
 * command per event floods a device that answers over MQTT: it falls behind and
 * then works through the backlog, so the light carries on changing for a second
 * after your finger stops. Sending only every Nth millisecond and dropping the
 * rest fixes the flood but loses the final position, which is the one that
 * matters — you let go on the colour you wanted.
 *
 * So: leading edge fires immediately (the control feels attached to the
 * finger), intermediate calls are dropped, and the most recent dropped value is
 * flushed when the window closes. The last thing you touched is always the last
 * thing sent.
 */
export function useThrottled<T>(fn: (v: T) => void, ms = 100): (v: T) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const last = useRef(0);
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A timer that outlives the screen would call into an unmounted component. */
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(
    (v: T) => {
      const now = Date.now();
      const wait = ms - (now - last.current);

      if (wait <= 0) {
        last.current = now;
        pending.current = null;
        fnRef.current(v);
        return;
      }

      /*
       * Held, not dropped. Without this the final position of a drag is
       * whatever happened to land on a window boundary, so releasing on a
       * colour would leave the light on a slightly different one.
       */
      pending.current = { v };
      if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          const held = pending.current;
          pending.current = null;
          if (held) {
            last.current = Date.now();
            fnRef.current(held.v);
          }
        }, wait);
      }
    },
    [ms]
  );
}
