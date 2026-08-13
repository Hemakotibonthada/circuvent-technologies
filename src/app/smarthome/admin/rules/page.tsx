"use client";

/**
 * Rules & automations console.
 *
 * This page is driven entirely by the control plane's real automations API
 * (`/automations`, full CRUD). Every rule, its trigger and its action are the
 * exact shape the backend stores (see `Automation` in src/lib/control-plane.ts):
 * a single trigger (device state OR time of day) and a single action (send a
 * device command OR raise a notification). Device pickers are populated from the
 * live fleet (`/admin/devices`), so triggers and actions only reference real
 * devices.
 *
 * The backend models nothing more than that, so the previously fabricated
 * visual node builder, complex-event-processing, edge deployment, execution
 * debugger and template marketplace were deleted rather than faked. We expose
 * exactly what the API supports.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workflow, Zap, Clock, Cpu, Bell, Radio, Plus, RefreshCw, Trash2, Pencil, Check,
  TriangleAlert, Inbox,
} from "lucide-react";
import { useAutomations, useAdminDevices } from "../_lib/api";
import { defaultCommandFor, validateActionCommand } from "./command-defaults";
import { checkTrigger, type TriggerOp } from "./trigger-checks";
import {
  controlPlane,
  actionList,
  type Automation,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationActions,
  type AutomationBody,
  type AdminDevice,
} from "@/lib/control-plane";
import { relativeTime, fmtDateTime, num } from "../_lib/format";
import {
  PageHeader, StatCard, Badge, Btn, Toggle, DataTable, SearchInput, Select, Segmented,
  Modal, Field, Input, EmptyState, LoadingState, ErrorState, SectionTitle, StaggerGrid,
  StaggerItem, type Column,
} from "../_ui";

// ------------------------------------------------------------------- types ---

type TriggerType = NonNullable<AutomationTrigger["type"]>;
type ActionType = NonNullable<AutomationAction["type"]>;
type Op = NonNullable<AutomationTrigger["op"]>;
type EnabledFilter = "all" | "enabled" | "disabled";

interface RuleForm {
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerDeviceId: string;
  triggerField: string;
  triggerOp: Op;
  triggerValue: string;
  triggerAt: string;
  actionType: ActionType;
  actionDeviceId: string;
  actionCommand: string;
  actionTitle: string;
  actionBody: string;
  /**
   * The stored action when it is a sequence this editor cannot represent.
   *
   * This screen edits one action; a rule built in the console's rule builder
   * may have several. Saving would otherwise flatten the sequence back to a
   * single step and silently discard the rest, so the original is carried
   * through untouched and the action fields are shown read-only.
   */
  keepSequence?: AutomationAction[];
}

// ----------------------------------------------------------------- helpers ---

const OPS: { value: Op; label: string }[] = [
  { value: "<", label: "< less than" },
  { value: "<=", label: "≤ at most" },
  { value: ">", label: "> greater than" },
  { value: ">=", label: "≥ at least" },
  { value: "==", label: "= equals" },
  { value: "!=", label: "≠ not equal" },
  { value: "truthy", label: "is set (truthy)" },
  { value: "falsy", label: "is clear (falsy)" },
];

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: "state", label: "Device state" },
  { value: "time", label: "Time of day" },
];

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: "command", label: "Send command" },
  { value: "notify", label: "Notify" },
];

const ENABLED_FILTERS: { value: EnabledFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

/*
 * The starting command used to be a fixed `{"action":"set","power":true}` for
 * every device, which `projectCommand` discards on 18 of the 23 device types.
 * It is now derived per device in `command-defaults.ts`, so picking a curtain
 * seeds a position and picking a tank seeds a pump.
 */

function formatVal(v: number | string | boolean | undefined): string {
  return v === undefined || v === null ? "?" : String(v);
}

function triggerSummary(t: AutomationTrigger, deviceName: (id?: string) => string): string {
  if (t.type === "time") return `At ${t.at ?? "—"}`;
  const dev = deviceName(t.deviceId);
  const field = t.field ?? "?";
  if (t.op === "truthy") return `${dev} · ${field} is set`;
  if (t.op === "falsy") return `${dev} · ${field} is clear`;
  return `${dev} · ${field} ${t.op ?? "?"} ${formatVal(t.value)}`;
}

function actionSummary(a: AutomationActions, deviceName: (id?: string) => string): string {
  const steps = actionList(a);
  if (steps.length === 0) return "No action";
  const one = (s: AutomationAction) =>
    s.type === "notify"
      ? `Notify — ${s.title || s.body || "message"}`
      : s.type === "tts"
        ? `Speak on ${deviceName(s.deviceId)} — ${s.text || s.body || ""}`
        : `Command ${deviceName(s.deviceId)} — ${s.command ? JSON.stringify(s.command) : "{}"}`;
  return steps.length === 1
    ? one(steps[0])
    : `${one(steps[0])} +${steps.length - 1} more`;
}

function coerceValue(raw: string): number | string | boolean {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s);
  return s;
}

