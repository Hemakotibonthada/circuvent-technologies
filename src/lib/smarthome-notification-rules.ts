// Notification Rules Builder — user-defined state-based rules (any device,
// any field, any comparison) that fire a real browser Notification the
// moment they newly match. This generalizes the fixed set of conditions
// ConsoleProvider already watches (dryRun/overflow/sos/offline) to ANY
// field, without touching ConsoleProvider itself — the page subscribes to
// the same live update stream via useConsole() and evaluates these rules
// independently.

const KEY = "cv-console-notify-rules";

export type CompareOp = "<" | "<=" | ">" | ">=" | "==" | "truthy" | "falsy";

export interface NotifyRule {
  id: string;
  name: string;
  deviceId?: string; // omit to match any device
  field: string;
  op: CompareOp;
  value?: number | string;
  enabled: boolean;
}

export function listRules(): NotifyRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as NotifyRule[]) : [];
  } catch {
    return [];
  }
}

function write(rules: NotifyRule[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export function upsertRule(input: Partial<NotifyRule> & { name: string; field: string; op: CompareOp }): NotifyRule {
  const rules = listRules();
  if (input.id) {
    const next = rules.map((r) => (r.id === input.id ? { ...r, ...input } : r));
    write(next);
    return next.find((r) => r.id === input.id)!;
  }
  const rule: NotifyRule = { id: `nr_${Date.now().toString(36)}`, enabled: true, ...input };
  write([rule, ...rules]);
  return rule;
}

export function toggleRule(id: string, enabled: boolean): void {
  write(listRules().map((r) => (r.id === id ? { ...r, enabled } : r)));
}

export function deleteRule(id: string): void {
  write(listRules().filter((r) => r.id !== id));
}

/** Pure predicate: does this state value satisfy the rule's comparison? */
export function matches(rule: NotifyRule, value: unknown): boolean {
  switch (rule.op) {
    case "truthy":
      return !!value;
    case "falsy":
      return !value;
    case "==":
      return String(value) === String(rule.value);
    case "<":
      return Number(value) < Number(rule.value);
    case "<=":
      return Number(value) <= Number(rule.value);
    case ">":
      return Number(value) > Number(rule.value);
    case ">=":
      return Number(value) >= Number(rule.value);
    default:
      return false;
  }
}
