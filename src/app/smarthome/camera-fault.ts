/**
 * Why a camera is not producing frames, said only as precisely as the evidence
 * allows.
 *
 * WHY THIS IS NOT A STRING IN THE COMPONENT
 *
 * The fallback used to be "The camera sensor is not responding. Check the
 * ribbon cable seating, then reboot." It fired whenever the cause was unknown,
 * and it was wrong in the case that actually happened: the sensor was
 * responding — it had answered on SCCB and identified itself as an OV2640 —
 * and the real cause was a frame buffer that could not be allocated at the
 * configured resolution. The remedy was a number, not a cable.
 *
 * The cost of that is not a confusing sentence. It is somebody on a ladder at a
 * ceiling-mounted camera, unlatching a connector on hardware that was working,
 * because the console told them to. An uncertain diagnosis stated confidently
 * is worse than an honest "I do not know yet", because only one of them leaves
 * the reader looking for the real cause.
 *
 * So each branch below is tied to something the device actually published, and
 * the last one admits what is not known instead of inventing it.
 */

export interface CameraFactsInput {
  /** `sccbAlive()` — the sensor answered a register read on SIOD/SIOC. */
  sccbOk?: unknown;
  /** Sensor product id, only ever set after a successful init. */
  sensorPid?: unknown;
  /** Set by firmware >= 1.14.1 when it lowered the picture to get a frame. */
  resolutionFault?: unknown;
  /** Captures the firmware attempted and failed. */
  dropped?: unknown;
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/** Human name for the sensors this firmware supports, for the diagnosis text. */
export function sensorLabel(pid: number): string {
  if (pid === 0x26 || pid === 38) return "an OV2640";
  if (pid === 0x3660) return "an OV3660";
  if (pid === 0x5640) return "an OV5640";
  return "a sensor";
}

export function describeCameraFault(state: CameraFactsInput): string {
  /*
   * The device fixed it itself. Say so plainly and stop — a recovered camera
   * must not also be carrying instructions to go and inspect it.
   */
  if (typeof state.resolutionFault === "string" && state.resolutionFault) {
    return `The picture size you chose could not be captured on this board, so the camera lowered it automatically and is working. Nothing needs reseating. Raise it again if you want, but expect this to repeat — the largest sizes need more memory than this unit has free.`;
  }

  /*
   * SCCB runs on SIOD/SIOC alone; frame data rides eleven other pins. A sensor
   * that answers a register read while no frame ever completes localises the
   * fault to the parallel bus, and that is a ribbon rather than a module.
   */
  if (state.sccbOk === true) {
    const id = num(state.sensorPid)
      ? ` and identifies as ${sensorLabel(num(state.sensorPid))}`
      : "";
    return `The sensor is alive — it answers on the control bus${id} — but no frame ever completes. That isolates the fault to the parallel data lines, so it is the ribbon rather than the module: power the board down, unlatch the connector, reseat the cable fully and latch it, then reboot.`;
  }

  if (state.sccbOk === false) {
    return "The sensor does not answer at all, so the module is unpowered, unseated or dead. Reseat the ribbon; if that changes nothing the camera module needs replacing.";
  }

  /*
   * No explicit SCCB result — but a published `sensorPid` is itself proof the
   * sensor answered, because the firmware can only read it after a successful
   * init. That is the case this file exists for: it used to be reported as an
   * unresponsive sensor, when the sensor had already introduced itself.
   */
  if (num(state.sensorPid)) {
    return `The sensor started and identified as ${sensorLabel(num(state.sensorPid))}, but no frame completed afterwards. That is either the ribbon on the parallel data lines, or a picture size this board cannot allocate — those two look identical from here. Try a smaller resolution first, because it costs nothing; if that does not help, reseat the ribbon and reboot.`;
  }

  return "The camera did not start. The device has not reported enough to say whether that is the module, the ribbon or the configured picture size — try a reboot, and if it persists, reseat the ribbon.";
}