function formFromRule(r: Automation | null): RuleForm {
  const t = r?.trigger;
  const steps = actionList(r?.action);
  const a = steps[0];
  return {
    name: r?.name ?? "",
    enabled: r?.enabled ?? true,
    triggerType: t?.type === "time" ? "time" : "state",
    triggerDeviceId: t?.deviceId ?? "",
    triggerField: t?.field ?? "",
    triggerOp: t?.op ?? ">",
    triggerValue: t?.value === undefined || t?.value === null ? "" : String(t.value),
    triggerAt: t?.at ?? "",
    actionType: a?.type === "notify" ? "notify" : "command",
    actionDeviceId: a?.deviceId ?? "",
    actionCommand: a?.command ? JSON.stringify(a.command, null, 2) : defaultCommandFor(""),
    actionTitle: a?.title ?? "",
    actionBody: a?.body ?? "",
    keepSequence: steps.length > 1 ? steps : undefined,
  };
}

/** Turn the form into the exact AutomationBody the control plane expects. */
function buildBody(
  f: RuleForm,
  deviceType: (id?: string) => string,
): { body?: AutomationBody; error?: string } {
  if (!f.name.trim()) return { error: "Give the rule a name." };

  let trigger: AutomationTrigger;
  if (f.triggerType === "time") {
    if (!f.triggerAt.trim()) return { error: "Enter the trigger time (HH:MM)." };
    trigger = { type: "time", at: f.triggerAt.trim() };
  } else {
    if (!f.triggerDeviceId) return { error: "Pick the trigger device." };
    if (!f.triggerField.trim()) return { error: "Enter the state field to watch." };
    trigger = { type: "state", deviceId: f.triggerDeviceId, field: f.triggerField.trim(), op: f.triggerOp };
    if (f.triggerOp !== "truthy" && f.triggerOp !== "falsy") {
      trigger.value = coerceValue(f.triggerValue);
    }
  }

  let action: AutomationActions;
  if (f.keepSequence) {
    // Multi-step rules are edited in the console's rule builder. Preserve the
    // sequence exactly so saving a name or trigger change here cannot discard
    // the steps this form has no way to show.
    action = f.keepSequence;
  } else if (f.actionType === "notify") {
    if (!f.actionTitle.trim() && !f.actionBody.trim()) return { error: "Enter a notification title or body." };
    action = { type: "notify", title: f.actionTitle.trim() || undefined, body: f.actionBody.trim() || undefined };
  } else {
    if (!f.actionDeviceId) return { error: "Pick the device to command." };
    let command: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(f.actionCommand);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      command = parsed as Record<string, unknown>;
    } catch {
      return { error: "Action command must be a valid JSON object." };
    }
    /*
     * Valid JSON is not the same as a command this device will act on. Without
     * this, a rule commanding a curtain, tank, gate or meter with the old
     * `power: true` default saved cleanly, looked correct in the list, fired on
     * time and did nothing — indistinguishable from failing hardware.
     */
    const dead = validateActionCommand(deviceType(f.actionDeviceId), command);
    if (dead) return { error: dead };
    action = { type: "command", deviceId: f.actionDeviceId, command };
  }

  return { body: { name: f.name.trim(), enabled: f.enabled, trigger, action } };
}

