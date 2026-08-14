/**
 * Saving camera footage to a folder the viewer picks.
 *
 * WHY THIS IS NOW A VIDEO FILE
 *
 * This used to write every frame as its own timestamped .jpg. The reasoning
 * was sound — the frames arriving here are already JPEGs, re-encoding them
 * would be lossy, and MediaRecorder can only capture a live element or canvas,
 * so a stalled stream becomes a stretched moment with no record that it
 * stalled.
 *
 * But it produced something nobody can watch. A twenty-minute recording was
 * twelve thousand files that no player opens, no gallery indexes and nobody
 * can scrub through. "Exact but unwatchable" is not a recording.
 *
 * AVI/MJPEG keeps both properties. The JPEGs are stored byte for byte, nothing
 * is re-encoded, nothing is interpolated over a dropped frame — and the result
 * plays in VLC, ffmpeg, QuickTime and Windows. The timebase is written from
 * measured elapsed time rather than the requested frame rate, so a recording
 * that dropped frames plays back at the speed it was really captured instead
 * of quietly misrepresenting when things happened.
 *
 * WHERE IT GOES
 *
 * The File System Access API writes straight into a directory the user chose,
 * with no size limit and no copy in browser storage — and, critically, it
 * supports writing at an offset, which is what lets the totals be patched into
 * the header once the clip ends. Where it is unavailable — Firefox, Safari, or
 * any page not served over HTTPS — recording falls back to building the file
 * in memory and delivering it as one download. That path is capped, because it
 * holds everything in memory and an unbounded recording would take the tab
 * down with it, losing the whole clip at the moment it mattered most.
 */
import {
  AviClip,
  applyPatches,
  clipFileName,
  jpegSize,
  AVI_HEADER_BYTES,
} from "@/lib/avi";

/** Written-file handle, kept local so this compiles without DOM lib updates. */
interface WritableTarget {
  write: (data: Uint8Array | { type: "write"; position: number; data: Uint8Array }) => Promise<void>;
  close: () => Promise<void>;
}
interface DirHandle {
  requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<WritableTarget>;
  }>;
  name?: string;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<DirHandle>;
};

/**
 * In-memory ceiling for the fallback path.
 *
 * 64 MB is roughly twenty-five minutes of VGA at 8 fps. Past that the
 * recording rolls into a second download rather than growing until the tab
 * dies.
 */
export const MEMORY_CLIP_MAX_BYTES = 64 * 1024 * 1024;

export interface RecordingTarget {
  kind: "folder" | "memory";
  /** Human-readable, for telling the user where footage is actually going. */
  label: string;
  dir?: DirHandle;
}

/**
 * Asks for a folder. Returns the memory fallback when the API is missing or
 * the user dismisses the picker — never throws, because failing to pick a
 * folder should not end a recording the user asked for.
 */
export async function chooseTarget(): Promise<RecordingTarget> {
  const w = typeof window !== "undefined" ? (window as PickerWindow) : undefined;
  if (!w?.showDirectoryPicker) {
    return { kind: "memory", label: "this browser cannot save to a folder — will download instead" };
  }
  try {
    const dir = await w.showDirectoryPicker({ mode: "readwrite" });
    if (dir.requestPermission) {
      const p = await dir.requestPermission({ mode: "readwrite" });
      if (p !== "granted") {
        return { kind: "memory", label: "folder access was declined — will download instead" };
      }
    }
    return { kind: "folder", label: dir.name || "selected folder", dir };
  } catch {
    return { kind: "memory", label: "no folder chosen — will download instead" };
  }
}

export interface RecordingResult {
  frames: number;
  bytes: number;
  clips: number;
  /** True when a clip was cut short by the in-memory ceiling. */
  rolled: boolean;
}

export interface Recorder {
  add: (jpeg: Uint8Array, at: number) => Promise<void>;
  stop: () => Promise<RecordingResult>;
  target: RecordingTarget;
}

