import { useEffect, useRef } from "react";
import { getToken } from "./api";
import { WS_URL } from "./config";

export interface DeviceUpdate {
  type: "device:update";
  deviceId: string;
  kind: "state" | "telemetry" | "status";
  payload: any;
  at: string;
}

export interface DeviceFrame {
  type: "device:frame";
  deviceId: string;
  /** Base64 JPEG. Wrap in a data URL to hand to <Image>. */
  jpeg: string;
  bytes: number;
  at: string;
}

type FrameHandler = (f: DeviceFrame) => void;

// ---------------------------------------------------------------------------
// One socket for the whole app.
//
// Device updates and camera frames share a single connection: a second socket
// would mean a second TLS handshake, a second auth round-trip and a second
// thing to reconnect on every network blip, for no benefit.
// ---------------------------------------------------------------------------
let sock: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let refs = 0;

const updateHandlers = new Set<(u: DeviceUpdate) => void>();
/** deviceId -> handlers currently rendering that camera. */
const frameHandlers = new Map<string, Set<FrameHandler>>();

function send(msg: object): void {
  if (sock && sock.readyState === WebSocket.OPEN) {
    try {
      sock.send(JSON.stringify(msg));
    } catch {
      /* socket died between the check and the send */
    }
  }
}

/**
 * Watches are server-side session state, so a reconnect silently loses every
 * one of them. Re-arming here is the difference between a Wi-Fi blip pausing
 * the video for a second and killing it until the user backs out of the screen.
 */
function rearmWatches(): void {
  for (const id of frameHandlers.keys()) send({ type: "watch", deviceId: id });
}

async function connect(): Promise<void> {
  if (refs === 0 || sock) return;
  const t = await getToken();
  if (!t) {
    retryTimer = setTimeout(() => { void connect(); }, 3000);
    return;
  }
  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_URL + "?token=" + encodeURIComponent(t));
  } catch {
    retryTimer = setTimeout(() => { void connect(); }, 3000);
    return;
  }
  sock = ws;

  ws.onopen = () => { rearmWatches(); };

  ws.onmessage = (e: any) => {
    let m: any;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (!m) return;
    if (m.type === "device:update") {
      for (const h of updateHandlers) h(m as DeviceUpdate);
    } else if (m.type === "device:frame") {
      const set = frameHandlers.get(m.deviceId);
      if (set) for (const h of set) h(m as DeviceFrame);
    }
  };

  ws.onclose = () => {
    if (sock === ws) sock = null;
    if (refs > 0) retryTimer = setTimeout(() => { void connect(); }, 3000);
  };

  ws.onerror = () => {
    try { ws.close(); } catch { /* already closing */ }
  };
}

function retain(): void {
  refs++;
  if (refs === 1) void connect();
}

function release(): void {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined; }
  const ws = sock;
  sock = null;
  try { ws?.close(); } catch { /* already closed */ }
}

/**
 * Live device channel — connects to wss://.../ws?token=<jwt> and calls
 * onUpdate for every real-time device push (<1s). Auto-reconnects on drop.
 */
export function useLive(onUpdate: (u: DeviceUpdate) => void): void {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    const h = (u: DeviceUpdate) => cb.current(u);
    updateHandlers.add(h);
    retain();
    return () => {
      updateHandlers.delete(h);
      release();
    };
  }, []);
}

/**
 * Subscribes to live JPEG frames from one camera.
 *
 * Frames are opt-in end to end: nothing is sent until a screen asks, and the
 * server stops as soon as the last viewer unmounts. Pass a null deviceId to
 * subscribe to nothing (e.g. while a view is paused) without unmounting.
 */
export function useCameraFrames(deviceId: string | null | undefined, onFrame: FrameHandler): void {
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    if (!deviceId) return;
    const h: FrameHandler = (f) => cb.current(f);

    let set = frameHandlers.get(deviceId);
    if (!set) { set = new Set(); frameHandlers.set(deviceId, set); }
    set.add(h);

    retain();
    // Harmless if the server already has this watch — it de-dupes per socket.
    send({ type: "watch", deviceId });

    return () => {
      const s = frameHandlers.get(deviceId);
      if (s) {
        s.delete(h);
        if (s.size === 0) {
          frameHandlers.delete(deviceId);
          send({ type: "unwatch", deviceId });
        }
      }
      release();
    };
  }, [deviceId]);
}

/** Asks the server to re-read which devices this account owns. */
export function refreshLiveSubscription(): void {
  send({ type: "subscribe" });
}
