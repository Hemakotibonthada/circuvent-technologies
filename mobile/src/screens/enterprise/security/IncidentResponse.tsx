import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../api";
import type { AppEvent, Scene } from "../../../api";
import { useTheme } from "../../../ui";
import { ActionButton, BottomSheet, Callout, CodeBlock, ConfirmDialog, FilterBar, Kpi, KpiGrid, SelectField, TextField, SeverityBadge, EventTimeline } from "../../../enterprise-ui";
import { formatDuration, formatRelative, severityOf } from "../../../enterprise";
import { useSecurityData } from "./useSecurity";
import { DetailRows, EventCard, HonestEmpty, rawJson, SecurityScaffold, Section } from "./parts";
import { eventDeviceName, incidentStore, type Incident, type IncidentStatus, sceneLooksLikeResponse } from "./zones";

type IncidentFilter = "all" | IncidentStatus;

let localIdSeq = 0;
function idNow() { localIdSeq += 1; return `${Date.now()}-${localIdSeq}`; }

export function IncidentResponse({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const data = useSecurityData(true);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filter, setFilter] = useState<IncidentFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sceneId, setSceneId] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState<Incident | null>(null);

  useEffect(() => { incidentStore.load().then((s) => setIncidents(s.incidents ?? [])); }, []);
  async function persist(next: Incident[]) { setIncidents(next); await incidentStore.save({ incidents: next }); }

  const candidates = useMemo(() => data.events.filter((e) => ["critical", "warning"].includes(severityOf(e.kind))), [data.events]);
  const responseScenes = useMemo(() => data.scenes.filter(sceneLooksLikeResponse), [data.scenes]);
  const shown = useMemo(() => filter === "all" ? incidents : incidents.filter((i) => i.status === filter), [incidents, filter]);
  const counts = useMemo(() => ({ all: incidents.length, open: incidents.filter((i) => i.status === "open").length, acknowledged: incidents.filter((i) => i.status === "acknowledged").length, resolved: incidents.filter((i) => i.status === "resolved").length }), [incidents]);
  const resolvedToday = useMemo(() => incidents.filter((i) => i.resolvedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, [incidents]);
  const meanAck = useMemo(() => {
    const vals = incidents.flatMap((i) => i.acknowledgedAt ? [(new Date(i.acknowledgedAt).getTime() - new Date(i.createdAt).getTime()) / 1000] : []);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [incidents]);

  async function createIncident(e: AppEvent) {
    const now = new Date().toISOString();
    const sev = severityOf(e.kind);
    const incident: Incident = { id: idNow(), title: title.trim() || e.title, severity: sev === "success" ? "info" : sev, status: "open", notes: notes.trim() ? [{ id: idNow(), at: now, text: notes.trim() }] : [], linkedEventIds: [e.id], createdAt: now, updatedAt: now, transitions: [{ at: now, from: "created", to: "open", note: "Created from real event" }], sceneRuns: [] };
    setBusy(true);
    if (sceneId) {
      const scene = responseScenes.find((s) => s.id === sceneId);
      try {
        const res = await api.activateScene(sceneId);
        incident.sceneRuns.push({ sceneId, sceneName: scene?.name ?? String(sceneId), at: new Date().toISOString(), success: !!(res as any).data?.success, sent: (res as any).data?.sent });
      } catch (err) {
        incident.sceneRuns.push({ sceneId, sceneName: scene?.name ?? String(sceneId), at: new Date().toISOString(), success: false, error: String(err) });
      }
    }
    await persist([incident, ...incidents]);
    setBusy(false); setSelectedEvent(null); setTitle(""); setNotes(""); setSceneId(0);
  }

  async function transition(i: Incident, to: IncidentStatus, note?: string) {
    const now = new Date().toISOString();
    const next = incidents.map((x) => x.id === i.id ? { ...x, status: to, updatedAt: now, acknowledgedAt: to === "acknowledged" && !x.acknowledgedAt ? now : x.acknowledgedAt, resolvedAt: to === "resolved" ? now : x.resolvedAt, notes: note ? [...x.notes, { id: idNow(), at: now, text: note }] : x.notes, transitions: [...x.transitions, { at: now, from: x.status, to, note }] } : x);
    await persist(next); setSelectedIncident(null); setConfirmResolve(null);
  }

  return <SecurityScaffold title="Incident Response" subtitle="Locally tracked work from real alert events" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <Callout kind="info" title="Local incident register" text="The server has no incident endpoint. Incidents, notes and transitions are stored locally; linked events are real API events." icon="incident" />
    <KpiGrid><Kpi icon="incident" label="Open" value={counts.open} tint={c.red} /><Kpi icon="pending" label="Acknowledged" value={counts.acknowledged} tint={c.amber} /><Kpi icon="success" label="Resolved today" value={resolvedToday} tint={c.green} /><Kpi icon="clock" label="Mean TTA" value={meanAck ? formatDuration(meanAck) : "—"} /></KpiGrid>
    <FilterBar options={[{ value: "all", label: "All", icon: "list" }, { value: "open", label: "Open", icon: "alert", color: c.red }, { value: "acknowledged", label: "Acknowledged", icon: "pending", color: c.amber }, { value: "resolved", label: "Resolved", icon: "success", color: c.green }]} value={filter} onChange={setFilter} counts={counts} />
    <Section title="Tracked incidents" icon="incident">
      {shown.length ? shown.map((i) => <View key={i.id} style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10 }}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><SeverityBadge severity={i.severity} /><Text style={{ color: c.text, fontWeight: "900", flex: 1 }}>{i.title}</Text></View><Text style={{ color: c.faint, fontSize: 12, marginTop: 6 }}>{i.status} · created {formatRelative(i.createdAt)} · events {i.linkedEventIds.join(", ")}</Text><View style={{ marginTop: 10 }}><ActionButton label="Open incident" icon="expand" outline onPress={() => setSelectedIncident(i)} /></View></View>) : <HonestEmpty icon="incident" title="No local incidents" subtitle="Create one from a real critical or warning event below." />}
    </Section>
    <Section title="Create from real alerts" subtitle="Only critical/warning events can seed incidents" icon="alerts">
      {candidates.length ? candidates.map((e) => <EventCard key={e.id} event={e} devices={data.devices} onPress={() => { setSelectedEvent(e); setTitle(e.title); }} />) : <HonestEmpty icon="alerts" title="No alert candidates" subtitle="api.events(200) returned no critical or warning rows." />}
    </Section>
    <BottomSheet visible={!!selectedEvent} onClose={() => setSelectedEvent(null)} title="Create incident">
      {selectedEvent ? <><SeverityBadge severity={severityOf(selectedEvent.kind)} /><DetailRows rows={[{ label: "Source event", value: selectedEvent.title, icon: "alerts" }, { label: "Device", value: eventDeviceName(selectedEvent, data.devices), icon: "device" }]} /><TextField label="Incident title" value={title} onChange={setTitle} placeholder="Required" /><TextField label="Initial notes" value={notes} onChange={setNotes} multiline placeholder="What was observed?" />{responseScenes.length ? <SelectField label="Optional response scene" value={sceneId} onChange={setSceneId} options={[{ value: 0, label: "Do not run a scene", icon: "stop" }, ...responseScenes.map((s: Scene) => ({ value: s.id, label: s.name, icon: "play" as const }))]} help="Runs api.activateScene after the incident is created." /> : <Callout kind="info" text="No response-looking scenes were returned by api.scenes()." icon="scenes" />}<ActionButton label="Create incident" icon="add" onPress={() => createIncident(selectedEvent)} busy={busy} /><CodeBlock label="Linked raw event" text={rawJson(selectedEvent)} /></> : null}
    </BottomSheet>
    <BottomSheet visible={!!selectedIncident} onClose={() => setSelectedIncident(null)} title={selectedIncident?.title ?? "Incident"}>
      {selectedIncident ? <><SeverityBadge severity={selectedIncident.severity} /><DetailRows rows={[{ label: "Status", value: selectedIncident.status, icon: "incident" }, { label: "Linked events", value: selectedIncident.linkedEventIds.join(", "), icon: "link" }, { label: "Created", value: formatRelative(selectedIncident.createdAt), icon: "clock" }]} /><EventTimeline items={selectedIncident.transitions.map((t, idx) => ({ id: `${selectedIncident.id}-${idx}`, title: `${t.from} → ${t.to}`, body: t.note, time: formatRelative(t.at), severity: t.to === "resolved" ? "success" : t.to === "acknowledged" ? "warning" : selectedIncident.severity, icon: "incident" }))} />{selectedIncident.notes.length ? <CodeBlock label="Notes" text={selectedIncident.notes.map((n) => `${n.at}: ${n.text}`).join("\n")} /> : null}{selectedIncident.sceneRuns.length ? <CodeBlock label="Response scene runs" text={rawJson(selectedIncident.sceneRuns)} /> : null}<View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><ActionButton label="Acknowledge" icon="check" onPress={() => transition(selectedIncident, "acknowledged", "Acknowledged by operator")} disabled={selectedIncident.status !== "open"} /></View><View style={{ flex: 1 }}><ActionButton label="Resolve" icon="success" tone={c.green} onPress={() => setConfirmResolve(selectedIncident)} disabled={selectedIncident.status === "resolved"} /></View></View></> : null}
    </BottomSheet>
    <ConfirmDialog visible={!!confirmResolve} title="Resolve incident?" message="Resolution is stored in the local incident register." confirmLabel="Resolve" onConfirm={() => confirmResolve && transition(confirmResolve, "resolved", "Resolved by operator")} onCancel={() => setConfirmResolve(null)} />
  </SecurityScaffold>;
}
