/**
 * Saving camera footage to the phone.
 *
 * TWO DIFFERENT THINGS, BOTH CALLED "RECORDING"
 *
 *  1. Pulling a finished clip off the camera's microSD card. The firmware
 *     already wrote a real indexed AVI; this streams it to storage without
 *     ever holding it in memory, so a 200 MB clip costs nothing but time.
 *
 *  2. Recording the live view. Frames arrive here as base64 JPEGs from the
 *     relay, so this builds the AVI itself. That one has to be assembled in
 *     memory, for a reason worth stating plainly: expo-file-system offers no
 *     append and no seek — only writeAsStringAsync, which replaces a whole
 *     file. There is no way to stream a growing file, and pretending otherwise
 *     would mean rewriting the entire clip on every frame.
 *
 *     So live recording is capped and rolls over into a new file when it hits
 *     the cap. A cap that produces several playable clips is honest; running
 *     until the app is killed by the OS mid-write is not, and that is what an
 *     uncapped version does — it loses everything, at the moment it matters.
 *
 * WHERE FILES GO, AND WHY IT DIFFERS BY PLATFORM
 *
 * Android uses the Storage Access Framework: the user picks a folder in the
 * system picker and the app writes into it with no storage permission at all.
 * That matters here because app.json deliberately blocks READ/WRITE_EXTERNAL_
 * STORAGE, and asking for them back to save a video would be a poor trade.
 *
 * iOS has no writable-folder picker. Clips go to the app's own Documents
 * directory, which is exposed in Files under "On My iPhone → Circuvent"
 * because app.json sets UIFileSharingEnabled and
 * LSSupportsOpeningDocumentsInPlace. Without those two keys the folder exists
 * and no human can reach it, which is the same as not saving at all.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import {
  AviClip,
  applyPatches,
  base64ToBytes,
  bytesToBase64,
  clipFileName,
  jpegSize,
} from "./avi";

const SAF = FileSystem.StorageAccessFramework;

/**
 * Live-recording ceiling.
 *
 * The clip is assembled in memory and then base64-encoded to be written, so
 * the peak cost is roughly 2.4x this. 24 MB is about 90 seconds of VGA at
 * 10 fps and peaks near 58 MB, which a phone carries without the OS reaching
 * for the app. Recording continues past it in a new file.
 */
export const LIVE_CLIP_MAX_BYTES = 24 * 1024 * 1024;

export type TargetKind = "folder" | "documents";

export interface SaveTarget {
  kind: TargetKind;
  /** Where footage is really going, in words a person can act on. */
  label: string;
  /** SAF directory URI on Android. */
  dir?: string;
}

/** The app's own Documents folder — always writable, visible in Files on iOS. */
function documentsTarget(): SaveTarget {
  return {
    kind: "documents",
    label: Platform.OS === "ios" ? "Files → On My iPhone → Circuvent" : "the app's private folder",
  };
}

/**
 * Asks where to save.
 *
 * Never throws and never returns null: failing to pick a folder must not end a
 * recording someone asked for, so a dismissed picker falls back to the app's
 * own folder and says so.
 */
export async function chooseTarget(): Promise<SaveTarget> {
  if (Platform.OS !== "android") return documentsTarget();
  try {
    const p = await SAF.requestDirectoryPermissionsAsync();
    if (!p.granted || !p.directoryUri) return documentsTarget();
    return { kind: "folder", label: folderLabel(p.directoryUri), dir: p.directoryUri };
  } catch {
    return documentsTarget();
  }
}

/** Turns a SAF tree URI into something recognisable, e.g. "Download/Cameras". */
export function folderLabel(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const tail = decoded.split(/[:/]/).filter(Boolean).pop();
    return tail && tail !== "primary" ? tail : "the folder you chose";
  } catch {
    return "the folder you chose";
  }
}

