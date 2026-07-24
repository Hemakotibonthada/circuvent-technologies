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

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Live device channel for the web console. Connects to
 * wss://.../ws?token=<jwt> and invokes onUpdate for every real-time device
 * push (sub-second). Auto-reconnects with backoff and reports link status so
 * the UI can show a Live/Reconnecting indicator (parity with the site's SSE).
 */
export function useControlLive(onUpdate: (u: DeviceUpdate) => void): LiveStatus {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;
  const [status, setStatus] = useState<LiveStatus>("connecting");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = () => {
      if (closed) return;
      const t = getToken();
      if (!t) {
        retry = setTimeout(connect, 3000);
        return;
      }
      setStatus(attempts === 0 ? "connecting" : "offline");
      try {
        ws = new WebSocket(CONTROL_PLANE_WS + "?token=" + encodeURIComponent(t));
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        attempts = 0;
        setStatus("live");
      };
      ws.onmessage = (e: MessageEvent) => {
        try {
          const m = JSON.parse(String(e.data));
          if (m && m.type === "device:update") cb.current(m as DeviceUpdate);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) scheduleReconnect();
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closed) return;
      setStatus("offline");
      attempts += 1;
      const delay = Math.min(15000, 1000 * 2 ** Math.min(attempts, 4));
      retry = setTimeout(connect, delay);
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return status;
}
