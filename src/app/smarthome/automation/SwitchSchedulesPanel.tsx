"use client";

/**
 * Per-switch scheduling.
 *
 * The generic rule builder can target a device and then a field, but it reads
 * as "home-hub-3f2a: power2 → true", which is not how anyone thinks about the
 * geyser. This panel inverts that: you pick a *switch* by the name you gave
 * it, say when it should come on and when it should go off, and on which days.
 *
 * Under the hood a switch schedule is still an ordinary time automation, so it
 * shows up in Rules and runs on the same server scheduler — there is no second
 * execution path to keep in sync. An "on at 06:00, off at 09:00" schedule is
 * simply two automations that share a marker in their name.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lightbulb,
  Plus,
  Power,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { controlPlane, actionList } from "@/lib/control-plane";
import { buildFieldCommand } from "@/lib/smarthome-command-map";
import type { Automation, AutomationAction } from "@/lib/control-plane";
import {
  useSwitchIndex,
  daysText,
  nextRunLabel,
  istOffsetNote,
  istNow,
  WEEK_ORDER,
  WEEKDAY_LABELS,
  EVERY_DAY,
  type SwitchTarget,
} from "@/lib/smarthome-switches";
import { useAutomations, useFleet } from "../_data/hooks";
import { useToast, ConfirmDialog, Modal } from "../_kit/overlays";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SectionTitle,
  RelativeTime,
  SelectInput,
  SwitchRow,
  TextInput,
} from "../_kit/primitives";

/* ------------------------------------------------------------------ */
/* Encoding                                                            */
/* ------------------------------------------------------------------ */

/**
 * Marker embedded in the automation name so a switch schedule can be found
 * again after a round trip. The server stores no metadata column, and the
 * trigger/action shape alone cannot tell a hand-written rule from one this
 * panel created — without the marker, editing here would silently adopt and
 * rewrite rules the user built in the rule editor.
 */
const MARK = "⟨sw⟩";

/**
 * The single command step of a switch schedule.
 *
 * Switch timers are always authored as one command action, but the stored
 * shape may be either a bare action or a one-element array, so read through
 * the list form. A multi-step rule is not a switch timer and is left alone.
 */
function switchStep(a: Automation): AutomationAction | null {
  const steps = actionList(a.action);
  return steps.length === 1 ? steps[0] : null;
}

/** True when this automation is a single-switch time schedule we authored. */
function isSwitchSchedule(a: Automation): boolean {
  const step = switchStep(a);
  return (
    a.name.startsWith(MARK) &&
    a.trigger.type === "time" &&
    !!step &&
    step.type === "command" &&
    !!step.deviceId &&
    !!step.command
  );
}

/** The one boolean key a switch schedule commands, or null if malformed. */
function commandField(a: Automation): { field: string; on: boolean } | null {
  const step = switchStep(a);
  if (!step) return null;
  const entries = Object.entries(step.command ?? {}).filter(([k]) => k !== "action");
  if (entries.length !== 1) return null;
  const [field, value] = entries[0];
  if (typeof value !== "boolean") return null;
  return { field, on: value };
}

function scheduleName(label: string, on: boolean): string {
  return `${MARK} ${label} ${on ? "on" : "off"}`;
}

/** Pulls the server's message out of an error response body. */
function apiError(data: unknown): string {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  return "";
}

