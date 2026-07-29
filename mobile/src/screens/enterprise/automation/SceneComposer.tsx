import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, type Scene, type SceneAction, type SceneBody } from "../../../api";
import type { IconName } from "../../../icons";
import { Screen, ToastHost, useTheme, useToast, EmptyState } from "../../../ui";
import { ActionButton, CodeBlock, ConfirmDialog, ScreenHeader, SelectField, TextField, ToggleField } from "../../../enterprise-ui";
import { SceneActionEditor } from "./commandComposer";
import { recordActivity } from "./activityLog";
import { sceneSummary } from "./humanize";
import { ScreenScaffold, SectionCard, SmallButton } from "./parts";
import { safeJson } from "./types";
import { useScenes } from "./useRules";

const ICONS: IconName[] = ["scenes", "home", "weather", "security", "energy", "leaf", "sparkles", "clock", "power", "curtain", "gate", "hvac", "fanBlade", "bell", "star"];

function draftFrom(scene?: Scene) { return scene ? { id: scene.id, name: scene.name, icon: scene.icon, favorite: scene.favorite, actions: scene.actions.map((a) => ({ deviceId: a.deviceId, command: { ...a.command } })) } : { name: "", icon: "scenes", favorite: false, actions: [] as SceneAction[] }; }

export default function SceneComposer({ onBack }: { onBack: () => void }) {
  const { c } = useTheme(); const toast = useToast(); const state = useScenes();
  const [editing, setEditing] = useState<Scene | "new" | null>(null); const [confirm, setConfirm] = useState<Scene | null>(null); const [busy, setBusy] = useState<number | "save" | null>(null);
  const activate = async (s: Scene) => { setBusy(s.id); try { const r = await api.activateScene(s.id); if (!r.ok) throw new Error((r.data as { error?: string }).error || "Activation failed"); const sent = r.data.sent; await recordActivity({ kind: "scene-activate", sceneId: s.id, name: s.name, detail: `${sent} command${sent === 1 ? "" : "s"} sent` }); toast.show(`Scene activated: ${sent} sent`); } catch (e) { toast.show(e instanceof Error ? e.message : "Activation failed"); } finally { setBusy(null); } };
  if (editing) return <SceneEditor scene={editing === "new" ? undefined : editing} devices={state.devices} onBack={() => { setEditing(null); void state.reload(); }} />;
  return <Screen><ScreenHeader title="Scene Composer" subtitle="The supported multi-action primitive" onBack={onBack} actions={[{ icon: "add", label: "Create scene", onPress: () => setEditing("new") }, { icon: "refresh", label: "Reload", onPress: state.reload }]} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><ScreenScaffold loading={state.loading} error={state.error} onRetry={state.reload}>
      {!state.scenes.length ? <EmptyState title="No scenes yet" subtitle="Scenes are real API objects with ordered device commands." actionLabel="Create scene" onAction={() => setEditing("new")} /> : state.scenes.map((s) => <SectionCard key={s.id} title={s.name} icon={(s.icon as IconName) || "scenes"} right={<Text style={{ color: c.faint, fontWeight: "800" }}>{s.actions.length} actions</Text>}>
        <Text style={{ color: c.textDim, lineHeight: 20, marginBottom: 12 }}>{sceneSummary(s, state.devices)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><SmallButton label="Activate" icon="play" onPress={() => void activate(s)} disabled={busy === s.id} /><SmallButton label="Edit" icon="edit" onPress={() => setEditing(s)} /><SmallButton label="Delete" icon="trash" danger onPress={() => setConfirm(s)} /></View>
      </SectionCard>)}
      <ActionButton label="Create scene" icon="add" onPress={() => setEditing("new")} />
    </ScreenScaffold></ScrollView>
    <ConfirmDialog visible={!!confirm} title="Delete scene?" message={confirm ? `Delete “${confirm.name}”?` : ""} destructive confirmLabel="Delete" busy={busy === confirm?.id} onCancel={() => setConfirm(null)} onConfirm={async () => { if (!confirm) return; setBusy(confirm.id); try { await api.deleteScene(confirm.id); await recordActivity({ kind: "scene-delete", sceneId: confirm.id, name: confirm.name }); toast.show("Scene deleted"); setConfirm(null); await state.reload(); } catch (e) { toast.show(e instanceof Error ? e.message : "Delete failed"); } finally { setBusy(null); } }} />
    <ToastHost toast={toast.toast} onHide={toast.hide} /></Screen>;
}

function SceneEditor({ scene, devices, onBack }: { scene?: Scene; devices: import("../../../api").Device[]; onBack: () => void }) {
  const { c } = useTheme(); const toast = useToast(); const [draft, setDraft] = useState(draftFrom(scene)); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const body: SceneBody = useMemo(() => ({ name: draft.name.trim(), icon: draft.icon, favorite: draft.favorite, actions: draft.actions }), [draft]);
  const move = (i: number, dir: -1 | 1) => { const next = [...draft.actions]; const j = i + dir; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j], next[i]]; setDraft({ ...draft, actions: next }); };
  const save = async () => { if (!draft.name.trim()) { setError("Scene name is required."); return; } if (draft.actions.some((a) => !a.deviceId || !Object.keys(a.command || {}).length)) { setError("Every scene action needs a device and non-empty command object."); return; } setBusy(true); setError(null); try { const res = scene ? await api.updateScene(scene.id, body) : await api.createScene(body); if (!res.ok) throw new Error((res.data as { error?: string }).error || "Save failed"); await recordActivity({ kind: scene ? "scene-update" : "scene-create", sceneId: res.data.scene?.id ?? scene?.id, name: body.name || "Scene" }); toast.show("Scene saved"); onBack(); } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setBusy(false); } };
  return <Screen><ScreenHeader title={scene ? "Edit Scene" : "Create Scene"} subtitle="Ordered commands, no drag gesture required" onBack={onBack} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"><SectionCard title="Scene details" icon="scenes"><TextField label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} error={!draft.name.trim() && error ? "Name is required." : undefined} /><SelectField label="Icon" value={draft.icon} options={ICONS.map((i) => ({ value: i, label: i, icon: i }))} onChange={(icon) => setDraft({ ...draft, icon })} /><ToggleField label="Favourite" value={draft.favorite} onChange={(favorite) => setDraft({ ...draft, favorite })} icon="star" /></SectionCard>
      <SectionCard title="Ordered actions" icon="list" right={<SmallButton label="Add" icon="add" onPress={() => setDraft({ ...draft, actions: [...draft.actions, { deviceId: devices[0]?.id || "", command: {} }] })} />}>{draft.actions.length === 0 ? <Text style={{ color: c.faint }}>Add at least one device command.</Text> : draft.actions.map((a, i) => <SceneActionEditor key={i} action={a} devices={devices} index={i} canUp={i > 0} canDown={i < draft.actions.length - 1} onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => setDraft({ ...draft, actions: draft.actions.filter((_, x) => x !== i) })} onChange={(next) => setDraft({ ...draft, actions: draft.actions.map((x, n) => n === i ? next : x) })} />)}</SectionCard>
      <SectionCard title="Exact scene payload" icon="terminal"><CodeBlock text={safeJson(body)} label="SceneBody" /></SectionCard>{error ? <TextField label="Save error" value={error} onChange={() => {}} editable={false} /> : null}<ActionButton label="Save scene" icon="save" onPress={save} busy={busy} disabled={busy} /></ScrollView><ToastHost toast={toast.toast} onHide={toast.hide} /></Screen>;
}
