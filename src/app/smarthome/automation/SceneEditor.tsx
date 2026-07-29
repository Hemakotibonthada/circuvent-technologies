"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import type { Scene, SceneAction, SceneBody } from "@/lib/control-plane";
import { useFleet } from "../_data/hooks";
import { useToast, Drawer } from "../_kit/overlays";
import { Button, Callout, Field, SelectInput, SwitchRow, TextInput } from "../_kit/primitives";
import { masterPower } from "@/lib/smarthome-command-map";
import { getCommandFields, buildCommand } from "./describe";

/* ------------------------------------------------------------------ */
/* Preset icons                                                        */
/* ------------------------------------------------------------------ */

const ICON_PRESETS = ["🎬", "🌙", "☀️", "🏠", "🔒", "💡", "🎵", "🌿", "🏖️", "❄️", "🔔", "⚡"];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ActionRow {
  /** Local key for React list */
  rowId: string;
  deviceId: string;
  /** The key inside command (e.g. "power", "g1", "action") */
  cmdField: string;
  /** Raw stringified value for editing */
  rawValue: string;
}

function parseSceneValue(raw: string): boolean | number | string {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(n)) return n;
  return raw;
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

interface Props {
  scene: Scene | null;
  onClose: () => void;
  onSaved: () => void;
}

let rowCounter = 0;
const nextId = () => `row-${++rowCounter}`;

