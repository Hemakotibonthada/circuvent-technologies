/**
 * What the device is telling us about a firmware update, and what a viewer
 * should be told instead of a fault.
 *
 * WHY THIS EXISTS
 *
 * A camera mid-update is busy, then briefly gone, then back on a new build.
 * Every one of those looks like a failure to a panel that only asks "is it
 * online" and "is the sensor ready" — so an update in progress rendered as
 * "Camera sensor failed to initialise", under a banner telling the owner to
 * power the board down and reseat a ribbon cable that was never the problem.
 *
 * That is worse than an unhelpful message. It sends somebody up a ladder to a
 * ceiling-mounted camera, during the ninety seconds it was always going to be
 * unavailable, to fix hardware that is working perfectly. A wrong diagnosis
 * spends someone's afternoon; a missing one only spends their patience.
 *
 * The device already publishes everything needed to tell these apart. Nothing
 * here asks it for anything new — this is a reading of `otaStatus`, which has
 * been in the state payload since 1.2.0 and which no surface has ever read.
 */

export type OtaPhase = "idle" | "updating" | "failed" | "skipped";

export interface OtaState {
  phase: OtaPhase;
  /** The version being moved to, when the device names one. */
  version: string;
  /** The device's own words for a failure — never paraphrased. */
  detail: string;
}

const IDLE: OtaState = { phase: "idle", version: "", detail: "" };

/**
 * Reads `state.otaStatus`.
 *
 * The strings come from `_otaStatus()` in firmware/CircuventDevice/
 * CircuventDevice.h and are matched loosely on purpose: a device in the field
 * may be running any build going back years, and an unrecognised status must
 * degrade to "idle" rather than to a phantom update that never clears.
 */
export function readOtaStatus(raw: unknown): OtaState {
  if (typeof raw !== "string") return IDLE;
  const s = raw.trim();
  if (!s || s === "-") return IDLE;

  const downloading = /^downloading\s*(.*)$/i.exec(s);
  if (downloading) {
    return { phase: "updating", version: downloading[1].trim(), detail: "" };
  }

  const failed = /^failed:\s*(.*)$/i.exec(s);
  if (failed) {
    return { phase: "failed", version: "", detail: failed[1].trim() };
  }

  const skipped = /^skipped:\s*(.*)$/i.exec(s);
  if (skipped) {
    return { phase: "skipped", version: "", detail: skipped[1].trim() };
  }

  /*
   * "no update offered at url" is a failure the device words as a statement.
   * It means the URL answered but had nothing to install — a bad pointer, not
   * a bad device — and it must not be filed as idle, or a rollout that silently
   * did nothing looks like a rollout that worked.
   */
  if (/^no update offered/i.test(s)) {
    return { phase: "failed", version: "", detail: s };
  }

  return IDLE;
}

/**
 * The message to show in place of any fault, or null when there is no update.
 *
 * `online` is deliberately an input: a device flashing an image is not
 * answering MQTT, so it goes offline in the middle of a perfectly healthy
 * update. That gap is the single most misleading moment in the whole process
 * and it is exactly when somebody looks.
 */
export function otaNotice(ota: OtaState, online: boolean): string | null {
  if (ota.phase === "updating") {
    const to = ota.version ? ` to ${ota.version}` : "";
    return online
      ? `Updating firmware${to}. The camera stops streaming while it downloads and will restart on its own — this takes a minute or two.`
      : `Updating firmware${to}. The camera is restarting to finish installing and will come back on its own. Nothing is wrong and there is nothing to do.`;
  }
  if (ota.phase === "failed") {
    // Named, because the remedies are completely different: a TLS rejection is
    // a pinned root, a 404 is a bad URL, a bad image is a bad build.
    return `The firmware update did not install${ota.detail ? `: ${ota.detail}` : "."} The camera is still running its previous version and is otherwise unaffected.`;
  }
  return null;
}

/**
 * True while the device should be left alone rather than diagnosed.
 *
 * Callers use this to suppress fault messaging and disable controls, so it
 * deliberately does NOT include `failed` — a failed update is over, the device
 * is back on its old firmware, and any fault showing then is a real one.
 */
export function isUpdating(ota: OtaState): boolean {
  return ota.phase === "updating";
}
