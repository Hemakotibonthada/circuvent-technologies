import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth";
import { registerPushToken, removePushToken } from "../push";
import { listForUser, markRevoked } from "../app-installs";
import { revokeAllSessions } from "../sessions";

export const accountRouter = Router();

const tokenSchema = z.object({ token: z.string().min(10).max(256), platform: z.string().max(20).optional() });

// POST /account/push-token — register this device's Expo push token.
accountRouter.post("/push-token", requireAuth, async (req: AuthedRequest, res) => {
  const p = tokenSchema.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }
  await registerPushToken(req.user!.uid, p.data.token, p.data.platform ?? "");
  res.json({ success: true });
});

// DELETE /account/push-token — unregister (e.g. on sign-out).
accountRouter.delete("/push-token", requireAuth, async (req: AuthedRequest, res) => {
  const t = String(req.body?.token || "");
  // Scoped to the caller: an unscoped delete lets any authenticated user
  // silence another account's alerts if they ever learn its token.
  if (t) await removePushToken(t, req.user!.uid);
  res.json({ success: true });
});

/*
 * GET /account/sessions — the phones and tablets signed in to this account.
 *
 * This exists before the admin view does, and that ordering is the point. Staff
 * being able to see which devices are on an account is only defensible when the
 * account holder can see the same thing; it is also the more useful of the two,
 * because the person who knows a phone was sold last year is the person who
 * owns it.
 *
 * The IP is included because "signed in from an address you do not recognise"
 * is the signal people actually act on. There are no coordinates here — see the
 * note in app-installs.ts.
 */
accountRouter.get("/sessions", requireAuth, async (req: AuthedRequest, res) => {
  const installs = await listForUser(req.user!.uid);
  res.json({
    sessions: installs.map((i) => ({
      installId: i.installId,
      platform: i.platform,
      osVersion: i.osVersion,
      appVersion: i.appVersion,
      model: i.model,
      lastIp: i.lastIp,
      lastCity: i.lastCity,
      lastCountry: i.lastCountry,
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      revokedAt: i.revokedAt,
      /* So the app can say "this device" rather than making somebody work it
         out from a model name they share with everyone else in the house. */
      current: i.installId === String(req.headers["x-cv-install"] || ""),
    })),
  });
});

/**
 * DELETE /account/sessions/:installId — sign a device out.
 *
 * Marks the install revoked *and* bumps the account's token epoch, because the
 * record alone changes nothing: the token is what grants access, and there is
 * no server-side session to delete. Bumping the epoch signs out every device,
 * which is blunt — but the alternative is a per-device token epoch, and a
 * "sign out" that leaves the lost phone working is worse than one that asks the
 * others to sign in again. The response says so plainly.
 */
accountRouter.delete("/sessions/:installId", requireAuth, async (req: AuthedRequest, res) => {
  const installId = String(req.params.installId || "").slice(0, 64);
  if (!installId) {
    res.status(400).json({ error: "Which device?" });
    return;
  }
  const uid = req.user!.uid;
  const found = await markRevoked(uid, installId);
  if (!found) {
    res.status(404).json({ error: "No such device on this account." });
    return;
  }
  await revokeAllSessions(uid);
  res.json({ success: true, signedOutEverywhere: true });
});
