import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth";
import { registerPushToken, removePushToken } from "../push";

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
