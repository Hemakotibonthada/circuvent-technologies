"use client";

// Notifications tab:
// • Browser push-notification enrolment driven by the REAL Notification.permission
//   value from useConsole() and the real enableNotifications() flow.
// • Per-severity and per-kind delivery preferences stored via usePersistentState
//   and labelled as browser-local with a Callout.
// • A real test notification that exercises the same Notification() constructor
//   the ConsoleProvider uses for foreground alerts.

import { Bell, BellOff, Check, Send } from "lucide-react";
import { useConsole } from "../ConsoleProvider";
import {
  Button,
  Callout,
  SectionTitle,
  Surface,
  SwitchRow,
  usePersistentState,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";
import { useWebPush } from "@/lib/useWebPush";
import {
  DEFAULT_NOTIFY_PREFS,
  NOTIFY_PREFS_KEY,
  type NotifyPrefs,
} from "./prefs";

export default function NotificationsPanel() {
  const { notifyPermission, enableNotifications } = useConsole();
  const push = useWebPush();
  const toast = useToast();
  const [prefs, setPrefs] = usePersistentState<NotifyPrefs>(
    NOTIFY_PREFS_KEY,
    DEFAULT_NOTIFY_PREFS,
  );

  const setField =
    (key: keyof NotifyPrefs) =>
    (v: boolean) =>
      setPrefs((p) => ({ ...p, [key]: v }));

  const handleEnable = async () => {
    await enableNotifications();
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      toast.ok("Notifications enabled", "This browser will now receive device alerts.");
    }
  };

  const sendTest = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      toast.err("Permission not granted", "Enable notifications first.");
      return;
    }
    try {
      new Notification("Circuvent — test notification", {
        body: "Your browser notification setup is working correctly.",
        icon: "/logo-mark.png",
      });
      toast.ok("Test notification sent");
    } catch {
      // Some browsers (Firefox in private) require a service worker; report it.
      toast.err("Could not send notification", "Your browser may require a service worker.");
    }
  };

  return (
    <div className="space-y-6 pt-1">
      {/* ── Push subscription ─────────────────────────── */}
      <SectionTitle>Notifications to this browser</SectionTitle>
      <Surface>
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: push.state === "enabled" ? "var(--cv-gradient)" : "var(--cv-input-bg)",
              color: push.state === "enabled" ? "#fff" : "var(--cv-muted)",
            }}
          >
            {push.state === "enabled" ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              {push.state === "enabled" ? "On for this browser" : "Off"}
            </div>
            {/*
              Every state has its own sentence. "Cannot", "blocked", "not
              configured" and "not yet enabled" all look like off, and mean
              completely different things — one of them the user can fix, one
              only their browser settings can, and one only the deployment can.
            */}
            <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
              {push.message}
            </div>
          </div>
          {(push.state === "idle" || push.state === "error") && (
            <Button onClick={() => void push.enable()}>Turn on</Button>
          )}
          {push.state === "enabled" && (
            <Button variant="ghost" onClick={() => void push.disable()}>
              Turn off
            </Button>
          )}
        </div>
      </Surface>

      {/* ── Browser permission ────────────────────────── */}
      <SectionTitle>Browser permission</SectionTitle>
      <Surface>
        {notifyPermission === "granted" ? (
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "var(--cv-gradient)", color: "#fff" }}
            >
              <Bell className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                Permission granted
              </div>
              <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
                This browser may show notifications. Permission on its own does
                not deliver anything — the switch above is what registers it to
                actually receive them.
              </div>
            </div>
            <Check className="h-5 w-5 shrink-0" style={{ color: "#16a34a" }} />
          </div>
        ) : notifyPermission === "denied" ? (
          <div className="flex items-start gap-3">
            <BellOff className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cv-muted)" }} />
            <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
              Notifications are blocked in this browser. Go to{" "}
              <strong style={{ color: "var(--cv-text)" }}>
                browser settings → Site permissions
              </strong>{" "}
              to re-enable them for this site.
            </div>
          </div>
        ) : notifyPermission === "unsupported" ? (
          <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
            This browser does not support the Notifications API.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm" style={{ color: "var(--cv-text)" }}>
              Grant permission to receive real-time browser notifications for device events, security
              triggers and automations — even when this tab is in the background.
            </div>
            <Button variant="primary" icon={Bell} onClick={handleEnable}>
              Request permission
            </Button>
          </div>
        )}
      </Surface>

      {/* Only show test button when permission is granted */}
      {notifyPermission === "granted" && (
        <Button variant="secondary" icon={Send} onClick={sendTest}>
          Send test notification
        </Button>
      )}

      {/* ── Delivery preferences ──────────────────────── */}
      <SectionTitle>Delivery preferences</SectionTitle>
      <Callout tone="info">
        These preferences are stored in this browser only and are not synced to the control plane.
        The foreground alert logic in ConsoleProvider honours the same event kinds.
      </Callout>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <SwitchRow
            label="Critical alerts"
            hint="Dry-run detections, overflow events, and SOS triggers — life-safety priority."
            checked={prefs.criticalAlerts}
            onChange={setField("criticalAlerts")}
          />
          <SwitchRow
            label="Warning alerts"
            hint="Unusual sensor readings and threshold crossings."
            checked={prefs.warningAlerts}
            onChange={setField("warningAlerts")}
          />
          <SwitchRow
            label="Security events"
            hint="Gate access, motion detection, and arming changes."
            checked={prefs.securityEvents}
            onChange={setField("securityEvents")}
          />
          <SwitchRow
            label="Device offline"
            hint="Notification when a paired device loses its connection."
            checked={prefs.deviceOffline}
            onChange={setField("deviceOffline")}
          />
          <SwitchRow
            label="Automation events"
            hint="Trigger confirmations and action failures from automation rules."
            checked={prefs.automationEvents}
            onChange={setField("automationEvents")}
          />
          <SwitchRow
            label="Success / completion"
            hint="Scene activations and command acknowledgements."
            checked={prefs.successEvents}
            onChange={setField("successEvents")}
          />
        </div>
      </Surface>

      {/* ── Integration note ──────────────────────────── */}
      <SectionTitle>Voice assistant integrations</SectionTitle>
      <Callout tone="info">
        Alexa and Google Home integrations have no server endpoint in the current control-plane
        release. Connection status cannot be determined and is not shown here.
      </Callout>
    </div>
  );
}
