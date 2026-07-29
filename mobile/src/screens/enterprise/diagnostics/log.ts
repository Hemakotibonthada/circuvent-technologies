import { Platform } from "react-native";
import { createStore } from "../../../enterprise";
import type { Severity } from "../../../enterprise";
import { API_BASE } from "../../../config";

export interface DiagnosticLogEntry { id: string; ts: string; severity: Severity; kind: string; title: string; detail?: string; data?: Record<string, unknown> }
interface LogState { entries: DiagnosticLogEntry[] }
const MAX = 160;
const store = createStore<LogState>("diagnostics-log-v1", { entries: [] });
const listeners = new Set<(entries: DiagnosticLogEntry[]) => void>();
let seq = 0;
async function publish(entries: DiagnosticLogEntry[]) { for (const l of listeners) l(entries); }
export function subscribeLogs(listener: (entries: DiagnosticLogEntry[]) => void): () => void { listeners.add(listener); store.load().then((s) => listener(s.entries)).catch(() => listener([])); return () => { listeners.delete(listener); }; }
export async function getLogs(): Promise<DiagnosticLogEntry[]> { return (await store.load()).entries; }
export async function logDiagnostic(entry: Omit<DiagnosticLogEntry, "id" | "ts">): Promise<void> { const current = await store.load(); const next: DiagnosticLogEntry = { ...entry, id: `${Date.now()}-${++seq}`, ts: new Date().toISOString() }; const entries = [next, ...current.entries].slice(0, MAX); await store.save({ entries }); await publish(entries); }
export async function clearDiagnosticLogs(): Promise<void> { await store.save({ entries: [] }); await publish([]); }
export function publicApiHost(): string { try { return new URL(API_BASE).host; } catch { return "configured control plane"; } }
export function makeSupportBundle(input: { deviceCount: number; online: number; stale: number; lastProbe?: Record<string, unknown>; errors: DiagnosticLogEntry[] }): string { const bundle = { generatedAt: new Date().toISOString(), app: { platform: Platform.OS, apiHost: publicApiHost(), note: "Authentication tokens and secrets are intentionally excluded." }, fleet: { devices: input.deviceCount, online: input.online, stale: input.stale }, lastProbe: input.lastProbe ?? null, recentErrors: input.errors.slice(0, 20).map((e) => ({ ts: e.ts, severity: e.severity, kind: e.kind, title: e.title, detail: e.detail, data: e.data })) }; return JSON.stringify(bundle, null, 2); }
