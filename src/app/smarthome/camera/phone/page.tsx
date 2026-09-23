"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, FlipHorizontal, Square } from "lucide-react";

/**
 * Spare-phone CCTV page.
 *
 * Opens from a pairing link generated in the Camera console. Claims a short
 * pair token, then posts JPEG frames from getUserMedia to the ingest API.
 * Keep this tab in the foreground for a continuous feed.
 */
export default function PhoneCameraPage() {
  return (
    <Suspense fallback={<Shell>Loading…</Shell>}>
      <PhoneCameraInner />
    </Suspense>
  );
}

function PhoneCameraInner() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<"claiming" | "ready" | "streaming" | "error" | "stopped">("claiming");
  const [message, setMessage] = useState("Connecting…");
  const [cameraId, setCameraId] = useState("");
  const [ingestToken, setIngestToken] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [name, setName] = useState("Phone camera");
  const [fpsOk, setFpsOk] = useState(0);

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("stopped");
    setMessage("Stopped. You can close this tab.");
  }, []);

  const startCamera = useCallback(
    async (facingMode: "environment" | "user") => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setFacing(facingMode);
        setStatus("streaming");
        setMessage(`Streaming as ${name}. Keep this page open.`);
      } catch (e) {
        setStatus("error");
        setMessage(
          e instanceof Error
            ? e.message
            : "Camera permission was denied. Allow the camera and reload."
        );
      }
    },
    [name]
  );

  // Claim pairing token once
  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing pairing token. Open Cameras on your console and generate a new phone link.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/smarthome/cameras/phone/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !d.ok) {
          setStatus("error");
          setMessage(d.error || "This pairing link is invalid or expired.");
          return;
        }
        setCameraId(d.cameraId);
        setIngestToken(d.ingestToken);
        const n = d.name || "Phone camera";
        setName(n);
        setStatus("ready");
        setMessage("Camera ready — starting…");
        // Start camera without depending on startCamera callback identity
        try {
          streamRef.current?.getTracks().forEach((tr) => tr.stop());
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((tr) => tr.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setFacing("environment");
          setStatus("streaming");
          setMessage(`Streaming as ${n}. Keep this page open.`);
        } catch (e) {
          setStatus("error");
          setMessage(
            e instanceof Error
              ? e.message
              : "Camera permission was denied. Allow the camera and reload."
          );
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not reach Circuvent. Check your connection and try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Frame upload loop
  useEffect(() => {
    if (status !== "streaming" || !cameraId || !ingestToken) return;

    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      canvas.width = Math.min(960, w);
      canvas.height = Math.round((canvas.width / w) * h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7)
      );
      if (!blob) return;
      try {
        const res = await fetch("/api/smarthome/cameras/phone/frame", {
          method: "POST",
          headers: {
            "x-cv-camera": cameraId,
            "x-cv-token": ingestToken,
            "content-type": "image/jpeg",
          },
          body: blob,
        });
        if (res.ok) setFpsOk((n) => n + 1);
        if (res.status === 410 || res.status === 403) {
          setStatus("error");
          setMessage("This phone session ended. Generate a new link from Cameras.");
          stop();
        }
      } catch {
        /* transient */
      }
    };

    timerRef.current = setInterval(() => void tick(), 800);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [status, cameraId, ingestToken, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <Shell>
      <h1 className="mb-1 text-lg font-bold text-white">{name}</h1>
      <p className="mb-4 text-sm text-slate-400">{message}</p>

      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "4 / 3" }}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {status === "streaming" && (
          <span className="absolute left-3 top-3 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
            Live · {fpsOk} frames
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "streaming" && (
          <>
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-800 px-4 py-3 text-sm font-semibold text-white"
              onClick={() => void startCamera(facing === "environment" ? "user" : "environment")}
            >
              <FlipHorizontal className="h-4 w-4" /> Flip camera
            </button>
            <button
              type="button"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-red-700 px-4 py-3 text-sm font-semibold text-white"
              onClick={stop}
            >
              <Square className="h-4 w-4" /> Stop
            </button>
          </>
        )}
        {status === "error" && (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-600 px-4 py-3 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            <Camera className="h-4 w-4" /> Try again
          </button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}
