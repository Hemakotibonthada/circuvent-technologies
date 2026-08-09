import { Router } from "express";
import { pool } from "../db";
import { CAPABILITIES, BUILD } from "../build-info";

export const healthRouter = Router();

/**
 * Liveness, and — more usefully — identity.
 *
 * WHY THIS REPORTS CAPABILITIES AND NOT JUST "ok"
 *
 * A running control plane and a *current* control plane are different things,
 * and nothing here could tell them apart. The container on the VM predates the
 * WebSocket `watch` handler, so cameras publish frames that are never relayed.
 * Every symptom points at the device: the dashboard says "waiting for the
 * first frame" while a camera has sent twenty thousand of them. Diagnosing it
 * took measuring the socket from two independent client stacks, because this
 * endpoint answered `{ok:true}` either way — which was true, and useless.
 *
 * A deployment that cannot say what it supports makes every stale deploy look
 * like a hardware fault. So the build stamps itself and lists the features it
 * actually has, and a client that needs `frameRelay` can check for it and say
 * "the server needs redeploying" instead of leaving a working camera under
 * suspicion.
 */
healthRouter.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "circuvent-control-plane",
      db: "up",
      version: BUILD.version,
      commit: BUILD.commit,
      builtAt: BUILD.builtAt,
      capabilities: CAPABILITIES,
      ts: new Date().toISOString(),
    });
  } catch {
    // Still identify the build on the failure path. "Which version is down" is
    // the first question asked, and a bare 503 does not answer it.
    res.status(503).json({
      ok: false,
      db: "down",
      version: BUILD.version,
      commit: BUILD.commit,
      capabilities: CAPABILITIES,
    });
  }
});
