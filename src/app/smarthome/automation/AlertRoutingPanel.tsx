"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, FlaskConical } from "lucide-react";
import { useEvents } from "../_data/hooks";
import { useToast } from "../_kit/overlays";
import {
  Button,
  Callout,
  ErrorState,
  Field,
  LoadingState,
  SectionTitle,
  SEVERITY,
  SEVERITY_ICON,
  SeverityBadge,
  SwitchRow,
  TextInput,
  type Severity,
} from "../_kit/primitives";
import { usePersistentState } from "../_kit/primitives";

/* ------------------------------------------------------------------ */
/* Locally-stored preferences shape                                    */
/* ------------------------------------------------------------------ */

interface AlertPrefs {
  /** Which severity levels trigger a browser notification */
  notifyOn: Record<Severity, boolean>;
  /** Quiet hours: notifications are suppressed in this window */
  quietStart: string;
  quietEnd: string;
  quietEnabled: boolean;
}

const DEFAULT_PREFS: AlertPrefs = {
  notifyOn: { critical: true, warning: true, info: false, ok: false },
  quietStart: "22:00",
  quietEnd: "07:00",
  quietEnabled: false,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Returns true if NOW falls inside a quiet-hours window (handles midnight wrap). */
function isQuietNow(start: string, end: string): boolean {
  const toMins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : -1;
  };
  const s = toMins(start);
  const e = toMins(end);
  if (s < 0 || e < 0) return false;
  const now = new Date();
  const n = now.getHours() * 60 + now.getMinutes();
  return s < e ? n >= s && n < e : n >= s || n < e;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

const SEVERITIES: Severity[] = ["critical", "warning", "info", "ok"];

export default function AlertRoutingPanel() {
  const { events, loading, error, refresh } = useEvents(50);
  const toast = useToast();

  const [prefs, setPrefs, prefsLoaded] = usePersistentState<AlertPrefs>(
    "cv-alert-routing-prefs",
    DEFAULT_PREFS,
  );

  const [permState, setPermState] = useState<NotificationPermission | "unsupported">("default");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermState("unsupported");
      return;
    }
    setPermState(Notification.permission);
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setPermState(perm);
    if (perm === "granted") toast.ok("Browser notifications enabled");
    else toast.err("Notification permission denied", "Allow notifications in your browser settings.");
  };

  const toggleSeverity = (sev: Severity) => {
    setPrefs((p) => ({
      ...p,
      notifyOn: { ...p.notifyOn, [sev]: !p.notifyOn[sev] },
    }));
  };

  const handleTest = async (sev: Severity) => {
    if (permState !== "granted") {
      toast.err("Grant notification permission first");
      return;
    }
    if (prefs.quietEnabled && isQuietNow(prefs.quietStart, prefs.quietEnd)) {
      toast.info("Quiet hours active — test suppressed");
      return;
    }
    setTesting(true);
    try {
      new Notification(`Test — ${SEVERITY[sev].label}`, {
        body: `This is a test ${SEVERITY[sev].label.toLowerCase()} notification from Circuvent.`,
        icon: "/favicon.ico",
      });
      toast.ok("Test notification sent");
    } catch {
      toast.err("Could not send test notification");
    }
    setTesting(false);
  };

  if (!prefsLoaded) return <LoadingState label="Loading preferences" />;

  return (
    <div className="space-y-6">
      {/* ---- Local storage callout ---- */}
      <Callout tone="info" title="Stored locally in this browser">
        Alert routing preferences and quiet hours are saved in <strong>this browser only</strong>.
        They are not synced to the server or to other devices. The server delivers events; this
        page controls whether your browser fires a desktop notification for each one.
      </Callout>

      {/* ---- Browser permission banner ---- */}
      {permState === "unsupported" && (
        <Callout tone="warning" title="Notifications not supported">
          Your browser does not support the Web Notification API. Alert routing preferences will
          still be saved, but no browser notifications can be sent.
        </Callout>
      )}

      {permState === "denied" && (
        <Callout tone="critical" title="Notifications blocked">
          You have blocked notifications from this site. Open your browser settings and allow
          notifications for this origin, then reload the page.
        </Callout>
      )}

      {permState === "default" && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
          style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
        >
          <div>
            <div className="font-semibold" style={{ color: "var(--cv-text)" }}>
              Enable browser notifications
            </div>
            <div className="mt-0.5 text-sm" style={{ color: "var(--cv-muted)" }}>
              Required to receive desktop alerts when this tab is open.
            </div>
          </div>
          <Button variant="primary" icon={Bell} onClick={requestPermission}>
            Allow notifications
          </Button>
        </div>
      )}

      {permState === "granted" && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: SEVERITY.ok.dim, border: `1px solid ${SEVERITY.ok.fg}33` }}
        >
          <Bell className="h-4 w-4 shrink-0" style={{ color: SEVERITY.ok.fg }} />
          <span style={{ color: "var(--cv-text)" }}>
            Browser notifications are <strong>allowed</strong> for this site.
          </span>
        </div>
      )}

      {/* ---- Per-severity toggles ---- */}
      <SectionTitle>Notify me when an event arrives with severity…</SectionTitle>
      <div
        className="cv-card divide-y rounded-2xl"
        style={{ borderColor: "var(--cv-border)" }}
      >
        {SEVERITIES.map((sev) => {
          const Icon = SEVERITY_ICON[sev];
          const meta = SEVERITY[sev];
          return (
            <div
              key={sev}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: meta.dim }}
                >
                  <Icon className="h-4 w-4" style={{ color: meta.fg }} />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: "var(--cv-text)" }}>
                    {meta.label}
                  </div>
                  <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
                    {sev === "critical" && "Immediate safety or system alerts"}
                    {sev === "warning" && "Abnormal conditions that need attention"}
                    {sev === "info" && "Routine activity and state changes"}
                    {sev === "ok" && "Successful operations and healthy signals"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  icon={FlaskConical}
                  busy={testing}
                  onClick={() => handleTest(sev)}
                  title={`Send a test ${meta.label} notification`}
                  disabled={permState !== "granted"}
                >
                  Test
                </Button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.notifyOn[sev]}
                  aria-label={`Notify on ${meta.label} events`}
                  onClick={() => toggleSeverity(sev)}
                  className="relative h-7 w-12 shrink-0 rounded-full transition"
                  style={{
                    background: prefs.notifyOn[sev] ? "var(--cv-gradient)" : "var(--cv-input-bg)",
                    border: "1px solid var(--cv-border)",
                  }}
                >
                  <span
                    className="absolute top-1/2 block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{
                      left: 3,
                      marginTop: -10,
                      transform: `translateX(${prefs.notifyOn[sev] ? 20 : 0}px)`,
                    }}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Quiet hours ---- */}
      <SectionTitle>Quiet hours</SectionTitle>
      <div
        className="cv-card rounded-2xl p-4"
        style={{ border: "1px solid var(--cv-border)" }}
      >
        <SwitchRow
          label="Enable quiet hours"
          hint="No browser notifications will be sent in this time window"
          checked={prefs.quietEnabled}
          onChange={(v) => setPrefs((p) => ({ ...p, quietEnabled: v }))}
        />

        {prefs.quietEnabled && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Quiet from">
              <TextInput
                type="time"
                value={prefs.quietStart}
                onChange={(v) => setPrefs((p) => ({ ...p, quietStart: v }))}
              />
            </Field>
            <Field label="Until">
              <TextInput
                type="time"
                value={prefs.quietEnd}
                onChange={(v) => setPrefs((p) => ({ ...p, quietEnd: v }))}
              />
            </Field>
          </div>
        )}

        {prefs.quietEnabled && (
          <div
            className="mt-3 rounded-xl px-3 py-2 text-xs"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
          >
            {isQuietNow(prefs.quietStart, prefs.quietEnd) ? (
              <span style={{ color: SEVERITY.warning.fg }}>
                🔕 Quiet hours are <strong>active right now</strong>. Notifications suppressed
                until {prefs.quietEnd}.
              </span>
            ) : (
              <span>
                🔔 Quiet hours are <strong>inactive</strong> right now. They will activate at{" "}
                {prefs.quietStart}.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ---- Recent events summary ---- */}
      <SectionTitle right={<span style={{ color: "var(--cv-muted)", fontSize: 11 }}>last 50</span>}>
        Recent events (read-only)
      </SectionTitle>

      {loading && <LoadingState label="Loading events" />}
      {error && <ErrorState message={error} onRetry={refresh} />}

      {!loading && !error && events.length === 0 && (
        <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
          No events yet.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="space-y-2">
          {events.slice(0, 20).map((ev) => {
            const sev = ev.kind === "alert" ? "critical" : ev.kind === "security" ? "warning" : ev.kind === "success" ? "ok" : "info";
            return (
              <div
                key={ev.id}
                className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{
                  background: "var(--cv-card-hi)",
                  border: `1px solid var(--cv-border)`,
                  opacity: ev.read ? 0.7 : 1,
                }}
              >
                <SeverityBadge severity={sev as Severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                    {ev.title}
                  </div>
                  {ev.body && (
                    <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
                      {ev.body}
                    </div>
                  )}
                  <div className="mt-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                    {new Date(ev.ts).toLocaleString()}
                  </div>
                </div>
                {!prefs.notifyOn[sev as Severity] && (
                  <BellOff
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: "var(--cv-muted)" }}
                    aria-label="Notifications off for this severity"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
