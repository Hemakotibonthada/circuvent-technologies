/**
 * Reconciling a device's registered type with what the hardware reports.
 *
 * `devices.type` is chosen once, by a human, in Add Device. Nothing validates
 * it against the board that later connects, so a wrong pick is permanent and
 * silent — and it happened: `camera-e8fc-8346` is registered as a camera while
 * running sentinel gas/relay firmware. The console showed it a camera panel
 * that sat on "Waiting for the first frame…" forever, offered Snapshot and
 * Record buttons that could never do anything, and looked healthy throughout.
 * Every layer between the browser and the board gets suspected before the
 * registration label does.
 *
 * The firmware, meanwhile, says exactly what it is on every state publish.
 * `hasCamera:false` alongside gas and relay fields is not ambiguous. Where the
 * label and the hardware disagree, the hardware wins — it is the thing that
 * actually exists.
 *
 * This deliberately does not rewrite anything. It corrects what the console
 * renders so the device is usable now; the stored type is still wrong and the
 * UI still says so, because the durable fix is to correct the registration.
 */
import type { Device } from "@/lib/control-plane";

const CAMERA_TYPES = new Set(["camera", "cctv", "doorbell"]);

/** Sentinel publishes all of these; nothing else in the fleet publishes gas. */
function looksLikeSentinel(state: Record<string, unknown> | null | undefined): boolean {
  if (!state) return false;
  const has = (k: string) => state[k] !== undefined;
  return has("hasGas") && has("gasBaseline") && (has("pads") || has("relays"));
}

/**
 * The device type the console should actually render.
 *
 * Returns the registered type unless the reported state positively contradicts
 * it. Correction requires `hasCamera === false` specifically — a missing field
 * means old firmware that never reported the capability, which is not evidence
 * of anything and must not trigger a rewrite.
 */
export function effectiveDeviceType(device: Pick<Device, "type" | "state">): string {
  const state = device.state as Record<string, unknown> | null | undefined;
  if (CAMERA_TYPES.has(device.type) && state?.hasCamera === false && looksLikeSentinel(state)) {
    return "sentinel";
  }
  return device.type;
}

/** True when {@link effectiveDeviceType} had to override the stored type. */
export function isMistyped(device: Pick<Device, "type" | "state">): boolean {
  return effectiveDeviceType(device) !== device.type;
}

/**
 * Whether this device can produce video, for list and grid filtering.
 *
 * A unit registered as a camera that reports no camera must not occupy a tile
 * in the security wall promising a feed that will never arrive.
 */
export function isCameraDevice(device: Pick<Device, "type" | "state">): boolean {
  return CAMERA_TYPES.has(effectiveDeviceType(device));
}
