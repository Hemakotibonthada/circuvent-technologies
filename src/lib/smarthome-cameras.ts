// Camera & Video Hub — a camera registry + player. No camera firmware exists
// in this product line yet (see firmware/ — none of the current devices are
// cameras), so this is a forward-looking scaffold: register a stream URL
// (HLS/MJPEG/snapshot) for any camera you already have, and view it here.
// Stored locally; nothing server-side to keep in sync.

const KEY = "cv-console-cameras";

export type CameraKind = "hls" | "mjpeg" | "snapshot";

export interface CameraEntry {
  id: string;
  name: string;
  streamUrl: string;
  kind: CameraKind;
  roomName?: string;
  createdAt: string;
}

export function listCameras(): CameraEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CameraEntry[]) : [];
  } catch {
    return [];
  }
}

function write(cameras: CameraEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cameras));
  } catch {
    /* ignore */
  }
}

export function addCamera(input: Omit<CameraEntry, "id" | "createdAt">): CameraEntry {
  const camera: CameraEntry = { ...input, id: `cam_${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  write([camera, ...listCameras()]);
  return camera;
}

export function deleteCamera(id: string): void {
  write(listCameras().filter((c) => c.id !== id));
}
