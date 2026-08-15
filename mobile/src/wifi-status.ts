/**
 * A device's own account of its network change, in the app's words.
 *
 * WHY THIS IS DUPLICATED FROM THE CONSOLE
 *
 * The app and the site are separate TypeScript projects and cannot import each
 * other, so `src/app/smarthome/wifi-status.ts` is mirrored here. Duplication is
 * correct; drift is not, and one surface learning something the other does not
 * is the shape of bug this codebase keeps finding.
 * tests/wifi-status-parity.test.ts fails if only one copy is taught something.
 *
 * WHAT WENT WRONG WITHOUT IT
 *
 * Changing a device's Wi-Fi means asking it to leave the only channel it can
 * answer on, so the device goes quiet by design. With nothing reading its
 * status, that silence was all the app had: a successful switch, a wrong
 * password, and a dead board were the same spinner.
 *
 * `_applyWifi()` in CircuventDevice.h narrates the whole thing — it announces
 * the move before dropping the radio, and if the new network will not take it,
 * it restores the old credentials and comes back to say so. That last part is
 * why pushing credentials remotely is safe at all: a typo does not strand a
 * board inside a wall.
 *
 * Every device has published `wifiStatus` for years. Nothing has ever read it.
 */

export type WifiPhase = "idle" | "switching" | "ok" | "failed" | "unchanged";

export interface WifiState {
  phase: WifiPhase;
  ssid: string;
  detail: string;
}

const IDLE: WifiState = { phase: "idle", ssid: "", detail: "" };

/** Reads `state.wifiStatus`, as written by `_applyWifi()`. */
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

  // Devices in the field run builds going back years; an unrecognised status
  // becomes idle rather than a change that never clears.
  return IDLE;
}

/**
 * `online` is an input because a device changing network is not answering, and
 * that gap is the most alarming part of an otherwise healthy operation.
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
 * `push` and `remote` both mean nobody has to walk anywhere: the device is
 * online, so it can either be handed new credentials directly, or told to
 * raise its own setup hotspot. `manual` is the old route — find the board,
 * hold its button, hope the phone's scan sees the AP — and it is now only what
 * happens when the device genuinely cannot be reached.
 */
export type ReprovisionRoute = "push" | "remote" | "manual";

export function reprovisionRoute(online: boolean): ReprovisionRoute {
  return online ? "push" : "manual";
}
