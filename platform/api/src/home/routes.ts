/**
 * Household members and invitations.
 *
 * Sharing a home used to mean sharing the account password. That grants
 * everything — including the ability to change the password and lock the owner
 * out — and leaves no record of who actually opened the door. These routes are
 * the alternative: named people, with a level of access somebody chose, that
 * can be taken away.
 *
 * Every route here is about the *account*, so they check identity rather than
 * role. A member acting inside a home has their `user.uid` rewritten to the
 * home's owner, so a role check alone would let an invited adult manage the
 * household that invited them.
 */
import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { pool, recordEvent } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import { logger } from "../logger";
import { homesFor } from "./membership";
import { canGrant, normaliseRole, refusalFor, capabilitiesOf, ROLES, type HomeRole } from "./roles";

export const homeRouter = Router();

/** Unambiguous alphabet — no I/L/O/0/1 — because people read these aloud. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function inviteCode(n = 8): string {
  const b = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/**
 * How long an invitation lives.
 *
 * Seven days. A standing invite code is a key to somebody's house that they
 * cannot see and did not choose; the one thing worse than sharing a password
 * is sharing one that never expires.
 */
const INVITE_TTL_HOURS = 24 * 7;

/** A home cannot grow without bound; this is a household, not a directory. */
const MAX_MEMBERS = 20;

/**
 * The account making this request, as opposed to the home it is acting in.
 *
 * `user.uid` is the home. Managing a household is an account action, so every
 * route below asks this instead — using uid here would let a member invited
 * into a home invite further people into it.
 */
function actorOf(req: AuthedRequest): number {
  return req.home?.actorId ?? req.user!.uid;
}

/** True when the caller owns the home they are acting in. */
function ownsThisHome(req: AuthedRequest): boolean {
  return actorOf(req) === req.user!.uid;
}

/* ------------------------------------------------------------------ *
 * Homes this account can see
 * ------------------------------------------------------------------ */

/** GET /home/mine — every home the caller can act in, their own first. */
homeRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ homes: await homesFor(actorOf(req)) });
});

/* ------------------------------------------------------------------ *
 * Members
 * ------------------------------------------------------------------ */

/** GET /home/members — who is in this home. */
homeRouter.get("/members", requireAuth, async (req: AuthedRequest, res) => {
  const homeId = req.user!.uid;

  /*
   * Visible to every member, not only the owner. Somebody living in a shared
   * home has a reasonable interest in knowing who else can open its doors, and
   * hiding that makes the household less safe rather than more private.
   */
  const r = await pool.query(
    `SELECT m.member_id, m.role, m.created_at, u.name, u.email
       FROM home_members m
       JOIN users u ON u.id = m.member_id
      WHERE m.home_id = $1
      ORDER BY u.name`,
    [homeId]
  );

  const owner = await pool.query<{ name: string; email: string }>(
    `SELECT name, email FROM users WHERE id = $1`,
    [homeId]
  );

  res.json({
    owner: owner.rows[0]
      ? { id: homeId, name: owner.rows[0].name, email: owner.rows[0].email, role: "owner" }
      : null,
    members: r.rows.map((m) => ({
      id: Number(m.member_id),
      name: m.name,
      email: m.email,
      role: m.role,
      since: m.created_at,
    })),
    you: {
      id: actorOf(req),
      role: req.home?.role ?? "owner",
      /*
       * Sent rather than derived on the client.
       *
       * A screen has to know what to offer, and the alternative is a copy of
       * the role table in the browser that drifts from this one — at which
       * point the console shows a button the server refuses, or worse, hides a
       * control somebody is entitled to and they conclude the feature is
       * broken.
       */
      capabilities: capabilitiesOf(req.home?.role ?? "owner"),
    },
    limits: { maxMembers: MAX_MEMBERS },
  });
});

const inviteSchema = z.object({
  role: z.enum(["adult", "limited", "guest"]),
  email: z.string().email().optional(),
});

