/**
 * Remote camera viewing, for when the frame relay cannot deliver.
 *
 * The live path is device -> broker -> control plane -> browser over a
 * WebSocket. That relay is opened by a `watch` message, and the deployed
 * control plane never reads inbound WebSocket messages, so it never opens.
 * LAN viewing (firmware 1.9.0) covers someone standing in the house; this
 * covers the case that actually matters, which is not being in it.
 *
 * Here the site itself is the relay: it tells the camera to post frames over
 * plain HTTPS and then serves them back. Slower than video by design — each
 * frame is a full TLS request from an ESP32 — but it works from anywhere and
 * depends on nothing that is currently broken.
 */
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/control-plane";

export interface RemoteFrame {
  src: string;
  at: number;
  bytes: number;
}

/** Re-arm well inside the server's window so viewing never lapses mid-watch. */
const REARM_MS = 60_000;

export type RemoteStatus = "idle" | "starting" | "live" | "unavailable";

export function useRemoteCamera(deviceId: string | null, enabled: boolean) {
  const [frame, setFrame] = useState<RemoteFrame | null>(null);
  const [status, setStatus] = useState<RemoteStatus>("idle");
  const [detail, setDetail] = useState("");
  const lastAt = useRef(0);

  useEffect(() => {
    if (!deviceId || !enabled) {
      setStatus("idle");
      return;
    }
    const token = getToken();
    if (!token) {
      setStatus("unavailable");
      setDetail("sign in again to view remotely");
      return;
    }

    let stopped = false;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const arm = async () => {
      const r = await fetch("/api/smarthome/camera/watch", {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, on: true }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        if (!stopped) {
          setStatus("unavailable");
          // Say what the server said. "Remote viewing failed" sends someone
          // power-cycling a camera that is fine.
          setDetail(body.error || `request failed (${r.status})`);
        }
        return false;
      }
      return true;
    };

    const poll = async () => {
      const r = await fetch(`/api/smarthome/camera/frame?deviceId=${encodeURIComponent(deviceId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (r.status === 204 || !r.ok) return;
      const f = (await r.json()) as { jpegB64: string; bytes: number; capturedAt: string };
      const at = new Date(f.capturedAt).getTime();
      if (at <= lastAt.current) return;      // same frame again; do not re-render
      lastAt.current = at;
      if (stopped) return;
      setStatus("live");
      setFrame({ src: `data:image/jpeg;base64,${f.jpegB64}`, at, bytes: f.bytes });
    };

    setStatus("starting");
    setDetail("");
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let armTimer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      if (!(await arm()) || stopped) return;
      pollTimer = setInterval(() => void poll().catch(() => {}), 400);
      armTimer = setInterval(() => void arm().catch(() => {}), REARM_MS);
    })();

    return () => {
      stopped = true;
      if (pollTimer) clearInterval(pollTimer);
      if (armTimer) clearInterval(armTimer);
      // Tell the camera to stop rather than letting the window lapse: a device
      // uploading for a viewer who closed the tab is spending the household's
      // bandwidth on nobody.
      void fetch("/api/smarthome/camera/watch", {
        method: "POST",
        headers,
        body: JSON.stringify({ deviceId, on: false }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [deviceId, enabled]);

  return { frame, status, detail };
}
