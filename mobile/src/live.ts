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

/**
 * Live device channel — connects to wss://.../ws?token=<jwt> and calls
 * onUpdate for every real-time device push (<1s). Auto-reconnects on drop.
 */
export function useLive(onUpdate: (u: DeviceUpdate) => void): void {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      if (closed) return;
      const t = await getToken();
      if (!t) {
        retry = setTimeout(connect, 3000);
        return;
      }
      try {
        ws = new WebSocket(WS_URL + "?token=" + encodeURIComponent(t));
      } catch {
        retry = setTimeout(connect, 3000);
        return;
      }
      ws.onmessage = (e: any) => {
        try {
          const m = JSON.parse(e.data);
          if (m && m.type === "device:update") cb.current(m as DeviceUpdate);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
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
}
