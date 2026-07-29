"use client";

import { useState, useMemo } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  RotateCcw,
} from "lucide-react";
import {
  Surface,
  SectionTitle,
  Button,
  Badge,
  StatusDot,
  RelativeTime,
  EmptyState,
  ErrorState,
  LoadingState,
  FilterChips,
  Kpi,
  KpiGrid,
  DetailRow,
  formatDateTime,
  SEVERITY,
} from "../_kit/primitives";
import { ConfirmDialog, useToast } from "../_kit/overlays";
import { DataGrid } from "../_kit/data-grid";
import type { Column } from "../_kit/data-grid";
import { useGatePasses, useFleet, useEvents, eventSeverity } from "../_data/hooks";
import type { AppEvent } from "@/lib/control-plane";
import type { GatePass } from "@/lib/control-plane";
import { GatePassEditor } from "./GatePassEditor";
import { EventDrawer } from "./EventDrawer";

type SubView = "passes" | "events";

const STATUS_TONE: Record<string, "ok" | "warning" | "critical" | "info" | "neutral"> = {
  active: "ok",
  scheduled: "info",
  expired: "neutral",
  used: "warning",
  revoked: "critical",
};

/** Access events: security kind, excluding SOS (which goes in Alerts). */
function isAccessEvent(e: AppEvent): boolean {
  return e.kind === "security" && !/sos/i.test(e.title);
}

