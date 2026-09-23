"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Camera as CameraIcon,
  Smartphone,
  Link2,
  Trash2,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  Surface,
  SectionTitle,
  Button,
  Callout,
  EmptyState,
} from "../_kit/primitives";
import {
  addExternalCamera,
  deleteExternalCamera,
  fetchExternalCameras,
  fetchPhoneFrame,
  pairPhoneCamera,
  revokePhoneCamera,
  type CameraEntry,
} from "@/lib/smarthome-cameras";

type Mode = "choose" | "brand" | "phone";

export function AddCameraPanel({ onChanged }: { onChanged?: () => void }) {
  const [mode, setMode] = useState<Mode>("choose");
  const [cameras, setCameras] = useState<CameraEntry[]>([]);
  const [relayConfigured, setRelayConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  // Brand form
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"hls" | "mjpeg" | "snapshot" | "rtsp">("rtsp");
  const [streamUrl, setStreamUrl] = useState("");
  const [snapshotUrl, setSnapshotUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roomName, setRoomName] = useState("");

  // Phone pairing
  const [pairUrl, setPairUrl] = useState("");
  const [pairExpires, setPairExpires] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [phoneName, setPhoneName] = useState("Phone camera");
  const [phoneRoom, setPhoneRoom] = useState("");

  const refresh = useCallback(async () => {
    const r = await fetchExternalCameras();
    setCameras(r.cameras);
    setRelayConfigured(r.relayConfigured);
    onChanged?.();
  }, [onChanged]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitBrand() {
    setBusy(true);
    setError("");
    try {
      await addExternalCamera({
        name: name || "Camera",
        kind,
        streamUrl,
        snapshotUrl: snapshotUrl || undefined,
        username: username || undefined,
        password: password || undefined,
        roomName: roomName || undefined,
      });
      setNote("Camera added.");
      setName("");
      setStreamUrl("");
      setSnapshotUrl("");
      setUsername("");
      setPassword("");
      setMode("choose");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add camera.");
    } finally {
      setBusy(false);
    }
  }

  async function startPhonePair() {
    setBusy(true);
    setError("");
    try {
      const r = await pairPhoneCamera({
        name: phoneName || "Phone camera",
        roomName: phoneRoom || undefined,
      });
      setPairUrl(r.pairUrl);
      setPairExpires(r.expires);
      setMode("phone");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start pairing.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPair() {
    if (!pairUrl) return;
    try {
      await navigator.clipboard.writeText(pairUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the link — select it manually.");
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await deleteExternalCamera(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokePhoneCamera(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>Add camera</SectionTitle>
        <Button variant="ghost" icon={RefreshCw} onClick={() => void refresh()} title="Refresh">
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-3">
          <Callout tone="warning">{error}</Callout>
        </div>
      )}
      {note && (
        <div className="mb-3">
          <Callout tone="ok">{note}</Callout>
        </div>
      )}

      {mode === "choose" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("brand")}
            className="rounded-2xl border p-4 text-left transition hover:border-cyan-500/50"
            style={{ borderColor: "var(--cv-border)", background: "var(--cv-elevated)" }}
          >
            <Link2 className="mb-2 h-5 w-5 text-cyan-400" />
            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              Other brand
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--cv-muted)" }}>
              Add a Hikvision, Dahua, Reolink, or any camera with an RTSP, HLS, MJPEG, or snapshot URL.
            </p>
          </button>
          <button
            type="button"
            onClick={() => void startPhonePair()}
            disabled={busy}
            className="rounded-2xl border p-4 text-left transition hover:border-cyan-500/50 disabled:opacity-50"
            style={{ borderColor: "var(--cv-border)", background: "var(--cv-elevated)" }}
          >
            <Smartphone className="mb-2 h-5 w-5 text-violet-400" />
            <div className="text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              Use a phone
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--cv-muted)" }}>
              Pair a spare or old phone as a CCTV camera. Open the link on the phone and allow the camera.
            </p>
          </button>
        </div>
      )}

      {mode === "brand" && (
        <div className="space-y-3">
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Front gate" />
          </Field>
          <Field label="Room">
            <input className={inputCls} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Entrance" />
          </Field>
          <Field label="Stream type">
            <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="rtsp">RTSP (most IP cameras)</option>
              <option value="hls">HLS (.m3u8)</option>
              <option value="mjpeg">MJPEG</option>
              <option value="snapshot">Snapshot / still JPEG URL</option>
            </select>
          </Field>
          <Field label={kind === "rtsp" ? "RTSP URL" : "Stream URL"}>
            <input
              className={inputCls}
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder={
                kind === "rtsp"
                  ? "rtsp://192.168.1.50:554/Streaming/Channels/101"
                  : "https://…"
              }
            />
          </Field>
          {kind === "rtsp" && (
            <>
              <Field label="Snapshot URL (optional)">
                <input
                  className={inputCls}
                  value={snapshotUrl}
                  onChange={(e) => setSnapshotUrl(e.target.value)}
                  placeholder="https://…/snapshot.jpg"
                />
              </Field>
              {!relayConfigured && (
                <Callout tone="info">
                  Live RTSP in the browser needs a media relay. Set{" "}
                  <code className="text-[11px]">CAMERA_RELAY_BASE_URL</code> to your go2rtc or MediaMTX
                  base (or provide a snapshot / HLS URL). The camera is still saved either way.
                </Callout>
              )}
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username (optional)">
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Password (optional)">
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={CameraIcon} busy={busy} onClick={() => void submitBrand()}>
              Save camera
            </Button>
            <Button variant="ghost" onClick={() => setMode("choose")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {mode === "phone" && (
        <div className="space-y-3">
          <Field label="Name on the wall">
            <input className={inputCls} value={phoneName} onChange={(e) => setPhoneName(e.target.value)} />
          </Field>
          <Field label="Room">
            <input className={inputCls} value={phoneRoom} onChange={(e) => setPhoneRoom(e.target.value)} />
          </Field>
          {pairUrl ? (
            <>
              <Callout tone="ok">
                Open this link on the phone you want to use as a camera. It expires{" "}
                {pairExpires ? new Date(pairExpires).toLocaleTimeString() : "soon"}.
              </Callout>
              <div
                className="break-all rounded-xl border p-3 text-xs"
                style={{ borderColor: "var(--cv-border)", color: "var(--cv-text)" }}
              >
                {pairUrl}
              </div>
              {/* Lightweight QR via chart API-free SVG QR would need a lib; use link + copy for v1 */}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={copied ? Check : Copy} onClick={() => void copyPair()}>
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button
                  variant="secondary"
                  busy={busy}
                  onClick={() => {
                    setPairUrl("");
                    void startPhonePair();
                  }}
                >
                  New link
                </Button>
                <Button variant="ghost" onClick={() => setMode("choose")}>
                  Done
                </Button>
              </div>
              <p className="text-xs" style={{ color: "var(--cv-muted)" }}>
                Tip: text the link to the spare phone, or open it in that phone&apos;s browser and keep the
                page in the foreground while you want live video.
              </p>
            </>
          ) : (
            <Button variant="primary" icon={Smartphone} busy={busy} onClick={() => void startPhonePair()}>
              Generate pairing link
            </Button>
          )}
        </div>
      )}

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--cv-border)" }}>
        <SectionTitle>Registered (other brand & phone)</SectionTitle>
        {cameras.length === 0 ? (
          <div className="mt-2">
            <EmptyState
              icon={CameraIcon}
              title="No external cameras yet"
              body="Add an other-brand stream or pair a phone — they show up here and on the wall."
            />
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {cameras.map((c) => (
              <ExternalRow key={c.id} cam={c} busy={busy} onRemove={() => void remove(c.id)} onRevoke={() => void revoke(c.id)} />
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}

function ExternalRow({
  cam,
  busy,
  onRemove,
  onRevoke,
}: {
  cam: CameraEntry;
  busy: boolean;
  onRemove: () => void;
  onRevoke: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (cam.kind !== "phone") {
      setThumb(cam.playUrl || cam.snapshotUrl || null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const f = await fetchPhoneFrame(cam.id);
      if (cancelled) return;
      setThumb(f ? `data:image/jpeg;base64,${f.jpegB64}` : null);
    };
    void tick();
    const t = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [cam.id, cam.kind, cam.playUrl, cam.snapshotUrl]);

  return (
    <li
      className="flex items-center gap-3 rounded-xl border p-2"
      style={{ borderColor: "var(--cv-border)" }}
    >
      <div
        className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-black/40"
        style={{ border: "1px solid var(--cv-border)" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px]" style={{ color: "var(--cv-muted)" }}>
            {cam.kind === "phone" ? "Waiting…" : cam.kind.toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
          {cam.name}
        </div>
        <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
          {cam.kind}
          {cam.roomName ? ` · ${cam.roomName}` : ""}
          {cam.kind === "phone" ? (cam.online ? " · live" : cam.paired ? " · idle" : " · awaiting pair") : ""}
          {cam.needsRelay ? " · needs relay for live RTSP" : ""}
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        {cam.kind === "phone" && cam.paired && (
          <Button variant="ghost" onClick={onRevoke} disabled={busy} title="Stop phone ingest">
            Stop
          </Button>
        )}
        <Button variant="danger" icon={Trash2} onClick={onRemove} disabled={busy} title="Remove" />
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cv-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-cyan-500/60";
