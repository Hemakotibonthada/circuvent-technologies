"use client";

import { useState, useMemo, useCallback } from "react";
import { Activity, CheckCheck, Download, RefreshCw, Trash2, X } from "lucide-react";
import {
  Button, IconButton, FilterChips, SectionTitle, SeverityBadge,
  EmptyState, ErrorState, LoadingState, RelativeTime,
  downloadCsv, toCsv, type Severity,
} from "../_kit/primitives";
import { ConfirmDialog } from "../_kit/overlays";
import { useEvents, useFleet, eventSeverity } from "../_data/hooks";
import { EventDrawer } from "./EventDrawer";
import { EVENTS_CSV_HEADERS, eventsToCsvRows } from "./report";
import type { AppEvent } from "@/lib/control-plane";

// Event kinds actually emitted by the platform (platform/api: mqtt.ts, gate.ts, scenes.ts)
const KIND_OPTIONS = [
  { value: "all", label: "Any kind" },
  { value: "alert", label: "Alert" },
  { value: "security", label: "Security" },
  { value: "success", label: "Success" },
  { value: "info", label: "Info" },
  { value: "activity", label: "Activity" },
] as const;
type KindFilter = (typeof KIND_OPTIONS)[number]["value"];

const SEV_OPTIONS: { value: "all" | Severity; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "info", label: "Info" },
  { value: "ok", label: "OK" },
];

const TIME_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
] as const;
type TimeFilter = (typeof TIME_OPTIONS)[number]["value"];

function timeWindowMs(f: TimeFilter): number {
  if (f === "24h") return 86_400_000;
  if (f === "7d") return 7 * 86_400_000;
  if (f === "30d") return 30 * 86_400_000;
  return 0;
}

export function ActivityPanel() {
  const feed = useEvents(500);
  const { devices, loading: devLoading } = useFleet();

  const [kind, setKind] = useState<KindFilter>("all");
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [deviceId, setDeviceId] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AppEvent | null>(null);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);

  const deviceById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const cutoff = timeWindowMs(timeFilter);
    const since = cutoff ? Date.now() - cutoff : 0;
    return feed.events.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (sev !== "all" && eventSeverity(e) !== sev) return false;
      if (deviceId && e.device_id !== deviceId) return false;
      if (since && new Date(e.ts).getTime() < since) return false;
      if (q && !e.title.toLowerCase().includes(q) && !e.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [feed.events, kind, sev, deviceId, timeFilter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, AppEvent[]>();
    for (const e of filtered) {
      const label = new Date(e.ts).toLocaleDateString(undefined, {
        weekday: "long", month: "short", day: "numeric",
      });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(e);
    }
    return Array.from(map.entries()).map(([dateLabel, evs]) => ({ dateLabel, events: evs }));
  }, [filtered]);

  const exportCsv = useCallback(() => {
    downloadCsv(
      "activity-events.csv",
      toCsv(EVENTS_CSV_HEADERS, eventsToCsvRows(filtered))
    );
  }, [filtered]);

  const markAllRead = useCallback(async () => {
    const ids = feed.events.filter((e) => !e.read).map((e) => e.id);
    if (ids.length) await feed.markRead(ids);
  }, [feed]);

  const doClear = useCallback(async () => {
    setBusy(true);
    await feed.clear();
    setBusy(false);
    setClearing(false);
  }, [feed]);

  if (feed.loading) return <LoadingState label="Loading events" />;
  if (feed.error) return <ErrorState message={feed.error} onRetry={feed.refresh} />;

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex min-h-10 flex-1 items-center gap-2 rounded-xl px-3 focus-within:ring-2 focus-within:ring-[var(--cv-accent)]"
          style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}
        >
          <Activity className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: "var(--cv-text)" }}
            aria-label="Search events"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search">
              <X className="h-4 w-4" style={{ color: "var(--cv-muted)" }} />
            </button>
          )}
        </div>

        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="cv-input text-sm"
          disabled={devLoading}
          aria-label="Filter by device"
        >
          <option value="">All devices</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name || d.id}</option>
          ))}
        </select>

        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          className="cv-input text-sm"
          aria-label="Time range"
        >
          {TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <IconButton icon={RefreshCw} label="Refresh events" onClick={feed.refresh} />

        {feed.unread > 0 && (
          <Button icon={CheckCheck} onClick={markAllRead} variant="secondary">
            Mark all read ({feed.unread})
          </Button>
        )}

        <Button icon={Download} onClick={exportCsv} variant="secondary">
          Export CSV
        </Button>

        <Button icon={Trash2} onClick={() => setClearing(true)} variant="danger">
          Clear all
        </Button>
      </div>

      {/* severity filter */}
      <FilterChips
        options={SEV_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
          count: o.value === "all" ? undefined : feed.counts[o.value as Severity],
        }))}
        value={sev}
        onChange={setSev}
      />

      {/* kind filter */}
      <div className="flex flex-wrap gap-1 overflow-x-auto rounded-xl p-1" style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}>
        {KIND_OPTIONS.map((o) => {
          const active = o.value === kind;
          return (
            <button
              key={o.value}
              onClick={() => setKind(o.value)}
              className="min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-bold transition"
              style={active ? { background: "var(--cv-gradient)", color: "#fff" } : { color: "var(--cv-muted)" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* summary badge */}
      {filtered.length < feed.events.length && (
        <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
          Showing <b style={{ color: "var(--cv-text)" }}>{filtered.length}</b> of {feed.events.length} events
        </div>
      )}

      {/* timeline */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No matching events"
          body="Adjust the filters or wait for new activity to arrive from your devices."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.dateLabel}>
              <SectionTitle>{g.dateLabel}</SectionTitle>
              <div className="space-y-1.5">
                {g.events.map((e) => {
                  const sv = eventSeverity(e);
                  const dev = deviceById.get(e.device_id ?? "");
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelected(e);
                        if (!e.read) void feed.markRead([e.id]);
                      }}
                      className="group flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition hover:brightness-110"
                      style={{
                        background: "var(--cv-card)",
                        border: "1px solid var(--cv-border)",
                        opacity: e.read ? 0.7 : 1,
                      }}
                    >
                      <SeverityBadge severity={sv} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                            {e.title}
                          </span>
                          {!e.read && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: "var(--cv-accent-hi)" }}
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        {e.body && (
                          <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
                            {e.body}
                          </div>
                        )}
                        {dev && (
                          <div className="mt-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                            {dev.name} · {dev.type}
                            {dev.room && ` · ${dev.room}`}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        <RelativeTime iso={e.ts} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <EventDrawer
          event={selected}
          device={selected.device_id ? (deviceById.get(selected.device_id) ?? undefined) : undefined}
          onClose={() => setSelected(null)}
          onMarkRead={async () => {
            await feed.markRead([selected.id]);
            setSelected((prev) => (prev ? { ...prev, read: true } : null));
          }}
          onDelete={async () => {
            await feed.remove(selected.id);
            setSelected(null);
          }}
        />
      )}

      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={doClear}
        title="Clear all events?"
        body="This permanently deletes every event in your feed and cannot be undone."
        danger
        confirmLabel="Clear all events"
        busy={busy}
      />
    </div>
  );
}
