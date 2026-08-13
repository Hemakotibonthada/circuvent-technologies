/**
 * Whether a rule's trigger will ever actually fire.
 *
 * The action half of this editor now refuses commands the device discards.
 * Triggers have the mirror problem and no checking at all: the field name is
 * free text, so `temperature` on a device that publishes `temp` saves cleanly
 * and the rule simply never fires. Nothing errors, because nothing is wrong —
 * the condition is just never true.
 *
 * These are WARNINGS, never refusals, and that distinction is the whole design:
 *
 *   A device's live state contains the fields it has published *so far*. A leak
 *   sensor does not publish `leak` until there is a leak; a tank may not report
 *   `pump` until the pump first runs. Refusing a field that is missing right
 *   now would block exactly the rules that matter most — the ones that watch
 *   for something that has not happened yet.
 *
 * So the operator is told what the device is currently reporting and left to
 * decide. The one thing worth saying firmly is a comparison that cannot work
 * however the state evolves: a boolean compared with `>` is not a typo, it is
 * a misunderstanding, and `operatorsFor` in describe.ts already says the server
 * will not fire it as expected.
 */

import { inferFieldKind } from "@/app/smarthome/automation/describe";

export type TriggerOp = "<" | "<=" | ">" | ">=" | "==" | "!=" | "truthy" | "falsy";

const NUMERIC_OPS: TriggerOp[] = ["<", "<=", ">", ">="];

export interface TriggerCheck {
  /** Shown to the operator. Null when there is nothing worth saying. */
  message: string | null;
  /** `warn` is advisory; `error` is a comparison that cannot work. */
  level: "warn" | "error";
}

const OK: TriggerCheck = { message: null, level: "warn" };

export function checkTrigger(args: {
  field: string;
  op: TriggerOp;
  /** The device's last published state, or null when it has never reported. */
  state: Record<string, unknown> | null;
}): TriggerCheck {
  const field = args.field.trim();
  if (!field) return OK;

  const state = args.state;

  // Never heard from the device. Nothing useful to say, and saying something
  // vague would train the operator to ignore this line.
  if (!state || Object.keys(state).length === 0) return OK;

  const keys = Object.keys(state);

  if (!(field in state)) {
    const near = closestKey(field, keys);
    const suffix = near
      ? ` Did you mean "${near}"?`
      : ` It currently reports: ${keys.slice(0, 8).join(", ")}.`;
    return {
      level: "warn",
      message:
        `This device has not reported "${field}" yet, so the rule will not fire ` +
        `until it does.${suffix}`,
    };
  }

  const kind = inferFieldKind(state[field]);

  if (kind === "boolean" && NUMERIC_OPS.includes(args.op)) {
    return {
      level: "error",
      message:
        `"${field}" is true/false, so comparing it with "${args.op}" will not fire ` +
        `as expected. Use "is set (truthy)" or "is clear (falsy)".`,
    };
  }

  if (kind === "string" && NUMERIC_OPS.includes(args.op)) {
    return {
      level: "error",
      message:
        `"${field}" is text (currently "${String(state[field])}"), so "${args.op}" ` +
        `compares alphabetically rather than numerically. Use "= equals" or ` +
        `"≠ not equal".`,
    };
  }

  return OK;
}

/**
 * The nearest live key, when the typed field looks like a near miss.
 *
 * Two arms, because state-field mistakes come in two shapes:
 *
 * 1. **Abbreviation mismatch** — typing `temperature` when the device reports
 *    `temp`, or `level` when it reports `lvl`. This is probably the commonest
 *    one and edit distance is useless for it: those are seven edits apart.
 *    A prefix test catches it exactly.
 * 2. **Typos** — `levle` for `level`. Optimal string alignment rather than
 *    plain Levenshtein, because the commonest typo is a transposition, which
 *    plain Levenshtein scores as two edits and would push outside any useful
 *    budget. Same reasoning as the shop's search — see src/lib/fuzzy.ts.
 */
function closestKey(input: string, keys: string[]): string | null {
  const a = input.toLowerCase();

  /*
   * Prefix arm first, and floored at three characters. `plug` matching
   * `plumbing` was a real bug in the shop's search; the floor is what stops
   * a two-letter stub matching half the state object.
   */
  const prefixHits = keys.filter((k) => {
    const b = k.toLowerCase();
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return short.length >= 3 && long.startsWith(short);
  });
  if (prefixHits.length === 1) return prefixHits[0];
  // Several plausible prefixes (power / power2 / power3) — a list is more
  // honest than picking one.
  if (prefixHits.length > 1) return null;

  let best: string | null = null;
  let bestScore = Infinity;

  for (const key of keys) {
    const d = osaDistance(a, key.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = key;
    }
  }

  // A budget that scales with length: two edits on a four-letter field is not a
  // typo, it is a different word, and a confidently wrong suggestion is worse
  // than none.
  const budget = a.length <= 4 ? 1 : 2;
  return best !== null && bestScore <= budget ? best : null;
}

function osaDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[m][n];
}
