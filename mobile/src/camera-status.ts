/**
 * Firmware updates and camera faults, in the app's own words.
 *
 * WHY THIS IS DUPLICATED FROM THE CONSOLE
 *
 * The app and the site are separate TypeScript projects and cannot import each
 * other, so `src/app/smarthome/ota-status.ts` and
 * `src/app/smarthome/camera-fault.ts` are mirrored here. Duplication is
 * correct; drift is not, and one surface learning something the other does not
 * is the shape of bug this codebase keeps finding.
 * tests/camera-ota-parity.test.ts fails if only one copy is taught something.
 *
 * WHAT WENT WRONG WITHOUT IT
 *
 * A camera taking an OTA showed "the camera sensor is not responding — check
 * the ribbon cable seating, then reboot". The hardware was fine and the update
 * finished on its own a minute later. Nothing read `otaStatus`, a field the
 * firmware has published since 1.2.0.
 *
 * That is not a confusing sentence, it is somebody on a ladder at a
 * ceiling-mounted camera, during the ninety seconds it was always going to be
 * unavailable, opening up working hardware because the app told them to.
 */

export type OtaPhase = "idle" | "updating" | "failed" | "skipped";

export interface OtaState {
  phase: OtaPhase;
  version: string;
  detail: string;
}

const IDLE: OtaState = { phase: "idle", version: "", detail: "" };

/** Reads `state.otaStatus`, as written by `_otaStatus()` in the shared library. */
export function readOtaStatus(raw: unknown): OtaState {
  if (typeof raw !== "string") return IDLE;
  const s = raw.trim();
  if (!s || s === "-") return IDLE;

  const downloading = /^downloading\s*(.*)$/i.exec(s);
  if (downloading) return { phase: "updating", version: downloading[1].trim(), detail: "" };

  const failed = /^failed:\s*(.*)$/i.exec(s);
  if (failed) return { phase: "failed", version: "", detail: failed[1].trim() };

  const skipped = /^skipped:\s*(.*)$/i.exec(s);
  if (skipped) return { phase: "skipped", version: "", detail: skipped[1].trim() };

  // A rollout that silently installed nothing must not look like one that
  // worked, so an empty manifest is a failure rather than idle.
  if (/^no update offered/i.test(s)) return { phase: "failed", version: "", detail: s };

  // Devices in the field run builds going back years; an unrecognised status
  // becomes idle rather than an update that never clears.
  return IDLE;
}

/**
 * `online` is an input because a device writing an image is not answering
 * MQTT — it goes offline in the middle of a healthy update, which is the most
 * misleading moment in the process and exactly when somebody looks.
 */
export function otaNotice(ota: OtaState, online: boolean): string | null {
  if (ota.phase === "updating") {
    const to = ota.version ? ` to ${ota.version}` : "";
    return online
      ? `Updating firmware${to}. Live view stops while it downloads and the camera restarts on its own — this takes a minute or two.`
      : `Updating firmware${to}. The camera is restarting to finish installing and will come back on its own. Nothing is wrong.`;
  }
  if (ota.phase === "failed") {
    return `The firmware update did not install${ota.detail ? `: ${ota.detail}` : "."} The camera is still on its previous version and is otherwise unaffected.`;
  }
  return null;
}

/** Deliberately excludes `failed`: that update is over and any fault is real. */
export function isUpdating(ota: OtaState): boolean {
  return ota.phase === "updating";
}

export interface CameraFactsInput {
  sccbOk?: unknown;
  sensorPid?: unknown;
  resolutionFault?: unknown;
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

export function sensorLabel(pid: number): string {
  if (pid === 0x26 || pid === 38) return "an OV2640";
  if (pid === 0x3660) return "an OV3660";
  if (pid === 0x5640) return "an OV5640";
  return "a sensor";
}

/**
 * Each branch is tied to something the device actually published, and the last
 * admits what is not known instead of inventing it. The sentence this replaced
 * told people to reseat a ribbon on a camera whose sensor had already named
 * itself, when the real cause was a frame buffer that would not allocate.
 */
export function describeCameraFault(state: CameraFactsInput): string {
  if (typeof state.resolutionFault === "string" && state.resolutionFault) {
    return "The picture size you chose could not be captured on this board, so the camera lowered it automatically and is working. Nothing needs reseating.";
  }

  if (state.sccbOk === true) {
    const id = num(state.sensorPid) ? ` and identifies as ${sensorLabel(num(state.sensorPid))}` : "";
    return `The sensor is alive — it answers on the control bus${id} — but no frame ever completes. That isolates the fault to the parallel data lines, so it is the ribbon rather than the module: power the board down, reseat the cable fully, then reboot.`;
  }

  if (state.sccbOk === false) {
    return "The sensor does not answer at all, so the module is unpowered, unseated or dead. Reseat the ribbon; if that changes nothing the module needs replacing.";
  }

  // A published sensorPid is itself proof the sensor answered — the firmware
  // can only read it after a successful init.
  if (num(state.sensorPid)) {
    return `The sensor started and identified as ${sensorLabel(num(state.sensorPid))}, but no frame completed afterwards. That is either the ribbon, or a picture size this board cannot allocate — they look identical from here. Try a smaller resolution first; it costs nothing.`;
  }

  return "The camera did not start. The device has not reported enough to say whether that is the module, the ribbon or the configured picture size — try a reboot first.";
}
