// Feature Flags & Experiments — simple flag management with deterministic
// percentage rollout, plus lightweight A/B experiment tracking (variant
// assignment counters + conversion counters). Exposes `evaluateFlag`, a pure
// helper any part of the app can call to decide whether a flag is on for a
// given stable seed (user id/email/device id) without needing a network call.
//
// SERVER ONLY (the admin CRUD side; `evaluateFlag` itself is a pure function
// and is safe to import from server or client code).

import { createFileStore, shortId } from "./data-file";

export interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
  rolloutPct: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface ExperimentVariant {
  name: string;
  weight: number;
  participants: number;
  conversions: number;
}

export type ExperimentStatus = "draft" | "running" | "completed";

export interface Experiment {
  id: string;
  name: string;
  metricName: string;
  status: ExperimentStatus;
  variants: ExperimentVariant[];
  createdAt: string;
}

interface FlagsDB {
  flags: FeatureFlag[];
  experiments: Experiment[];
}

const store = createFileStore<FlagsDB>("admin-flags.json", () => ({ flags: [], experiments: [] }));

/** Deterministic 32-bit string hash (FNV-1a) — stable across restarts, no crypto needed. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pure helper: is `key` enabled for `seed` (e.g. user id/email)? Safe to call from anywhere. */
export function evaluateFlag(flag: Pick<FeatureFlag, "enabled" | "rolloutPct" | "key">, seed: string): boolean {
  if (!flag.enabled) return false;
  if (flag.rolloutPct >= 100) return true;
  if (flag.rolloutPct <= 0) return false;
  const bucket = hash(`${flag.key}:${seed}`) % 100;
  return bucket < flag.rolloutPct;
}

/** Deterministically assigns one of an experiment's variants for a given seed. */
export function assignVariant(experiment: Pick<Experiment, "variants" | "id">, seed: string): string {
  const total = experiment.variants.reduce((s, v) => s + v.weight, 0) || 1;
  const bucket = hash(`${experiment.id}:${seed}`) % total;
  let acc = 0;
  for (const v of experiment.variants) {
    acc += v.weight;
    if (bucket < acc) return v.name;
  }
  return experiment.variants[0]?.name ?? "control";
}

export function listFlags(): FeatureFlag[] {
  return [...store.read().flags].sort((a, b) => a.key.localeCompare(b.key));
}

export function upsertFlag(input: Partial<FeatureFlag> & { key: string; label: string }): FeatureFlag {
  return store.mutate((db) => {
    const now = new Date().toISOString();
    const existing = db.flags.find((f) => f.key === input.key);
    if (existing) {
      existing.label = input.label;
      existing.description = input.description;
      existing.enabled = input.enabled ?? existing.enabled;
      existing.rolloutPct = input.rolloutPct ?? existing.rolloutPct;
      existing.updatedAt = now;
      return existing;
    }
    const created: FeatureFlag = {
      id: shortId("flag"),
      key: input.key,
      label: input.label,
      description: input.description,
      enabled: input.enabled ?? false,
      rolloutPct: input.rolloutPct ?? 100,
      createdAt: now,
      updatedAt: now,
    };
    db.flags.unshift(created);
    return created;
  });
}

export function deleteFlag(id: string): boolean {
  return store.mutate((db) => {
    const before = db.flags.length;
    db.flags = db.flags.filter((f) => f.id !== id);
    return db.flags.length < before;
  });
}

export function listExperiments(): Experiment[] {
  return [...store.read().experiments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createExperiment(input: { name: string; metricName: string; variantNames: string[] }): Experiment {
  return store.mutate((db) => {
    const created: Experiment = {
      id: shortId("exp"),
      name: input.name,
      metricName: input.metricName,
      status: "draft",
      variants: input.variantNames.map((name) => ({ name, weight: 1, participants: 0, conversions: 0 })),
      createdAt: new Date().toISOString(),
    };
    db.experiments.unshift(created);
    return created;
  });
}

export function setExperimentStatus(id: string, status: ExperimentStatus): Experiment | null {
  return store.mutate((db) => {
    const e = db.experiments.find((x) => x.id === id);
    if (!e) return null;
    e.status = status;
    return e;
  });
}

export function recordParticipant(id: string, variant: string): void {
  store.mutate((db) => {
    const e = db.experiments.find((x) => x.id === id);
    const v = e?.variants.find((x) => x.name === variant);
    if (v) v.participants += 1;
  });
}

export function recordConversion(id: string, variant: string): void {
  store.mutate((db) => {
    const e = db.experiments.find((x) => x.id === id);
    const v = e?.variants.find((x) => x.name === variant);
    if (v) v.conversions += 1;
  });
}

export function deleteExperiment(id: string): boolean {
  return store.mutate((db) => {
    const before = db.experiments.length;
    db.experiments = db.experiments.filter((e) => e.id !== id);
    return db.experiments.length < before;
  });
}
