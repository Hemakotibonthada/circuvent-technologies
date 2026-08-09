/**
 * Two-way audio between a camera and whoever is watching it.
 *
 * SHAPED LIKE PUSH-TO-TALK, NOT LIKE A PHONE CALL
 *
 * A conversational voice link needs a bidirectional low-latency socket. The
 * device has no public address, the broker relay is the component that has
 * been unreliable throughout, and an ESP32 running TLS has neither the
 * throughput nor the jitter budget for a duplex call. Building it that way
 * produces something that works on a bench and fails in a house.
 *
 * So each direction is a bounded transfer over the path already proven here —
 * the same one the frame relay uses:
 *
 *   Listening — while a viewer has armed it, the camera POSTs one second of
 *   WAV at a time. The arming expires on its own, so a closed tab cannot leave
 *   a microphone in someone's home uploading indefinitely. That expiry is a
 *   privacy property, not a bandwidth optimisation, which is why nothing here
 *   offers a way to disable it.
 *
 *   Talking — the browser records a clip, uploads it here, and the camera is
 *   told to fetch and play it. The device pulls rather than being pushed to,
 *   because nothing on the internet can reach into a home network, and a
 *   camera that accepted unsolicited audio would be a loudspeaker in someone's
 *   house that strangers could use.
 *
 * 8 kHz 16-bit mono PCM in a WAV wrapper. Speech is intelligible at 8 kHz —
 * it is what telephony used for a century — and it costs 16 kB/s, which this
 * device can sustain. There is no codec because every consumer of this plays
 * WAV with nothing added, and shipping a decoder to three clients to save
 * 8 kB/s is a bad trade.
 */
import {
  dbArmCameraListen,
  dbStopCameraListen,
  dbCameraListenToken,
  dbStoreCameraAudioIfToken,
  dbCameraAudioSince,
  dbQueueCameraSpeak,
  dbTakeCameraSpeak,
  dbEnabled,
  AUDIO_LISTEN_MS,
  AUDIO_SPEAK_TTL_MS,
} from "./db";

export { AUDIO_LISTEN_MS, AUDIO_SPEAK_TTL_MS };

/** The one format every end of this agrees on. */
export const AUDIO_RATE = 8000;
export const AUDIO_BITS = 16;

/**
 * Upload ceiling for one chunk. A second of 8 kHz 16-bit mono is 16 kB plus a
 * 44-byte header; base64 adds a third. Generous enough for a two-second chunk
 * from a device that fell behind, small enough that a misbehaving client
 * cannot post megabytes.
 */
export const AUDIO_MAX_CHUNK_B64 = 120_000;

/**
 * Ceiling for a talk clip: twenty seconds, matching the firmware's own limit.
 * A longer clip would be truncated by the device mid-word, which is a worse
 * outcome than being told up front that it is too long.
 */
export const SPEAK_MAX_SECONDS = 20;
export const SPEAK_MAX_B64 = Math.ceil(((AUDIO_RATE * 2 * SPEAK_MAX_SECONDS + 44) * 4) / 3) + 64;

export function newAudioToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function armListen(deviceId: string): Promise<{ token: string; expires: number } | null> {
  if (!dbEnabled()) return null;
  const token = newAudioToken();
  const expires = Date.now() + AUDIO_LISTEN_MS;
  await dbArmCameraListen(deviceId, token, expires);
  return { token, expires };
}

export async function stopListen(deviceId: string): Promise<void> {
  if (!dbEnabled()) return;
  await dbStopCameraListen(deviceId);
}

export type StoreResult = { ok: true } | { ok: false; reason: string; status: number };

/**
 * Stores a chunk if the token is valid and unexpired.
 *
 * Reports *why* it was refused rather than a bare false, for the same reason
 * the frame relay does: "your window expired" and "nobody is listening" need
 * completely different fixes, and one undifferentiated failure is how someone
 * ends up reflashing firmware to chase an expiry.
 */
