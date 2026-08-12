"use client";

// ═══════════════════════════════════════════════════════════════
// Clips
// ═══════════════════════════════════════════════════════════════
// Recordings live on the card inside each camera. There is no cloud copy and
// no control-plane endpoint that lists them: the camera serves them itself,
// over plain HTTP on its LAN address (port 81 — /rec/list, /rec/get).
//
// That has a consequence this panel cannot engineer away. The console is
// served over HTTPS, and a browser will not let an HTTPS page fetch from
// http://192.168.x.x — it is mixed content and gets blocked before it reaches
// the network. So this panel does not pretend to browse clips inline; it shows
// what the control plane genuinely knows (recording state, clip count, card
// health) and links out to the camera's own interface, because a top-level
// navigation to http:// is allowed where a background fetch is not.
//
// The alternative — a clip browser that spins forever behind a blocked request
// — would look like broken cameras rather than a browser policy.

import { useMemo } from "react";
import {
  Disc,
  ExternalLink,
  HardDrive,
  Video,
  AlertTriangle,
} from "lucide-react";
import {
  Surface,
  SectionTitle,
  Kpi,
  KpiGrid,
  EmptyState,
  ErrorState,
  LoadingState,
  Callout,
  DetailRow,
} from "../_kit/primitives";
import { useFleet } from "../_data/hooks";
import { isCameraDevice } from "../_data/device-type";

type FleetDevice = {
  id: string;
  name: string;
  type: string;
  room?: string;
  online: boolean;
  state: Record<string, unknown>;
};

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown): boolean => v === true;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/** The camera's own LAN interface, when it has told us where it is. */
function lanUrl(d: FleetDevice, path = "/"): string | null {
  const ip = str(d.state.ip);
  if (!ip) return null;
  const port = num(d.state.lanPort, 81);
  return `http://${ip}:${port}${path}`;
}

function CameraRow({ device }: { device: FleetDevice }) {
  const s = device.state;
  const clips = num(s.clips, 0);
  const recording = bool(s.recording);
  const card = bool(s.sd);
  const fault = str(s.sdFault);
  const url = lanUrl(device, "/rec/list");
  const home = lanUrl(device, "/");

  return (
    <Surface>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              {device.name || device.id}
            </span>
            {recording && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={{ background: "rgba(220,38,38,0.9)", color: "#fff" }}
              >
                <Disc className="h-2.5 w-2.5" /> Recording
              </span>
            )}
            {!device.online && (
              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                Offline
              </span>
            )}
          </div>
          {device.room && (
            <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
              {device.room}
            </span>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {home && (
            <a
              href={home}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open camera
            </a>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10"
            >
              <Video className="h-3.5 w-3.5" /> Clips
            </a>
          )}
        </div>
      </div>

      <div className="mt-2">
        <DetailRow label="Clips on card">{clips > 0 ? String(clips) : "None"}</DetailRow>
        <DetailRow label="Card">
          {card ? "Present" : fault ? `Fault — ${fault}` : "Not detected"}
        </DetailRow>
        {!lanUrl(device) && (
          <DetailRow label="LAN address">
            {device.online ? "Not reported yet" : "Unknown while offline"}
          </DetailRow>
        )}
      </div>

      {!card && device.online && (
        <div className="mt-2">
          <Callout tone="warning">
            No card detected, so nothing is being written. Recording will report success and
            keep nothing.
          </Callout>
        </div>
      )}
    </Surface>
  );
}

export function RecordingsPanel() {
  const { devices, loading, error, refresh } = useFleet();

  const cameras = useMemo(
    () => (devices as unknown as FleetDevice[]).filter((d) => isCameraDevice(d as never)),
    [devices]
  );

  if (loading && devices.length === 0) return <LoadingState label="Loading cameras" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  if (cameras.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No cameras yet"
        body="Clips are written to the card inside a camera, so this fills in once you add one."
      />
    );
  }

  const totalClips = cameras.reduce((n, d) => n + num(d.state.clips, 0), 0);
  const recording = cameras.filter((d) => bool(d.state.recording)).length;
  const noCard = cameras.filter((d) => d.online && !bool(d.state.sd)).length;

  return (
    <div className="space-y-4">
      <KpiGrid cols={3}>
        <Kpi label="Clips on cards" value={totalClips} icon={HardDrive} />
        <Kpi label="Recording now" value={recording} tone={recording > 0 ? "ok" : undefined} />
        <Kpi
          label="Missing a card"
          value={noCard}
          tone={noCard > 0 ? "warning" : undefined}
          hint={noCard > 0 ? "Recording keeps nothing" : undefined}
        />
      </KpiGrid>

      <Callout tone="info" title="Clips stay on the camera">
        There is no cloud copy. Each camera serves its own recordings over your local network,
        so the links below only work from a device on the same network — and they open in a new
        tab rather than loading here, because a page served over HTTPS is not allowed to fetch
        from a plain-HTTP address on your LAN.
      </Callout>

      {noCard > 0 && (
        <Callout tone="warning">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {noCard} camera{noCard === 1 ? " has" : "s have"} no card fitted. Turning on
            recording there succeeds and stores nothing.
          </span>
        </Callout>
      )}

      <div className="space-y-3">
        <SectionTitle>Cameras</SectionTitle>
        {cameras.map((d) => (
          <CameraRow key={d.id} device={d} />
        ))}
      </div>
    </div>
  );
}
