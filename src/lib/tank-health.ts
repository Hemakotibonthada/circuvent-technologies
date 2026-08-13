/**
 * Problems with a tank's radio sensor.
 *
 * These need their own detector because **the controller stays online while its
 * sensor dies**. The starter is mains powered and on Wi-Fi; it keeps reporting,
 * keeps answering commands, and looks perfectly healthy. Every existing
 * detector — offline, stale, standby drain — is looking at the controller and
 * sees nothing wrong.
 *
 * Meanwhile the thing that fills the tank has quietly stopped. The firmware
 * refuses to pump on a level nobody is measuring, which is correct and is the
 * whole point of the freshness work, but it means the failure mode is now:
 * everything looks fine, and one day there is no water.
 *
 * The system knows. It has known for hours. Nothing was telling anyone, which
 * makes it the same silent-failure class as the rest of this codebase — just
 * one level up, at the product rather than the code.
 *
 * The most useful finding here is the low battery one, because it is the only
 * one that arrives before the outage rather than during it.
 */

import type { Device } from "@/lib/control-plane";
import { readTankLink, formatAge, type TankDeviceState } from "@/lib/tank-link";
import type { Finding } from "@/lib/ai/analysis";

/** Warn about the sensor cell at this remaining percentage. */
export const TANK_BATTERY_WARN_PCT = 20;

/**
 * Rejected packets that mean something.
 *
 * A handful over a device's lifetime is ordinary: 433 MHz is a shared band and
 * other people's transmissions occasionally pass CRC and then fail the MAC,
 * which is exactly the check doing its job. A large number means either a
 * neighbour's unit is colliding with this one, or somebody is deliberately
 * transmitting at it.
 */
export const TANK_REJECT_NOTABLE = 50;

function isTank(d: Device): boolean {
  return d.type === "watertank";
}

export function findTankSensorProblems(devices: Device[]): Finding[] {
  const out: Finding[] = [];

  for (const d of devices.filter(isTank)) {
    const state = (d.state ?? {}) as TankDeviceState;

    // A controller that is itself offline is already reported by
    // findOfflineDevices. Adding a second finding for the same outage buries
    // the one that actually needs acting on.
    if (d.online === false) continue;

    const link = readTankLink(state);
    const name = d.name || d.id;

    if (link.status === "lost") {
      out.push({
        id: `tank-sensor-lost:${d.id}`,
        severity: "critical",
        title: `${name} has lost its tank sensor`,
        detail:
          `No reading from the sensor on the tank for ${formatAge(link.ageS ?? 0)}. ` +
          "The controller will not fill the tank without a current level, so the " +
          "overhead tank is no longer being topped up.",
        deviceIds: [d.id],
        evidence: {
          ageSeconds: link.ageS ?? 0,
          // Evidence is a flat map of primitives; a null would render as an
          // empty row telling the reader nothing. Omit what we do not know.
          ...(link.batteryPct !== null ? { batteryPct: link.batteryPct } : {}),
          ...(link.rssi !== null ? { rssi: link.rssi } : {}),
        },
        suggestion:
          link.batteryPct !== null && link.batteryPct <= TANK_BATTERY_WARN_PCT
            ? "The sensor battery was low when it last reported — replace or recharge it."
            : "Check the sensor unit on the tank: battery, and that its antenna is clear.",
      });
      continue;
    }

    if (link.status === "waiting") {
      out.push({
        id: `tank-sensor-silent:${d.id}`,
        severity: "warning",
        title: `${name} is paired to a sensor it cannot hear`,
        detail:
          "A tank sensor is paired but has never reported. Auto-fill cannot run " +
          "without a level.",
        deviceIds: [d.id],
        evidence: {},
        suggestion:
          "Check the sensor has power, and that it is in range — re-pair it if it was replaced.",
      });
      continue;
    }

    if (link.status === "unpaired") {
      /*
       * Only worth raising when somebody has asked for auto-fill. An installer
       * part way through a job does not need to be told the thing they have not
       * done yet is not done.
       */
      if (state && (state as Record<string, unknown>).auto === true) {
        out.push({
          id: `tank-sensor-unpaired:${d.id}`,
          severity: "warning",
          title: `${name} has auto-fill on but no tank sensor`,
          detail:
            "Auto-fill is switched on, but no sensor is paired, so the controller " +
            "has no level to work from and will not run the pump.",
          deviceIds: [d.id],
          evidence: {},
          suggestion: "Pair the sensor fitted to the tank, or switch auto-fill off.",
        });
      }
      continue;
    }

    if (link.status === "fault") {
      /*
       * A sensor that is reporting but reporting nonsense. Distinct from a dead
       * link: the radio is fine, so signal advice would send someone in the
       * wrong direction entirely.
       */
      out.push({
        id: `tank-sensor-fault:${d.id}`,
        severity: "warning",
        title: `${name}'s tank sensor is reporting out of range`,
        detail:
          "The sensor is transmitting normally, but its distance readings are not " +
          "plausible for the configured tank, so no level can be derived.",
        deviceIds: [d.id],
        evidence: {},
        suggestion:
          "Check it is mounted clear of the inlet stream and pointing at the water, " +
          "and that the tank's empty and full distances are set correctly.",
      });
    }

    if (link.status === "stale") {
      out.push({
        id: `tank-sensor-stale:${d.id}`,
        severity: "warning",
        title: `${name} is not hearing its tank sensor`,
        detail:
          `Last reading ${formatAge(link.ageS ?? 0)} ago. Auto-fill is paused until ` +
          "the sensor reports again.",
        deviceIds: [d.id],
        evidence: {
          ageSeconds: link.ageS ?? 0,
          ...(link.rssi !== null ? { rssi: link.rssi } : {}),
        },
        suggestion:
          "Usually a weak signal or a tiring battery. If it clears on its own but keeps " +
          "returning, move the controller's antenna.",
      });
    }

    /*
     * Battery is reported separately from link state on purpose: it is the one
     * finding that arrives BEFORE the outage. Once the cell is flat this
     * becomes a "lost" finding and somebody is already without water.
     *
     * No need to exclude the lost case here — it returns above, which the
     * compiler confirms by narrowing `status` to exclude "lost" at this point.
     */
    if (link.batteryPct !== null && link.batteryPct <= TANK_BATTERY_WARN_PCT) {
      out.push({
        id: `tank-battery:${d.id}`,
        severity: link.batteryPct <= 10 ? "warning" : "info",
        title: `${name}'s tank sensor battery is low`,
        detail:
          `The sensor on the tank reports ${link.batteryPct}% battery. When it runs ` +
          "out the controller stops receiving levels and auto-fill stops.",
        deviceIds: [d.id],
        evidence: { batteryPct: link.batteryPct },
        suggestion: "Replace or recharge the cell in the tank unit before it stops reporting.",
      });
    }

    const rejected = Number((state as Record<string, unknown>).rfRejected ?? 0);
    if (Number.isFinite(rejected) && rejected >= TANK_REJECT_NOTABLE) {
      out.push({
        id: `tank-rf-rejected:${d.id}`,
        severity: "info",
        title: `${name} is discarding radio packets`,
        detail:
          `${rejected} packets have been rejected because they were not signed by the ` +
          "paired sensor, or repeated one already received. The controller ignored them.",
        deviceIds: [d.id],
        evidence: { rejected },
        suggestion:
          "Usually another 433 MHz device nearby. Worth a look if it climbs quickly, " +
          "since it can also mean a neighbouring unit is colliding with yours.",
      });
    }
  }

  return out;
}