export default function SceneEditor({ scene, onClose, onSaved }: Props) {
  const { devices, byId: deviceById } = useFleet();
  const toast = useToast();

  const [name, setName] = useState(scene?.name ?? "");
  const [icon, setIcon] = useState(scene?.icon ?? "🎬");
  const [favorite, setFavorite] = useState(scene?.favorite ?? false);
  const [rows, setRows] = useState<ActionRow[]>(() => {
    if (!scene) return [];
    return scene.actions.map((a) => {
      const entries = Object.entries(a.command).filter(([k]) => k !== "action");
      const [key, val] = entries[0] ?? ["", ""];
      return {
        rowId: nextId(),
        deviceId: a.deviceId,
        cmdField: key,
        rawValue: String(val),
      };
    });
  });

  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);

  const deviceOptions = useMemo(
    () => [
      { value: "", label: "Select a device…" },
      ...devices.map((d) => ({ value: d.id, label: d.name || d.id })),
    ],
    [devices],
  );

  /* ---- Add a new blank action row ---- */
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { rowId: nextId(), deviceId: "", cmdField: "", rawValue: "true" },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const updateRow = (rowId: string, patch: Partial<ActionRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const updated = { ...r, ...patch };
        // Reset field when device changes
        if (patch.deviceId !== undefined && patch.deviceId !== r.deviceId) {
          const device = deviceById.get(patch.deviceId);
          const fields = device ? getCommandFields(device.type) : [];
          updated.cmdField = fields[0]?.key ?? "";
          updated.rawValue =
            fields[0]?.kind === "bool"
              ? "true"
              : fields[0]?.kind === "number"
                ? String(fields[0].min ?? 0)
                : fields[0]?.choices?.[0]?.value ?? "";
        }
        return updated;
      }),
    );
  };

  /* ---- Capture current fleet state ---- */
  const captureCurrentState = async () => {
    setCapturing(true);
    // Re-fetch devices to get the freshest state
    const r = await controlPlane.devices();
    setCapturing(false);
    const freshDevices = r.ok ? (r.data.devices ?? devices) : devices;

    const captured: ActionRow[] = [];
    for (const device of freshDevices) {
      const mp = masterPower(device);
      if (!mp) continue; // skip devices without a safe power toggle
      const fields = getCommandFields(device.type);
      const powerField = fields.find((f) => f.kind === "bool");
      if (!powerField) continue;
      captured.push({
        rowId: nextId(),
        deviceId: device.id,
        cmdField: powerField.key,
        rawValue: String(mp.on),
      });
    }

    if (captured.length === 0) {
      toast.info("No controllable devices found in current state.");
    } else {
      setRows(captured);
      toast.ok(`Captured ${captured.length} device${captured.length !== 1 ? "s" : ""}`);
    }
  };

  /* ---- Build final SceneAction array ---- */
  const buildActions = (): SceneAction[] => {
    return rows.flatMap((row) => {
      if (!row.deviceId || !row.cmdField) return [];
      const device = deviceById.get(row.deviceId);
      if (!device) return [];
      const fields = getCommandFields(device.type);
      const field = fields.find((f) => f.key === row.cmdField);
      if (!field) return [];
      let value: boolean | number | string = parseSceneValue(row.rawValue);
      // Coerce to correct type
      if (field.kind === "bool") value = Boolean(parseSceneValue(row.rawValue));
      if (field.kind === "number") value = Number(row.rawValue) || (field.min ?? 0);
      return [{ deviceId: row.deviceId, command: buildCommand(field, value) }];
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.err("Enter a scene name.");
      return;
    }
    const actions = buildActions();
    const body: SceneBody = {
      name: name.trim(),
      icon: icon.trim() || "🎬",
      favorite,
      actions,
    };

    setBusy(true);
    const r = scene
      ? await controlPlane.updateScene(scene.id, body)
      : await controlPlane.createScene(body);
    setBusy(false);

    if (r.ok) {
      toast.ok(scene ? "Scene updated" : "Scene created");
      onSaved();
    } else {
      toast.err(
        scene ? "Could not update scene" : "Could not create scene",
        r.status === 0 ? "Network error" : `Server error ${r.status}`,
      );
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={scene ? `Edit — ${scene.name}` : "New scene"}
      subtitle={scene ? `${scene.actions.length} actions` : "Build a multi-device one-tap routine"}
      width={520}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={handleSave as never}>
            {scene ? "Save changes" : "Create scene"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSave} className="space-y-5">
        {/* ---- Name & icon ---- */}
        <div className="grid grid-cols-[80px_1fr] gap-3">
          <Field label="Icon">
            <TextInput value={icon} onChange={setIcon} placeholder="🎬" />
          </Field>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="Movie night" />
          </Field>
        </div>

        {/* ---- Icon presets ---- */}
        <div className="flex flex-wrap gap-2">
          {ICON_PRESETS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              aria-label={`Use icon ${ic}`}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition"
              style={{
                background: icon === ic ? "var(--cv-accent)" : "var(--cv-card-hi)",
                border: "1px solid var(--cv-border)",
              }}
            >
              {ic}
            </button>
          ))}
        </div>

        <SwitchRow
          label="Mark as favourite"
          hint="Favourite scenes appear at the top of the list"
          checked={favorite}
          onChange={setFavorite}
        />

        {/* ---- Actions list ---- */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--cv-muted)" }}
            >
              Actions ({rows.length})
            </span>
            <div className="flex gap-2">
              <Button
                icon={Camera}
                busy={capturing}
                onClick={captureCurrentState}
                title="Capture current device states"
              >
                Capture current state
              </Button>
              <Button icon={Plus} onClick={addRow}>
                Add action
              </Button>
            </div>
          </div>

          {rows.length === 0 && (
            <div
              className="rounded-xl px-4 py-6 text-center text-sm"
              style={{
                background: "var(--cv-input-bg)",
                border: "1px dashed var(--cv-border)",
                color: "var(--cv-muted)",
              }}
            >
              No actions yet. Add a device command or capture the current state of your home.
            </div>
          )}

          <div className="space-y-2">
            {rows.map((row) => {
              const device = row.deviceId ? deviceById.get(row.deviceId) : undefined;
              const cmdFields = device ? getCommandFields(device.type) : [];
              const selectedField = cmdFields.find((f) => f.key === row.cmdField);

              return (
                <ActionRowCard
                  key={row.rowId}
                  row={row}
                  deviceOptions={deviceOptions}
                  cmdFields={cmdFields}
                  selectedField={selectedField}
                  onChange={(patch) => updateRow(row.rowId, patch)}
                  onRemove={() => removeRow(row.rowId)}
                />
              );
            })}
          </div>
        </div>
      </form>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Action row card                                                     */
/* ------------------------------------------------------------------ */

interface ActionRowCardProps {
  row: ActionRow;
  deviceOptions: { value: string; label: string }[];
  cmdFields: ReturnType<typeof getCommandFields>;
  selectedField: ReturnType<typeof getCommandFields>[number] | undefined;
  onChange: (patch: Partial<ActionRow>) => void;
  onRemove: () => void;
}

function ActionRowCard({
  row,
  deviceOptions,
  cmdFields,
  selectedField,
  onChange,
  onRemove,
}: ActionRowCardProps) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <SelectInput
            value={row.deviceId}
            onChange={(v) => onChange({ deviceId: v })}
            options={deviceOptions}
          />

          {row.deviceId && cmdFields.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <SelectInput
                value={row.cmdField}
                onChange={(v) => {
                  const field = cmdFields.find((f) => f.key === v);
                  onChange({
                    cmdField: v,
                    rawValue:
                      field?.kind === "bool"
                        ? "true"
                        : field?.kind === "number"
                          ? String(field.min ?? 0)
                          : field?.choices?.[0]?.value ?? "",
                  });
                }}
                options={cmdFields.map((f) => ({ value: f.key, label: f.label }))}
              />

              {selectedField?.kind === "bool" && (
                <SelectInput
                  value={row.rawValue}
                  onChange={(v) => onChange({ rawValue: v })}
                  options={[
                    { value: "true", label: "On / true" },
                    { value: "false", label: "Off / false" },
                  ]}
                />
              )}

              {selectedField?.kind === "number" && (
                <input
                  type="number"
                  value={row.rawValue}
                  min={selectedField.min}
                  max={selectedField.max}
                  onChange={(e) => onChange({ rawValue: e.target.value })}
                  className="cv-input text-sm tabular-nums"
                  aria-label={`${selectedField.label} value`}
                />
              )}

              {selectedField?.kind === "select" && selectedField.choices && (
                <SelectInput
                  value={row.rawValue}
                  onChange={(v) => onChange({ rawValue: v })}
                  options={selectedField.choices}
                />
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove action"
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:brightness-125"
          style={{ background: "var(--cv-card-hi)", color: "#ef4444", border: "1px solid var(--cv-border)" }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
