/**
 * What a device is telling us about its own network, and what the owner should
 * be told instead of silence.
 *
 * WHY THIS EXISTS
 *
 * Changing a device's Wi-Fi means asking it to leave the only channel it can
 * answer on. From the app's side the sequence is: a command goes out, the
 * device stops responding, and then either it comes back on the new network or
 * it does not. "Offline" is the same symptom as a crash, a power cut, and a
 * successful switch that is still in progress — so with nothing else to go on,
 * a working re-provision and a bricked one look identical for the ninety
 * seconds that matter most.
 *
 * `_applyWifi()` in firmware/CircuventDevice/CircuventDevice.h already solves
 * this. It announces `switching to <ssid>` *before* dropping the radio,
 * deliberately holding the publish open long enough to leave; it reports `ok`
 * with the new SSID once it is back; and if the new network cannot be joined it
 * restores the previous credentials, reconnects, and says `failed: <why>`.
 *
 * That last part is the important one and it is the reason this flow is safe
 * to offer at all: bad credentials do not strand a device in a wall. It falls
 * back to the network it was already on.
 *
 * None of it was read by anything. Every Circuvent device has been publishing
 * `wifiStatus` and no surface has ever displayed a word of it, so the one
 * moment the firmware goes out of its way to narrate was the one moment the
 * owner was shown a spinner.
 */

export type WifiPhase = "idle" | "switching" | "ok" | "failed" | "unchanged";

export interface WifiState {
  phase: WifiPhase;
  /** The network being moved to, when the device names one. */
  ssid: string;
  /** The device's own words for a failure — never paraphrased. */
  detail: string;
}

const IDLE: WifiState = { phase: "idle", ssid: "", detail: "" };

/**
 * Reads `state.wifiStatus`, as written by `_applyWifi()`.
 *
 * Matched loosely on purpose: devices in the field run builds going back
 * years, and an unrecognised status becomes idle rather than a change that
 * never clears.
 */
export function readWifiStatus(raw: unknown): WifiState {
  if (typeof raw !== "string") return IDLE;
  const s = raw.trim();
  if (!s || s === "-") return IDLE;

  const switching = /^switching to\s+(.*)$/i.exec(s);
  if (switching) return { phase: "switching", ssid: switching[1].trim(), detail: "" };

  const failed = /^failed:\s*(.*)$/i.exec(s);
  if (failed) return { phase: "failed", ssid: "", detail: failed[1].trim() };

  if (/^ok$/i.test(s)) return { phase: "ok", ssid: "", detail: "" };
  if (/^unchanged$/i.test(s)) return { phase: "unchanged", ssid: "", detail: "" };

  return IDLE;
}

/**
 * `online` is an input because a device changing network is not answering, and
 * that gap is the most alarming part of an otherwise healthy operation. Going
 * quiet here is the expected behaviour, not evidence of a fault.
 */
export function wifiNotice(w: WifiState, online: boolean): string | null {
  if (w.phase === "switching") {
    const to = w.ssid ? ` to ${w.ssid}` : "";
    return online
      ? `Moving${to}. The device drops off this network while it joins the new one — give it up to a minute.`
      : `Moving${to}. It has left the old network and has not reported in on the new one yet. This is the expected gap; nothing is wrong.`;
  }
  if (w.phase === "failed") {
    return `Could not join that network${w.detail ? `: ${w.detail}` : "."} The device put its previous Wi-Fi back and is still reachable — check the name and password and try again.`;
  }
  if (w.phase === "unchanged") {
    return "That is already the network this device is on, so nothing changed.";
  }
  return null;
}

/** True while a network change is in flight and the device is expected to be quiet. */
export function isSwitchingWifi(w: WifiState): boolean {
  return w.phase === "switching";
}

/**
 * How a device can be re-provisioned right now.
 *
 * The whole point of asking this question is that the answer decides whether
 * somebody has to walk to the device at all:
 *
 *   - `push`   the device is online, so new credentials can simply be sent to
 *              it. No hotspot, no button, no trip to the wall.
 *   - `remote` it is online, so it can be told to raise its own setup hotspot
 *              and the phone can join that. Still no button.
 *   - `manual` it is not reachable, so the only route left is the physical
 *              button and its setup AP.
 *
 * The app asked for `manual` unconditionally, which is why a perfectly
 * reachable board on the wall still demanded somebody find it, hold a button
 * for three seconds, and hope the phone's scan noticed.
 */
export type ReprovisionRoute = "push" | "remote" | "manual";

export function reprovisionRoute(online: boolean): ReprovisionRoute {
  return online ? "push" : "manual";
}