export function AccessPanel() {
  const { passes, loading, error, refresh, revoke } = useGatePasses();
  const fleet = useFleet();
  const feed = useEvents(200);
  const toast = useToast();

  const [view, setView] = useState<SubView>("passes");
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<GatePass | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [eventSelected, setEventSelected] = useState<AppEvent | null>(null);

  const activePasses = useMemo(() => passes.filter((p) => p.status === "active"), [passes]);
  const accessEvents = useMemo(
    () =>
      feed.events
        .filter(isAccessEvent)
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()),
    [feed.events]
  );

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const ok = await revoke(revokeTarget.id);
    setRevoking(false);
    setRevokeTarget(null);
    if (ok) {
      toast.ok(`Pass "${revokeTarget.label}" revoked`);
    } else {
      toast.err("Revoke failed — please try again");
    }
  };

  const viewOptions: { value: SubView; label: string; count?: number }[] = [
    { value: "passes", label: "Gate passes", count: activePasses.length },
    { value: "events", label: "Access events", count: accessEvents.length },
  ];

  const passColumns: Column<GatePass>[] = [
    {
      key: "label",
      header: "Label",
      render: (p) => (
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0" style={{ color: "var(--cv-accent-hi)" }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              {p.label}
            </div>
            <code
              className="font-mono text-xs tracking-wider"
              style={{ color: "var(--cv-muted)" }}
            >
              {p.code}
            </code>
          </div>
        </div>
      ),
      value: (p) => p.label,
    },
    {
      key: "status",
      header: "Status",
      width: "100px",
      render: (p) => (
        <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
      ),
      value: (p) => p.status,
    },
    {
      key: "device",
      header: "Device",
      width: "140px",
      optional: true,
      render: (p) => (
        <code className="font-mono text-xs" style={{ color: "var(--cv-muted)" }}>
          {p.device_id}
        </code>
      ),
      value: (p) => p.device_id,
    },
    {
      key: "uses",
      header: "Uses",
      width: "80px",
      render: (p) => (
        <span className="tabular-nums text-sm" style={{ color: "var(--cv-text)" }}>
          {p.uses}/{p.max_uses === 999 ? "∞" : p.max_uses}
        </span>
      ),
      value: (p) => p.uses,
    },
    {
      key: "valid_to",
      header: "Expires",
      width: "130px",
      render: (p) => (
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {formatDateTime(p.valid_to)}
        </span>
      ),
      value: (p) => new Date(p.valid_to).getTime(),
    },
    {
      key: "last_used",
      header: "Last used",
      width: "110px",
      optional: true,
      render: (p) =>
        p.last_used ? (
          <RelativeTime iso={p.last_used} />
        ) : (
          <span style={{ color: "var(--cv-muted)" }}>Never</span>
        ),
      value: (p) => (p.last_used ? new Date(p.last_used).getTime() : 0),
    },
    {
      key: "actions",
      header: "",
      width: "80px",
      render: (p) =>
        !p.revoked && p.status !== "expired" && p.status !== "used" ? (
          <Button
            variant="danger"
            icon={Trash2}
            onClick={(e?: React.MouseEvent) => {
              e?.stopPropagation();
              setRevokeTarget(p);
            }}
            title="Revoke pass"
          />
        ) : null,
    },
  ];

  const eventColumns: Column<AppEvent>[] = [
    {
      key: "title",
      header: "Event",
      render: (e) => (
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
            {e.title}
          </div>
          {e.body && (
            <div className="mt-0.5 truncate text-xs max-w-sm" style={{ color: "var(--cv-muted)" }}>
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
      width: "140px",
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
      width: "110px",
      render: (e) => (
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          <RelativeTime iso={e.ts} />
        </span>
      ),
      value: (e) => new Date(e.ts).getTime(),
    },
    {
      key: "read",
      header: "Status",
      width: "80px",
      optional: true,
      render: (e) =>
        e.read ? (
          <span className="text-xs" style={{ color: "var(--cv-muted)" }}>Read</span>
        ) : (
          <Badge tone="accent">Unread</Badge>
        ),
      value: (e) => (e.read ? 1 : 0),
    },
  ];

  if (loading && passes.length === 0) return <LoadingState label="Loading gate passes" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      <KpiGrid cols={4}>
        <Kpi label="Active passes" value={activePasses.length} icon={KeyRound} tone={activePasses.length > 0 ? "ok" : undefined} />
        <Kpi label="Total passes" value={passes.length} />
        <Kpi label="Access events" value={accessEvents.length} />
        <Kpi label="Unread events" value={feed.unread} />
      </KpiGrid>

      <div className="flex items-center justify-between gap-3">
        <FilterChips options={viewOptions} value={view} onChange={setView} />
        {view === "passes" && (
          <div className="flex gap-2">
            <Button icon={RotateCcw} variant="ghost" onClick={refresh} />
            <Button icon={Plus} variant="primary" onClick={() => setCreateOpen(true)}>
              New pass
            </Button>
          </div>
        )}
        {view === "events" && (
          <Button icon={RotateCcw} variant="ghost" onClick={feed.refresh} />
        )}
      </div>

      {view === "passes" && (
        <DataGrid
          rows={passes}
          columns={passColumns}
          rowKey={(p) => String(p.id)}
          loading={loading}
          searchable
          searchPlaceholder="Search passes by label or code…"
          searchOn={(p) => `${p.label} ${p.code} ${p.device_id}`}
          pageSize={20}
          emptyTitle="No gate passes"
          emptyBody="Create a time-limited pass to grant temporary access to a gate or door."
          storageKey="security-passes-grid"
        />
      )}

      {view === "events" && (
        <DataGrid
          rows={accessEvents}
          columns={eventColumns}
          rowKey={(e) => String(e.id)}
          loading={feed.loading}
          onRowClick={setEventSelected}
          searchable
          searchPlaceholder="Search access events…"
          searchOn={(e) => `${e.title} ${e.body} ${e.device_id ?? ""}`}
          pageSize={25}
          emptyTitle="No access events"
          emptyBody="Gate pass uses, RFID reads and face-match events will appear here."
          storageKey="security-access-events-grid"
          dense
        />
      )}

      <GatePassEditor
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        devices={fleet.devices}
        onCreated={refresh}
      />

      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevoke}
        title="Revoke gate pass"
        body={
          revokeTarget
            ? `Revoke pass "${revokeTarget.label}" (${revokeTarget.code})? The visitor will not be able to use this code again.`
            : ""
        }
        confirmLabel="Revoke pass"
        danger
        busy={revoking}
      />

      <EventDrawer
        event={eventSelected}
        onClose={() => setEventSelected(null)}
        feed={feed}
      />
    </div>
  );
}
