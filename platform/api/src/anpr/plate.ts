/**
 * Plate normalisation, validation and burst voting.
 *
 * THE GOVERNING PRINCIPLE, WHICH IS THE SAME ONE Docs/16-ai-assistant.md STATES
 *
 *   > This file decides what is true. The recogniser only proposes.
 *
 * Everything here is pure: no network, no database, no clock. An OCR provider
 * returns a string and a number it made up the meaning of; this module decides
 * whether that string is a plate, what it actually reads, and whether three
 * frames of the same car agree. A gate opens on the output of this file, so it
 * is the part that gets the tests.
 *
 * WHY POSITIONAL CORRECTION RATHER THAN A CONFUSION DICTIONARY
 *
 * Every OCR confuses O with 0, I with 1, S with 5, B with 8. The naive fix is
 * to pick one direction and always apply it, which is wrong in both
 * directions: "MH12AB1234" has an O-shaped glyph in a letter slot and a
 * zero-shaped glyph in a digit slot, and a blanket rule corrupts one to fix the
 * other. An Indian plate has a known *shape*, so the class each position must
 * hold is known before the character is read. Correcting per position fixes
 * both without a dictionary of plates and without guessing.
 */

/**
 * Registered state and union-territory codes.
 *
 * Used to reject a well-shaped string that cannot be a plate — "XX01AB1234"
 * matches the format perfectly and is not a registration. Without this check
 * a smudge that OCRs into a plausible shape becomes a confident read, and a
 * confident wrong read is the failure that opens a gate for a stranger.
 */
export const STATE_CODES = new Set([
  "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "DN", "GA", "GJ",
  "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH", "ML", "MN", "MP",
  "MZ", "NL", "OD", "OR", "PB", "PY", "RJ", "SK", "TN", "TR", "TS", "UK",
  "UA", "UP", "WB",
]);

/**
 * Plate shapes, as character classes. `A` is a letter, `9` is a digit.
 *
 * `groups` is how the shape is printed, and `states` restricts a shape to the
 * registrations that actually use it. Both live here rather than in a separate
 * formatter or validator, because format knowledge in two places is format
 * knowledge that will disagree — which is exactly how "KA01AB1234" once
 * printed as "KA 01A B 1234" and how a Maharashtra plate matched Delhi's
 * letter-district shape and lost a digit.
 *
 * Ties are broken by fewest corrections.
 */
const SHAPES: ReadonlyArray<{
  shape: string;
  kind: PlateKind;
  groups: number[];
  /** When present, only these state codes may use this shape. */
  states?: string[];
}> = [
  { shape: "AA99AA9999", kind: "standard", groups: [2, 2, 2, 4] },   // KA01AB1234
  { shape: "AA99AAA9999", kind: "standard", groups: [2, 2, 3, 4] },  // KA01ABC1234
  { shape: "AA99A9999", kind: "standard", groups: [2, 2, 1, 4] },    // MH12A3456
  /*
   * Delhi writes its RTO as a digit plus a series letter — DL1CAA1111 — and
   * it is the only state that does.
   *
   * Leaving these unrestricted made them a trap rather than a feature: a
   * Maharashtra plate misread as "MH1ZAB1Z34" fits AA9AAA9999 with a single
   * correction (treating the Z as a letter) and fits the correct
   * AA99AA9999 with two, so the wrong shape won on the fewest-corrections
   * rule and silently produced "MH1ZAB1234" — a valid-looking plate, one
   * character different from the real one, which is the worst possible
   * failure for an allow-list.
   */
  { shape: "AA9AAA9999", kind: "standard", groups: [2, 2, 2, 4], states: ["DL"] },
  { shape: "AA9AA9999", kind: "standard", groups: [2, 2, 1, 4], states: ["DL"] },
  { shape: "AA999999", kind: "legacy", groups: [2, 2, 4] },          // older 2+6
  { shape: "99AA9999AA", kind: "bharat", groups: [2, 2, 4, 2] },     // 21BH1234AB
  { shape: "99AA9999A", kind: "bharat", groups: [2, 2, 4, 1] },      // 21BH1234A
];

export type PlateKind = "standard" | "bharat" | "legacy" | "unknown";

/** Digit glyphs that are commonly read as letters, and the letter they are. */
const TO_LETTER: Record<string, string> = {
  "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "8": "B",
};