async function writeBytes(target: SaveTarget, name: string, bytes: Uint8Array): Promise<string> {
  const b64 = bytesToBase64(bytes);
  if (target.kind === "folder" && target.dir) {
    const uri = await SAF.createFileAsync(target.dir, name, "video/x-msvideo");
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
    return uri;
  }
  const dir = `${FileSystem.documentDirectory}recordings/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const uri = `${dir}${name}`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

export interface LiveRecorderStatus {
  frames: number;
  bytes: number;
  clips: number;
  /** Set when a frame could not be added, so the UI can stop claiming success. */
  error?: string;
}

export interface LiveRecorder {
  /** Feeds one frame. Base64 or a data: URL; both are accepted. */
  add: (jpegB64: string) => Promise<void>;
  stop: () => Promise<{ frames: number; bytes: number; clips: number; files: string[] }>;
  status: () => LiveRecorderStatus;
  target: SaveTarget;
}

/**
 * Records the live view into one or more AVI files.
 *
 * Frames are kept as raw bytes and only encoded at the moment a clip is
 * written, because base64 costs a third more and holding both forms would put
 * the ceiling a third lower for no benefit.
 */
export function startLiveRecording(
  deviceName: string,
  target: SaveTarget,
  nominalFps: number
): LiveRecorder {
  const files: string[] = [];
  let clip: AviClip | null = null;
  let parts: Uint8Array[] = [];
  let startedAt = 0;
  let totalFrames = 0;
  let totalBytes = 0;
  let error: string | undefined;

  const flush = async () => {
    if (!clip || clip.frames === 0) {
      clip = null;
      parts = [];
      return;
    }
    const finished = clip;
    const body = parts;
    clip = null;
    parts = [];

    const index = finished.indexBlock();
    const size = body.reduce((n, p) => n + p.length, 0) + index.length;
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of body) {
      out.set(p, at);
      at += p.length;
    }
    out.set(index, at);
    applyPatches(out, finished.finish(Date.now() - startedAt));

    const name = clipFileName(deviceName, startedAt);
    files.push(await writeBytes(target, name, out));
    totalBytes += out.length;
  };

  const add = async (jpegB64: string) => {
    const bytes = base64ToBytes(jpegB64);
    if (bytes.length < 4) return;

    if (!clip) {
      const size = jpegSize(bytes);
      // Without a readable SOF there is no honest picture size to declare, and
      // a wrong one makes players letterbox or refuse the clip. Skip the frame
      // and start on one that can be read.
      if (!size) return;
      clip = new AviClip(size.width, size.height, nominalFps);
      parts = [clip.header()];
      startedAt = Date.now();
    }

    const { chunkHeader, pad } = clip.addFrame(bytes.length);
    parts.push(chunkHeader, bytes);
    if (pad) parts.push(new Uint8Array(1));
    totalFrames++;

    if (clip.projectedBytes >= LIVE_CLIP_MAX_BYTES) {
      try {
        await flush();
      } catch (e) {
        error = e instanceof Error ? e.message : "could not save the clip";
        throw e;
      }
    }
  };

  const stop = async () => {
    await flush();
    return { frames: totalFrames, bytes: totalBytes, clips: files.length, files };
  };

  return {
    add,
    stop,
    status: () => ({ frames: totalFrames, bytes: totalBytes, clips: files.length, error }),
    target,
  };
}

// ---------------------------------------------------------------------------
// Clips on the camera's own card
// ---------------------------------------------------------------------------
export interface SdClip {
  name: string;
  bytes: number;
  mtime: number;
  /** True while the camera is still writing it — it has no index yet. */
  live: boolean;
}

export interface SdStatus {
  clips: SdClip[];
  freeMb: number;
  totalMb: number;
}

/** The camera's LAN base URL, from the address it publishes in its state. */
export function cameraLanBase(state: Record<string, unknown>): string | null {
  const ip = typeof state.ip === "string" ? state.ip : "";
  if (!ip) return null;
  const port = Number(state.lanPort) || 81;
  return `http://${ip}:${port}`;
}

/**
 * Lists the clips on the card.
 *
 * LAN-only by design. The card lives on the camera and the only route to it
 * that does not involve uploading gigabytes through a broker is the device's
 * own HTTP server, which is reachable when the phone is on the same network
 * and honestly unreachable when it is not. The caller is expected to say so
 * rather than spin.
 */
export async function listSdClips(base: string, timeoutMs = 6000): Promise<SdStatus> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}/rec/list`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`camera answered ${r.status}`);
    const j = (await r.json()) as Partial<SdStatus> & { error?: string };
    if (j.error) throw new Error(j.error);
    return { clips: j.clips ?? [], freeMb: j.freeMb ?? 0, totalMb: j.totalMb ?? 0 };
  } finally {
    clearTimeout(t);
  }
}

export async function deleteSdClip(base: string, name: string): Promise<void> {
  const r = await fetch(`${base}/rec/delete?f=${encodeURIComponent(name)}`);
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `camera answered ${r.status}`);
  }
}

/**
 * Copies a clip from the card to the phone.
 *
 * Downloaded to the cache first and moved afterwards, so a transfer that fails
 * halfway leaves nothing in the user's folder. A half-written file sitting in
 * Downloads looking like a recording is worse than no file: it plays for two
 * seconds and stops, and nothing says why.
 */
export async function downloadSdClip(
  base: string,
  clip: SdClip,
  target: SaveTarget,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const staging = `${FileSystem.cacheDirectory}cv-${clip.name}`;
  await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => {});

  const task = FileSystem.createDownloadResumable(
    `${base}/rec/get?f=${encodeURIComponent(clip.name)}`,
    staging,
    {},
    (p) => {
      if (!onProgress) return;
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : clip.bytes;
      if (total > 0) onProgress(Math.min(1, p.totalBytesWritten / total));
    }
  );

  const res = await task.downloadAsync();
  if (!res || res.status !== 200) {
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => {});
    throw new Error(res ? `camera answered ${res.status}` : "the download did not complete");
  }

  try {
    if (target.kind === "folder" && target.dir) {
      // SAF has no move from a file:// URI, so the bytes go through base64.
      // Acceptable here and not for live recording: this happens once per
      // clip, with the file already safely on disk if it fails.
      const b64 = await FileSystem.readAsStringAsync(staging, { encoding: FileSystem.EncodingType.Base64 });
      const uri = await SAF.createFileAsync(target.dir, clip.name, "video/x-msvideo");
      await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
      return uri;
    }
    const dir = `${FileSystem.documentDirectory}recordings/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const uri = `${dir}${clip.name}`;
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: staging, to: uri });
    return uri;
  } finally {
    await FileSystem.deleteAsync(staging, { idempotent: true }).catch(() => {});
  }
}

/** Clips already saved on this phone, newest first. */
export async function listSavedClips(): Promise<{ name: string; uri: string; bytes: number }[]> {
  const dir = `${FileSystem.documentDirectory}recordings/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) return [];
  const names = await FileSystem.readDirectoryAsync(dir);
  const out: { name: string; uri: string; bytes: number }[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".avi")) continue;
    const uri = `${dir}${name}`;
    const st = await FileSystem.getInfoAsync(uri, { size: true });
    out.push({ name, uri, bytes: st.exists && "size" in st ? (st.size as number) : 0 });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
