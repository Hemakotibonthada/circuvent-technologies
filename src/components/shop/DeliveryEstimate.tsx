"use client";

/**
 * Delivery estimate — the line that sits under the price.
 *
 * On every large Indian store this is directly above the buy button, because
 * it answers the question that actually blocks a purchase: not "how much" but
 * "when, and do you even come to my street".
 *
 * The PIN is remembered in localStorage. A buyer who has already told the shop
 * where they are should not be asked again on the next product — and asking
 * again is how a helpful feature becomes an obstacle repeated on every page.
 */

import { useCallback, useEffect, useState } from "react";
import { MapPin, Truck } from "lucide-react";
import {
  estimateDelivery,
  formatWindow,
  isValidPincode,
  normalisePincode,
  type DeliveryEstimate as Est,
} from "@/lib/delivery-estimate";

const KEY = "cv.shop.pincode";

export default function DeliveryEstimate({ compact = false }: { compact?: boolean }) {
  const [pin, setPin] = useState("");
  const [est, setEst] = useState<Est | null>(null);
  const [touched, setTouched] = useState(false);

  // Read on mount rather than during render: localStorage does not exist on
  // the server, and reading it in the initial state would make the server and
  // client markup disagree and blow away hydration.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved && isValidPincode(saved)) {
        setPin(saved);
        setEst(estimateDelivery(saved));
      }
    } catch {
      /* private mode, or storage disabled — the field simply starts empty */
    }
  }, []);

  const check = useCallback(
    (value: string) => {
      const p = normalisePincode(value);
      setPin(p);
      setTouched(true);
      if (!isValidPincode(p)) { setEst(null); return; }
      const e = estimateDelivery(p);
      setEst(e);
      try { window.localStorage.setItem(KEY, p); } catch { /* not essential */ }
    },
    []
  );

  const invalid = touched && pin.length > 0 && !isValidPincode(pin);

  return (
    <div className={compact ? "" : "mt-4"}>
      <label
        htmlFor="cv-pincode"
        className="flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: "var(--text-secondary)" }}
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        Delivery
      </label>

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          id="cv-pincode"
          value={pin}
          onChange={(e) => check(e.target.value)}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="PIN code"
          aria-invalid={invalid || undefined}
          aria-describedby="cv-pincode-result"
          className="min-h-[44px] w-[124px] rounded-xl border px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2"
          style={{
            background: "var(--bg-surface)",
            borderColor: invalid ? "var(--status-danger-text, #dc2626)" : "var(--border-primary)",
            color: "var(--text-primary)",
          }}
        />

        {/*
          * The result is a live region, so a screen reader hears the estimate
          * change as the sixth digit is typed. Without it the field silently
          * updates text elsewhere on the page and a non-sighted buyer gets
          * nothing at all.
          */}
        <p id="cv-pincode-result" aria-live="polite" className="text-[13px]">
          {invalid && (
            <span style={{ color: "var(--status-danger-text, #dc2626)" }}>
              Enter a 6-digit PIN code
            </span>
          )}

          {est?.ok && (
            <span style={{ color: "var(--text-secondary)" }}>
              <Truck className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatWindow(est)}
              </span>
              <span className="opacity-80"> to {est.zone}</span>
              {est.express && (
                <span className="ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan-text)" }}>
                  Next-day lane
                </span>
              )}
              {!est.cod && <span className="opacity-70"> · card or wallet only</span>}
            </span>
          )}
        </p>
      </div>

      {/*
        * Labelled an estimate, every time.
        *
        * There is no courier integration behind this. Quoting a confident date
        * from a table nobody maintains is worse than saying nothing: a missed
        * date that was promised precisely becomes a refund, whereas a range
        * that was labelled an estimate is just a delivery.
        */}
      {est?.ok && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Estimated, from dispatch in 24–48 h. Not a guaranteed date.
        </p>
      )}
    </div>
  );
}
