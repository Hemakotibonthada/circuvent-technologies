"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useAutomations, useFleet } from "../_data/hooks";
import { useToast, ConfirmDialog } from "../_kit/overlays";
import { Button, EmptyState, ErrorState, LoadingState, Badge, SectionTitle, Callout } from "../_kit/primitives";
import type { Automation } from "@/lib/control-plane";
import { daysText, istOffsetNote, istNow, nextRunLabel, WEEK_ORDER, WEEKDAY_LABELS } from "@/lib/smarthome-switches";
import { actionText } from "./describe";
import RuleEditor from "./RuleEditor";

/* Switch timers are time automations too, but they have their own tab with a
   purpose-built editor. Listing them here as well would show the same rule in
   two places, and editing one here would strip the marker that pairs its on
   and off halves. */
const SWITCH_MARK = "⟨sw⟩";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function scheduleHour(at: string): number {
  const h = parseInt(at.split(":")[0], 10);
  return Number.isFinite(h) ? h : -1;
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function SchedulesPanel() {
  const { automations, loading, error, refresh, setEnabled, remove } = useAutomations();
  const { byId: deviceById } = useFleet();
  const toast = useToast();

  const [editorTarget, setEditorTarget] = useState<Automation | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deviceName = (id?: string) =>
    id ? (deviceById.get(id)?.name ?? id) : "any device";

  // Only time-triggered automations are "schedules", and switch timers live in
  // their own tab.
  const schedules = useMemo(
    () => automations.filter((a) => a.trigger.type === "time" && !a.name.startsWith(SWITCH_MARK)),
    [automations],
  );

  const handleToggle = async (a: Automation) => {
    const ok = await setEnabled(a.id, !a.enabled);
    if (!ok) toast.err("Could not update schedule");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await remove(deleteTarget.id);
    setDeleting(false);
    if (!ok) toast.err("Could not delete schedule");
    setDeleteTarget(null);
  };

  if (loading) return <LoadingState label="Loading schedules" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
          Time-triggered rules that act on a whole device. To time a single switch, use the
          Switch timers tab.
        </p>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setEditorTarget("new")}
        >
          New schedule
        </Button>
      </div>

      {istOffsetNote() && (
        <Callout tone="info">
          {istOffsetNote()} It is currently {istNow()} IST.
        </Callout>
      )}

      {schedules.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No schedules yet"
          body="A schedule is an automation with a time trigger — e.g. 'every day at 06:00, start the pump'. Create one and it will appear here."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setEditorTarget("new")}>
              Create schedule
            </Button>
          }
        />
      )}

      {schedules.length > 0 && (
        <>
          {/* ---- Schedule list ---- */}
          <div className="space-y-3">
            {schedules
              .slice()
              .sort((a, b) => scheduleHour(a.trigger.at ?? "00:00") - scheduleHour(b.trigger.at ?? "00:00"))
              .map((s) => (
                <ScheduleCard
                  key={s.id}
                  schedule={s}
                  deviceName={deviceName}
                  onToggle={() => handleToggle(s)}
                  onEdit={() => setEditorTarget(s)}
                  onDelete={() => setDeleteTarget(s)}
                />
              ))}
          </div>

          {/* ---- Weekly grid ---- */}
          <SectionTitle>Weekly overview</SectionTitle>
          <WeeklyGrid schedules={schedules} />
        </>
      )}

      {editorTarget !== null && (
        <RuleEditor
          rule={editorTarget === "new" ? null : editorTarget}
          onClose={() => setEditorTarget(null)}
          onSaved={() => {
            setEditorTarget(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete schedule"
        body={
          <>
            Delete <strong>{deleteTarget?.name}</strong>? The schedule will stop running.
          </>
        }
        confirmLabel="Delete schedule"
        danger
        busy={deleting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schedule list card                                                  */
/* ------------------------------------------------------------------ */

function ScheduleCard({
  schedule,
  deviceName,
  onToggle,
  onEdit,
  onDelete,
}: {
  schedule: Automation;
  deviceName: (id?: string) => string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const at = schedule.trigger.at ?? "--:--";
  const next = nextRunLabel(at, schedule.trigger.days);

  return (
    <div
      className="cv-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
      style={{ border: "1px solid var(--cv-border)" }}
    >
      {/* Clock badge */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "var(--cv-card-hi)" }}
      >
        <Clock className="h-5 w-5" style={{ color: "var(--cv-accent-hi)" }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold" style={{ color: "var(--cv-text)" }}>
            {schedule.name}
          </span>
          <Badge tone={schedule.enabled ? "ok" : "neutral"}>
            {schedule.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--cv-muted)" }}>
          {daysText(schedule.trigger.days)} at{" "}
          <span className="font-mono font-semibold" style={{ color: "var(--cv-text)" }}>
            {at}
          </span>
          {" IST · "}
          {actionText(schedule.action, deviceName)}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
          Next run: <span style={{ color: "var(--cv-accent-hi)" }}>{next}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggle}
          aria-label={schedule.enabled ? `Disable ${schedule.name}` : `Enable ${schedule.name}`}
          className="transition"
        >
          <Badge tone={schedule.enabled ? "ok" : "neutral"}>
            {schedule.enabled ? "On" : "Off"}
          </Badge>
        </button>
        <button
          onClick={onEdit}
          aria-label={`Edit ${schedule.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:brightness-125"
          style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)", border: "1px solid var(--cv-border)" }}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete ${schedule.name}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:brightness-125"
          style={{ background: "var(--cv-card-hi)", color: "#ef4444", border: "1px solid var(--cv-border)" }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Weekly overview grid                                                */
/* A schedule with no day filter runs daily and appears in every       */
/* column; one with a filter only appears on the days it will fire.    */
/* ------------------------------------------------------------------ */

function WeeklyGrid({ schedules }: { schedules: Automation[] }) {
  // Group schedules by their hour slot
  const byHour = useMemo(() => {
    const m = new Map<number, Automation[]>();
    for (const s of schedules) {
      const h = scheduleHour(s.trigger.at ?? "00:00");
      if (h < 0) continue;
      if (!m.has(h)) m.set(h, []);
      m.get(h)!.push(s);
    }
    return m;
  }, [schedules]);

  const occupiedHours = Array.from(byHour.keys()).sort((a, b) => a - b);
  if (occupiedHours.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-xs border-separate"
        style={{ borderSpacing: "0 4px" }}
        aria-label="Weekly schedule grid"
      >
        <thead>
          <tr>
            <th
              className="py-1.5 pr-3 text-left font-bold"
              style={{ color: "var(--cv-muted)", whiteSpace: "nowrap" }}
            >
              Time
            </th>
            {WEEK_ORDER.map((d) => (
              <th
                key={d}
                className="px-2 py-1.5 text-center font-bold"
                style={{ color: "var(--cv-muted)" }}
              >
                {WEEKDAY_LABELS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {occupiedHours.map((h) => {
            const hour = `${String(h).padStart(2, "0")}:00`;
            const entries = byHour.get(h) ?? [];
            return (
              <tr key={h}>
                <td
                  className="py-1.5 pr-3 font-mono font-semibold whitespace-nowrap"
                  style={{ color: "var(--cv-text)" }}
                >
                  {hour}
                </td>
                {WEEK_ORDER.map((d) => (
                  <td key={d} className="px-1 py-1">
                    <div className="flex flex-col gap-1">
                      {entries
                        .filter((s) => {
                          const days = s.trigger.days;
                          return !days || days.length === 0 || days.includes(d);
                        })
                        .map((s) => (
                          <div
                            key={s.id}
                            title={s.name}
                            className="truncate rounded-md px-2 py-1 text-center font-semibold"
                            style={{
                              maxWidth: 90,
                              background: s.enabled
                                ? "color-mix(in srgb, var(--cv-accent) 20%, transparent)"
                                : "var(--cv-card-hi)",
                              color: s.enabled ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                              border: "1px solid var(--cv-border)",
                            }}
                          >
                            {s.name}
                          </div>
                        ))}
                    </div>
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