export async function storeAudioChunk(
  deviceId: string,
  presented: string,
  wavB64: string,
  bytes: number
): Promise<StoreResult> {
  if (!dbEnabled()) return { ok: false, reason: "no database configured", status: 503 };
  if (await dbStoreCameraAudioIfToken(deviceId, presented, wavB64, bytes)) return { ok: true };

  const { token, expires } = await dbCameraListenToken(deviceId);
  if (!token) return { ok: false, reason: "nobody is listening to this camera", status: 409 };
  if (token !== presented) return { ok: false, reason: "listen token rejected", status: 403 };
  if (expires != null && expires < Date.now()) {
    return { ok: false, reason: "listening window expired", status: 410 };
  }
  return { ok: false, reason: "audio could not be stored", status: 500 };
}

export interface AudioChunk {
  id: number;
  wavB64: string;
  bytes: number;
  capturedAt: string;
}

export async function audioSince(deviceId: string, sinceId: number): Promise<AudioChunk[]> {
  if (!dbEnabled()) return [];
  return dbCameraAudioSince(deviceId, sinceId);
}

export async function queueSpeak(deviceId: string, wavB64: string): Promise<{ token: string } | null> {
  if (!dbEnabled()) return null;
  const token = newAudioToken();
  await dbQueueCameraSpeak(deviceId, token, wavB64, Date.now() + AUDIO_SPEAK_TTL_MS);
  return { token };
}

export async function takeSpeak(deviceId: string, token: string): Promise<Buffer | null> {
  if (!dbEnabled()) return null;
  const b64 = await dbTakeCameraSpeak(deviceId, token);
  return b64 ? Buffer.from(b64, "base64") : null;
}

/**
 * Checks a WAV is the exact shape everything downstream assumes.
 *
 * The firmware skips a fixed 44-byte header and streams the rest straight to
 * the amplifier. A file with an extra chunk before `data`, or a different rate
 * or channel count, is not rejected by that code — it is *played*, as a burst
 * of noise at the wrong speed through a speaker in someone's home. Validating
 * here is what keeps that from being possible.
 */
export function validateSpeakWav(buf: Buffer): { ok: true } | { ok: false; reason: string } {
  if (buf.length < 45) return { ok: false, reason: "clip is empty" };
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return { ok: false, reason: "not a WAV file" };
  }
  if (buf.toString("ascii", 12, 16) !== "fmt " || buf.readUInt32LE(16) !== 16) {
    return { ok: false, reason: "the camera can only play a canonical 44-byte-header WAV" };
  }
  if (buf.readUInt16LE(20) !== 1) return { ok: false, reason: "audio must be uncompressed PCM" };
  if (buf.readUInt16LE(22) !== 1) return { ok: false, reason: "audio must be mono" };
  if (buf.readUInt32LE(24) !== AUDIO_RATE) {
    return { ok: false, reason: `audio must be ${AUDIO_RATE} Hz` };
  }
  if (buf.readUInt16LE(34) !== AUDIO_BITS) {
    return { ok: false, reason: `audio must be ${AUDIO_BITS}-bit` };
  }
  if (buf.toString("ascii", 36, 40) !== "data") {
    return { ok: false, reason: "the camera can only play a canonical 44-byte-header WAV" };
  }
  const declared = buf.readUInt32LE(40);
  if (declared === 0) return { ok: false, reason: "clip has no audio in it" };
  if (declared > buf.length - 44) return { ok: false, reason: "clip is truncated" };
  const seconds = declared / (AUDIO_RATE * 2);
  if (seconds > SPEAK_MAX_SECONDS) {
    return { ok: false, reason: `clip is ${seconds.toFixed(0)}s — the camera plays at most ${SPEAK_MAX_SECONDS}s` };
  }
  return { ok: true };
}

const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com";

/** Sends an audio command to a camera through the control plane. */
export async function commandAudio(
  deviceId: string,
  cpToken: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const r = await fetch(`${CONTROL_PLANE}/devices/${encodeURIComponent(deviceId)}/command`, {
      method: "POST",
      headers: { authorization: `Bearer ${cpToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch {
    return false;
  }
}
