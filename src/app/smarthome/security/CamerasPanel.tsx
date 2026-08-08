"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, VideoOff, Radio } from "lucide-react";
import {
  Surface,
  SectionTitle,
  StatusDot,
  Kpi,
  KpiGrid,
  EmptyState,
  ErrorState,
  LoadingState,
  RelativeTime,
  DetailRow,
  Callout,
} from "../_kit/primitives";
import { useFleet } from "../_data/hooks";
import { deviceMeta } from "../DeviceControls";
import { useCameraFrames, useNow } from "@/lib/control-plane-live";
import { isCameraDevice } from "../_data/device-type";

// Security devices that operators typically want visual status for
const SECURITY_TYPES = new Set([
  "facedoor",
  "rfid-gate",
  "guardian",
  "motion-sensor",
  "smart-lock",
  "camera",
  "cctv",
  "doorbell",
]);

/** Types whose firmware relays JPEG frames over MQTT (firmware/camera). */
const CAMERA_TYPES = new Set(["camera", "cctv", "doorbell"]);

// Third-party devices may still publish a plain stream/snapshot URL in state.
const POTENTIAL_CAMERA_TYPES = new Set(["facedoor", "rfid-gate"]);

interface SecurityDeviceCardProps {
  device: {
    id: string;
    name: string;
    type: string;
    room?: string;
    online: boolean;
    last_seen?: string | null;
    state: Record<string, unknown>;
  };
}

