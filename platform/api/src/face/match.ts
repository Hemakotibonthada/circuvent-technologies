/**
 * Face matching for the FaceDoor lock.
 *
 * This module decides whether a face at the door belongs to somebody allowed
 * through it. A false accept opens a physical door to a stranger, so every
 * default here leans towards refusing — and the interesting cases are all
 * about refusing safely rather than matching cleverly.
 *
 * Deliberately pure: no database, no MQTT, no clock beyond what is passed in.
 * Recognition itself happens on the hub's AI node, which produces a
 * descriptor; this decides what to do with one.
 *
 * WHY DESCRIPTORS AND NOT PHOTOS
 *
 * An enrolled face is stored as its embedding, never as an image. A household
 * face database is a serious liability if it leaks, and an embedding is not
 * reversible into a photograph somebody could be recognised from. It also
 * means an enrolment sent from a phone can have its image discarded the moment
 * the descriptor is computed.
 */

/** Length of a face embedding. 128 is dlib/face_recognition; 512 is ArcFace. */
export const DESCRIPTOR_LENGTHS = [128, 512] as const;

/**
 * Distance below which two descriptors are the same person.
 *
 * 0.6 is the widely used dlib threshold for 128-d embeddings and is what the
 * hub's recogniser is tuned against. This is a door, so it is a ceiling rather
 * than a starting point: `matchFace` accepts a stricter threshold from
 * configuration and silently refuses a looser one.
 */
export const DEFAULT_THRESHOLD = 0.6;
export const MAX_THRESHOLD = 0.6;

/**
 * How much closer the best match must be than the runner-up.
 *
 * Without this, two similar-looking people — siblings, a parent and child —
 * both sit just inside the threshold and the winner is decided by noise. The
 * door then opens for whoever the lighting favoured that morning. When the gap
 * is this small the honest answer is "unsure", which is a refusal.
 */
export const MIN_MARGIN = 0.05;

export interface FaceSample {
  id: number;
  profileId: number;
  descriptor: number[];
}

export interface FaceProfile {
  id: number;
  name: string;
  enabled: boolean;
  /** Local time-of-day window, "HH:MM". Absent means always. */
  allowFrom?: string | null;
  allowTo?: string | null;
  /** ISO instant after which the profile stops working. Absent means never. */
  expiresAt?: string | null;
}

export type MatchOutcome =
  | "match"
  | "no-match"
  | "unsure"
  | "disabled"
  | "expired"
  | "out-of-hours";

export interface MatchResult {
  outcome: MatchOutcome;
  profile: FaceProfile | null;
  /** Distance to the closest sample, or null when nothing was comparable. */
  distance: number | null;
  /** Gap to the next-closest person, for the "unsure" case. */
  margin: number | null;
  /** Whether the door should open. Only ever true for "match". */
  grant: boolean;
  reason: string;
}