const u32 = (v: number) =>
  new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

/**
 * Starts a recording.
 *
 * `add` is deliberately serialised by the caller awaiting it: two concurrent
 * writes to the same file handle can interleave and produce a corrupt clip,
 * and a dropped frame is better than an unplayable file.
 */
export function startRecording(deviceName: string, target: RecordingTarget): Recorder {
  let clip: AviClip | null = null;
  let sink: WritableTarget | null = null;
  let held: Uint8Array[] = [];
  let startedAt = 0;
  let frames = 0;
  let bytes = 0;
  let clips = 0;
  let rolled = false;

  const openClip = async (width: number, height: number, at: number) => {
    // The nominal rate only seeds the header; finish() overwrites it with the
    // rate actually achieved, so an optimistic guess here costs nothing.
    const next = new AviClip(width, height, 10);
    startedAt = at;
    const header = next.header();
    if (target.kind === "folder" && target.dir) {
      const fh = await target.dir.getFileHandle(clipFileName(deviceName, at), { create: true });
      sink = await fh.createWritable();
      await sink.write(header);
    } else {
      held = [header];
    }
    clip = next;
  };

  const emit = async (data: Uint8Array) => {
    if (sink) await sink.write(data);
    else held.push(data);
  };

  const closeClip = async () => {
    if (!clip) return;
    const finished = clip;
    clip = null;

    if (finished.frames === 0) {
      // Nothing was captured. Close without patching rather than leaving a
      // 224-byte file that claims to be a video.
      if (sink) { await sink.close(); sink = null; }
      held = [];
      return;
    }

    const index = finished.indexBlock();
    const patches = finished.finish(Date.now() - startedAt);

    if (sink) {
      await sink.write(index);
      // Positional writes are why this path can stream: the totals are not
      // knowable until now, and rewriting the file to insert them would mean
      // holding it all in memory, which is exactly what this avoids.
      for (const p of patches) {
        await sink.write({ type: "write", position: p.offset, data: u32(p.value) });
      }
      await sink.close();
      sink = null;
      bytes += finished.projectedBytes;
    } else {
      held.push(index);
      const size = held.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(size);
      let at = 0;
      for (const p of held) { out.set(p, at); at += p.length; }
      held = [];
      applyPatches(out, patches);
      bytes += out.length;

      const url = URL.createObjectURL(new Blob([out], { type: "video/x-msvideo" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = clipFileName(deviceName, startedAt);
      a.click();
      // Revoked on a delay: revoking immediately races the download the click
      // just started, and the browser then saves a zero-byte file.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    clips++;
  };

  /*
   * Takes the JPEG bytes, not a data URL.
   *
   * It used to take the `src` string and base64-decode it here, which meant a
   * decode per recorded frame of data the caller had already received as bytes.
   * Live video is the one path where that matters — recording is happening at
   * the same moment the picture has to stay smooth.
   */
  const add = async (jpeg: Uint8Array, at: number) => {
    if (jpeg.length < 4) return;

    if (!clip) {
      const size = jpegSize(jpeg);
      // Without a readable SOF marker there is no honest picture size to put
      // in the header, and a wrong one makes players letterbox or refuse the
      // file. Wait for a frame that can be read.
      if (!size) return;
      await openClip(size.width, size.height, at);
      if (!clip) return;
    }

    const { chunkHeader, pad } = clip.addFrame(jpeg.length);
    await emit(chunkHeader);
    await emit(jpeg);
    if (pad) await emit(new Uint8Array(1));
    frames++;

    if (target.kind === "memory" && clip.projectedBytes >= MEMORY_CLIP_MAX_BYTES) {
      rolled = true;
      await closeClip();
    }
  };

  const stop = async () => {
    await closeClip();
    return { frames, bytes, clips, rolled };
  };

  return { add, stop, target };
}

/** Bytes of AVI header written before the first frame. */
export const HEADER_BYTES = AVI_HEADER_BYTES;
