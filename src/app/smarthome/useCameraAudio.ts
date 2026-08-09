/**
 * Listening to and talking through a camera, from the browser.
 *
 * WHY WEB AUDIO AND NOT MediaRecorder
 *
 * MediaRecorder produces WebM/Opus, and the camera plays 8 kHz 16-bit PCM.
 * Bridging those means either decoding Opus on an ESP32 — which it cannot
 * afford — or transcoding on the server, which means shipping ffmpeg into a
 * serverless function to convert two seconds of speech. Capturing raw samples
 * and downsampling them here is a few dozen lines, adds no dependency, and
 * puts the conversion where there is CPU to spare.
 *
 * Playback goes through an AudioContext queue rather than an <audio> element
 * per chunk. Chunks arrive once a second and elements have start-up latency
 * that varies; scheduling each buffer at a running cursor makes the seams
 * inaudible instead of leaving a click between every second.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/control-plane";

/** Must match the firmware and the server. Speech, not music. */
export const AUDIO_RATE = 8000;

/** Re-arm well inside the server's window so listening never lapses mid-use. */
const REARM_MS = 60_000;

export type ListenStatus = "idle" | "starting" | "live" | "unavailable";

interface Chunk {
  id: number;
  wavB64: string;
  bytes: number;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads 16-bit PCM out of a canonical WAV into floats the mixer can play. */
function wavToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const pcm = new DataView(bytes.buffer, bytes.byteOffset + 44, Math.max(0, bytes.length - 44));
  const n = Math.floor(pcm.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.getInt16(i * 2, true) / 32768;
  return out;
}

export function useCameraListen(deviceId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [detail, setDetail] = useState("");
  const [level, setLevel] = useState(0);
  const since = useRef(0);
  const active = Boolean(deviceId) && enabled;

  useEffect(() => {
    if (!active || !deviceId) return;

    let stopped = false;
    const cpToken = getToken();
    const headers = { authorization: `Bearer ${cpToken}`, "content-type": "application/json" };
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    // Where the next chunk should start. Kept slightly ahead of the clock so a
    // late arrival does not get scheduled in the past and dropped.
    let cursor = 0;

    const play = (bytes: Uint8Array) => {
      const samples = wavToFloat(bytes);
      if (!samples.length) return;
      let peak = 0;
      for (let i = 0; i < samples.length; i += 16) peak = Math.max(peak, Math.abs(samples[i]));
      setLevel(peak);

      const buf = ctx.createBuffer(1, samples.length, AUDIO_RATE);
      buf.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const now = ctx.currentTime;
      if (cursor < now + 0.05) cursor = now + 0.05;
      src.start(cursor);
      cursor += buf.duration;
    };

    const arm = async () => {
      const r = await fetch("/api/smarthome/camera/listen", {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, on: true }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        if (!stopped) {
          setStatus("unavailable");
          // Say what the server said. "Listening failed" sends someone
          // power-cycling a camera that is fine.
          setDetail(body.error || `request failed (${r.status})`);
        }
        return false;
      }
      return true;
    };

    const poll = async () => {
      const r = await fetch(
        `/api/smarthome/camera/listen?deviceId=${encodeURIComponent(deviceId)}&since=${since.current}`,
        { headers: { authorization: `Bearer ${cpToken}` }, cache: "no-store" }
      );
      if (!r.ok) return;
      const { chunks } = (await r.json()) as { chunks: Chunk[] };
      if (stopped || !chunks?.length) return;
      setStatus("live");
      for (const c of chunks) {
        since.current = Math.max(since.current, c.id);
        play(b64ToBytes(c.wavB64));
      }
    };

    since.current = 0;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let armTimer: ReturnType<typeof setInterval> | undefined;

    /*
     * The whole start-up runs here rather than in the effect body, including
     * the first status write. Setting state synchronously while the effect is
     * running schedules a cascading render for something no external system
     * has reported yet — "starting" is only true once this has begun trying.
     */
    void (async () => {
      if (!cpToken) {
        if (!stopped) {
          setStatus("unavailable");
          setDetail("sign in again to listen");
        }
        return;
      }
      setStatus("starting");
      setDetail("");
      // Browsers suspend an AudioContext created outside a gesture. This runs
      // from a click on the Listen button, so resuming here is what makes the
      // difference between audio and a silent context that reports "running".
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      if (!(await arm()) || stopped) return;
      pollTimer = setInterval(() => void poll().catch(() => {}), 700);
      armTimer = setInterval(() => void arm().catch(() => {}), REARM_MS);
    })();

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (armTimer) clearInterval(armTimer);
      void ctx.close().catch(() => {});
      // Tell the camera to stop rather than letting the window lapse. A
      // microphone left uploading for a viewer who closed the tab is a privacy
      // problem, not just wasted bandwidth.
      void fetch("/api/smarthome/camera/listen", {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, on: false }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [deviceId, active]);

  /*
   * Reported rather than stored when inactive.
   *
   * Writing "idle" from inside the effect on the way out looks equivalent and
   * is not: it schedules a second render for a value that is already implied
   * by the arguments, and it leaves the last session's status visible for one
   * frame after the caller stops listening. Deriving it means the hook cannot
   * claim to be live when nothing is running.
   */
  return { status: active ? status : ("idle" as ListenStatus), detail, level };
}

export type TalkStatus = "idle" | "recording" | "sending" | "sent" | "error";

/**
 * Push-to-talk.
 *
 * Records while held, downsamples to what the camera plays, and uploads. The
 * clip is built here rather than streamed, because the device fetches a whole
 * file — and because a half-second of network trouble mid-sentence should mean
 * a failed send, not a message that arrives with a hole in it.
 */
export function useCameraTalk(deviceId: string | null) {
  const [status, setStatus] = useState<TalkStatus>("idle");
  const [detail, setDetail] = useState("");
  const [seconds, setSeconds] = useState(0);
  const media = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!deviceId) return;
    setDetail("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The camera is in the same room as the speaker it will play through,
        // so echo cancellation and noise suppression are doing real work here
        // rather than being cargo-culted defaults.
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      media.current = stream;
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      chunks.current = [];

      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessor is deprecated in favour of AudioWorklet, and is used
      // anyway: a worklet needs a separate module file served from the origin,
      // and this runs for a few seconds at a time on a click. The deprecation
      // is about the main-thread cost of continuous processing, which is not
      // what this is.
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        chunks.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      // Routed to a muted gain node, not to the speakers: connecting to the
      // destination would play the microphone back into the room.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute);
      mute.connect(ctx.destination);

      setStatus("recording");
      setSeconds(0);
      tick.current = setInterval(() => setSeconds((s) => s + 0.25), 250);
    } catch (e) {
      setStatus("error");
      setDetail(e instanceof Error ? e.message : "microphone access was refused");
      cleanup();
    }
  }, [deviceId, cleanup]);

