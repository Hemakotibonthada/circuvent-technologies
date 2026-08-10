"use client";

/**
 * Safety — the flight envelope, alerting, and the daily report.
 *
 * WHY THESE LIMITS EXIST HERE WHEN THE AIRCRAFT ALSO HOLDS THEM
 *
 * The copy on the aircraft is the one that matters, because it is the one that
 * still works when this server is unreachable. This copy exists because it is
 * the one that can be changed for a whole fleet at once, and because it knows
 * things the airframe does not — which account this is, and what that account
 * is allowed to do.
 *
 * Both copies are deliberate. A limit that lives only on the aircraft cannot
 * be managed; a limit that lives only here cannot be enforced.
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, Send, ShieldCheck } from "lucide-react";
import { controlPlane, type DroneSettings } from "@/lib/control-plane";
import {
  Button, Callout, ErrorState, Field, LoadingState, NumberInput, SectionTitle,
  SelectInput, Surface, SwitchRow, TextInput,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00 IST`,
}));

export function SafetyPanel() {
  const toast = useToast();
  const [settings, setSettings] = useState<DroneSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    void controlPlane.droneSettings().then((r) => {
      if (r.ok) {
        setSettings(r.data.settings);
        setError(null);
      } else {
        setError((r.data as { error?: string })?.error || "Could not load settings.");
      }
    });
  }, []);

  useEffect(load, [load]);

  const save = useCallback(
    async (patch: Partial<DroneSettings>) => {
      if (!settings) return;
      setSettings({ ...settings, ...patch });
      setSaving(true);
      try {
        const r = await controlPlane.saveDroneSettings(patch);
        // The server clamps, so the value that comes back may differ from the
        // one that went out. Showing the request rather than the response
        // would leave the form claiming a limit that is not in force.
        if (r.ok) setSettings(r.data.settings);
        else {
          toast.err((r.data as { error?: string })?.error || "Could not save.");
          load();
        }
      } finally {
        setSaving(false);
      }
    },
    [settings, load, toast]
  );

  const sendTest = useCallback(async () => {
    setSending(true);
    try {
      const r = await controlPlane.sendTestFlightReport();
      if (r.ok) toast.ok(r.data.sentTo ? `Report sent to ${r.data.sentTo}` : "Report sent");
      else toast.err((r.data as { error?: string })?.error || "Could not send the report.");
    } finally {
      setSending(false);
    }
  }, [toast]);

  if (error && !settings) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <LoadingState label="Loading settings" />;

  return (
    <div className="space-y-5">
      <Surface>
        <SectionTitle>Flight envelope</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <Field
            label="Altitude ceiling"
            hint="metres above the launch point"
          >
            <NumberInput
              value={settings.maxAltM}
              onChange={(v) => void save({ maxAltM: v })}
              min={5}
              max={500}
              step={5}
              disabled={saving}
            />
          </Field>
          <Field label="Range from home" hint="metres">
            <NumberInput
              value={settings.maxRangeM}
              onChange={(v) => void save({ maxRangeM: v })}
              min={10}
              max={20000}
              step={50}
              disabled={saving}
            />
          </Field>
          <Field label="Minimum battery to arm" hint="percent">
            <NumberInput
              value={settings.minBattPct}
              onChange={(v) => void save({ minBattPct: v })}
              min={0}
              max={90}
              step={5}
              disabled={saving}
            />
          </Field>
        </div>

        {/*
          * 120 m is the legal ceiling in most of the world — DGCA, EASA and
          * Part 107 all land on 120 m / 400 ft. Saying so is worth more than
          * a silent default, because an operator who raises it should know
          * what they are raising it past.
          */}
        {settings.maxAltM > 120 && (
          <Callout tone="warning" title="Above the usual legal ceiling">
            120 m (400 ft) is the limit for uncontrolled airspace under DGCA, EASA and FAA Part 107
            rules alike. Flying above it generally needs a specific permission.
          </Callout>
        )}

        <p className="mt-3 text-xs opacity-60">
          These are enforced twice. The aircraft holds its own copy and refuses commands that
          breach it even with no network; this copy is what the console checks before a command is
          relayed, and what a saved mission is validated against.
        </p>
      </Surface>

      <Surface>
        <SectionTitle>Operator</SectionTitle>
        <div className="mt-3">
          <Field
            label="Operator identification"
            hint="Printed on the aircraft and carried in the flight report. Required above toy weight in most jurisdictions."
          >
            <TextInput
              value={settings.operatorId ?? ""}
              onChange={(v) => void save({ operatorId: v || null })}
              placeholder="UAOP-XXXXXXX"
            />
          </Field>
        </div>
      </Surface>

      <Surface>
        <SectionTitle>Alerts</SectionTitle>
        <div className="mt-2 space-y-1">
          <SwitchRow
            label="Autopilot failsafe"
            hint="The aircraft entered a failsafe — lost radio, lost GPS, or critically low battery."
            checked={settings.alertFailsafe}
            onChange={(v) => void save({ alertFailsafe: v })}
          />
          <SwitchRow
            label="Left the flight area"
            hint="The aircraft went beyond the range or altitude set above."
            checked={settings.alertFence}
            onChange={(v) => void save({ alertFence: v })}
          />
          <SwitchRow
            label="Battery low in flight"
            hint="Sent once per flight, not once per second — a warning that repeats gets muted."
            checked={settings.alertLowBatt}
            onChange={(v) => void save({ alertLowBatt: v })}
          />
        </div>
      </Surface>

      <Surface>
        <SectionTitle>Daily flight report</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Send to"
            hint="Leave empty for no report. This is often not the account holder — a chief pilot, an operations inbox."
          >
            <TextInput
              value={settings.reportEmail ?? ""}
              onChange={(v) => void save({ reportEmail: v || null })}
              placeholder="operations@example.com"
              type="email"
            />
          </Field>
          <Field label="Send at">
            <SelectInput
              value={String(settings.reportHour)}
              onChange={(v) => void save({ reportHour: Number(v) })}
              options={HOURS}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            icon={Send}
            onClick={() => void sendTest()}
            disabled={!settings.reportEmail || sending}
            busy={sending}
          >
            Send one now
          </Button>
          <span className="text-xs opacity-60">
            <Mail className="mr-1 inline h-3 w-3" />
            Sent from info@circuvent.com
          </span>
        </div>

        <p className="mt-3 text-xs opacity-60">
          <ShieldCheck className="mr-1 inline h-3 w-3" />
          The report covers the previous full day and leads with anything that needs review —
          failsafes, flights that ended without a landing, and packs due for retirement — rather
          than with the totals.
        </p>
      </Surface>
    </div>
  );
}
