/**
 * The gate access subsystem.
 *
 * One thing runs on a timer, and it is the one the device cannot do for
 * itself: bringing time-of-day and day-of-week rules into and out of force.
 *
 * The barrier holds a flat list of tag numbers in NVS and decides locally,
 * because a driveway box on a long cable run is offline often enough that
 * "ask the server" is not an access-control strategy. It has no clock it can
 * trust either, so a contractor's tag that is only valid until 17:00 cannot be
 * enforced there — it is enforced by the list no longer containing that tag at
 * 17:01.
 */
import { logger } from "../logger";
import { syncAllGates, startGate } from "./sync";

export { gateAccessRouter } from "./routes";
export { syncGate, startGate, __resetGateForTests } from "./sync";

/*
 * A minute.
 *
 * The lag this leaves is the worst case for a time-limited tag: a contractor's
 * vehicle can still open the barrier for up to sixty seconds after their
 * window closes. That is a deliberate trade against pushing a list to every
 * gate on every tick — nothing is sent unless the list actually changed, so a
 * settled site costs one query a minute and no MQTT traffic at all.
 */
const ACL_INTERVAL_MS = 60_000;

let timers: NodeJS.Timeout[] = [];

export function startGateSystem(): void {
  if (timers.length) return;
  startGate();

  const t = setInterval(() => {
    void syncAllGates().catch((err) => logger.error({ err }, "gate acl sweep failed"));
  }, ACL_INTERVAL_MS);

  /* Unreferenced so it cannot hold the process open during a shutdown. */
  t.unref?.();
  timers = [t];

  /*
   * The first pass is delayed rather than run at boot: the broker is still
   * connecting, and a list published before the MQTT client is up goes nowhere
   * while the platform records it as sent — which on an access-control device
   * means believing a revocation took effect when it did not.
   */
  const first = setTimeout(() => {
    void syncAllGates().catch(() => {});
  }, 22_000);
  first.unref?.();
  timers.push(first);

  logger.info("gate access system started");
}

/** Test seam: stops the timers so a suite can exit. */
export function __stopGateForTests(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
