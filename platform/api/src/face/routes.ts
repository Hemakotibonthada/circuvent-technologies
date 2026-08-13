/**
 * Face enrolment and recognition for the FaceDoor lock.
 *
 * Two ways in, because they suit different moments:
 *
 *   From the phone — the owner enrols themselves, or adds a family member who
 *   is not at the door right now. The app captures frames, computes the
 *   descriptor and sends that; the photograph never leaves the handset.
 *
 *   From the device — somebody is standing at the door and should be enrolled
 *   there and then, without anybody fetching a phone. The door is put into
 *   enrolment mode for a short window and the paired camera captures the
 *   samples.
 *
 * The ESP32 itself has no camera and does not recognise anybody: recognition
 * runs on the hub's AI node, which posts a descriptor here. This decides, and
 * on a grant publishes the unlock the firmware already understands.
 */
import express, { Router } from "express";
import { z } from "zod";
import { pool, recordEvent } from "../db";
import { publishCommand } from "../mqtt";
import { requireAuth, type AuthedRequest } from "../auth";
import { logger } from "../logger";
import {
  matchFace,
  isDescriptor,
  sampleIsUseful,
  sampleBelongsToProfile,
  DESCRIPTOR_LENGTHS,
  type FaceProfile,
  type FaceSample,
} from "./match";
import { getEmbedder, embedFailureMessage } from "./embedder";

export const faceRouter = Router();

/**
 * How many faces one person may enrol.
 *
 * Enough for glasses, a beard, a hat and a few angles. The cap exists because
 * every sample is compared on every unlock, and an unbounded roster turns a
 * door into something that takes a noticeable moment to open.
 */
const MAX_SAMPLES_PER_PROFILE = 12;
const MAX_PROFILES_PER_DEVICE = 50;

/** How long a device-side enrolment window stays open. */
const ENROL_WINDOW_SECONDS = 120;

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

/** Confirms the caller owns the door before anything else happens. */
async function ownsDevice(deviceId: string, uid: number): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM devices WHERE id = $1 AND owner_id = $2`, [
    deviceId,
    uid,
  ]);
  return Boolean(r.rowCount);
}

/** The profile plus its device, so ownership can be checked from a sample id. */
async function profileForOwner(
  profileId: string,
  uid: number
): Promise<ProfileRow | null> {
  const r = await pool.query<ProfileRow>(
    `SELECT p.* FROM face_profiles p
      JOIN devices d ON d.id = p.device_id
     WHERE p.id = $1 AND d.owner_id = $2`,
    [profileId, uid]
  );
  return r.rows[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Roster
 * ------------------------------------------------------------------ */

/** GET /face/profiles?deviceId= — who is enrolled on this door. */
faceRouter.get("/profiles", requireAuth, async (req: AuthedRequest, res) => {
  const deviceId = String(req.query.deviceId || "");
  if (!deviceId || !(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const r = await pool.query(
    `SELECT p.id, p.name, p.role, p.enabled, p.allow_from, p.allow_to,
            p.expires_at, p.created_at,
            COUNT(s.id)::int AS samples,
            MAX(s.created_at)  AS last_enrolled
       FROM face_profiles p
       LEFT JOIN face_samples s ON s.profile_id = p.id
      WHERE p.device_id = $1
      GROUP BY p.id
      ORDER BY p.name`,
    [deviceId]
  );

  res.json({
    profiles: r.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      role: row.role,
      enabled: row.enabled,
      allowFrom: row.allow_from,
      allowTo: row.allow_to,
      expiresAt: row.expires_at,
      samples: row.samples,
      lastEnrolled: row.last_enrolled,
      createdAt: row.created_at,
    })),
    limits: { maxSamples: MAX_SAMPLES_PER_PROFILE, maxProfiles: MAX_PROFILES_PER_DEVICE },
    /*
     * Whether enrolling from a photograph is possible at all.
     *
     * It needs an embedding model, which is deployment configuration this
     * account may simply not have set. Reported alongside the roster so the
     * console can say "enrol at the door instead" before somebody picks a
     * photo — rather than letting them choose one, wait, and get a failure
     * that reads like a broken feature.
     */
    capabilities: {
      photoEnrolment: getEmbedder().name !== "none",
      reason:
        getEmbedder().name === "none"
          ? "Photo enrolment needs a face model. Set FACE_EMBEDDER on the control plane, or enrol at the door."
          : "",
    },
  });
});

const createProfileSchema = z.object({
  deviceId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  role: z.enum(["resident", "guest", "staff"]).optional(),
  allowFrom: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  allowTo: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

/** POST /face/profiles — add a person. */
faceRouter.post("/profiles", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile", detail: parsed.error.issues[0]?.message });
    return;
  }
  const { deviceId, name, role, allowFrom, allowTo, expiresAt } = parsed.data;

  if (!(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const count = await pool.query(
    `SELECT COUNT(*)::int AS n FROM face_profiles WHERE device_id = $1`,
    [deviceId]
  );
  if ((count.rows[0]?.n ?? 0) >= MAX_PROFILES_PER_DEVICE) {
    res.status(409).json({ error: `A door can hold ${MAX_PROFILES_PER_DEVICE} people` });
    return;
  }

  try {
    const r = await pool.query<ProfileRow>(
      `INSERT INTO face_profiles (owner_id, device_id, name, role, allow_from, allow_to, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user!.uid, deviceId, name, role ?? "resident", allowFrom ?? null, allowTo ?? null, expiresAt ?? null]
    );
    await recordEvent(req.user!.uid, "face", `${name} enrolled on this door`, `Role: ${role ?? "resident"}`, deviceId);
    res.status(201).json({ profile: { ...toProfile(r.rows[0]), samples: 0 } });
  } catch (e) {
    /* The unique constraint is on (device_id, name): two people called "Mum"
       on one door would be indistinguishable in every log and every alert. */
    if ((e as { code?: string }).code === "23505") {
      res.status(409).json({ error: `Somebody called ${name} is already enrolled on this door` });
      return;
    }
    throw e;
  }
});