/** POST /home/invites — create a single-use, time-boxed invitation. */
homeRouter.post("/invites", requireAuth, async (req: AuthedRequest, res) => {
  if (!ownsThisHome(req)) {
    res.status(403).json({ error: refusalFor(req.home?.role ?? "guest", "manage-members") });
    return;
  }

  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a level of access: adult, limited or guest." });
    return;
  }
  const role = parsed.data.role as HomeRole;
  if (!canGrant("owner", role)) {
    res.status(400).json({ error: "That level of access cannot be granted." });
    return;
  }

  const homeId = req.user!.uid;
  const count = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM home_members WHERE home_id = $1`,
    [homeId]
  );
  if ((count.rows[0]?.n ?? 0) >= MAX_MEMBERS) {
    res.status(409).json({ error: `A home can hold ${MAX_MEMBERS} people.` });
    return;
  }

  const code = inviteCode();
  const expires = new Date(Date.now() + INVITE_TTL_HOURS * 3600_000);

  await pool.query(
    `INSERT INTO home_invites (code, home_id, role, email, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [code, homeId, role, parsed.data.email?.toLowerCase() ?? "", actorOf(req), expires]
  );

  await recordEvent(
    homeId,
    "home",
    `Invited somebody to this home as ${role}`,
    parsed.data.email ? `For ${parsed.data.email}` : "Open to whoever has the code",
    null
  );

  res.status(201).json({
    code,
    role,
    expiresAt: expires.toISOString(),
    /* A deep link, so the invitee does not have to type anything. The code is
       still shown, because a link that fails to open leaves them stuck. */
    link: `circuvent://home/join?code=${code}`,
  });
});

