/**
 * The decisions a face leads to, in one place.
 *
 * `routes.ts` reaches these from an HTTP request and `door.ts` reaches them
 * from a camera frame. Both are asking the same two questions — "may this face
 * open the door" and "may this face be added to this person" — and the answers
 * involve a threshold, a margin, an audit row and, on a grant, an unlock.
 *
 * Two copies of that would be two copies of a security decision, which is the
 * kind of duplication that stays in step for exactly as long as nobody is
 * looking. So the routes and the camera driver share this, and `match.ts`
 * stays what it is: pure arithmetic that knows nothing about databases.
 */
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { logger } from "../logger";
import {
  matchFace,
  sampleIsUseful,
  sampleBelongsToProfile,
  type FaceProfile,
  type FaceSample,
  type MatchResult,
} from "./match";

/** How many faces one person may enrol. Mirrored by the route that enforces it. */
export const MAX_SAMPLES_PER_PROFILE = 12;

interface ProfileRow {
  id: string;
  device_id: string;
  name: string;
  role: string;
  enabled: boolean;
  allow_from: string | null;
  allow_to: string | null;
  expires_at: string | null;
  created_at: string;
}

const toProfile = (r: ProfileRow): FaceProfile => ({
  id: Number(r.id),
  name: r.name,
  enabled: r.enabled,
  allowFrom: r.allow_from,
  allowTo: r.allow_to,
  expiresAt: r.expires_at,
});

/** The roster enrolled against one door, with every stored face. */
export async function loadRoster(
  deviceId: string
): Promise<{ profiles: FaceProfile[]; samples: FaceSample[] }> {
  const [p, s] = await Promise.all([
    pool.query<ProfileRow>(`SELECT * FROM face_profiles WHERE device_id = $1`, [deviceId]),
    pool.query<{ id: string; profile_id: string; descriptor: number[] }>(
      `SELECT s.id, s.profile_id, s.descriptor
         FROM face_samples s
         JOIN face_profiles p ON p.id = s.profile_id
        WHERE p.device_id = $1`,
      [deviceId]
    ),
  ]);
  return {
    profiles: p.rows.map(toProfile),
    samples: s.rows.map((r) => ({
      id: Number(r.id),
      profileId: Number(r.profile_id),
      descriptor: r.descriptor,
    })),
  };
}

export interface DecideOptions {
  /** Where the unlock goes. Usually the lock; the camera when it is the door. */
  lockId?: string | null;
  threshold?: number;
  /** Recorded verbatim on the attempt, so a test capture is never mistaken for a caller. */
  via?: string;
}

/**
 * Judges a descriptor against a door's roster, records it, and acts.
 *
 * Every attempt is written down, including the refusals. The refusals are the
 * valuable half: a stranger at the door at three in the morning is exactly the
 * event somebody wants to find later, and exactly the one a feed built from
 * successful unlocks would omit.
 */
export async function decideFace(
  deviceId: string,
  ownerId: number,
  descriptor: number[],
  opts: DecideOptions = {}
): Promise<MatchResult> {
  const { profiles, samples } = await loadRoster(deviceId);
  const result = matchFace(descriptor, profiles, samples, { threshold: opts.threshold });

  await pool.query(
    `INSERT INTO face_attempts (device_id, profile_id, name, outcome, distance, granted, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      deviceId,
      result.profile ? result.profile.id : null,
      result.profile?.name ?? "",
      result.outcome,
      result.distance,
      result.grant,
      opts.via ? `${result.reason} (${opts.via})` : result.reason,
    ]
  );

  const target = opts.lockId ?? deviceId;
  if (result.grant && result.profile) {
    /* The firmware already understands this shape — it is the same command the
       hub sent before any of this existed. */
    try {
      publishCommand(target, { action: "unlock", method: "face", name: result.profile.name });
    } catch (err) {
      // The decision stands and is already recorded; only the door did not
      // hear it. Swallowing this would report a grant that never opened
      // anything, which is the one outcome nobody could debug from the log.
      logger.error({ err, target }, "face unlock publish failed");
    }
    await recordEvent(ownerId, "face", `${result.profile.name} was let in`, result.reason, deviceId);
  } else {
    await recordEvent(ownerId, "face", "A face was refused at the door", result.reason, deviceId);
    logger.info({ deviceId, outcome: result.outcome }, "face refused");
  }

  return result;
}

export type AddSampleFailure = "full" | "different-person" | "too-similar";

export interface AddSampleResult {
  ok: boolean;
  code?: AddSampleFailure;
  message?: string;
  sampleId?: number;
  total: number;
}

/**
 * Stores one more face for a person, or explains why not.
 *
 * The two refusals are opposites and both matter. "Different person" stops a
 * profile from quietly becoming a second key for somebody else — enrol your
 * flatmate's face onto your own profile and the door can no longer tell you
 * apart, and neither can the log. "Too similar" stops twelve near-identical
 * frames from a single burst filling the roster, which would leave a profile
 * that only recognises one pose while appearing fully enrolled.
 */
export async function addSample(
  profileId: number | string,
  descriptor: number[],
  source: string
): Promise<AddSampleResult> {
  const existing = await pool.query<{ descriptor: number[] }>(
    `SELECT descriptor FROM face_samples WHERE profile_id = $1`,
    [profileId]
  );
  const descriptors = existing.rows.map((r) => r.descriptor);

  if (descriptors.length >= MAX_SAMPLES_PER_PROFILE) {
    return {
      ok: false,
      code: "full",
      message: `This person already has ${MAX_SAMPLES_PER_PROFILE} faces enrolled. Remove one first.`,
      total: descriptors.length,
    };
  }

  const belongs = sampleBelongsToProfile(descriptor, descriptors);
  if (!belongs.ok) {
    return { ok: false, code: "different-person", message: belongs.reason, total: descriptors.length };
  }
  const useful = sampleIsUseful(descriptor, descriptors);
  if (!useful.ok) {
    return { ok: false, code: "too-similar", message: useful.reason, total: descriptors.length };
  }

  const r = await pool.query<{ id: string }>(
    `INSERT INTO face_samples (profile_id, descriptor, source)
     VALUES ($1, $2::jsonb, $3)
     RETURNING id`,
    [profileId, JSON.stringify(descriptor), source]
  );

  return { ok: true, sampleId: Number(r.rows[0].id), total: descriptors.length + 1 };
}