  const stopAndSend = useCallback(async () => {
    if (!deviceId || status !== "recording") return;
    const ctx = ctxRef.current;
    const inRate = ctx?.sampleRate ?? 48000;
    const captured = chunks.current;
    cleanup();
    setStatus("sending");

    const total = captured.reduce((n, c) => n + c.length, 0);
    if (total === 0) {
      setStatus("error");
      setDetail("nothing was recorded");
      return;
    }
    const flat = new Float32Array(total);
    let at = 0;
    for (const c of captured) { flat.set(c, at); at += c.length; }

    /*
     * Downsample by averaging over each source window rather than taking every
     * Nth sample. Point-sampling 48 kHz down to 8 kHz aliases everything above
     * 4 kHz back into the speech band, which sounds like a badly tuned radio —
     * and it is the mistake that makes people conclude the hardware is bad.
     */
    const ratio = inRate / AUDIO_RATE;
    const outLen = Math.floor(flat.length / ratio);
    const pcm = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const from = Math.floor(i * ratio);
      const to = Math.min(flat.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = from; j < to; j++) sum += flat[j];
      const v = sum / Math.max(1, to - from);
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
    }

    const wav = new Uint8Array(44 + pcm.length * 2);
    const dv = new DataView(wav.buffer);
    const ascii = (off: number, s: string) => { for (let i = 0; i < s.length; i++) wav[off + i] = s.charCodeAt(i); };
    ascii(0, "RIFF");  dv.setUint32(4, 36 + pcm.length * 2, true);
    ascii(8, "WAVE");  ascii(12, "fmt ");  dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);            // PCM
    dv.setUint16(22, 1, true);            // mono
    dv.setUint32(24, AUDIO_RATE, true);
    dv.setUint32(28, AUDIO_RATE * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    ascii(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    wav.set(new Uint8Array(pcm.buffer), 44);

    try {
      const cpToken = getToken();
      const r = await fetch(`/api/smarthome/camera/speak?deviceId=${encodeURIComponent(deviceId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${cpToken}`, "content-type": "audio/wav" },
        body: wav,
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setDetail(body.error || `request failed (${r.status})`);
        return;
      }
      setStatus("sent");
      setDetail("");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setStatus("error");
      setDetail(e instanceof Error ? e.message : "could not reach the camera");
    }
  }, [deviceId, status, cleanup]);

  return { status, detail, seconds, start, stopAndSend };
}
