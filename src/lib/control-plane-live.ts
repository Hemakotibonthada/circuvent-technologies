"use client";

import { useEffect, useRef, useState } from "react";
import { CONTROL_PLANE_WS, getActiveHome, getToken } from "./control-plane";

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
  /** Raw JPEG bytes. Wrap in a Blob to render; never re-encode to base64. */
  data: Uint8Array;
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
    /* The home this socket is for, when it is not the caller's own. A
       WebSocket handshake from a browser carries no custom headers, so it
       rides in the URL like the token does. Omitting it when there is no
       active home keeps the connection byte-identical to what it was. */
    const home = getActiveHome();
    ws = new WebSocket(
      CONTROL_PLANE_WS + "?token=" + encodeURIComponent(t) + (home ? "&home=" + home : "")
    );
  } catch {
    scheduleReconnect();
    return;
  }
  sock = ws;
  /*
   * Frames arrive as bytes, so the socket must hand them over as bytes. Without
   * this a binary message is delivered as a Blob and every frame costs an async
   * read before it can even be looked at.
   */
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    attempts = 0;
    setStatus("live");
    /*
     * Announce that this client can read binary frames BEFORE re-arming any
     * watch, so the very first frame already comes back in the fast shape
     * rather than one base64 frame slipping through per reconnect.
     */
    send({ type: "hello", binaryFrames: true });
    rearmWatches();
  };

  /**
   * Binary frame: [version][idLen][deviceId][JPEG].
   *
   * Matches `encodeFrame` in platform/api/src/ws.ts. The version byte leads so
   * an unrecognised shape can be dropped instead of rendered as garbage.
   */
  const readBinaryFrame = (buf: ArrayBuffer): void => {
    const view = new Uint8Array(buf);
    if (view.length < 3 || view[0] !== 1) return;
    const idLen = view[1];
    if (view.length < 2 + idLen) return;
    let deviceId = "";
    for (let i = 0; i < idLen; i++) deviceId += String.fromCharCode(view[2 + i]);
    const set = frameHandlers.get(deviceId);
    if (!set || set.size === 0) return;
    // slice(), not subarray(): a view would pin the socket's whole receive
    // buffer alive for as long as any consumer held the frame, and the copy of
    // a dozen kilobytes costs far less than the base64 round trip it replaced.
    const data = view.slice(2 + idLen);
    const f: DeviceFrame = {
      type: "device:frame",
      deviceId,
      data,
      bytes: data.length,
      at: new Date().toISOString(),
    };
    for (const h of set) h(f);
  };

  ws.onmessage = (e: MessageEvent) => {
    if (e.data instanceof ArrayBuffer) {
      readBinaryFrame(e.data);
      return;
    }
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
      /*
       * The base64 shape, from a control plane older than the binary framing.
       * Decoded here so every consumer downstream sees bytes and none of them
       * has to know which server it happened to connect to.
       */
      const set = frameHandlers.get(m.deviceId);
      if (!set || set.size === 0) return;
      const b64 = (m as unknown as { jpeg?: unknown }).jpeg;
      if (typeof b64 !== "string") return;
      let data: Uint8Array;
      try {
        const bin = atob(b64);
        data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      } catch {
        return;
      }
      const f: DeviceFrame = {
        type: "device:frame",
        deviceId: m.deviceId,
        data,
        bytes: data.length,
        at: (m as unknown as { at?: string }).at || new Date().toISOString(),
      };
      for (const h of set) h(f);
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

/**
 * A wall clock that advances on an interval, for deciding whether the last
 * frame is stale.
 *
 * Reading `Date.now()` during render would be impure — the value changes
 * without a state update, so React is free to render a stale "Live" badge and
 * never correct it. Sampling the clock inside the interval instead makes the
 * staleness a real piece of state that drives a re-render.
 *
 * @param ms      Sampling period. 1000 is enough for a seconds-granular age.
 * @param enabled Pass false to stop the timer entirely (e.g. device offline).
 */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}

/** Asks the server to re-read which devices this account owns. */
export function refreshLiveSubscription(): void {
  send({ type: "subscribe" });
}