/** Letter glyphs that are commonly read as digits, and the digit they are. */
const TO_DIGIT: Record<string, string> = {
  O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", A: "4", S: "5", G: "6", B: "8",
};

const isLetter = (c: string) => c >= "A" && c <= "Z";
const isDigit = (c: string) => c >= "0" && c <= "9";

/**
 * Strips everything that is not A-Z or 0-9 and uppercases.
 *
 * Plates are written with spaces, hyphens and occasionally a state emblem
 * between the groups, and no two OCR providers agree on which. Comparing
 * normalised forms is what makes "KA 01 AB 1234" and "KA-01-AB-1234" the same
 * vehicle — including for the allow-list, which is why the same function is
 * used when a rule is saved and when a plate is read.
 *
 * IND / BHARAT country prefixes are dropped: they are printed on the plate but
 * are not part of the registration.
 */
export function normalisePlate(raw: string): string {
  const cleaned = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.replace(/^(?:IND|BHARAT)(?=[A-Z0-9]{6,})/, "");
}

export interface PlateAnalysis {
  /** The corrected plate, or the normalised input when no shape fits. */
  plate: string;
  kind: PlateKind;
  /** True when the string fits a known shape and carries a real state code. */
  valid: boolean;
  /** How many characters positional correction had to change. */
  corrections: number;
  /** How the plate is printed, from the matched shape. Empty when no fit. */
  groups: number[];
  /** Why it was rejected, for the operator-facing "why is this not a plate". */
  reason?: "too_short" | "too_long" | "no_shape" | "unknown_state";
}

/**
 * Fits `raw` to the closest plate shape, correcting class confusions per
 * position, and reports whether the result is a real registration.
 */
export function analysePlate(raw: string): PlateAnalysis {
  const s = normalisePlate(raw);
  if (s.length < 6) return { plate: s, kind: "unknown", valid: false, corrections: 0, groups: [], reason: "too_short" };
  if (s.length > 11) return { plate: s, kind: "unknown", valid: false, corrections: 0, groups: [], reason: "too_long" };

  let best: { out: string; kind: PlateKind; corrections: number; groups: number[] } | null = null;
  let sawShapeButWrongState = false;

  for (const { shape, kind, groups, states } of SHAPES) {
    if (shape.length !== s.length) continue;
    let out = "";
    let corrections = 0;
    let fits = true;

    for (let i = 0; i < shape.length; i++) {
      const want = shape[i];
      const c = s[i];
      if (want === "A") {
        if (isLetter(c)) { out += c; continue; }
        const fixed = TO_LETTER[c];
        if (!fixed) { fits = false; break; }
        out += fixed;
        corrections++;
      } else {
        if (isDigit(c)) { out += c; continue; }
        const fixed = TO_DIGIT[c];
        if (!fixed) { fits = false; break; }
        out += fixed;
        corrections++;
      }
    }
    if (!fits) continue;

    // A shape restricted to particular states is not merely a worse fit for
    // another state, it is not that shape at all — so it is rejected here
    // rather than allowed to win the fewest-corrections comparison below.
    const code = kind === "bharat" ? out.slice(2, 4) : out.slice(0, 2);
    if (states && !states.includes(code)) continue;
    const stateOk = kind === "bharat" ? code === "BH" : STATE_CODES.has(code);
    if (!stateOk) { sawShapeButWrongState = true; continue; }

    // Fewest corrections wins: the shape that needed least reinterpretation is
    // the one the characters actually were.
    if (!best || corrections < best.corrections) best = { out, kind, corrections, groups };
  }

  if (!best) {
    return {
      plate: s,
      kind: "unknown",
      valid: false,
      corrections: 0,
      groups: [],
      reason: sawShapeButWrongState ? "unknown_state" : "no_shape",
    };
  }

  return {
    plate: best.out,
    kind: best.kind,
    valid: true,
    corrections: best.corrections,
    groups: best.groups,
  };
}

/** Convenience predicate for callers that only need a yes/no. */
export function isValidPlate(raw: string): boolean {
  return analysePlate(raw).valid;
}

export interface PlateCandidate {
  /** Whatever the recogniser returned, before any correction. */
  raw: string;
  /** The recogniser's own confidence, 0-100. */
  confidence: number;
  /** Which frame of the burst this came from. */
  seq?: number;
}

