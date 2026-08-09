/**
 * Saving camera footage to a folder the viewer picks.
 *
 * WHY FILES AND NOT A VIDEO
 *
 * The frames arriving here are already JPEGs — from the MQTT relay, from the
 * site's remote route, or from the camera on the LAN. Turning them into an
 * MP4 in the browser would mean re-encoding, and MediaRecorder can only record
 * a live media element or canvas, so a dropped or slow frame becomes a
 * stretched or skipped moment with no record that it happened. Writing each
 * frame as a timestamped JPEG keeps the evidence exact: what the camera sent,
 * when it sent it, with nothing interpolated. They are trivially assembled
 * into a video later by anything that reads a numbered sequence.
 *
 * WHERE THEY GO
 *
 * The File System Access API writes straight into a directory the user chose,
 * with no size limit and no copy in browser storage. Where it is unavailable
 * — Firefox, Safari, and any page not served over HTTPS — recording falls back
 * to collecting frames and delivering them as one download at the end. The
 * fallback is capped, because that path holds everything in memory and an
 * unbounded recording would take the tab down with it.
 */

/** Directory handle type, kept local so the file compiles without DOM lib updates. */
interface DirHandle {
  requestPermission?: (o: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  getFileHandle: (name: string, o?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
  name?: string;
}

type PickerWindow = Window & {
  showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<DirHandle>;
};

export function canPickFolder(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

/** Frames held in memory on the fallback path before recording stops itself. */
export const MEMORY_FRAME_LIMIT = 900;

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

function stamp(at: number): string {
  return new Date(at).toISOString().replace(/[:.]/g, "-");
}

export function dataUrlToBlob(src: string): Blob {
  const b64 = src.slice(src.indexOf(",") + 1);
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: "image/jpeg" });
}

export interface Recorder {
  add: (src: string, at: number) => Promise<void>;
  stop: () => Promise<{ frames: number; bytes: number; truncated: boolean }>;
  target: RecordingTarget;
}

/**
 * Starts a recording.
 *
 * `add` is deliberately serialised by the caller awaiting it: two concurrent
 * writes to the same directory handle can interleave and produce a truncated
 * file, and a dropped frame is better than a corrupt one.
 */
export function startRecording(deviceName: string, target: RecordingTarget): Recorder {
  const safe = (deviceName || "camera").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
  const session = stamp(Date.now());
  let frames = 0;
  let bytes = 0;
  let truncated = false;
  const held: { blob: Blob; name: string }[] = [];

  const add = async (src: string, at: number) => {
    const blob = dataUrlToBlob(src);
    const name = `${safe}-${session}-${String(frames + 1).padStart(6, "0")}-${stamp(at)}.jpg`;

    if (target.kind === "folder" && target.dir) {
      const fh = await target.dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      if (held.length >= MEMORY_FRAME_LIMIT) {
        truncated = true;
        return;
      }
      held.push({ blob, name });
    }
    frames++;
    bytes += blob.size;
  };

  const stop = async () => {
    if (target.kind === "memory" && held.length) {
      // No zip library is bundled, and adding one to deliver a fallback would
      // put weight on every page load for a path most viewers never take. The
      // frames are handed over individually, spaced so the browser does not
      // treat the burst as a popup attack.
      for (let i = 0; i < held.length; i++) {
        const url = URL.createObjectURL(held[i].blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = held[i].name;
        a.click();
        URL.revokeObjectURL(url);
        if (i % 20 === 19) await new Promise((r) => setTimeout(r, 250));
      }
      held.length = 0;
    }
    return { frames, bytes, truncated };
  };

  return { add, stop, target };
}