const patchProfileSchema = createProfileSchema.partial().omit({ deviceId: true }).extend({
  enabled: z.boolean().optional(),
});

/** PATCH /face/profiles/:id — rename, suspend, or change the access window. */
faceRouter.patch("/profiles/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = patchProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid change" });
    return;
  }
  const existing = await profileForOwner(req.params.id, req.user!.uid);
  if (!existing) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const p = parsed.data;
  const r = await pool.query<ProfileRow>(
    `UPDATE face_profiles
        SET name       = COALESCE($2, name),
            role       = COALESCE($3, role),
            enabled    = COALESCE($4, enabled),
            allow_from = $5,
            allow_to   = $6,
            expires_at = $7,
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      existing.id,
      p.name ?? null,
      p.role ?? null,
      p.enabled ?? null,
      /* Explicitly nullable: clearing a window is a thing somebody needs to be
         able to do, and COALESCE would make it impossible to express. */
      p.allowFrom === undefined ? existing.allow_from : p.allowFrom,
      p.allowTo === undefined ? existing.allow_to : p.allowTo,
      p.expiresAt === undefined ? existing.expires_at : p.expiresAt,
    ]
  );

  await recordEvent(req.user!.uid, "face", `${r.rows[0].name} updated`, "", existing.device_id);
  res.json({ profile: toProfile(r.rows[0]) });
});

/** DELETE /face/profiles/:id — remove a person and every face they enrolled. */
faceRouter.delete("/profiles/:id", requireAuth, async (req: AuthedRequest, res) => {
  const existing = await profileForOwner(req.params.id, req.user!.uid);
  if (!existing) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  await pool.query(`DELETE FROM face_profiles WHERE id = $1`, [existing.id]);
  await recordEvent(req.user!.uid, "face", `${existing.name} removed from this door`, "", existing.device_id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Samples
 * ------------------------------------------------------------------ */

const sampleSchema = z.object({
  descriptor: z.array(z.number()).refine(isDescriptor, {
    message: `A descriptor must be ${DESCRIPTOR_LENGTHS.join(" or ")} finite numbers`,
  }),
  source: z.enum(["mobile", "device", "web"]).optional(),
  quality: z.number().min(0).max(1).optional(),
});

/**
 * POST /face/profiles/:id/samples — add one face to a person.
 *
 * The two guards here are the reason this is not a plain insert. A sample that
 * duplicates one already stored costs time on every future unlock and buys no
 * coverage; a sample that is somebody *else's* face silently grants them this
 * person's access under this person's name.
 */
faceRouter.post("/profiles/:id/samples", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = sampleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid sample" });
    return;
  }
  const profile = await profileForOwner(req.params.id, req.user!.uid);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const existing = await pool.query<{ descriptor: number[] }>(
    `SELECT descriptor FROM face_samples WHERE profile_id = $1`,
    [profile.id]
  );
  const descriptors = existing.rows.map((r) => r.descriptor);

  if (descriptors.length >= MAX_SAMPLES_PER_PROFILE) {
    res.status(409).json({
      error: `${profile.name} already has ${MAX_SAMPLES_PER_PROFILE} faces enrolled. Remove one first.`,
    });
    return;
  }

  const belongs = sampleBelongsToProfile(parsed.data.descriptor, descriptors);
  if (!belongs.ok) {
    res.status(409).json({ error: belongs.reason, code: "different-person" });
    return;
  }

  const useful = sampleIsUseful(parsed.data.descriptor, descriptors);
  if (!useful.ok) {
    res.status(409).json({ error: useful.reason, code: "too-similar" });
    return;
  }

  const r = await pool.query(
    `INSERT INTO face_samples (profile_id, descriptor, source, quality)
     VALUES ($1, $2::jsonb, $3, $4)
     RETURNING id, source, quality, created_at`,
    [
      profile.id,
      JSON.stringify(parsed.data.descriptor),
      parsed.data.source ?? "mobile",
      parsed.data.quality ?? null,
    ]
  );

  await recordEvent(
    req.user!.uid,
    "face",
    `New face enrolled for ${profile.name}`,
    `Captured from ${parsed.data.source ?? "mobile"} - ${descriptors.length + 1} now stored`,
    profile.device_id
  );

  res.status(201).json({
    sample: { id: Number(r.rows[0].id), source: r.rows[0].source, createdAt: r.rows[0].created_at },
    total: descriptors.length + 1,
    /* Told plainly, because "how many more should I take" is the only question
       somebody has during enrolment. */
    remaining: MAX_SAMPLES_PER_PROFILE - (descriptors.length + 1),
  });
});

/**
 * POST /face/profiles/:id/samples/image — enrol from a photograph.
 *
 * What the phone calls. The image is embedded and then dropped: it is not
 * stored, not logged and not forwarded. A household face database is a serious
 * liability if it leaks, and the descriptor is enough to recognise somebody
 * while being useless to anybody who steals it.
 *
 * The body is the raw image, so an ordinary fetch with a content-type is all
 * the app needs — no multipart parser, and nothing to misconfigure between a
 * phone and a browser.
 */
faceRouter.post(
  "/profiles/:id/samples/image",
  requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "6mb" }),
  async (req: AuthedRequest, res) => {
    const profile = await profileForOwner(req.params.id, req.user!.uid);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const image = req.body as Buffer;
    if (!Buffer.isBuffer(image) || image.length === 0) {
      res.status(400).json({ error: "Send the photo as the request body" });
      return;
    }

    const embedder = getEmbedder();
    const result = await embedder.embed(image, req.header("content-type") || "image/jpeg");

    if (!result.descriptor) {
      /*
       * 503 for "no model configured" and 422 for "this photo did not work".
       * They read the same to a careless client and mean opposite things to
       * the person holding the phone: one is "set your home up", the other is
       * "stand somewhere brighter".
       */
      const status = result.reason === "no_embedder" ? 503 : 422;
      res.status(status).json({
        error: embedFailureMessage(result.reason),
        reason: result.reason,
      });
      return;
    }

    if (!isDescriptor(result.descriptor)) {
      res.status(502).json({ error: "The recogniser returned a descriptor this door cannot use" });
      return;
    }

    const existing = await pool.query<{ descriptor: number[] }>(
      `SELECT descriptor FROM face_samples WHERE profile_id = $1`,
      [profile.id]
    );
    const descriptors = existing.rows.map((r) => r.descriptor);

    if (descriptors.length >= MAX_SAMPLES_PER_PROFILE) {
      res.status(409).json({
        error: `${profile.name} already has ${MAX_SAMPLES_PER_PROFILE} faces enrolled. Remove one first.`,
      });
      return;
    }

    const belongs = sampleBelongsToProfile(result.descriptor, descriptors);
    if (!belongs.ok) {
      res.status(409).json({ error: belongs.reason, code: "different-person" });
      return;
    }
    const useful = sampleIsUseful(result.descriptor, descriptors);
    if (!useful.ok) {
      res.status(409).json({ error: useful.reason, code: "too-similar" });
      return;
    }

    const r = await pool.query(
      `INSERT INTO face_samples (profile_id, descriptor, source)
       VALUES ($1, $2::jsonb, 'mobile')
       RETURNING id, created_at`,
      [profile.id, JSON.stringify(result.descriptor)]
    );

    await recordEvent(
      req.user!.uid,
      "face",
      `New face enrolled for ${profile.name}`,
      `Captured from a phone - ${descriptors.length + 1} now stored`,
      profile.device_id
    );

    res.status(201).json({
      sample: { id: Number(r.rows[0].id), createdAt: r.rows[0].created_at },
      total: descriptors.length + 1,
      remaining: MAX_SAMPLES_PER_PROFILE - (descriptors.length + 1),
      embedMs: result.ms,
    });
  }
);

/** DELETE /face/samples/:id — remove one face, keeping the person. */
faceRouter.delete("/samples/:id", requireAuth, async (req: AuthedRequest, res) => {
  const r = await pool.query<{ profile_id: string; device_id: string; name: string }>(
    `SELECT s.profile_id, p.device_id, p.name
       FROM face_samples s
       JOIN face_profiles p ON p.id = s.profile_id
       JOIN devices d       ON d.id = p.device_id
      WHERE s.id = $1 AND d.owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  if (!r.rowCount) {
    res.status(404).json({ error: "Sample not found" });
    return;
  }

  await pool.query(`DELETE FROM face_samples WHERE id = $1`, [req.params.id]);
  await recordEvent(req.user!.uid, "face", `A face was removed from ${r.rows[0].name}`, "", r.rows[0].device_id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Enrolment at the door
 * ------------------------------------------------------------------ */

const startEnrolSchema = z.object({
  deviceId: z.string().min(1),
  profileId: z.union([z.number(), z.string()]).optional(),
  name: z.string().trim().min(1).max(60).optional(),
});

/**
 * POST /face/enrol/start — put the door into enrolment mode.
 *
 * For enrolling somebody who is standing at the door, without anybody going to
 * fetch a phone. The door shows it is enrolling and the hub captures samples
 * for this profile until the window closes.
 *
 * Deliberately time-boxed and owner-authenticated. A door that can be put into
 * enrolment mode indefinitely, or by anyone, is a door that can be taught to
 * open for a stranger — and unlike a stolen key, nobody would notice.
 */
faceRouter.post("/enrol/start", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = startEnrolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid enrolment request" });
    return;
  }
  const { deviceId, name } = parsed.data;
  if (!(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  let profileId = parsed.data.profileId ? String(parsed.data.profileId) : "";
  let profileName = name ?? "";

  if (profileId) {
    const p = await profileForOwner(profileId, req.user!.uid);
    if (!p || p.device_id !== deviceId) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    profileName = p.name;
  } else {
    if (!name) {
      res.status(400).json({ error: "A name is required to enrol somebody new" });
      return;
    }
    const created = await pool.query<ProfileRow>(
      `INSERT INTO face_profiles (owner_id, device_id, name, role)
       VALUES ($1, $2, $3, 'resident')
       ON CONFLICT (device_id, name) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [req.user!.uid, deviceId, name]
    );
    profileId = created.rows[0].id;
    profileName = created.rows[0].name;
  }

  const expiresAt = new Date(Date.now() + ENROL_WINDOW_SECONDS * 1000).toISOString();

  /*
   * The firmware only needs to know it is enrolling, for how long, and for
   * whom — it shows that on its LED and refuses to act as a normal lock while
   * the window is open. The hub does the capturing.
   */
  publishCommand(deviceId, {
    action: "enrol",
    mode: "face",
    profileId: Number(profileId),
    name: profileName,
    seconds: ENROL_WINDOW_SECONDS,
  });

  await recordEvent(req.user!.uid, "face", `Enrolment started at the door for ${profileName}`, `Open for ${ENROL_WINDOW_SECONDS} seconds`, deviceId);

  res.json({
    ok: true,
    profileId: Number(profileId),
    name: profileName,
    seconds: ENROL_WINDOW_SECONDS,
    expiresAt,
  });
});

/** POST /face/enrol/stop — close the window early. */
faceRouter.post("/enrol/stop", requireAuth, async (req: AuthedRequest, res) => {
  const deviceId = String(req.body?.deviceId || "");
  if (!deviceId || !(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  publishCommand(deviceId, { action: "enrol", mode: "off" });
  await recordEvent(req.user!.uid, "face", "Enrolment closed", "", deviceId);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Recognition
 * ------------------------------------------------------------------ */

const matchSchema = z.object({
  deviceId: z.string().min(1),
  descriptor: z.array(z.number()),
  threshold: z.number().min(0.1).max(0.6).optional(),
});

/**
 * POST /face/match — the hub reports a face; this decides what happens.
 *
 * Every attempt is recorded, including the refusals. The refusals are the
 * valuable half: a stranger at the door at three in the morning is exactly the
 * event somebody wants to find later, and exactly the one a feed built from
 * successful unlocks would omit.
 */
faceRouter.post("/match", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid match request" });
    return;
  }
  const { deviceId, descriptor, threshold } = parsed.data;
  if (!(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const profilesRes = await pool.query<ProfileRow>(
    `SELECT * FROM face_profiles WHERE device_id = $1`,
    [deviceId]
  );
  const samplesRes = await pool.query<{ id: string; profile_id: string; descriptor: number[] }>(
    `SELECT s.id, s.profile_id, s.descriptor
       FROM face_samples s
       JOIN face_profiles p ON p.id = s.profile_id
      WHERE p.device_id = $1`,
    [deviceId]
  );

  const profiles = profilesRes.rows.map(toProfile);
  const samples: FaceSample[] = samplesRes.rows.map((r) => ({
    id: Number(r.id),
    profileId: Number(r.profile_id),
    descriptor: r.descriptor,
  }));

  const result = matchFace(descriptor, profiles, samples, { threshold });

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
      result.reason,
    ]
  );

  if (result.grant && result.profile) {
    /* The firmware already understands this shape — it is the same command the
       hub sent before any of this existed. */
    publishCommand(deviceId, {
      action: "unlock",
      method: "face",
      name: result.profile.name,
    });
    await recordEvent(req.user!.uid, "face", `${result.profile.name} was let in`, result.reason, deviceId);
  } else {
    await recordEvent(req.user!.uid, "face", "A face was refused at the door", result.reason, deviceId);
    logger.info({ deviceId, outcome: result.outcome }, "face refused");
  }

  res.json({
    outcome: result.outcome,
    granted: result.grant,
    name: result.profile?.name ?? null,
    distance: result.distance,
    reason: result.reason,
  });
});

/** GET /face/attempts?deviceId=&limit= — the door's memory, refusals included. */
faceRouter.get("/attempts", requireAuth, async (req: AuthedRequest, res) => {
  const deviceId = String(req.query.deviceId || "");
  if (!deviceId || !(await ownsDevice(deviceId, req.user!.uid))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

  const r = await pool.query(
    `SELECT id, name, outcome, distance, granted, reason, at
       FROM face_attempts
      WHERE device_id = $1
      ORDER BY at DESC
      LIMIT $2`,
    [deviceId, limit]
  );

  res.json({
    attempts: r.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      outcome: row.outcome,
      distance: row.distance,
      granted: row.granted,
      reason: row.reason,
      at: row.at,
    })),
  });
});
