"use client";

/**
 * Says why a command did not happen, wherever it was sent from.
 *
 * Every failure used to look the same: the control snapped back and flashed
 * red. That was fine while the only cause was the broker being down. Once a
 * home can be shared it is not — somebody with view-only access tapping a lock
 * would watch it appear to open and then close, with nothing said, which is
 * the worst available reading of what actually happened.
 *
 * Mounted once in the console chrome and fed by a broadcast, rather than
 * threaded through the dozen surfaces that send commands. A per-surface banner
 * is a per-surface chance to forget one, and the forgotten one is a control
 * that silently does nothing.
 *
 * A refusal and a fault are worded differently on purpose. A fault invites a
 * retry; a refusal will never succeed on a second press.
 */

import { useEffect, useState } from "react";
import { Ban, TriangleAlert, X } from "lucide-react";
import { onCommandError, type CommandError } from "@/lib/smarthome-realtime";

/** How long it stays up. Long enough to read a sentence, not long enough to nag. */
const SHOW_MS = 7000;

export default function CommandRefusal() {
  const [shown, setShown] = useState<CommandError | null>(null);

  useEffect(() => onCommandError((e) => setShown(e)), []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(t);
    /* Keyed on the timestamp so two identical refusals in a row re-arm the
       timer — pressing a refused control twice and seeing the message vanish
       mid-read is worse than not showing it. */
  }, [shown?.at, shown]);

  if (!shown) return null;

  const refused = shown.refused;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-[13px] shadow-lg md:bottom-6"
      style={{
        background: "var(--cv-surface, #1a1a1f)",
        border: "1px solid var(--cv-border)",
      }}
    >
      {refused ? (
        <Ban className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{refused ? "That did not run" : "That did not work"}</div>
        <div style={{ color: "var(--cv-muted)" }}>{shown.message}</div>
      </div>
      <button
        onClick={() => setShown(null)}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-1"
        style={{ color: "var(--cv-muted)" }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
