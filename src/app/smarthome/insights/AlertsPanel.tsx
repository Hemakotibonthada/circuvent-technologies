"use client";

/**
 * The alerts panel.
 *
 * What this screen has to get right is the difference between three states
 * that all look like "nothing here" if you are careless: no alerts because
 * everything is healthy, no alerts because the sweep has not run, and no
 * alerts because the control plane is unreachable and what you are looking at
 * is old. Each says something different and each is spelled out.
 */
import { useMemo } from "react";
import { AlertTriangle, Bell, BellOff, Check, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useAlerts } from "../_kit/useAlerts";
import { alertAgeMs, type Alert } from "@/lib/anomaly-monitor";
import { useConsoleTheme } from "../theme";
import { Button, SEVERITY } from "../_kit/primitives";

function relative(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function AlertRow({ a, onAck }: { a: Alert; onAck: (fp: string) => void }) {
  const { cardClass } = useConsoleTheme();
  const sev = SEVERITY[a.severity] ?? SEVERITY.info;
  const resolved = a.state === "resolved";
  const acked = a.state === "acknowledged";

  return (
    <li className={`${cardClass} p-4`} style={{ opacity: resolved ? 0.55 : 1 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: sev.dim, color: sev.fg }}
            >
              {resolved ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {resolved ? "Resolved" : a.severity}
            </span>
            <p className="truncate text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {a.title}
            </p>
            {acked && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                <BellOff className="h-3 w-3" /> acknowledged
              </span>
            )}
          </div>

          <p className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
            {a.detail}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--cv-muted)" }}>
            <span>
              {resolved ? "Lasted" : "Ongoing"} {relative(alertAgeMs(a))}
            </span>
            {/* Occurrences separate a stuck problem from a flapping one, which
                is the difference between "replace it" and "watch it". */}
            {a.occurrences > 1 && <span>seen {a.occurrences}×</span>}
            {a.deviceIds.length > 0 && <span className="font-mono">{a.deviceIds.join(", ")}</span>}
          </div>

          {a.suggestion && !resolved && (
            <p className="mt-2 text-[13px]" style={{ color: "var(--cv-text)" }}>
              {a.suggestion}
            </p>
          )}
        </div>

        {a.state === "open" && (
          <Button variant="ghost" onClick={() => onAck(a.fingerprint)} title="Stop reminding me about this">
            Acknowledge
          </Button>
        )}
      </div>
    </li>
  );
}

export function AlertsPanel({ compact = false }: { compact?: boolean }) {
  const { alerts, summary, loading, error, lastSweepAt, stale, refresh, acknowledge } = useAlerts();
  const { cardClass } = useConsoleTheme();

  const shown = useMemo(() => (compact ? alerts.filter((a) => a.state !== "resolved").slice(0, 3) : alerts), [alerts, compact]);
  const openCount = summary?.open ?? alerts.filter((a) => a.state === "open").length;

  if (loading && alerts.length === 0) {
    return (
      <div className={`${cardClass} p-6`}>
        <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
          Checking your devices…
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Anomaly alerts">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" style={{ color: "var(--cv-muted)" }} />
          <h2 className="text-[17px] font-bold" style={{ color: "var(--cv-text)" }}>
            Alerts
          </h2>
          {openCount > 0 && (
            <span
              className="cv-num rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: SEVERITY.critical.dim, color: SEVERITY.critical.fg }}
            >
              {openCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastSweepAt && (
            <span className="text-[12px]" style={{ color: "var(--cv-muted)" }}>
              checked {relative(Date.now() - new Date(lastSweepAt).getTime())} ago
            </span>
          )}
          <Button variant="ghost" icon={RefreshCw} onClick={refresh} title="Check now">
            Check now
          </Button>
        </div>
      </header>

      {/* Unreachable is not the same as healthy. If the sweep failed, say so
          above whatever is being shown, because those alerts are now old. */}
      {stale && error && (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl p-3 text-[13px]"
          style={{ background: SEVERITY.warning.dim, color: SEVERITY.warning.fg }}
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error} These alerts may be out of date.</span>
        </div>
      )}

      {!stale && error && (
        <p className="mb-3 text-[13px]" style={{ color: "var(--cv-muted)" }}>
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <div className={`${cardClass} flex items-center gap-3 p-6`}>
          <ShieldCheck className="h-5 w-5" style={{ color: "var(--cv-accent)" }} />
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {stale ? "Nothing known to be wrong" : "Nothing wrong right now"}
            </p>
            <p className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
              {stale
                ? "The last check could not reach your devices."
                : "Every device is reporting, and nothing is drawing power it should not."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((a) => (
            <AlertRow key={a.fingerprint} a={a} onAck={acknowledge} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default AlertsPanel;
