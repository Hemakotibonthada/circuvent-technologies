"use client";

import { useState, useMemo, useCallback } from "react";
import {
  KpiGrid,
  Kpi,
  FilterChips,
  ErrorState,
  LoadingState,
  SeverityBadge,
  RelativeTime,
  Badge,
  Button,
  SectionTitle,
  SEVERITY_RANK,
  SEVERITY_ICON,
  toCsv,
  downloadCsv,
} from "../_kit/primitives";
import type { Severity } from "../_kit/primitives";
import { DataGrid } from "../_kit/data-grid";
import type { Column, BulkAction } from "../_kit/data-grid";
import { ConfirmDialog, useToast } from "../_kit/overlays";
import { useEvents, eventSeverity } from "../_data/hooks";
import type { AppEvent } from "@/lib/control-plane";
import { EventDrawer } from "./EventDrawer";
import { ShieldAlert, BellRing, Download, Trash2, RotateCcw } from "lucide-react";

type KindFilter = "security" | "all";
type SevFilter = Severity | "all";

const SECURITY_KINDS = new Set(["security", "alert"]);

export function AlertsPanel() {
  const feed = useEvents(200);
  const toast = useToast();
  const [kindFilter, setKindFilter] = useState<KindFilter>("security");
  const [sevFilter, setSevFilter] = useState<SevFilter>("all");
  const [selected, setSelected] = useState<AppEvent | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const securityCount = useMemo(
    () => feed.events.filter((e) => SECURITY_KINDS.has(e.kind)).length,
    [feed.events]
  );

  const visible = useMemo(() => {
    let rows =
      kindFilter === "security"
        ? feed.events.filter((e) => SECURITY_KINDS.has(e.kind))
        : feed.events;
    if (sevFilter !== "all") {
      rows = rows.filter((e) => eventSeverity(e) === sevFilter);
    }
    // Most urgent and most recent first
    return rows.slice().sort((a, b) => {
      const ra = SEVERITY_RANK[eventSeverity(a)];
      const rb = SEVERITY_RANK[eventSeverity(b)];
      if (ra !== rb) return ra - rb;
      return new Date(b.ts).getTime() - new Date(a.ts).getTime();
    });
  }, [feed.events, kindFilter, sevFilter]);

  const kindOptions: { value: KindFilter; label: string; count?: number }[] = [
    { value: "security", label: "Security & Alerts", count: securityCount },
    { value: "all", label: "All events", count: feed.events.length },
  ];

  const sevOptions: { value: SevFilter; label: string; count?: number }[] = [
    { value: "all", label: "All" },
    { value: "critical", label: "Critical", count: feed.counts.critical },
    { value: "warning", label: "Warning", count: feed.counts.warning },
    { value: "info", label: "Info", count: feed.counts.info },
    { value: "ok", label: "OK", count: feed.counts.ok },
  ];

  const handleExport = useCallback(() => {
    const csv = toCsv(
      ["Time", "Kind", "Severity", "Title", "Body", "Device ID"],
      visible.map((e) => [
        e.ts,
        e.kind,
        eventSeverity(e),
        e.title,
        e.body,
        e.device_id ?? "",
      ])
    );
    downloadCsv("security-events.csv", csv);
  }, [visible]);

  const handleClear = async () => {
    setClearing(true);
    try {
      await feed.clear();
      toast.ok("All events cleared");
    } catch {
      toast.err("Failed to clear events");
    } finally {
      setClearing(false);
      setClearOpen(false);
    }
  };

  const columns: Column<AppEvent>[] = [
    {
      key: "sev",
      header: "Severity",
      width: "140px",
      render: (e) => {
        const sev = eventSeverity(e);
        const Icon = SEVERITY_ICON[sev];
        return (
          <span className="flex items-center gap-1.5">
            {/* Icon ensures critical is unmistakable without colour alone */}
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <SeverityBadge severity={sev} />
          </span>
        );
      },
      value: (e) => SEVERITY_RANK[eventSeverity(e)],
    },
    {
      key: "kind",
      header: "Kind",
      width: "90px",
      render: (e) => <Badge tone="neutral">{e.kind}</Badge>,
      value: (e) => e.kind,
    },
    {
      key: "title",
      header: "Event",
      render: (e) => (
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
            {e.title}
          </div>
          {e.body && (
            <div
              className="mt-0.5 max-w-xs truncate text-xs"
              style={{ color: "var(--cv-muted)" }}
            >
              {e.body}
            </div>
          )}
        </div>
      ),
      value: (e) => e.title,
    },
    {
      key: "device",
      header: "Device",
      width: "150px",
      optional: true,
      render: (e) =>
        e.device_id ? (
          <code className="font-mono text-xs" style={{ color: "var(--cv-muted)" }}>
            {e.device_id}
          </code>
        ) : (
          <span style={{ color: "var(--cv-muted)" }}>—</span>
        ),
      value: (e) => e.device_id ?? "",
    },
    {
      key: "time",
      header: "Time",
      width: "100px",
      render: (e) => (
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          <RelativeTime iso={e.ts} />
        </span>
      ),
      value: (e) => new Date(e.ts).getTime(),
    },
    {
      key: "status",
      header: "Status",
      width: "80px",
      optional: true,
      render: (e) =>
        e.read ? (
          <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
            Read
          </span>
        ) : (
          <Badge tone="accent">Unread</Badge>
        ),
      value: (e) => (e.read ? 1 : 0),
    },
  ];

  const bulkActions: BulkAction<AppEvent>[] = [
    {
      id: "mark-read",
      label: "Mark read",
      run: (rows) => {
        void feed.markRead(rows.map((e) => e.id)).then(() => {
          toast.ok(`${rows.length} event${rows.length !== 1 ? "s" : ""} marked as read`);
        });
      },
    },
  ];

  if (feed.loading) return <LoadingState label="Loading security events" />;
  if (feed.error) return <ErrorState message={feed.error} onRetry={feed.refresh} />;

  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <Kpi
          label="Critical events"
          value={feed.counts.critical}
          tone={feed.counts.critical > 0 ? "critical" : undefined}
          icon={ShieldAlert}
        />
        <Kpi
          label="Warnings"
          value={feed.counts.warning}
          tone={feed.counts.warning > 0 ? "warning" : undefined}
        />
        <Kpi label="Unread" value={feed.unread} icon={BellRing} />
        <Kpi label="Total events" value={feed.events.length} />
      </KpiGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips
          options={kindOptions}
          value={kindFilter}
          onChange={setKindFilter}
        />
        <FilterChips
          options={sevOptions}
          value={sevFilter}
          onChange={setSevFilter}
        />
      </div>

      <SectionTitle
        right={
          <div className="flex gap-2">
            <Button icon={RotateCcw} variant="ghost" onClick={feed.refresh}>
              Refresh
            </Button>
            <Button icon={Download} onClick={handleExport}>
              Export CSV
            </Button>
            <Button
              icon={Trash2}
              variant="danger"
              onClick={() => setClearOpen(true)}
            >
              Clear all
            </Button>
          </div>
        }
      >
        {visible.length} event{visible.length !== 1 ? "s" : ""}
      </SectionTitle>

      <DataGrid
        rows={visible}
        columns={columns}
        rowKey={(e) => String(e.id)}
        loading={feed.loading}
        onRowClick={setSelected}
        bulkActions={bulkActions}
        searchable
        searchPlaceholder="Search by title, body or device ID…"
        searchOn={(e) => `${e.title} ${e.body} ${e.device_id ?? ""} ${e.kind}`}
        pageSize={25}
        emptyTitle="No events"
        emptyBody={
          kindFilter === "security"
            ? "No security or alert events have been recorded yet."
            : "No events have been recorded yet."
        }
        storageKey="security-alerts-grid"
        dense
      />

      <EventDrawer
        event={selected}
        onClose={() => setSelected(null)}
        feed={feed}
      />

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={handleClear}
        title="Clear all events"
        body="This permanently removes every event from the server. This cannot be undone."
        confirmLabel="Clear all events"
        danger
        busy={clearing}
      />
    </div>
  );
}