/** Groups the two halves of one switch schedule back together. */
interface SwitchSchedule {
  key: string;
  target: SwitchTarget | null;
  deviceId: string;
  field: string;
  onRule: Automation | null;
  offRule: Automation | null;
  days: number[];
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function SwitchSchedulesPanel() {
  const { automations, loading, error, refresh, setEnabled, remove } = useAutomations();
  const { devices } = useFleet();
  const index = useSwitchIndex(devices);
  const toast = useToast();

  const [editor, setEditor] = useState<SwitchSchedule | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SwitchSchedule | null>(null);
  const [busy, setBusy] = useState(false);

  const schedules = useMemo<SwitchSchedule[]>(() => {
    const byKey = new Map<string, SwitchSchedule>();
    for (const a of automations) {
      if (!isSwitchSchedule(a)) continue;
      const cmd = commandField(a);
      if (!cmd) continue;
      const deviceId = switchStep(a)!.deviceId!;
      const key = `${deviceId}::${cmd.field}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          key,
          target: index.byKey.get(key) ?? null,
          deviceId,
          field: cmd.field,
          onRule: null,
          offRule: null,
          days: a.trigger.days ?? [],
        };
        byKey.set(key, entry);
      }
      if (cmd.on) entry.onRule = a;
      else entry.offRule = a;
      // The on-rule owns the day filter; both halves are always written with
      // the same one, but prefer the on-rule if they ever diverge.
      if (cmd.on || !entry.onRule) entry.days = a.trigger.days ?? [];
    }
    return Array.from(byKey.values()).sort((x, y) => {
      const a = x.onRule?.trigger.at ?? x.offRule?.trigger.at ?? "99:99";
      const b = y.onRule?.trigger.at ?? y.offRule?.trigger.at ?? "99:99";
      return a.localeCompare(b);
    });
  }, [automations, index.byKey]);

  const tzNote = istOffsetNote();

  const handleToggle = async (s: SwitchSchedule) => {
    const next = !(s.onRule?.enabled ?? s.offRule?.enabled ?? false);
    const results = await Promise.all(
      [s.onRule, s.offRule].filter(Boolean).map((r) => setEnabled(r!.id, next))
    );
    if (results.some((ok) => !ok)) toast.err("Could not update the schedule");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const results = await Promise.all(
      [deleteTarget.onRule, deleteTarget.offRule].filter(Boolean).map((r) => remove(r!.id))
    );
    setBusy(false);
    setDeleteTarget(null);
    if (results.some((ok) => !ok)) toast.err("Could not delete the schedule");
    else toast.ok("Schedule deleted");
  };

  if (loading) return <LoadingState label="Loading switch schedules" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
          Schedule a single switch rather than a whole device — the porch light on at dusk, the
          geyser off at nine. Each switch keeps its own timing.
        </p>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setEditor("new")}
          disabled={index.switches.length === 0}
        >
          New switch schedule
        </Button>
      </div>

      {tzNote && <Callout tone="info">{tzNote} It is currently {istNow()} IST.</Callout>}

      {index.switches.length === 0 && (
        <EmptyState
          icon={ToggleLeft}
          title="No switchable outputs"
          body="Schedules here target individual relay channels. Add a switch, hub, or touchboard to this fleet and its channels will appear."
        />
      )}

      {index.switches.length > 0 && schedules.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No switch schedules yet"
          body="Pick one switch, choose when it turns on and when it turns off, and it will run every day you select."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditor("new")}>
              Create switch schedule
            </Button>
          }
        />
      )}

      {schedules.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {schedules.map((s) => (
              <ScheduleCard
                key={s.key}
                schedule={s}
                onToggle={() => handleToggle(s)}
                onEdit={() => setEditor(s)}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </div>

          <SectionTitle>Day coverage</SectionTitle>
          <DayCoverage schedules={schedules} />
        </>
      )}

      {editor !== null && (
        <SwitchScheduleEditor
          existing={editor === "new" ? null : editor}
          switches={index.switches}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete switch schedule"
        body={
          <>
            Stop scheduling <strong>{deleteTarget?.target?.label ?? deleteTarget?.field}</strong>?
            The switch keeps its current state; only the timer is removed.
          </>
        }
        confirmLabel="Delete schedule"
        danger
        busy={busy}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule card                                                       */
/* ------------------------------------------------------------------ */

function ScheduleCard({
  schedule,
  onToggle,
  onEdit,
  onDelete,
}: {
  schedule: SwitchSchedule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const enabled = schedule.onRule?.enabled ?? schedule.offRule?.enabled ?? false;
  const onAt = schedule.onRule?.trigger.at ?? null;
  const offAt = schedule.offRule?.trigger.at ?? null;
  const label = schedule.target?.label ?? schedule.field;
  const sub = schedule.target
    ? `${schedule.target.deviceName} · ${schedule.target.fallbackLabel}`
    : `${schedule.deviceId} · ${schedule.field}`;

  // A schedule whose switch is no longer in the fleet still exists on the
  // server and still fires; saying so is more useful than hiding it.
  const orphaned = schedule.target === null;

  return (
    <div
      className="cv-card rounded-2xl p-4"
      style={{ border: "1px solid var(--cv-border)", opacity: enabled ? 1 : 0.62 }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--cv-card-hi)" }}
        >
          <Lightbulb className="h-5 w-5" style={{ color: "var(--cv-accent-hi)" }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-bold" style={{ color: "var(--cv-text)" }}>
              {label}
            </span>
            {orphaned && <Badge tone="warning">Switch not found</Badge>}
            {!orphaned && schedule.target?.online === false && <Badge tone="neutral">Offline</Badge>}
          </div>
          <div className="truncate text-xs" style={{ color: "var(--cv-muted)" }}>
            {sub}
          </div>
        </div>

        <button
          onClick={onToggle}
          aria-label={enabled ? `Pause ${label} schedule` : `Resume ${label} schedule`}
          className="shrink-0 transition hover:brightness-125"
          style={{ color: enabled ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}
        >
          {enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TimeChip icon={Power} tone="on" at={onAt} days={schedule.days} label="On" />
        <TimeChip icon={Power} tone="off" at={offAt} days={schedule.days} label="Off" />
      </div>

      <RunRecord schedule={schedule} />

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--cv-muted)" }}>
          <Clock className="h-3.5 w-3.5" />
          {daysText(schedule.days)}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          <button
            onClick={onDelete}
            aria-label={`Delete ${label} schedule`}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-125"
            style={{ background: "var(--cv-card-hi)", color: "#ef4444", border: "1px solid var(--cv-border)" }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * What actually happened the last time this timer was due.
 *
 * WHY A TIMER NEEDS TO SHOW THIS
 *
 * A switch timer used to save correctly, display the right next-run time and
 * count down — while the relay never moved, because the stored command was a
 * shape the device discards before its sketch runs. Every screen in the
 * product showed a healthy schedule. There was no way, from the app, to tell
 * "fired and worked" from "never fired at all", and that is why the fault
 * survived so long.
 *
 * The three states are kept distinct on purpose:
 *   never run   — expected before the first due time, suspicious long after
 *   ran, failed — with the server's own reason, not a generic apology
 *   ran, fine   — the device was commanded; the relay is the device's business
 *
 * A control plane too old to report any of this says nothing rather than
 * claiming "never", which would be a confident wrong answer.
 */
function RunRecord({ schedule }: { schedule: SwitchSchedule }) {
  const rules = [schedule.onRule, schedule.offRule].filter(Boolean) as Automation[];
  if (!rules.length) return null;

  // Older control planes omit the field entirely. Absent is unknown.
  const reports = rules.some((r) => r.last_run_at !== undefined || r.run_count !== undefined);
  if (!reports) return null;

  const ran = rules
    .filter((r) => r.last_run_at)
    .sort((a, b) => new Date(b.last_run_at!).getTime() - new Date(a.last_run_at!).getTime());
  const latest = ran[0];
  const failed = rules.find((r) => r.last_run_ok === false && r.last_error);

  if (failed) {
    return (
      <p className="mt-2.5 flex items-start gap-1.5 text-xs" style={{ color: "#f59e0b" }}>
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Last run failed — {failed.last_error}
          {failed.last_run_at ? <> · <RelativeTime iso={failed.last_run_at} /></> : null}
        </span>
      </p>
    );
  }

  if (!latest) {
    return (
      <p className="mt-2.5 text-xs" style={{ color: "var(--cv-muted)" }}>
        Has not run yet — it will fire at the next time shown above.
      </p>
    );
  }

  const total = rules.reduce((n, r) => n + (r.run_count ?? 0), 0);
  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--cv-muted)" }}>
      <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
      <span>
        Last ran <RelativeTime iso={latest.last_run_at!} />
        {total > 0 ? ` · ${total.toLocaleString()} run${total === 1 ? "" : "s"}` : ""}
      </span>
    </p>
  );
}

function TimeChip({
  icon: Icon,
  tone,
  at,
  days,
  label,
}: {
  icon: typeof Power;
  tone: "on" | "off";
  at: string | null;
  days: number[];
  label: string;
}) {
  const accent = tone === "on" ? "#22c55e" : "#94a3b8";
  if (!at) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
        style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)", border: "1px dashed var(--cv-border)" }}
      >
        <Icon className="h-3.5 w-3.5" />
        No {label.toLowerCase()} time
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
      style={{
        background: `color-mix(in srgb, ${accent} 16%, transparent)`,
        color: accent,
        border: "1px solid var(--cv-border)",
      }}
      title={`${label} at ${at} IST — next ${nextRunLabel(at, days)}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label} {at}
      <span style={{ color: "var(--cv-muted)", fontWeight: 500 }}>{nextRunLabel(at, days)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Day coverage strip                                                  */
/* ------------------------------------------------------------------ */

function DayCoverage({ schedules }: { schedules: SwitchSchedule[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" aria-label="Which days each switch schedule runs">
        <thead>
          <tr>
            <th className="py-1.5 pr-3 text-left font-bold" style={{ color: "var(--cv-muted)" }}>
              Switch
            </th>
            {WEEK_ORDER.map((d) => (
              <th key={d} className="px-2 py-1.5 text-center font-bold" style={{ color: "var(--cv-muted)" }}>
                {WEEKDAY_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedules.map((s) => {
            const active = s.days.length === 0 ? new Set(EVERY_DAY) : new Set(s.days);
            const enabled = s.onRule?.enabled ?? s.offRule?.enabled ?? false;
            return (
              <tr key={s.key}>
                <td
                  className="max-w-[180px] truncate py-1.5 pr-3 font-semibold"
                  style={{ color: "var(--cv-text)" }}
                >
                  {s.target?.label ?? s.field}
                </td>
                {WEEK_ORDER.map((d) => (
                  <td key={d} className="px-1 py-1 text-center">
                    <span
                      className="inline-block h-5 w-full rounded-md"
                      style={{
                        background:
                          active.has(d) && enabled
                            ? "color-mix(in srgb, var(--cv-accent) 45%, transparent)"
                            : active.has(d)
                              ? "var(--cv-card-hi)"
                              : "transparent",
                        border: "1px solid var(--cv-border)",
                      }}
                      aria-label={active.has(d) ? "Runs" : "Does not run"}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

const PRESETS: { label: string; days: number[] }[] = [
  { label: "Every day", days: EVERY_DAY },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];

function SwitchScheduleEditor({
  existing,
  switches,
  onClose,
  onSaved,
}: {
  existing: SwitchSchedule | null;
  switches: SwitchTarget[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  // Shared cache keyed on "devices", so this is the same fetch the panel
  // already made. Needed here because the command shape depends on the device
  // type, and a schedule whose switch has left the fleet still has one.
  const { devices } = useFleet();

  const [switchKey, setSwitchKey] = useState(existing?.key ?? switches[0]?.key ?? "");
  const [useOn, setUseOn] = useState(existing ? existing.onRule !== null : true);
  const [useOff, setUseOff] = useState(existing ? existing.offRule !== null : true);
  const [onAt, setOnAt] = useState(existing?.onRule?.trigger.at ?? "06:00");
  const [offAt, setOffAt] = useState(existing?.offRule?.trigger.at ?? "22:00");
  const [days, setDays] = useState<number[]>(
    existing && existing.days.length ? existing.days : EVERY_DAY
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const target = switches.find((s) => s.key === switchKey) ?? null;

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const validate = (): string | null => {
    if (!target && !existing) return "Choose a switch to schedule.";
    if (!useOn && !useOff) return "Set at least one of the on or off times.";
    if (days.length === 0) return "Select at least one day.";
    if (useOn && !/^\d{2}:\d{2}$/.test(onAt)) return "The on time must be HH:MM.";
    if (useOff && !/^\d{2}:\d{2}$/.test(offAt)) return "The off time must be HH:MM.";
    if (useOn && useOff && onAt === offAt)
      return "The on and off times cannot be identical — the switch would end up in whichever order the server ran them.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bad = validate();
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    setBusy(true);

    // Resolve the switch identity. When editing a schedule whose switch has
    // left the fleet there is no SwitchTarget, but the stored ids are still
    // valid and must not be lost.
    const deviceId = target?.deviceId ?? existing?.deviceId;
    const field = target?.field ?? existing?.field;
    const label = target?.label ?? existing?.field ?? "Switch";
    if (!deviceId || !field) {
      setBusy(false);
      setProblem("That switch could not be resolved.");
      return;
    }

    /*
     * The device type decides the command shape, so it has to be known before
     * a rule can be written. When the switch has left the fleet the target is
     * gone, but the schedule still points at a real device — read the type off
     * the fleet by id rather than giving up.
     */
    const deviceType = target?.deviceType ?? devices.find((d) => d.id === deviceId)?.type ?? "";
    const commandFor = (on: boolean) => buildFieldCommand(deviceType, field, on);
    if (!commandFor(true)) {
      setBusy(false);
      // Refusing beats saving a rule that cannot fire. Timers that looked
      // perfect and never moved a relay are the reason this check exists.
      setProblem(
        deviceType
          ? `A ${deviceType} does not accept a scheduled change to “${field}”.`
          : "That switch's device is no longer in the fleet, so its type is unknown."
      );
      return;
    }

    // Seven selected days is the same as no filter; store the shorter form so
    // the row reads the way it behaves.
    const dayFilter = days.length === 7 ? undefined : days;

    const half = async (on: boolean, wanted: boolean, at: string, rule: Automation | null) => {
      if (!wanted) {
        if (rule) {
          const r = await controlPlane.deleteAutomation(rule.id);
          return { ok: r.ok, error: apiError(r.data) };
        }
        return { ok: true, error: "" };
      }
      const body = {
        name: scheduleName(label, on),
        enabled: rule?.enabled ?? true,
        trigger: { type: "time" as const, at, days: dayFilter },
        action: { type: "command" as const, deviceId, command: commandFor(on)! },
      };
      const r = rule
        ? await controlPlane.updateAutomation(rule.id, body)
        : await controlPlane.createAutomation(body);
      return { ok: r.ok, error: apiError(r.data) };
    };

    // A switch that moved devices leaves the old rules pointing at the old
    // relay, so replace rather than patch when the identity changed.
    const moved =
      existing != null && (existing.deviceId !== deviceId || existing.field !== field);
    const onRule = moved ? null : existing?.onRule ?? null;
    const offRule = moved ? null : existing?.offRule ?? null;
    if (moved) {
      await Promise.all(
        [existing?.onRule, existing?.offRule]
          .filter(Boolean)
          .map((r) => controlPlane.deleteAutomation(r!.id))
      );
    }

    const results = await Promise.all([
      half(true, useOn, onAt, onRule),
      half(false, useOff, offAt, offRule),
    ]);
    setBusy(false);

    const failed = results.find((r) => !r.ok);
    if (failed) {
      setProblem(failed.error || "Could not save the schedule.");
      return;
    }
    toast.ok(existing ? "Schedule updated" : "Schedule created");
    onSaved();
  };

  const tzNote = istOffsetNote();

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Edit switch schedule" : "New switch schedule"}
      width="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Switch" hint="Only individually switchable outputs are listed.">
          <SelectInput
            value={switchKey}
            onChange={setSwitchKey}
            options={switches.map((s) => ({
              value: s.key,
              label: `${s.deviceName} · ${s.label}`,
            }))}
          />
        </Field>

        {target && target.label !== target.fallbackLabel && (
          <p className="-mt-3 text-xs" style={{ color: "var(--cv-muted)" }}>
            {target.fallbackLabel} on {target.deviceName}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SwitchRow
              label="Turn on"
              checked={useOn}
              onChange={setUseOn}
              hint="Closes the relay"
            />
            <Field label="On at">
              <TextInput type="time" value={onAt} onChange={setOnAt} disabled={!useOn} />
            </Field>
          </div>
          <div className="space-y-2">
            <SwitchRow
              label="Turn off"
              checked={useOff}
              onChange={setUseOff}
              hint="Opens the relay"
            />
            <Field label="Off at">
              <TextInput type="time" value={offAt} onChange={setOffAt} disabled={!useOff} />
            </Field>
          </div>
        </div>

        <Field label="Days" hint={daysText(days)}>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_ORDER.map((d) => {
              const active = days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={active}
                  className="h-9 w-11 rounded-lg text-xs font-bold transition"
                  style={{
                    background: active
                      ? "color-mix(in srgb, var(--cv-accent) 25%, transparent)"
                      : "var(--cv-card-hi)",
                    color: active ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                    border: `1px solid ${active ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                >
                  {WEEKDAY_LABELS[d]}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setDays(p.days)}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold transition hover:brightness-125"
                style={{
                  background: "var(--cv-card-hi)",
                  color: "var(--cv-muted)",
                  border: "1px solid var(--cv-border)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Callout tone="info">
          {tzNote || "Times run on India Standard Time (IST)."}
          {useOn && useOff && (
            <>
              {" "}
              {target?.label ?? "The switch"} will be on for{" "}
              <strong>{spanText(onAt, offAt)}</strong> each selected day.
            </>
          )}
        </Callout>

        {problem && (
          <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>
            {problem}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" busy={busy}>
            {existing ? "Save schedule" : "Create schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** "3h 30m" between two HH:MM times, wrapping past midnight. */
function spanText(from: string, to: string): string {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  if (![fh, fm, th, tm].every(Number.isFinite)) return "—";
  let mins = th * 60 + tm - (fh * 60 + fm);
  if (mins <= 0) mins += 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
