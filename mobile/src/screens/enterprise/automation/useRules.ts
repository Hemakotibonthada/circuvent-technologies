import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Automation, type Device, type Room, type Scene, type AppEvent } from "../../../api";
import { recordActivity } from "./activityLog";
import type { RuleDraft } from "./types";
import { toAutomationBody } from "./types";

export interface RulesState {
  automations: Automation[];
  devices: Device[];
  rooms: Room[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  saveRule: (draft: RuleDraft) => Promise<Automation>;
  removeRule: (rule: Automation) => Promise<void>;
  setEnabled: (rule: Automation, enabled: boolean) => Promise<void>;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function dataOf<T>(res: { ok: boolean; data: T; status: number }): T {
  if (!res.ok) {
    const err = res.data as { error?: string };
    throw new Error(err?.error || `Request failed (${res.status})`);
  }
  return res.data;
}

export function useRules(): RulesState {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ra, rd, rr] = await Promise.all([api.automations(), api.devices(), api.rooms().catch(() => ({ ok: true, status: 200, data: { rooms: [] as Room[] } }))]);
      setAutomations(dataOf(ra).automations);
      setDevices(dataOf(rd).devices);
      setRooms(dataOf(rr).rooms);
    } catch (e) {
      setError(msg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const saveRule = useCallback(async (draft: RuleDraft) => {
    const body = toAutomationBody(draft);
    const res = dataOf(draft.id ? await api.updateAutomation(draft.id, body) : await api.createAutomation(body));
    setAutomations((prev) => draft.id ? prev.map((r) => r.id === draft.id ? res.automation : r) : [res.automation, ...prev]);
    await recordActivity({ kind: draft.id ? "update" : "create", ruleId: res.automation.id, name: res.automation.name, detail: draft.id ? "Rule updated" : "Rule created" });
    return res.automation;
  }, []);

  const removeRule = useCallback(async (rule: Automation) => {
    dataOf(await api.deleteAutomation(rule.id));
    setAutomations((prev) => prev.filter((r) => r.id !== rule.id));
    await recordActivity({ kind: "delete", ruleId: rule.id, name: rule.name, detail: "Rule deleted" });
  }, []);

  const setEnabled = useCallback(async (rule: Automation, enabled: boolean) => {
    const before = automations;
    setAutomations((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled } : r));
    try {
      const res = dataOf(await api.updateAutomation(rule.id, { enabled }));
      setAutomations((prev) => prev.map((r) => r.id === rule.id ? res.automation : r));
      await recordActivity({ kind: enabled ? "enable" : "disable", ruleId: rule.id, name: rule.name, detail: enabled ? "Rule enabled" : "Rule disabled" });
    } catch (e) {
      setAutomations(before);
      throw e;
    }
  }, [automations]);

  return useMemo(() => ({ automations, devices, rooms, loading, error, reload, saveRule, removeRule, setEnabled }), [automations, devices, rooms, loading, error, reload, saveRule, removeRule, setEnabled]);
}

export function useScenes() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rs, rd] = await Promise.all([api.scenes(), api.devices()]);
      setScenes(dataOf(rs).scenes); setDevices(dataOf(rd).devices);
    } catch (e) { setError(msg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { scenes, setScenes, devices, loading, error, reload };
}

export function useEvents(limit = 200) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setEvents(dataOf(await api.events(limit)).events); }
    catch (e) { setError(msg(e)); }
    finally { setLoading(false); }
  }, [limit]);
  useEffect(() => { void reload(); }, [reload]);
  return { events, loading, error, reload };
}
