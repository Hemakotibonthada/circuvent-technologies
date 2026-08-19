/**
 * The attendance system, started and kept running.
 *
 * Three things happen on a timer here, and each exists because the thing it
 * does is *not* caused by an event:
 *
 *   - nobody scans in order to become absent, so a register only becomes
 *     correct when something goes looking for the people who did not arrive;
 *   - a day does not close itself, so hours worked stay open until somebody
 *     decides the shift is over;
 *   - a card allowed only until 19:00 is still on the terminal's list at
 *     19:01 unless the list is rebuilt.
 *
 * All three are cheap — a handful of queries per site — and all three are the
 * difference between a system that is right and one that is right only when
 * somebody happens to be looking at it.
 */
import { logger } from "../logger";
import { syncAll } from "./acl";
import { startAttendance } from "./ingest";
import { notifyAll } from "./notify";
import { sweepRegisters } from "./rollup";

export { attendanceRouter } from "./routes";

/*
 * A minute for the allow-lists.
 *
 * The lag this leaves is the worst case for a time-limited permission: a
 * cleaner's card can work for up to sixty seconds after their window closes.
 * That is a deliberate trade against pushing a roster to every terminal on
 * every tick — nothing is sent unless the list actually changed, so a settled
 * site costs one query a minute and no MQTT traffic at all.
 */
const ACL_INTERVAL_MS = 60_000;

/*
 * Five minutes for the register.
 *
 * Finer would not help: the two things it decides — somebody has become
 * absent, and a day has closed — are both measured in hours, and a parent
 * notified five minutes later is a parent notified at the same time as far as
 * anybody is concerned.
 */
const REGISTER_INTERVAL_MS = 5 * 60_000;

let timers: NodeJS.Timeout[] = [];

/** Wires ingest and the sweeps. Call once at boot, after the MQTT bridge. */
export function startAttendanceSystem(): void {
  if (timers.length) return;
  startAttendance();

  const acl = setInterval(() => {
    void syncAll().catch((err) => logger.error({ err }, "attendance acl sweep failed"));
  }, ACL_INTERVAL_MS);
  const register = setInterval(() => {
    void sweepRegisters()
      .then(() => notifyAll())
      .catch((err) => logger.error({ err }, "attendance register sweep failed"));
  }, REGISTER_INTERVAL_MS);

  /*
   * Unreferenced so neither timer can hold the process open during a shutdown.
   * A control plane that will not exit is one that gets killed, and a
   * SIGKILL mid-write is how a register acquires half a row.
   */
  acl.unref?.();
  register.unref?.();
  timers = [acl, register];

  /*
   * The first pass is deliberately delayed rather than run at boot.
   *
   * Everything else is still connecting — the broker especially — and a
   * roster pushed before the MQTT client is up is a roster that goes nowhere
   * while the database records it as sent.
   */
  const first = setTimeout(() => {
    void syncAll().catch(() => {});
    void sweepRegisters().catch(() => {});
  }, 20_000);
  first.unref?.();
  timers.push(first);

  logger.info("attendance system started");
}

/** Test seam: stops the timers so a suite can exit. */
export function __stopAttendanceForTests(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}
