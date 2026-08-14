/**
 * Remote camera viewing, for when the frame relay cannot deliver.
 *
 * The live path is device -> broker -> control plane -> browser over a
 * WebSocket, opened by a `watch` message. That path is the one that carries
 * real video, and it is the one to fix if video is slow — see
 * `platform/api/src/ws.ts`, which reads `watch`/`unwatch` and refcounts
 * viewers, and firmware 1.13.0, which is what lifted the camera off 3 fps.
 *
 * This is the fallback, and it is deliberately not video. The site itself
 * relays: it tells the camera to POST frames over plain HTTPS and serves them
 * back. Every frame is a full TLS request from an ESP32, so the firmware caps
 * it at four per second (`cloudpush` in `firmware/camera/camera.ino` clamps
 * fps to 1..4) and no amount of polling here can exceed what the device
 * uploads. It works from anywhere and depends on nothing that can break in the
 * middle, which is the entire point of it.
 *
 * Do not "optimise" this into the main path. If live video is slow, this file
 * is not where the problem is.
 */
import { useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/control-plane";

export interface RemoteFrame {
  src: string;
  at: number;
  bytes: number;
  /** JPEG bytes, so a recording started on this path writes without re-decoding. */
  data: Uint8Array;
}

/** Re-arm well inside the server's window so viewing never lapses mid-watch. */
const REARM_MS = 60_000;

/**
 * Matched to the firmware's four-frames-a-second ceiling on this path.
 *
 * It was 400ms, which is 2.5 polls a second against a device willing to upload
 * four — so a third of the frames the camera paid TLS to send were overwritten
 * before anyone saw them. Polling faster than the device uploads is waste;
 * polling slower is a self-inflicted frame rate.
 */
const POLL_MS = 250;

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
      /*
       * This path really does arrive as base64 — it is a JSON API, not the
       * frame socket — so it is decoded once here. Everything downstream then
       * sees bytes regardless of which transport delivered the picture, and
       * recording does not need to know the difference.
       */
      let data: Uint8Array;
      try {
        const bin = atob(f.jpegB64);
        data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      } catch {
        return;
      }
      setFrame({ src: `data:image/jpeg;base64,${f.jpegB64}`, at, bytes: f.bytes, data });
    };

    setStatus("starting");
    setDetail("");
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let armTimer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      if (!(await arm()) || stopped) return;
      pollTimer = setInterval(() => void poll().catch(() => {}), POLL_MS);
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