export interface PlateVerdict {
  plate: string;
  kind: PlateKind;
  valid: boolean;
  /** Final confidence, 0-100, after agreement and format are accounted for. */
  confidence: number;
  /** How many frames of the burst produced this plate. */
  votes: number;
  /** Frames that produced any candidate at all. */
  samples: number;
  corrections: number;
}

/**
 * Picks one plate from a burst.
 *
 * A burst exists because a single frame of a moving vehicle is a coin toss —
 * motion blur, a headlight flare, a wiper. Three frames of the same car that
 * agree is a far stronger claim than one frame with a high confidence score,
 * and OCR confidence scores are not comparable between providers anyway, so
 * agreement is the signal that is actually trustworthy.
 *
 * Scoring, in order of weight:
 *  - agreement across frames, which is why a burst is taken at all;
 *  - format validity, because a string that is not a registration is not a
 *    read no matter how sure the recogniser was;
 *  - the recogniser's own confidence, as a tie-breaker only.
 *
 * An unreadable burst returns `valid: false` rather than the least-bad guess.
 * "A vehicle arrived and we could not read it" is a useful, actionable fact;
 * a fabricated plate is not, and would be acted on.
 */
export function voteOnBurst(candidates: PlateCandidate[]): PlateVerdict | null {
  if (!candidates.length) return null;

  interface Tally { plate: string; kind: PlateKind; valid: boolean; votes: number; confSum: number; corrections: number }
  const byPlate = new Map<string, Tally>();

  for (const c of candidates) {
    const a = analysePlate(c.raw);
    if (!a.plate) continue;
    const t = byPlate.get(a.plate);
    const conf = Number.isFinite(c.confidence) ? Math.max(0, Math.min(100, c.confidence)) : 0;
    if (t) {
      t.votes++;
      t.confSum += conf;
      // Keep the cheapest interpretation seen for this plate.
      t.corrections = Math.min(t.corrections, a.corrections);
    } else {
      byPlate.set(a.plate, {
        plate: a.plate, kind: a.kind, valid: a.valid, votes: 1, confSum: conf, corrections: a.corrections,
      });
    }
  }
  if (!byPlate.size) return null;

  const samples = candidates.length;
  const ranked = [...byPlate.values()].sort((a, b) => {
    if (a.valid !== b.valid) return a.valid ? -1 : 1;
    if (a.votes !== b.votes) return b.votes - a.votes;
    if (a.corrections !== b.corrections) return a.corrections - b.corrections;
    return b.confSum / b.votes - a.confSum / a.votes;
  });

  const w = ranked[0];
  const meanConf = w.confSum / w.votes;
  const agreement = w.votes / samples;

  /*
   * 60 % agreement, 25 % the recogniser's confidence, 15 % format cleanliness.
   *
   * The recogniser is deliberately the smallest term. Providers report
   * confidence on incomparable scales and all of them are overconfident on a
   * blurred plate — the number that survived contact with reality is how many
   * independent frames produced the same string.
   */
  const formatScore = w.valid ? Math.max(0, 100 - w.corrections * 12) : 0;
  const confidence = Math.round(agreement * 60 + meanConf * 0.25 + formatScore * 0.15);

  return {
    plate: w.plate,
    kind: w.kind,
    valid: w.valid,
    confidence: Math.max(0, Math.min(100, confidence)),
    votes: w.votes,
    samples,
    corrections: w.corrections,
  };
}

/**
 * Formats a plate for display: `KA01AB1234` -> `KA 01 AB 1234`.
 *
 * Stored and compared without spaces, shown with them. A plate is read aloud
 * and copied into a ticket by people, and an unspaced run of ten characters is
 * materially harder to transcribe correctly.
 *
 * The grouping comes from the shape `analysePlate` matched, not from a regex
 * of its own. Keeping a second copy of the format here is what once printed
 * `KA01AB1234` as `KA 01A B 1234`: the district's optional letter was greedy
 * and stole the first character of the series.
 */
export function prettyPlate(plate: string): string {
  const a = analysePlate(plate);
  if (!a.valid || !a.groups.length) return normalisePlate(plate);
  const out: string[] = [];
  let i = 0;
  for (const n of a.groups) {
    out.push(a.plate.slice(i, i + n));
    i += n;
  }
  if (i < a.plate.length) out.push(a.plate.slice(i));
  return out.filter(Boolean).join(" ");
}