/** GET /home/invites — outstanding invitations. */
homeRouter.get("/invites", requireAuth, async (req: AuthedRequest, res) => {
  if (!ownsThisHome(req)) {
    res.status(403).json({ error: refusalFor(req.home?.role ?? "guest", "manage-members") });
    return;
  }

  const r = await pool.query(
    `SELECT code, role, email, expires_at, used_by, used_at, revoked, created_at
       FROM home_invites
      WHERE home_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [req.user!.uid]
  );

  const now = Date.now();
  res.json({
    invites: r.rows.map((i) => ({
      code: i.code,
      role: i.role,
      email: i.email || null,
      expiresAt: i.expires_at,
      createdAt: i.created_at,
      /* One status rather than three booleans the client has to combine —
         "used, revoked and expired" is not a state anybody needs to reason
         about, and combining them differently in two clients is how a revoked
         invite ends up looking live in one of them. */
      status: i.revoked
        ? "revoked"
        : i.used_at
          ? "accepted"
          : new Date(i.expires_at).getTime() < now
            ? "expired"
            : "open",
    })),
  });
});

/** POST /home/invites/:code/revoke — withdraw an invitation. */
homeRouter.post("/invites/:code/revoke", requireAuth, async (req: AuthedRequest, res) => {
  if (!ownsThisHome(req)) {
    res.status(403).json({ error: refusalFor(req.home?.role ?? "guest", "manage-members") });
    return;
  }

  const r = await pool.query(
    `UPDATE home_invites SET revoked = true
      WHERE code = $1 AND home_id = $2 AND used_at IS NULL
      RETURNING code`,
    [String(req.params.code || "").toUpperCase(), req.user!.uid]
  );
  if (!r.rowCount) {
    res.status(404).json({ error: "That invitation is not open." });
    return;
  }
  res.json({ ok: true });
});

/**
 * POST /home/join — redeem an invitation.
 *
 * Deliberately not scoped to a home: the caller is joining somebody else's,
 * and the code is what says which. Rate-limited by the code space rather than
 * by a counter — eight characters from a 31-letter alphabet is 2^40, and a
 * wrong guess consumes nothing.
 */
homeRouter.post("/join", requireAuth, async (req: AuthedRequest, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!code) {
    res.status(400).json({ error: "Enter the invitation code." });
    return;
  }

  const actor = actorOf(req);

  const found = await pool.query<{
    home_id: string; role: string; email: string; expires_at: string;
    used_at: string | null; revoked: boolean;
  }>(
    `SELECT home_id, role, email, expires_at, used_at, revoked FROM home_invites WHERE code = $1`,
    [code]
  );
  const inv = found.rows[0];

  /*
   * One message for every failure mode.
   *
   * "Already used" and "no such code" told apart would let somebody probe for
   * valid codes, and the person holding a genuine invite is not helped by
   * knowing which kind of dead it is — they need a new one either way.
   */
  const dead = () => res.status(404).json({ error: "That invitation is not valid. Ask for a new one." });

  if (!inv || inv.revoked || inv.used_at) return dead();
  if (new Date(inv.expires_at).getTime() < Date.now()) return dead();

  const homeId = Number(inv.home_id);
  if (homeId === actor) {
    res.status(400).json({ error: "This is your own home." });
    return;
  }

  const role = normaliseRole(inv.role);
  if (!role || role === "owner") {
    logger.warn({ code, role: inv.role }, "invite carries an impossible role");
    return dead();
  }

  if (inv.email) {
    const me = await pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [actor]);
    if ((me.rows[0]?.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      /* An invite addressed to somebody is for them. Saying so plainly is
         safe: the holder already has the code. */
      res.status(403).json({ error: "This invitation was sent to a different address." });
      return;
    }
  }

  /*
   * Claimed in one statement so two people redeeming the same code at once
   * cannot both succeed. The UPDATE only matches while it is still unused, so
   * the loser sees no rows and gets the same "not valid" answer.
   */
  const claimed = await pool.query(
    `UPDATE home_invites SET used_by = $1, used_at = now()
      WHERE code = $2 AND used_at IS NULL AND revoked = false
      RETURNING code`,
    [actor, code]
  );
  if (!claimed.rowCount) return dead();

  await pool.query(
    `INSERT INTO home_members (home_id, member_id, role, invited_by)
     VALUES ($1, $2, $3, (SELECT created_by FROM home_invites WHERE code = $4))
     ON CONFLICT (home_id, member_id) DO UPDATE SET role = EXCLUDED.role`,
    [homeId, actor, role, code]
  );

  await recordEvent(homeId, "home", "Somebody joined this home", `Access: ${role}`, null);

  res.json({ ok: true, homeId, role });
});

const roleChangeSchema = z.object({ role: z.enum(["adult", "limited", "guest"]) });

/** PATCH /home/members/:id — change somebody's level of access. */
homeRouter.patch("/members/:id", requireAuth, async (req: AuthedRequest, res) => {
  if (!ownsThisHome(req)) {
    res.status(403).json({ error: refusalFor(req.home?.role ?? "guest", "manage-members") });
    return;
  }
  const parsed = roleChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose adult, limited or guest." });
    return;
  }

  const r = await pool.query(
    `UPDATE home_members SET role = $1 WHERE home_id = $2 AND member_id = $3 RETURNING member_id`,
    [parsed.data.role, req.user!.uid, req.params.id]
  );
  if (!r.rowCount) {
    res.status(404).json({ error: "They are not a member of this home." });
    return;
  }
  res.json({ ok: true, role: parsed.data.role });
});

/**
 * DELETE /home/members/:id — remove somebody, or leave a home yourself.
 *
 * Both directions through one route because they are the same row. The owner
 * removing a member and a member leaving are different sentences and the same
 * delete, and splitting them would mean two places that must stay in step.
 */
homeRouter.delete("/members/:id", requireAuth, async (req: AuthedRequest, res) => {
  const actor = actorOf(req);
  const target = Number(req.params.id);
  const homeId = req.user!.uid;

  const leavingSelf = target === actor;
  if (!leavingSelf && !ownsThisHome(req)) {
    res.status(403).json({ error: refusalFor(req.home?.role ?? "guest", "manage-members") });
    return;
  }

  const r = await pool.query(
    `DELETE FROM home_members WHERE home_id = $1 AND member_id = $2 RETURNING member_id`,
    [homeId, target]
  );
  if (!r.rowCount) {
    res.status(404).json({ error: "They are not a member of this home." });
    return;
  }

  await recordEvent(
    homeId,
    "home",
    leavingSelf ? "Somebody left this home" : "Somebody was removed from this home",
    "",
    null
  );

  /*
   * No token revocation is needed and none is done. Membership is read from
   * the database on every request, so the next one they make is already
   * refused — which is the reason it is a read rather than a JWT claim.
   */
  res.json({ ok: true });
});

/** GET /home/roles — what each level of access means, for the invite screen. */
homeRouter.get("/roles", requireAuth, (_req, res) => {
  res.json({
    roles: ROLES.filter((r) => r !== "owner").map((role) => ({
      role,
      label: role === "adult" ? "Adult" : role === "limited" ? "Limited" : "Guest",
      description:
        role === "adult"
          ? "Full control, including locks and adding devices. Cannot invite others."
          : role === "limited"
            ? "Everyday control of lights, fans and scenes. No locks, no changes to the home."
            : "Can see the home but cannot control anything.",
    })),
  });
});
