/**
 * The WAV guard on the talk path.
 *
 * WHY THIS IS SECURITY-SHAPED AND NOT A FORMAT NICETY
 *
 * The firmware's audioSpeak() skips a fixed 44 bytes and streams everything
 * after it straight to the amplifier. It does not — cannot, at that memory
 * budget — parse chunk headers or check the sample rate. So a file with an
 * extra LIST chunk before `data`, or 44.1 kHz stereo, is not rejected by the
 * device. It is *played*: as a burst of noise, at the wrong speed, through a
 * loudspeaker in somebody's home.
 *
 * validateSpeakWav() is the only thing standing between an arbitrary upload
 * and that speaker, which makes these cases worth writing down.
 */
import { validateSpeakWav, AUDIO_RATE, SPEAK_MAX_SECONDS } from "@/lib/camera-audio";

/** Builds a canonical 44-byte-header WAV, with knobs for each field. */
function wav(opts: {
  rate?: number;
  channels?: number;
  bits?: number;
  format?: number;
  samples?: number;
  /** Overrides the declared data size without changing the payload. */
  declared?: number;
  fmtChunkSize?: number;
  dataTag?: string;
  riff?: string;
  wave?: string;
} = {}): Buffer {
  const rate = opts.rate ?? AUDIO_RATE;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const samples = opts.samples ?? rate; // one second by default
  const bytesPerFrame = (bits / 8) * channels;
  const dataBytes = samples * bytesPerFrame;
  const b = Buffer.alloc(44 + dataBytes);
  b.write(opts.riff ?? "RIFF", 0, "ascii");
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write(opts.wave ?? "WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(opts.fmtChunkSize ?? 16, 16);
  b.writeUInt16LE(opts.format ?? 1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * bytesPerFrame, 28);
  b.writeUInt16LE(bytesPerFrame, 32);
  b.writeUInt16LE(bits, 34);
  b.write(opts.dataTag ?? "data", 36, "ascii");
  b.writeUInt32LE(opts.declared ?? dataBytes, 40);
  return b;
}

describe("what the camera is allowed to play", () => {
  it("accepts what the browser recorder produces", () => {
    expect(validateSpeakWav(wav())).toEqual({ ok: true });
    expect(validateSpeakWav(wav({ samples: 400 }))).toEqual({ ok: true });
  });

  it.each([
    ["44.1 kHz", { rate: 44100 }, /8000 Hz/],
    ["stereo", { channels: 2 }, /mono/],
    ["8-bit", { bits: 8 }, /16-bit/],
    ["compressed", { format: 6 }, /uncompressed PCM/],
  ])("rejects %s", (_name, opts, expected) => {
    const r = validateSpeakWav(wav(opts));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(expected);
  });

  it("rejects a header the firmware's fixed 44-byte skip cannot handle", () => {
    // An extended fmt chunk moves `data` past byte 36. The device would play
    // the remaining header bytes as audio and then be misaligned for the rest
    // of the clip.
    const r = validateSpeakWav(wav({ fmtChunkSize: 18 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/canonical 44-byte-header/);

    const withList = validateSpeakWav(wav({ dataTag: "LIST" }));
    expect(withList.ok).toBe(false);
  });

  it("rejects a clip that claims more audio than it carries", () => {
    // Trusting this field is how a device reads past the end of what arrived
    // and emits whatever the socket buffer happened to contain.
    const r = validateSpeakWav(wav({ samples: 100, declared: 999_999 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/truncated/);
  });

  it("rejects an empty or silent-length clip", () => {
    // A zero-sample clip is exactly 44 bytes — header and nothing else — so it
    // is caught by the length check and reported as empty, which is accurate.
    const r = validateSpeakWav(wav({ samples: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/empty/);

    // The other path: a clip that carries audio but declares none. The device
    // would play nothing and report success, so it has to be refused here or
    // "Sent" would be a lie.
    const lies = validateSpeakWav(wav({ samples: 800, declared: 0 }));
    expect(lies.ok).toBe(false);
    if (!lies.ok) expect(lies.reason).toMatch(/no audio/);

    expect(validateSpeakWav(Buffer.alloc(0)).ok).toBe(false);
    expect(validateSpeakWav(Buffer.alloc(44)).ok).toBe(false);
  });

  it("rejects things that are not WAV at all", () => {
    expect(validateSpeakWav(wav({ riff: "RIFX" })).ok).toBe(false);
    expect(validateSpeakWav(wav({ wave: "AVI " })).ok).toBe(false);
    // A JPEG, which is what the neighbouring endpoint takes — a plausible
    // mix-up, and one that would be several seconds of loud static.
    expect(validateSpeakWav(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(64).fill(0)])).ok).toBe(false);
  });

  it("refuses a clip longer than the device will play", () => {
    // The firmware stops at its own ceiling mid-word. Being told the clip is
    // too long is a better outcome than a message that silently ends early.
    const tooLong = wav({ samples: AUDIO_RATE * (SPEAK_MAX_SECONDS + 5) });
    const r = validateSpeakWav(tooLong);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(new RegExp(`${SPEAK_MAX_SECONDS}s`));

    // And accepts one exactly at the limit, so the boundary is not off by one.
    expect(validateSpeakWav(wav({ samples: AUDIO_RATE * SPEAK_MAX_SECONDS })).ok).toBe(true);
  });
});
