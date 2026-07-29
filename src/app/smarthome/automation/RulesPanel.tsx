"use client";

import { useState } from "react";
import { Activity, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useAutomations, useFleet } from "../_data/hooks";
import { useToast } from "../_kit/overlays";
import { ConfirmDialog } from "../_kit/overlays";
import { DataGrid } from "../_kit/data-grid";
import type { Column, BulkAction } from "../_kit/data-grid";
import { Badge, Button, ErrorState, FilterChips } from "../_kit/primitives";
import type { Automation } from "@/lib/control-plane";
import { triggerText, actionText } from "./describe";
import RuleEditor from "./RuleEditor";

type TriggerFilter = "all" | "state" | "time";

export default function RulesPanel() {
  const { automations, loading, error, refresh, setEnabled, remove } = useAutomations();
  const { byId: deviceById } = useFleet();
  const toast = useToast();

  const [filter, setFilter] = useState<TriggerFilter>("all");
  const [editorTarget, setEditorTarget] = useState<Automation | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deviceName = (id?: string) =>
    id ? (deviceById.get(id)?.name ?? id) : "any device";

  const filtered = automations.filter((a) => {
    if (filter === "state") return a.trigger.type === "state";
    if (filter === "time") return a.trigger.type === "time";
    return true;
  });

  const stateCount = automations.filter((a) => a.trigger.type === "state").length;
  const timeCount = automations.filter((a) => a.trigger.type === "time").length;

  const handleToggle = async (a: Automation, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await setEnabled(a.id, !a.enabled);
    if (!ok) toast.err("Could not update rule", "Check your connection and try again.");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await remove(deleteTarget.id);
    setDeleting(false);
    if (!ok) toast.err("Could not delete rule");
    setDeleteTarget(null);
  };

  const columns: Column<Automation>[] = [
    {
      key: "type",
      header: "",
      width: "40px",
      render: (a) =>
        a.trigger.type === "time" ? (
          <Clock className="h-4 w-4" style={{ color: "var(--cv-accent-hi)" }} aria-label="Schedule" />
        ) : (
          <Activity className="h-4 w-4" style={{ color: "var(--cv-accent)" }} aria-label="Device event" />
        ),
      hideOnCard: true,
    },
    {
      key: "name",
      header: "Name",
      render: (a) => (
        <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
          {a.name}
        </span>
      ),
      value: (a) => a.name,
    },
    {
      key: "trigger",
      header: "Trigger",
      render: (a) => (
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {triggerText(a.trigger, deviceName)}
        </span>
      ),
      value: (a) => triggerText(a.trigger, deviceName),
    },
    {
      key: "action",
      header: "Action",
      render: (a) => (
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {actionText(a.action, deviceName)}
        </span>
      ),
      value: (a) => actionText(a.action, deviceName),
      hideOnCard: true,
    },
    {
      key: "enabled",
      header: "Enabled",
      width: "90px",
      align: "center",
      render: (a) => (
        <button
          onClick={(e) => handleToggle(a, e)}
          aria-label={a.enabled ? `Disable ${a.name}` : `Enable ${a.name}`}
          className="transition"
        >
          <Badge tone={a.enabled ? "ok" : "neutral"}>{a.enabled ? "On" : "Off"}</Badge>
        </button>
      ),
      value: (a) => (a.enabled ? "enabled" : "disabled"),
    },
    {
      key: "actions",
      header: "",
      width: "88px",
      render: (a) => (
        <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            aria-label={`Edit ${a.name}`}
            onClick={() => setEditorTarget(a)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-125"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label={`Delete ${a.name}`}
            onClick={() => setDeleteTarget(a)}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:brightness-125"
            style={{ background: "var(--cv-card-hi)", color: "#ef4444" }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
      hideOnCard: true,
    },
  ];

  const bulkActions: BulkAction<Automation>[] = [
    {
      id: "enable",
      label: "Enable",
      run: async (rows) => {
        const results = await Promise.all(
          rows.filter((r) => !r.enabled).map((r) => setEnabled(r.id, true)),
        );
        if (results.some((ok) => !ok)) toast.err("Some rules failed to enable");
        else toast.ok("Rules enabled");
      },
    },
    {
      id: "disable",
      label: "Disable",
      run: async (rows) => {
        const results = await Promise.all(
          rows.filter((r) => r.enabled).map((r) => setEnabled(r.id, false)),
        );
        if (results.some((ok) => !ok)) toast.err("Some rules failed to disable");
        else toast.ok("Rules disabled");
      },
    },
    {
      id: "delete",
      label: "Delete",
      danger: true,
      icon: Trash2,
      run: async (rows) => {
        const results = await Promise.all(rows.map((r) => remove(r.id)));
        if (results.some((ok) => !ok)) toast.err("Some rules could not be deleted");
        else toast.ok("Rules deleted");
      },
    },
  ];

  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips<TriggerFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: automations.length },
            { value: "state", label: "Device event", count: stateCount },
            { value: "time", label: "Schedule", count: timeCount },
          ]}
        />
        <Button variant="primary" icon={Plus} onClick={() => setEditorTarget("new")}>
          New rule
        </Button>
      </div>

      <DataGrid<Automation>
        rows={filtered}
        columns={columns}
        rowKey={(a) => String(a.id)}
        loading={loading}
        searchable
        searchPlaceholder="Filter rules…"
        searchOn={(a) =>
          `${a.name} ${triggerText(a.trigger, deviceName)} ${actionText(a.action, deviceName)}`
        }
        onRowClick={(a) => setEditorTarget(a)}
        bulkActions={bulkActions}
        pageSize={20}
        exportName="automation-rules"
        emptyTitle="No rules yet"
        emptyBody="Create a rule — e.g. 'when the tank drops below 20%, notify me' or 'every day at 06:00, start the pump.'"
        storageKey="automation-rules-grid"
      />

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
        title="Delete rule"
        body={
          <>
            Permanently delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
          </>
        }
        confirmLabel="Delete rule"
        danger
        busy={deleting}
      />
    </div>
  );
}