function SecurityDeviceCard({ device }: SecurityDeviceCardProps) {
  const meta = deviceMeta(device.type);
  const Icon = meta.icon;
  const state = device.state;

  // Check for any stream or snapshot URL the firmware might have published
  const streamUrl = typeof state.streamUrl === "string" ? state.streamUrl : null;
  const snapshotUrl = typeof state.snapshotUrl === "string" ? state.snapshotUrl : null;

  // Collect meaningful status fields from state
  const statusLines: { label: string; value: string }[] = [];
  if (typeof state.locked === "boolean") {
    statusLines.push({ label: "Lock", value: state.locked ? "Locked" : "Unlocked" });
  }
  if (typeof state.barrier === "string") {
    statusLines.push({ label: "Barrier", value: state.barrier });
  }
  if (typeof state.motion === "boolean") {
    statusLines.push({ label: "Motion", value: state.motion ? "Detected" : "Clear" });
  }
  if (typeof state.sos === "boolean" && state.sos) {
    statusLines.push({ label: "SOS", value: "ACTIVE" });
  }
  if (typeof state.armed === "boolean") {
    statusLines.push({ label: "Armed", value: state.armed ? "Yes" : "No" });
  }

  return (
    <Surface padded={false}>
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `${meta.accent}22` }}
            >
              <Icon className="h-5 w-5" style={{ color: meta.accent }} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold" style={{ color: "var(--cv-text)" }}>
                {device.name || device.id}
              </div>
              <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
                {meta.label}{device.room ? ` · ${device.room}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusDot online={device.online} />
            <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
              {device.online ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        {statusLines.length > 0 && (
          <div
            className="mb-3 overflow-hidden rounded-xl"
            style={{ border: "1px solid var(--cv-border)" }}
          >
            {statusLines.map((s) => (
              <DetailRow key={s.label} label={s.label}>
                <span
                  style={{
                    color:
                      s.label === "SOS" && s.value === "ACTIVE"
                        ? "#dc2626"
                        : s.label === "Lock" && s.value === "Unlocked"
                        ? "#b45309"
                        : "var(--cv-text)",
                    fontWeight: s.label === "SOS" ? 800 : undefined,
                  }}
                >
                  {s.value}
                </span>
              </DetailRow>
            ))}
          </div>
        )}

        {/* Live frames for Circuvent cameras, then plain stream/snapshot URLs
            for third-party devices, then honest disclosure. */}
        {isCameraDevice(device) ? (
          <CameraThumb device={device} />
        ) : streamUrl ? (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
              Live stream
            </div>
            <video
              src={streamUrl}
              className="w-full rounded-xl"
              style={{ aspectRatio: "16/9", background: "#000", objectFit: "cover" }}
              controls
              muted
              playsInline
              aria-label={`Video stream from ${device.name || device.id}`}
            />
          </div>
        ) : snapshotUrl ? (
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--cv-muted)" }}>
              Snapshot
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={snapshotUrl}
              alt={`Snapshot from ${device.name || device.id}`}
              className="w-full rounded-xl"
              style={{ aspectRatio: "16/9", objectFit: "cover" }}
            />
          </div>
        ) : POTENTIAL_CAMERA_TYPES.has(device.type) ? (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "var(--cv-card-hi)" }}
          >
            <VideoOff className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
            <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
              No stream URL published — this device does not expose a live feed in the current firmware.
            </span>
          </div>
        ) : null}

        {device.last_seen && (
          <div className="mt-3 text-xs" style={{ color: "var(--cv-muted)" }}>
            Last seen <RelativeTime iso={device.last_seen} />
          </div>
        )}
      </div>
    </Surface>
  );
}

/**
 * Live tile for a Circuvent camera. Subscribes to the frame relay while the
 * card is mounted, so the wall shows moving pictures rather than a placeholder.
 * Frames are only produced while the device is streaming; before then this
 * shows the last snapshot, or an invitation to open the camera.
 */
function CameraThumb({ device }: { device: SecurityDeviceCardProps["device"] }) {
  const [frame, setFrame] = useState<{ src: string; at: number } | null>(null);
  const seen = useRef(0);

  useCameraFrames(device.online ? device.id : null, (f) => {
    seen.current += 1;
    setFrame({ src: `data:image/jpeg;base64,${f.jpeg}`, at: Date.now() });
  });

  const streaming = device.state.streaming === true;
  const now = useNow(1000, device.online && frame != null);
  const live = streaming && frame != null && now - frame.at < 5000;

  return (
    <Link href={`/smarthome/device/${encodeURIComponent(device.id)}`} className="block">
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ aspectRatio: "4/3", background: "#000", border: "1px solid var(--cv-border)" }}
      >
        {frame ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={frame.src}
            alt={`Live view from ${device.name || device.id}`}
            className="h-full w-full object-contain"
            style={{ transform: device.state.rotation === 180 ? "rotate(180deg)" : undefined }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
            <VideoOff className="h-7 w-7" style={{ color: "#475569" }} />
            <span className="text-xs" style={{ color: "#94a3b8" }}>
              {device.online ? "Open to start live view" : "Camera is offline"}
            </span>
          </div>
        )}
        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            background: live ? "rgba(239,68,68,0.85)" : "rgba(15,23,42,0.75)",
            color: live ? "#fff" : "#cbd5e1",
          }}
        >
          <Radio className="h-2.5 w-2.5" />
          {live ? "Live" : frame ? "Still" : "Idle"}
        </span>
        {device.state.motionActive === true && (
          <span
            className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}
          >
            Motion
          </span>
        )}
      </div>
    </Link>
  );
}

export function CamerasPanel() {
  const { devices, loading, error, refresh } = useFleet();

  const securityDevices = useMemo(
    () => devices.filter((d) => SECURITY_TYPES.has(d.type)),
    [devices]
  );

  const devicesWithStreams = useMemo(
    () =>
      securityDevices.filter(
        (d) =>
          // isCameraDevice rather than CAMERA_TYPES: a unit registered as a
          // camera that reports hasCamera:false will never produce a frame, so
          // it must not hold a tile promising one.
          isCameraDevice(d) ||
          typeof d.state.streamUrl === "string" ||
          typeof d.state.snapshotUrl === "string"
      ),
    [securityDevices]
  );

  const onlineCount = useMemo(
    () => securityDevices.filter((d) => d.online).length,
    [securityDevices]
  );

  if (loading && devices.length === 0) return <LoadingState label="Loading devices" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;

  return (
    <div className="space-y-5">
      <KpiGrid cols={3}>
        <Kpi label="Security devices" value={securityDevices.length} icon={Camera} />
        <Kpi label="Online" value={onlineCount} tone={onlineCount > 0 ? "ok" : undefined} />
        <Kpi
          label="With live video"
          value={devicesWithStreams.length}
          hint={devicesWithStreams.length === 0 ? "Add a camera to see live video" : undefined}
        />
      </KpiGrid>

      {devicesWithStreams.length === 0 && (
        <Callout tone="info">
          This view shows security devices — cameras, facedoors, RFID gates, motion sensors,
          guardians and smart locks. Circuvent cameras relay live JPEG frames over the device
          channel; other devices appear here for status only.
        </Callout>
      )}

      {securityDevices.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No security devices registered"
          body="Add a camera, facedoor, RFID gate, motion sensor, guardian, or smart lock to this fleet to see it here."
        />
      ) : (
        <>
          <SectionTitle>Security devices — {securityDevices.length} total</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {securityDevices.map((d) => (
              <SecurityDeviceCard key={d.id} device={d} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