function apiError(res: { status: number; data: unknown }): string {
  const d = res.data;
  const body = d && typeof d === "object" && "error" in d ? String((d as { error?: unknown }).error ?? "") : "";
  if (body) return body;
  if (res.status === 0) return "Cannot reach the control plane.";
  if (res.status === 401) return "Your operator session has expired — sign in again.";
  if (res.status === 403) return "This account is not an operator.";
  return `Control plane returned ${res.status}.`;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
      <TriangleAlert className="h-4 w-4 shrink-0" /> {message}
    </div>
  );
}

/**
 * Inline advice about a rule that would save but not work.
 *
 * `warn` is advisory — the rule may be correct and the device simply has not
 * reported that field yet. `error` is a comparison that cannot work however
 * the state evolves. Different colours because they call for different
 * reactions, and one shade for both would make the advisory ones look like
 * failures and get dismissed.
 */
function Notice({ level, children }: { level: "warn" | "error"; children: React.ReactNode }) {
  const tone =
    level === "error"
      ? "border-red-500/25 bg-red-500/[0.08] text-red-200"
      : "border-amber-500/25 bg-amber-500/[0.08] text-amber-200";
  return (
    <p role="status" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

// -------------------------------------------------------------------- page ---

export default function RulesPage() {
  const rulesRes = useAutomations();
  const devicesRes = useAdminDevices();

  const [showEditor, setShowEditor] = useState(false);
  const [editRule, setEditRule] = useState<Automation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Automation | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [deviceFilter, setDeviceFilter] = useState("all");

  const rules = useMemo(() => rulesRes.data ?? [], [rulesRes.data]);
  const devices = useMemo(() => devicesRes.data ?? [], [devicesRes.data]);

  const deviceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of devices) m.set(d.id, d.name || d.id);
    return (id?: string) => (id ? m.get(id) ?? id : "any device");
  }, [devices]);

  const enabledCount = rules.filter((r) => r.enabled).length;
  const stateTrig = rules.filter((r) => r.trigger.type === "state").length;
  const timeTrig = rules.filter((r) => r.trigger.type === "time").length;

  const referencedDeviceOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rules) {
      if (r.trigger.deviceId) ids.add(r.trigger.deviceId);
      // A sequence can touch several devices; every one of them should be
      // filterable, not just the first step's.
      for (const s of actionList(r.action)) if (s.deviceId) ids.add(s.deviceId);
    }
    return [{ value: "all", label: "All devices" }, ...[...ids].map((id) => ({ value: id, label: deviceName(id) }))];
  }, [rules, deviceName]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rules.filter((r) => {
      const steps = actionList(r.action);
      if (enabledFilter !== "all" && (enabledFilter === "enabled") !== r.enabled) return false;
      if (
        deviceFilter !== "all" &&
        r.trigger.deviceId !== deviceFilter &&
        !steps.some((s) => s.deviceId === deviceFilter)
      ) {
        return false;
      }
      if (needle) {
        const stepText = steps
          .map((s) => `${s.title ?? ""} ${s.body ?? ""} ${s.text ?? ""} ${deviceName(s.deviceId)}`)
          .join(" ");
        const hay = `${r.name} ${r.trigger.field ?? ""} ${stepText} ${deviceName(r.trigger.deviceId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rules, q, enabledFilter, deviceFilter, deviceName]);

  const openEdit = useCallback((r: Automation) => {
    setEditRule(r);
    setShowEditor(true);
  }, []);
  const openCreate = () => {
    setEditRule(null);
    setShowEditor(true);
  };

  const toggle = useCallback(
    async (r: Automation) => {
      setBusyId(r.id);
      setActionErr(null);
      const res = await controlPlane.updateAutomation(r.id, { enabled: !r.enabled });
      setBusyId(null);
      if (res.ok) rulesRes.reload();
      else setActionErr(apiError(res));
    },
    [rulesRes]
  );

  const doDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleteBusy(true);
    setActionErr(null);
    const res = await controlPlane.deleteAutomation(confirmDelete.id);
    setDeleteBusy(false);
    if (res.ok) {
      setConfirmDelete(null);
      rulesRes.reload();
    } else {
      setActionErr(apiError(res));
    }
  }, [confirmDelete, rulesRes]);

  const reloadAll = () => {
    rulesRes.reload();
    devicesRes.reload();
  };

  if (rulesRes.loading && rules.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingState rows={2} label="Loading automations…" />
        <LoadingState rows={4} />
      </div>
    );
  }
  if (rulesRes.error && rules.length === 0) {
    return <ErrorState message={rulesRes.error} unauthorized={rulesRes.unauthorized} onRetry={rulesRes.reload} />;
  }

  const cols: Column<Automation>[] = [
    {
      key: "name", header: "Rule",
      sort: (a, b) => a.name.localeCompare(b.name),
      render: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-white">{r.name}</div>
          <div className="truncate text-[11px] ad-muted">{triggerSummary(r.trigger, deviceName)}</div>
        </div>
      ),
    },
    {
      key: "trigger", header: "Trigger",
      render: (r) =>
        r.trigger.type === "time" ? (
          <Badge tone="blue"><Clock className="h-3 w-3" /> time</Badge>
        ) : r.trigger.type === "event" ? (
          <Badge tone="violet"><Bell className="h-3 w-3" /> event</Badge>
        ) : (
          <Badge tone="brand"><Zap className="h-3 w-3" /> state</Badge>
        ),
    },
    {
      key: "action", header: "Action",
      render: (r) => {
        const steps = actionList(r.action);
        const first = steps[0];
        return (
          <div className="flex min-w-0 items-center gap-2">
            {first?.type === "notify" ? (
              <Badge tone="violet"><Bell className="h-3 w-3" /> notify</Badge>
            ) : first?.type === "tts" ? (
              <Badge tone="blue"><Radio className="h-3 w-3" /> speak</Badge>
            ) : (
              <Badge tone="amber"><Radio className="h-3 w-3" /> command</Badge>
            )}
            {steps.length > 1 && <Badge tone="slate">{steps.length} steps</Badge>}
            <span className="max-w-[220px] truncate text-[11px] ad-muted">{actionSummary(r.action, deviceName)}</span>
          </div>
        );
      },
    },
    {
      key: "enabled", header: "Enabled", align: "center",
      render: (r) => (
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <Toggle checked={r.enabled} onChange={() => toggle(r)} disabled={busyId === r.id} />
        </div>
      ),
    },
    {
      key: "created", header: "Created", align: "right",
      sort: (a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""),
      render: (r) => <span className="text-xs ad-muted" title={r.created_at ? fmtDateTime(r.created_at) : ""}>{r.created_at ? relativeTime(r.created_at) : "—"}</span>,
    },
    {
      key: "act", header: "", align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-3" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => openEdit(r)} className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"><Pencil className="h-3.5 w-3.5" /> Edit</button>
          <button onClick={() => { setConfirmDelete(r); setActionErr(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 transition hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules & automations"
        icon={<Workflow className="h-5 w-5" />}
        subtitle="Automations backed by the control plane's real rules engine: a device-state or time trigger, and a device-command or notification action. Exactly what the API stores — nothing simulated."
        actions={
          <div className="flex items-center gap-2">
            <Btn variant="subtle" onClick={reloadAll}><RefreshCw className="h-4 w-4" /> Refresh</Btn>
            <Btn variant="primary" onClick={openCreate}><Plus className="h-4 w-4" /> New rule</Btn>
          </div>
        }
      />

      {devicesRes.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> Device list unavailable ({devicesRes.error}) — device pickers may be empty.
        </div>
      )}

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Automations" value={num(rules.length)} icon={<Workflow className="h-4 w-4" />} tone="brand" sub="total" /></StaggerItem>
        <StaggerItem><StatCard label="Enabled" value={num(enabledCount)} icon={<Zap className="h-4 w-4" />} tone={enabledCount ? "green" : "slate"} sub={`${num(rules.length - enabledCount)} disabled`} /></StaggerItem>
        <StaggerItem><StatCard label="State-triggered" value={num(stateTrig)} icon={<Cpu className="h-4 w-4" />} tone="violet" sub="on device state" /></StaggerItem>
        <StaggerItem><StatCard label="Time-triggered" value={num(timeTrig)} icon={<Clock className="h-4 w-4" />} tone="blue" sub="on a schedule" /></StaggerItem>
      </StaggerGrid>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search rules…" className="min-w-[200px] flex-1" />
        <Segmented value={enabledFilter} onChange={setEnabledFilter} options={ENABLED_FILTERS} />
        <Select value={deviceFilter} onChange={setDeviceFilter} options={referencedDeviceOptions} />
      </div>

      {actionErr && <ErrorBanner message={actionErr} />}

      {rulesRes.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {rulesRes.error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm ad-muted">{num(filtered.length)} of {num(rules.length)} rules</span>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-6 w-6" />}
          title="No automations yet"
          hint="Create your first rule to react to device state or run an action on a schedule."
          action={<Btn variant="primary" onClick={openCreate}><Plus className="h-4 w-4" /> Create rule</Btn>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="No matching rules" hint="Adjust the search or filters above." />
      ) : (
        <DataTable rows={filtered} columns={cols} rowKey={(r) => String(r.id)} onRowClick={openEdit} />
      )}

      <RuleEditor
        open={showEditor}
        rule={editRule}
        devices={devices}
        onClose={() => setShowEditor(false)}
        onSaved={rulesRes.reload}
      />

      <Modal open={!!confirmDelete} onClose={() => { if (!deleteBusy) setConfirmDelete(null); }} title="Delete rule">
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Delete <b className="text-slate-200">{confirmDelete?.name}</b>? The control plane stops evaluating it immediately. This cannot be undone.
          </p>
          {actionErr && <ErrorBanner message={actionErr} />}
          <div className="flex justify-end gap-2">
            <Btn variant="subtle" onClick={() => setConfirmDelete(null)} disabled={deleteBusy}>Cancel</Btn>
            <Btn variant="danger" onClick={doDelete} disabled={deleteBusy}>{deleteBusy ? "Deleting…" : "Delete rule"}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ editor ---

function RuleEditor({
  open, rule, devices, onClose, onSaved,
}: {
  open: boolean;
  rule: Automation | null;
  devices: AdminDevice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<RuleForm>(() => formFromRule(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(formFromRule(rule));
    setErr(null);
    setBusy(false);
  }, [open, rule]);

  function set<K extends keyof RuleForm>(k: K, v: RuleForm[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  const deviceOptions = useMemo(
    () => [
      { value: "", label: devices.length ? "Select a device…" : "No devices available" },
      ...devices.map((d) => ({ value: d.id, label: `${d.name || d.id} · ${d.type}` })),
    ],
    [devices]
  );

  const typeOf = useCallback(
    (id?: string) => (id ? devices.find((d) => d.id === id)?.type ?? "" : ""),
    [devices],
  );

  const actionType = typeOf(f.actionDeviceId);

  /*
   * Re-seed the command when the operator picks a different device, but only
   * while it is still an untouched default — a command someone has typed is
   * theirs, and silently rewriting it would be its own kind of surprise.
   */
  function pickActionDevice(id: string) {
    setF((p) => {
      const untouched = p.actionCommand.trim() === defaultCommandFor(typeOf(p.actionDeviceId)).trim();
      return {
        ...p,
        actionDeviceId: id,
        actionCommand: untouched ? defaultCommandFor(typeOf(id)) : p.actionCommand,
      };
    });
  }

  const triggerDevice = devices.find((d) => d.id === f.triggerDeviceId) ?? null;
  const stateKeys = triggerDevice ? Object.keys(triggerDevice.state ?? {}) : [];

  /*
   * The mirror of the action check: a field the device never publishes gives a
   * rule that saves cleanly and never fires. Advisory rather than blocking —
   * a leak sensor does not report `leak` until there is a leak, so refusing an
   * unreported field would block the rules most worth writing.
   */
  const triggerCheck = useMemo(
    () =>
      f.triggerType === "state" && f.triggerDeviceId
        ? checkTrigger({
            field: f.triggerField,
            op: f.triggerOp as TriggerOp,
            state: (triggerDevice?.state as Record<string, unknown> | undefined) ?? null,
          })
        : { message: null, level: "warn" as const },
    [f.triggerType, f.triggerDeviceId, f.triggerField, f.triggerOp, triggerDevice],
  );

  /* Shown while editing rather than only on save, so the operator is not told
     their work is wrong after they have finished it. */
  const commandWarning = useMemo(() => {
    if (f.actionType !== "command" || !f.actionDeviceId) return null;
    try {
      const parsed: unknown = JSON.parse(f.actionCommand);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return validateActionCommand(actionType, parsed as Record<string, unknown>);
    } catch {
      return null; // Mid-typing JSON is not an error worth shouting about.
    }
  }, [f.actionType, f.actionDeviceId, f.actionCommand, actionType]);

  const save = useCallback(async () => {
    const { body, error } = buildBody(f, typeOf);
    if (error || !body) {
      setErr(error ?? "Invalid rule.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = rule ? await controlPlane.updateAutomation(rule.id, body) : await controlPlane.createAutomation(body);
    setBusy(false);
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      setErr(apiError(res));
    }
  }, [f, rule, onSaved, onClose, typeOf]);

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={rule ? "Edit rule" : "New rule"} wide>
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Turn on pump when tank is low" /></Field>
        <label className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
          <span className="text-sm text-slate-200">Enabled</span>
          <Toggle checked={f.enabled} onChange={(v) => set("enabled", v)} />
        </label>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <SectionTitle>When · trigger</SectionTitle>
          <Segmented value={f.triggerType} onChange={(v) => set("triggerType", v)} options={TRIGGER_TYPES} />
          {f.triggerType === "state" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Device"><Select value={f.triggerDeviceId} onChange={(v) => set("triggerDeviceId", v)} options={deviceOptions} /></Field>
              <Field label="State field" hint={stateKeys.length ? `Live keys: ${stateKeys.slice(0, 6).join(", ")}` : "The state property the firmware publishes."}>
                <input
                  list="cv-rule-state-keys"
                  value={f.triggerField}
                  onChange={(e) => set("triggerField", e.target.value)}
                  placeholder="e.g. level, leak, temp"
                  className="ad-input"
                />
                <datalist id="cv-rule-state-keys">{stateKeys.map((k) => <option key={k} value={k} />)}</datalist>
              </Field>
              <Field label="Comparator"><Select value={f.triggerOp} onChange={(v) => set("triggerOp", v)} options={OPS} /></Field>
              {f.triggerOp !== "truthy" && f.triggerOp !== "falsy" && (
                <Field label="Value" hint="Numbers and true/false are typed automatically."><Input value={f.triggerValue} onChange={(e) => set("triggerValue", e.target.value)} placeholder="e.g. 20" /></Field>
              )}
              {triggerCheck.message && (
                <div className="sm:col-span-2">
                  <Notice level={triggerCheck.level}>{triggerCheck.message}</Notice>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <Field label="Time" hint="24-hour HH:MM, evaluated by the control plane."><Input value={f.triggerAt} onChange={(e) => set("triggerAt", e.target.value)} placeholder="07:30" /></Field>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <SectionTitle>Then · action</SectionTitle>
          <Segmented value={f.actionType} onChange={(v) => set("actionType", v)} options={ACTION_TYPES} />
          {f.actionType === "command" ? (
            <div className="mt-3 space-y-3">
              <Field label="Device"><Select value={f.actionDeviceId} onChange={pickActionDevice} options={deviceOptions} /></Field>
              <Field
                label="Command (JSON)"
                hint={
                  actionType
                    ? `Published to the device over MQTT when the rule fires. Fields a ${actionType} reads are pre-filled.`
                    : "Published to the device over MQTT when the rule fires."
                }
              >
                <textarea value={f.actionCommand} onChange={(e) => set("actionCommand", e.target.value)} rows={4} spellCheck={false} className="ad-input resize-none font-mono text-xs" />
              </Field>
              {commandWarning && <Notice level="error">{commandWarning}</Notice>}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Title"><Input value={f.actionTitle} onChange={(e) => set("actionTitle", e.target.value)} placeholder="Tank low" /></Field>
              <Field label="Body"><Input value={f.actionBody} onChange={(e) => set("actionBody", e.target.value)} placeholder="Water level dropped below 20%." /></Field>
            </div>
          )}
        </div>

        {err && <ErrorBanner message={err} />}

        <div className="flex justify-end gap-2">
          <Btn variant="subtle" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={busy}><Check className="h-4 w-4" /> {busy ? "Saving…" : rule ? "Save changes" : "Create rule"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
