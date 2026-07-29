"use client";

import { useState, useCallback } from "react";
import {
  Home,
  ShieldOff,
  Moon,
  Shield,
  Play,
  Settings2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronUp,
} from "lucide-react";
import {
  Surface,
  SectionTitle,
  Button,
  Badge,
  Callout,
  ErrorState,
  LoadingState,
  SwitchRow,
  usePersistentState,
  SEVERITY,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";
import { useScenes } from "../_data/hooks";
import type { Scene } from "@/lib/control-plane";
import { MODE_IDS, MODE_META, DEFAULT_MODE_MAP } from "./modes";
import type { ModeId, ModeMap } from "./modes";

const MODE_ICON: Record<ModeId, typeof Home> = {
  home: Home,
  away: ShieldOff,
  night: Moon,
  disarmed: Shield,
};

interface ActivationResult {
  modeId: ModeId;
  total: number;
  succeeded: number;
  failed: { sceneId: number; name: string }[];
}

/**
 * SceneSelector — inline list of all available scenes with checkboxes
 * so the operator can build the action list for a mode.
 */
function SceneSelector({
  scenes,
  selected,
  onChange,
}: {
  scenes: Scene[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  if (scenes.length === 0) {
    return (
      <p className="py-4 text-center text-sm" style={{ color: "var(--cv-muted)" }}>
        No scenes defined yet — create scenes in the Scenes section first.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {scenes.map((s) => {
        const on = selected.includes(s.id);
        return (
          <SwitchRow
            key={s.id}
            label={s.name}
            hint={`${s.actions.length} device action${s.actions.length !== 1 ? "s" : ""}`}
            checked={on}
            onChange={(v) =>
              onChange(v ? [...selected, s.id] : selected.filter((id) => id !== s.id))
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Single mode card — shows current scene assignments, lets the operator
 * configure and activate the mode.
 */
function ModeCard({
  modeId,
  scenes,
  modeMap,
  onMapChange,
  activeModeId,
  onActivate,
  lastResult,
}: {
  modeId: ModeId;
  scenes: Scene[];
  modeMap: ModeMap;
  onMapChange: (modeId: ModeId, sceneIds: number[]) => void;
  activeModeId: ModeId | null;
  onActivate: (modeId: ModeId) => void;
  lastResult: ActivationResult | null;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const meta = MODE_META[modeId];
  const Icon = MODE_ICON[modeId];
  const config = modeMap[modeId];
  const isActive = activeModeId === modeId;
  const assignedScenes = scenes.filter((s) => config.sceneIds.includes(s.id));
  const isThisResult = lastResult?.modeId === modeId;

  return (
    <div
      className={`cv-card rounded-2xl p-4 ${isActive ? "ring-2" : ""}`}
      style={isActive ? ({ "--tw-ring-color": "var(--cv-accent)" } as React.CSSProperties) : undefined}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: meta.danger
                ? SEVERITY.critical.dim
                : "color-mix(in srgb, var(--cv-accent) 14%, transparent)",
            }}
          >
            <Icon
              className="h-5 w-5"
              style={{ color: meta.danger ? SEVERITY.critical.fg : "var(--cv-accent-hi)" }}
              aria-hidden
            />
          </div>
          <div>
            <div className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--cv-text)" }}>
              {meta.label}
              {isActive && (
                  <Badge tone="accent">
                    Active
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: "var(--cv-muted)" }}>
                {meta.description}
              </div>
            </div>
          </div>
        </div>

        {/* Scene summary */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {assignedScenes.length > 0 ? (
            assignedScenes.map((s) => (
              <Badge key={s.id} tone="neutral">
                {s.name}
              </Badge>
            ))
          ) : (
            <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
              No scenes assigned — configure to add scene activations.
            </span>
          )}
        </div>

        {/* Last activation result */}
        {isThisResult && lastResult && (
          <div
            className="mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
            style={{
              background: lastResult.failed.length === 0 ? SEVERITY.ok.dim : SEVERITY.warning.dim,
              color: lastResult.failed.length === 0 ? SEVERITY.ok.fg : SEVERITY.warning.fg,
            }}
          >
            {lastResult.failed.length === 0 ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <div>
              <span className="font-bold">
                {lastResult.succeeded} of {lastResult.total} scenes activated
              </span>
              {lastResult.failed.length > 0 && (
                <ul className="mt-1 list-disc list-inside text-xs">
                  {lastResult.failed.map((f) => (
                    <li key={f.sceneId}>{f.name} — failed</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant={meta.danger ? "danger" : "primary"}
            icon={Play}
            onClick={() => onActivate(modeId)}
            disabled={assignedScenes.length === 0}
            title={assignedScenes.length === 0 ? "Assign at least one scene first" : `Activate ${meta.label} mode`}
          >
            Activate
          </Button>
          <Button
            icon={configOpen ? ChevronUp : Settings2}
            onClick={() => setConfigOpen((v) => !v)}
          >
            {configOpen ? "Done" : "Configure"}
          </Button>
        </div>

        {configOpen && (
          <div
            className="mt-4 rounded-xl p-3"
            style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
              Scenes to activate
            </div>
            <SceneSelector
              scenes={scenes}
              selected={config.sceneIds}
              onChange={(ids) => onMapChange(modeId, ids)}
            />
          </div>
        )}
    </div>
  );
}

export function ModesPanel() {
  const { scenes, loading, error, refresh, activate } = useScenes();
  const toast = useToast();

  // Mode map is stored locally — no server endpoint exists for "security modes".
  const [modeMap, setModeMap, mapLoaded] = usePersistentState<ModeMap>(
    "cv-security-mode-map",
    DEFAULT_MODE_MAP
  );
  const [activeModeId, setActiveModeId] = usePersistentState<ModeId | null>(
    "cv-security-active-mode",
    null
  );
  const [lastResult, setLastResult] = useState<ActivationResult | null>(null);
  const [activating, setActivating] = useState<ModeId | null>(null);

  const handleMapChange = useCallback(
    (modeId: ModeId, sceneIds: number[]) => {
      setModeMap((prev) => ({ ...prev, [modeId]: { sceneIds } }));
    },
    [setModeMap]
  );

  const handleActivate = useCallback(
    async (modeId: ModeId) => {
      const config = modeMap[modeId];
      const sceneIds = config.sceneIds;
      if (sceneIds.length === 0) return;

      setActivating(modeId);
      const results = await Promise.allSettled(sceneIds.map((id) => activate(id)));

      const succeeded: number[] = [];
      const failed: { sceneId: number; name: string }[] = [];

      results.forEach((r, i) => {
        const sceneId = sceneIds[i];
        const scene = scenes.find((s) => s.id === sceneId);
        const sceneName = scene?.name ?? String(sceneId);
        if (r.status === "fulfilled" && r.value !== null) {
          succeeded.push(sceneId);
        } else {
          failed.push({ sceneId, name: sceneName });
        }
      });

      const result: ActivationResult = {
        modeId,
        total: sceneIds.length,
        succeeded: succeeded.length,
        failed,
      };

      setLastResult(result);

      if (failed.length === 0) {
        setActiveModeId(modeId);
        toast.ok(
          `${MODE_META[modeId].label} mode activated`,
          `${succeeded.length} scene${succeeded.length !== 1 ? "s" : ""} activated successfully`
        );
      } else if (succeeded.length > 0) {
        // Partial success — still set the mode but surface the issue
        setActiveModeId(modeId);
        toast.push({
          tone: "warning",
          title: `${MODE_META[modeId].label} mode — partial`,
          body: `${succeeded.length} of ${sceneIds.length} scenes succeeded; ${failed.length} device${failed.length !== 1 ? "s" : ""} may be offline`,
        });
      } else {
        toast.err(
          `${MODE_META[modeId].label} mode failed`,
          `All ${sceneIds.length} scene${sceneIds.length !== 1 ? "s" : ""} failed — check device connectivity`
        );
      }

      setActivating(null);
    },
    [modeMap, activate, scenes, setActiveModeId, toast]
  );

  if (loading && !mapLoaded) return <LoadingState label="Loading scenes" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      {/* Critical disclosure: mode state is local, not server-side */}
      <Callout tone="info" title="Mode state is stored locally in this browser">
        Security mode selections and scene assignments are saved in your browser&apos;s local
        storage — they are{" "}
        <strong>not</strong> enforced server-side. Activating a mode issues real scene
        activation commands, but the &quot;active mode&quot; label shown below is purely a
        local preference. Clearing your browser data will reset it.
      </Callout>

      {scenes.length === 0 && !loading && (
        <Callout tone="warning" title="No scenes defined">
          Security modes work by activating sets of scenes. Go to the Scenes section and create
          scenes (e.g. &quot;Away — lock doors&quot;, &quot;Night — arm perimeter&quot;) and
          then assign them to the modes below.
        </Callout>
      )}

      <SectionTitle>Security modes</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODE_IDS.map((modeId) => (
          <ModeCard
            key={modeId}
            modeId={modeId}
            scenes={scenes}
            modeMap={modeMap}
            onMapChange={handleMapChange}
            activeModeId={activeModeId}
            onActivate={handleActivate}
            lastResult={lastResult}
          />
        ))}
      </div>

      {lastResult && (
        <div className="space-y-2">
          <SectionTitle>Last activation detail</SectionTitle>
          <Surface padded>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold" style={{ color: "var(--cv-text)" }}>
                {MODE_META[lastResult.modeId].label} mode
              </span>
              <Badge tone={lastResult.failed.length === 0 ? "ok" : "warning"}>
                {lastResult.succeeded}/{lastResult.total} scenes
              </Badge>
            </div>
            {lastResult.failed.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
                  Failed scenes
                </div>
                {lastResult.failed.map((f) => (
                  <div key={f.sceneId} className="flex items-center gap-2 py-1 text-sm">
                    <XCircle
                      className="h-4 w-4 shrink-0"
                      style={{ color: SEVERITY.critical.fg }}
                      aria-hidden
                    />
                    <span style={{ color: "var(--cv-text)" }}>{f.name}</span>
                    <span style={{ color: "var(--cv-muted)" }}>— device may be offline</span>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
