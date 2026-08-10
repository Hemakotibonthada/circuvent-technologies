/**
 * The `cv/<id>/anpr` wire format.
 *
 * A binary MQTT topic has nowhere to put metadata. The alternative — the
 * device publishing a JSON descriptor on `telemetry` next to each image — was
 * rejected because it forces the worker to correlate two streams by arrival
 * time, and that correlation breaks precisely when two vehicles arrive within
 * a second of each other, which is the case that matters at a gate.
 *
 * So every capture is a fixed 16-byte header followed by the JPEG bytes. The
 * struct is mirrored by `AnprHeader` in firmware/anpr-cam/anpr-cam.ino, which
 * carries a `static_assert` on its size for the same reason this file exports
 * `HEADER_BYTES`: the two must not drift.
 *
 *   offset  size  field
 *   0       4     magic   "CVAN"
 *   4       1     ver     format version (1)
 *   5       1     seq     0-based index within the burst
 *   6       1     burst   frames in this burst
 *   7       1     reason  trigger reason (see REASONS)
 *   8       4     capture uint32 LE — groups the frames of one burst
 *   12      2     width   uint16 LE
 *   14      2     height  uint16 LE
 *   16      …     JPEG
 */

export const HEADER_BYTES = 16;
export const MAGIC = "CVAN";

/** Index is the `reason` byte. Mirrored by `TriggerReason` in the firmware. */
export const REASONS = ["motion", "loop", "manual", "periodic"] as const;
export type TriggerReasonName = (typeof REASONS)[number];

export interface AnprCapture {
  /** Groups the frames of one burst. 0 when the payload carried no header. */
  captureId: number;
  seq: number;
  burst: number;
  reason: TriggerReasonName;
  width: number;
  height: number;
  jpeg: Buffer;
}

/**
 * JPEG magic. Checked rather than assumed because the header is optional (see
 * below), so a payload that is neither a valid header nor a JPEG means a
 * misconfigured device is publishing something else onto this topic — which
 * should be dropped at the edge, not forwarded to an OCR provider.
 */
function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Parses one `cv/<id>/anpr` payload.
 *
 * A bare JPEG with no header is accepted as a single-frame manual capture.
 * That is deliberate compatibility in both directions: it lets a third-party
 * camera, a test fixture or `mosquitto_pub -f plate.jpg` feed the pipeline
 * without reimplementing the header, and it means a future header version this
 * build does not understand degrades to "we still got a picture" rather than
 * to silence.
 *
 * Returns null when the payload is not usable at all.
 */
export function parseCapture(payload: Buffer): AnprCapture | null {
  if (!payload || payload.length === 0) return null;

  const hasHeader =
    payload.length > HEADER_BYTES && payload.subarray(0, 4).toString("latin1") === MAGIC;

  if (!hasHeader) {
    if (!looksLikeJpeg(payload)) return null;
    return { captureId: 0, seq: 0, burst: 1, reason: "manual", width: 0, height: 0, jpeg: payload };
  }

  const jpeg = payload.subarray(HEADER_BYTES);
  if (!looksLikeJpeg(jpeg)) return null;

  return {
    captureId: payload.readUInt32LE(8),
    seq: payload.readUInt8(5),
    // A burst of 0 would make the collector wait for frames that are not
    // coming, so it is floored at "this one".
    burst: Math.max(1, payload.readUInt8(6)),
    reason: REASONS[payload.readUInt8(7)] ?? "motion",
    width: payload.readUInt16LE(12),
    height: payload.readUInt16LE(14),
    jpeg,
  };
}
