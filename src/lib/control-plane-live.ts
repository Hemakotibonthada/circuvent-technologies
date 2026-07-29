"use client";

import { useEffect, useRef, useState } from "react";
import { CONTROL_PLANE_WS, getToken } from "./control-plane";

export interface DeviceUpdate {
  type: "device:update";
  deviceId: string;
  kind: "state" | "telemetry" | "status";
  payload: Record<string, unknown>;
  at: string;
}

export interface DeviceFrame {
  type: "device:frame";
  deviceId: string;
  /** Base64 JPEG — wrap in a data URL to render. */
  jpeg: string;
  bytes: number;
  at: string;
}

export type LiveStatus = "connecting" | "live" | "offline";

type FrameHandler = (f: DeviceFrame) => void;

// ---------------------------------------------------------------------------
// One socket per browser tab.
//
// Device updates and camera frames share it: a second connection would mean a
// second TLS handshake, a second auth round-trip, and a second thing to
// reconnect on every network blip, for no benefit.
// ---------------------------------------------------------------------------
let sock: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let refs = 0;

const updateHandlers = new Set<(u: DeviceUpdate) => void>();
const statusHandlers = new Set<(s: LiveStatus) => void>();
/** deviceId -> components currently rendering that camera. */
const frameHandlers = new Map<string, Set<FrameHandler>>();

let status: LiveStatus = "connecting";
function setStatus(s: LiveStatus): void {
  if (status === s) return;
  status = s;
  for (const h of statusHandlers) h(s);
}

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
 * one of them. Re-arming here is the difference between a blip pausing the
 * video for a second and killing it until the operator reloads the page.
 */
function rearmWatches(): void {
  for (const id of frameHandlers.keys()) send({ type: "watch", deviceId: id });
}

function scheduleReconnect(): void {
  if (refs === 0) return;
  setStatus("offline");
  attempts += 1;
  const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts, 4));
  retry = setTimeout(connect, delay);
}

function connect(): void {
  if (refs === 0 || sock) return;
  const t = getToken();
  if (!t) {
    retry = setTimeout(connect, 3000);
    return;
  }
  setStatus(attempts === 0 ? "connecting" : "offline");

  let ws: WebSocket;
  try {
    ws = new WebSocket(CONTROL_PLANE_WS + "?token=" + encodeURIComponent(t));
  } catch {
    scheduleReconnect();
    return;
  }
  sock = ws;

  ws.onopen = () => {
    attempts = 0;
    setStatus("live");
    rearmWatches();
  };

  ws.onmessage = (e: MessageEvent) => {
    let m: { type?: string; deviceId?: string } | null = null;
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return; // malformed frame
    }
    if (!m) return;
    if (m.type === "device:update") {
      for (const h of updateHandlers) h(m as unknown as DeviceUpdate);
    } else if (m.type === "device:frame" && m.deviceId) {
      const set = frameHandlers.get(m.deviceId);
      if (set) for (const h of set) h(m as unknown as DeviceFrame);
    }
  };

  ws.onclose = () => {
    if (sock === ws) sock = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  };
}

function retain(): void {
  refs += 1;
  if (refs === 1) connect();
}

function release(): void {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  if (retry) {
    clearTimeout(retry);
    retry = undefined;
  }
  const ws = sock;
  sock = null;
  try {
    ws?.close();
  } catch {
    /* already closed */
  }
}

/**
 * Live device channel for the web console. Connects to
 * wss://.../ws?token=<jwt> and invokes onUpdate for every real-time device
 * push (sub-second). Auto-reconnects with backoff and reports link status so
 * the UI can show a Live/Reconnecting indicator (parity with the site's SSE).
 */
export function useControlLive(onUpdate: (u: DeviceUpdate) => void): LiveStatus {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  const [s, setS] = useState<LiveStatus>(status);

  useEffect(() => {
    const onMsg = (u: DeviceUpdate) => cb.current(u);
    updateHandlers.add(onMsg);
    statusHandlers.add(setS);
    retain();
    setS(status);
    return () => {
      updateHandlers.delete(onMsg);
      statusHandlers.delete(setS);
      release();
    };
  }, []);

  return s;
}

/**
 * Subscribes to live JPEG frames from one camera.
 *
 * Frames are opt-in end to end: nothing is sent until a view asks for it, and
 * the server stops relaying as soon as the last viewer unmounts. Pass a falsy
 * deviceId to subscribe to nothing (e.g. while paused) without unmounting.
 */
export function useCameraFrames(deviceId: string | null | undefined, onFrame: FrameHandler): void {
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    if (!deviceId) return;
    const h: FrameHandler = (f) => cb.current(f);

    let set = frameHandlers.get(deviceId);
    if (!set) {
      set = new Set();
      frameHandlers.set(deviceId, set);
    }
    set.add(h);

    retain();
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