/** True when the value is a usable embedding. */
export function isDescriptor(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    (DESCRIPTOR_LENGTHS as readonly number[]).includes(v.length) &&
    v.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * Euclidean distance between two embeddings.
 *
 * Returns Infinity for mismatched lengths rather than throwing or comparing
 * the overlap: a 128-d descriptor and a 512-d one come from different models
 * and are not comparable at all. Comparing the first 128 dimensions would
 * produce a number that looks like a distance and means nothing.
 */
export function distance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Minutes since midnight for "HH:MM", or null when unparseable. */
function minutesOfDay(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Whether a profile is usable right now, ignoring the face entirely.
 *
 * Checked before any descriptor comparison, so a disabled or expired profile
 * cannot be granted by an unusually good match — and so the reason recorded is
 * the real one rather than "not recognised".
 */
export function profileUsable(
  p: FaceProfile,
  now: Date
): { ok: true } | { ok: false; outcome: MatchOutcome; reason: string } {
  if (!p.enabled) {
    return { ok: false, outcome: "disabled", reason: `${p.name} is disabled` };
  }
  if (p.expiresAt) {
    const exp = Date.parse(p.expiresAt);
    if (Number.isFinite(exp) && now.getTime() > exp) {
      return { ok: false, outcome: "expired", reason: `${p.name}'s access expired` };
    }
  }

  const from = minutesOfDay(p.allowFrom);
  const to = minutesOfDay(p.allowTo);
  if (from !== null && to !== null) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    /*
     * A window that wraps midnight (22:00–06:00) is a normal way to say
     * "overnight", and treating it as an empty range would lock somebody out
     * for exactly the hours they were given.
     */
    const inside = from <= to ? nowMin >= from && nowMin <= to : nowMin >= from || nowMin <= to;
    if (!inside) {
      return {
        ok: false,
        outcome: "out-of-hours",
        reason: `${p.name} is only allowed between ${p.allowFrom} and ${p.allowTo}`,
      };
    }
  }

  return { ok: true };
}

export interface MatchOptions {
  threshold?: number;
  minMargin?: number;
  now?: Date;
}

/**
 * Identifies a face against the enrolled roster.
 *
 * A person is represented by several samples — different angles, glasses on
 * and off, a beard grown since — and their distance is the *closest* of those,
 * because any one being a good match is evidence it is them. The margin,
 * however, is measured between people rather than between samples: two samples
 * of one person sitting close together says nothing about risk.
 */
export function matchFace(
  probe: number[],
  profiles: FaceProfile[],
  samples: FaceSample[],
  opts: MatchOptions = {}
): MatchResult {
  const now = opts.now ?? new Date();
  /* Clamped, not trusted. A configuration mistake that loosens the threshold
     is a configuration mistake that opens the door to strangers. */
  const threshold = Math.min(opts.threshold ?? DEFAULT_THRESHOLD, MAX_THRESHOLD);
  const minMargin = opts.minMargin ?? MIN_MARGIN;

  const refuse = (reason: string, d: number | null = null): MatchResult => ({
    outcome: "no-match",
    profile: null,
    distance: d,
    margin: null,
    grant: false,
    reason,
  });

  if (!isDescriptor(probe)) return refuse("The face descriptor was malformed");

  const byProfile = new Map<number, number>();
  for (const s of samples) {
    if (!isDescriptor(s.descriptor)) continue;
    const d = distance(probe, s.descriptor);
    if (!Number.isFinite(d)) continue;
    const best = byProfile.get(s.profileId);
    if (best === undefined || d < best) byProfile.set(s.profileId, d);
  }

  const ranked = [...byProfile.entries()]
    .map(([profileId, d]) => ({ profile: profiles.find((p) => p.id === profileId) ?? null, d }))
    .filter((r): r is { profile: FaceProfile; d: number } => r.profile !== null)
    .sort((a, b) => a.d - b.d);

  if (ranked.length === 0) return refuse("Nobody is enrolled on this door");

  const best = ranked[0];
  const runnerUp = ranked[1];
  const margin = runnerUp ? runnerUp.d - best.d : null;

  if (best.d > threshold) {
    return { ...refuse("Face not recognised", best.d), margin };
  }

  /*
   * Ambiguity is resolved before eligibility. If two people are too close to
   * tell apart we do not know who is at the door, and answering "Priya's
   * access has expired" would be a claim about an identity never established.
   */
  if (runnerUp && runnerUp.d <= threshold && margin !== null && margin < minMargin) {
    return {
      outcome: "unsure",
      profile: null,
      distance: best.d,
      margin,
      grant: false,
      reason: `Too close to call between ${best.profile.name} and ${runnerUp.profile.name}`,
    };
  }

  const usable = profileUsable(best.profile, now);
  if (!usable.ok) {
    return {
      outcome: usable.outcome,
      profile: best.profile,
      distance: best.d,
      margin,
      grant: false,
      reason: usable.reason,
    };
  }

  return {
    outcome: "match",
    profile: best.profile,
    distance: best.d,
    margin,
    grant: true,
    reason: `Recognised ${best.profile.name}`,
  };
}

/**
 * Whether a new sample adds anything.
 *
 * Enrolment captures several frames in a row, and consecutive frames of a
 * still face are nearly identical. Storing them all inflates the roster, slows
 * every match and adds no coverage — the point of multiple samples is
 * different conditions, not more of the same one.
 */
export const MIN_SAMPLE_SEPARATION = 0.12;

export function sampleIsUseful(
  candidate: number[],
  existing: number[][],
  minSeparation = MIN_SAMPLE_SEPARATION
): { ok: boolean; reason: string } {
  if (!isDescriptor(candidate)) {
    return { ok: false, reason: "The face descriptor was malformed" };
  }
  for (const e of existing) {
    if (!isDescriptor(e)) continue;
    if (distance(candidate, e) < minSeparation) {
      return {
        ok: false,
        reason: "Too similar to a face already enrolled — try a different angle or expression",
      };
    }
  }
  return { ok: true, reason: "" };
}

/**
 * Whether a candidate sample plausibly belongs to the person being enrolled.
 *
 * Adding somebody else's face to an existing profile — by accident or on
 * purpose — silently grants them that profile's access under another person's
 * name, and nothing downstream would ever notice. A new sample must be within
 * the matching threshold of at least one sample already on that profile.
 *
 * Skipped for the first sample, which has nothing to be consistent with.
 */
export function sampleBelongsToProfile(
  candidate: number[],
  existing: number[][],
  threshold = DEFAULT_THRESHOLD
): { ok: boolean; reason: string } {
  if (!isDescriptor(candidate)) {
    return { ok: false, reason: "The face descriptor was malformed" };
  }
  const usable = existing.filter(isDescriptor);
  if (usable.length === 0) return { ok: true, reason: "" };

  const closest = Math.min(...usable.map((e) => distance(candidate, e)));
  if (closest > threshold) {
    return {
      ok: false,
      reason: "This does not look like the same person. Enrol them as a new profile instead.",
    };
  }
  return { ok: true, reason: "" };
}
