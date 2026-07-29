"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Minus, RotateCcw, MousePointer, Square, Pin, X, ZoomIn, ZoomOut, Move } from "lucide-react";
import type { Device } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import { useFleet } from "../_data/hooks";
import {
  Button,
  IconButton,
  Callout,
  SectionTitle,
  Surface,
  Badge,
  StatusDot,
  EmptyState,
  LoadingState,
} from "../_kit/primitives";
import { PowerButton, deviceMetric } from "../_kit/device";
import { ConfirmDialog, useToast } from "../_kit/overlays";
import { usePersistentState } from "../_kit/primitives";
import { deviceMeta } from "../DeviceControls";
import type { FloorLayout, FloorPin, FloorRoom } from "./storage";
import { EMPTY_LAYOUT } from "./storage";

const STORAGE_KEY = "cv-spaces-floorplan-v1";

// Canvas is always 1000×1000 internal units; the SVG scales to fill its container.
const GRID = 1000;
const SNAP = 25; // snap interval in grid units

type Tool = "select" | "pin" | "room";

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

// ---------------------------------------------------------------------------
// Status colour derived purely from published device state (matches floorplan legacy).
// ---------------------------------------------------------------------------
function pinColor(d: Device): { fill: string; active: boolean; label: string } {
  const s = d.state ?? {};
  if (!d.online) return { fill: "#64748b", active: false, label: "offline" };
  if (s.dryRun || s.overflow || s.sos || s.leak || s.tamper)
    return { fill: "#ef4444", active: true, label: "alert" };
  if (s.motion) return { fill: "#f59e0b", active: true, label: "motion" };
  switch (d.type) {
    case "rfid-gate":
      return String(s.barrier) === "open"
        ? { fill: "#22c55e", active: true, label: "open" }
        : { fill: "#38bdf8", active: false, label: "closed" };
    case "facedoor":
    case "smart-lock":
      return s.locked
        ? { fill: "#38bdf8", active: false, label: "locked" }
        : { fill: "#22c55e", active: true, label: "unlocked" };
    case "watertank":
      return s.pump ? { fill: "#06b6d4", active: true, label: "pump on" } : { fill: "#38bdf8", active: false, label: "idle" };
    case "aquaguard":
      return { fill: "#38bdf8", active: !!s.pump, label: `${Number(s.ohPct ?? 0)}%` };
    case "touchboard": {
      const on = [s.g1, s.g2, s.g3].filter(Boolean).length;
      return on ? { fill: "#22c55e", active: true, label: `${on}/3 on` } : { fill: "#475569", active: false, label: "off" };
    }
    case "home-hub": {
      const on = [s.power, s.power2, s.power3, s.power4].filter(Boolean).length;
      return on ? { fill: "#22c55e", active: true, label: `${on}/4 on` } : { fill: "#475569", active: false, label: "off" };
    }
    default: {
      const on = !!(s.power ?? s.pump ?? s.on);
      return on ? { fill: "#22c55e", active: true, label: "on" } : { fill: "#475569", active: false, label: "off" };
    }
  }
}

// ---------------------------------------------------------------------------
// Emoji glyph per device type (re-uses floorplan legacy mapping)
// ---------------------------------------------------------------------------
function deviceGlyph(type: string): string {
  const MAP: Record<string, string> = {
    "rfid-gate": "🚗",
    facedoor: "🚪",
    "smart-lock": "🔒",
    watertank: "🌊",
    aquaguard: "💧",
    touchboard: "🎛️",
    "motion-sensor": "🚶",
    "energy-monitor": "⚡",
    "smart-plug": "🔌",
    "smart-switch": "🎚️",
    "home-hub": "🏠",
    guardian: "🛡️",
    "agri-starter": "🌿",
  };
  return MAP[type] ?? "📟";
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export default function FloorplanPanel() {
  const fleet = useFleet();
  const toast = useToast();

  const [layout, setLayout, loaded] = usePersistentState<FloorLayout>(STORAGE_KEY, EMPTY_LAYOUT);
  const [resetOpen, setResetOpen] = useState(false);

  // Active tool
  const [tool, setTool] = useState<Tool>("select");

  // Device selection (for the pin tool — next click places this device)
  const [pendingDevice, setPendingDevice] = useState<string | null>(null);

  // Selected pin or room for the info panel
  const [selectedPin, setSelectedPin] = useState<string | null>(null); // deviceId
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null); // room name

  // Drag state
  const [dragging, setDragging] = useState<{ type: "pin"; deviceId: string } | { type: "room"; name: string } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Room drawing state
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Room name prompt
  const [namingRoom, setNamingRoom] = useState<FloorRoom | null>(null);
  const [roomNameInput, setRoomNameInput] = useState("");

  const zoom = layout.zoom ?? 1;
  const svgRef = useRef<SVGSVGElement>(null);

  const setZoom = useCallback((z: number) => {
    setLayout((prev) => ({ ...prev, zoom: Math.max(0.5, Math.min(3, z)) }));
  }, [setLayout]);

  // Convert SVG client coords → grid coords (accounting for zoom)
  const clientToGrid = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const rx = ((clientX - rect.left) / rect.width) * GRID;
    const ry = ((clientY - rect.top) / rect.height) * GRID;
    return { x: snap(rx), y: snap(ry) };
  }, []);

  // ---------------------------------------------------------------------------
  // Pointer event handlers
  // ---------------------------------------------------------------------------
  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pos = clientToGrid(e.clientX, e.clientY);
      if (!pos) return;

      if (tool === "pin" && pendingDevice) {
        // Place or move a pin
        const alreadyPlaced = layout.pins.find((p) => p.deviceId === pendingDevice);
        if (alreadyPlaced) {
          setLayout((prev) => ({
            ...prev,
            pins: prev.pins.map((p) =>
              p.deviceId === pendingDevice ? { ...p, x: pos.x, y: pos.y } : p,
            ),
          }));
        } else {
          setLayout((prev) => ({
            ...prev,
            pins: [...prev.pins, { deviceId: pendingDevice, x: pos.x, y: pos.y }],
          }));
        }
        toast.ok("Pin placed — click again to reposition.");
        return;
      }

      if (tool === "room") {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrawStart(pos);
        setDrawCurrent(pos);
        return;
      }
    },
    [tool, pendingDevice, layout.pins, setLayout, clientToGrid, toast],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const pos = clientToGrid(e.clientX, e.clientY);
      if (!pos) return;

      if (dragging) {
        if (dragging.type === "pin") {
          setLayout((prev) => ({
            ...prev,
            pins: prev.pins.map((p) =>
              p.deviceId === dragging.deviceId
                ? { ...p, x: snap(pos.x + dragOffset.dx), y: snap(pos.y + dragOffset.dy) }
                : p,
            ),
          }));
        } else if (dragging.type === "room") {
          setLayout((prev) => ({
            ...prev,
            rooms: prev.rooms.map((r) =>
              r.name === dragging.name
                ? { ...r, x: snap(pos.x + dragOffset.dx), y: snap(pos.y + dragOffset.dy) }
                : r,
            ),
          }));
        }
        return;
      }

      if (tool === "room" && drawStart) {
        setDrawCurrent(pos);
      }
    },
    [dragging, dragOffset, tool, drawStart, setLayout, clientToGrid],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragging) {
        setDragging(null);
        return;
      }

      if (tool === "room" && drawStart && drawCurrent) {
        const x = Math.min(drawStart.x, drawCurrent.x);
        const y = Math.min(drawStart.y, drawCurrent.y);
        const w = Math.abs(drawCurrent.x - drawStart.x);
        const h = Math.abs(drawCurrent.y - drawStart.y);
        if (w > SNAP * 2 && h > SNAP * 2) {
          const newRoom: FloorRoom = { name: `Room ${layout.rooms.length + 1}`, x, y, w, h };
          setNamingRoom(newRoom);
          setRoomNameInput(newRoom.name);
        }
        setDrawStart(null);
        setDrawCurrent(null);
      }
    },
    [dragging, tool, drawStart, drawCurrent, layout.rooms.length],
  );

  const startDragPin = useCallback(
    (e: React.PointerEvent, deviceId: string, pin: FloorPin) => {
      if (tool !== "select") return;
      e.stopPropagation();
      const pos = clientToGrid(e.clientX, e.clientY);
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging({ type: "pin", deviceId });
      setDragOffset({ dx: pin.x - pos.x, dy: pin.y - pos.y });
    },
    [tool, clientToGrid],
  );

  const startDragRoom = useCallback(
    (e: React.PointerEvent, room: FloorRoom) => {
      if (tool !== "select") return;
      e.stopPropagation();
      const pos = clientToGrid(e.clientX, e.clientY);
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging({ type: "room", name: room.name });
      setDragOffset({ dx: room.x - pos.x, dy: room.y - pos.y });
    },
    [tool, clientToGrid],
  );

  const confirmRoomName = useCallback(() => {
    if (!namingRoom) return;
    const name = roomNameInput.trim() || namingRoom.name;
    setLayout((prev) => ({ ...prev, rooms: [...prev.rooms, { ...namingRoom, name }] }));
    setNamingRoom(null);
    toast.ok(`Room outline "${name}" added`);
  }, [namingRoom, roomNameInput, setLayout, toast]);

  const removePin = useCallback(
    (deviceId: string) => {
      setLayout((prev) => ({ ...prev, pins: prev.pins.filter((p) => p.deviceId !== deviceId) }));
      if (selectedPin === deviceId) setSelectedPin(null);
    },
    [setLayout, selectedPin],
  );

  const removeRoom = useCallback(
    (name: string) => {
      setLayout((prev) => ({ ...prev, rooms: prev.rooms.filter((r) => r.name !== name) }));
      if (selectedRoom === name) setSelectedRoom(null);
    },
    [setLayout, selectedRoom],
  );

  const handleReset = useCallback(() => {
    setLayout(EMPTY_LAYOUT);
    setSelectedPin(null);
    setSelectedRoom(null);
    setResetOpen(false);
    toast.info("Floor plan cleared");
  }, [setLayout, toast]);

  // Device selected via pin click
  const selectedDevice = useMemo(
    () => (selectedPin ? fleet.devices.find((d) => d.id === selectedPin) ?? null : null),
    [selectedPin, fleet.devices],
  );

  // Devices not yet placed
  const unplaced = useMemo(
    () => fleet.devices.filter((d) => !layout.pins.some((p) => p.deviceId === d.id)),
    [fleet.devices, layout.pins],
  );

  if (!loaded) return <LoadingState label="Loading floor plan" />;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Stored locally in this browser">
        Pin positions and room outlines are saved in this browser&apos;s localStorage only — they are not synced to
        the server. Device status colours update live from the control plane.
      </Callout>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <ToolButton icon={MousePointer} label="Select / drag" active={tool === "select"} onClick={() => { setTool("select"); setPendingDevice(null); }} />
        <ToolButton icon={Pin} label="Place pin" active={tool === "pin"} onClick={() => setTool("pin")} />
        <ToolButton icon={Square} label="Draw room outline" active={tool === "room"} onClick={() => { setTool("room"); setPendingDevice(null); }} />
        <div className="h-6 w-px" style={{ background: "var(--cv-border)" }} />
        <IconButton icon={ZoomIn} label="Zoom in" onClick={() => setZoom(zoom + 0.25)} />
        <span className="text-xs tabular-nums" style={{ color: "var(--cv-muted)" }}>{Math.round(zoom * 100)}%</span>
        <IconButton icon={ZoomOut} label="Zoom out" onClick={() => setZoom(zoom - 0.25)} />
        <div className="flex-1" />
        <Button variant="danger" icon={RotateCcw} onClick={() => setResetOpen(true)}>
          Reset
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* SVG Canvas */}
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{ border: "1px solid var(--cv-border)", background: "var(--cv-card)", touchAction: "none" }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${GRID} ${GRID}`}
            className="w-full"
            style={{ maxHeight: 560, display: "block", cursor: tool === "pin" ? "crosshair" : tool === "room" ? "crosshair" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            aria-label="Floor plan canvas"
            role="application"
          >
            {/* Grid lines */}
            <GridLines />

            {/* Room outlines */}
            {layout.rooms.map((room) => (
              <g key={room.name}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  rx={8}
                  fill="rgba(99,102,241,0.06)"
                  stroke={selectedRoom === room.name ? "var(--cv-accent)" : "rgba(99,102,241,0.4)"}
                  strokeWidth={selectedRoom === room.name ? 2 : 1}
                  style={{ cursor: tool === "select" ? "move" : "default" }}
                  onPointerDown={(e) => startDragRoom(e, room)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool === "select") setSelectedRoom(room.name);
                  }}
                />
                <text
                  x={room.x + 8}
                  y={room.y + 18}
                  fontSize={11}
                  fontWeight={700}
                  fill="rgba(99,102,241,0.8)"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {room.name}
                </text>
              </g>
            ))}

            {/* Drawing preview */}
            {tool === "room" && drawStart && drawCurrent && (
              <rect
                x={Math.min(drawStart.x, drawCurrent.x)}
                y={Math.min(drawStart.y, drawCurrent.y)}
                width={Math.abs(drawCurrent.x - drawStart.x)}
                height={Math.abs(drawCurrent.y - drawStart.y)}
                rx={8}
                fill="rgba(99,102,241,0.08)"
                stroke="rgba(99,102,241,0.5)"
                strokeWidth={1}
                strokeDasharray="6 3"
                style={{ pointerEvents: "none" }}
              />
            )}

            {/* Device pins */}
            {layout.pins.map((pin) => {
              const device = fleet.devices.find((d) => d.id === pin.deviceId);
              if (!device) return null;
              const { fill, active, label } = pinColor(device);
              const glyph = deviceGlyph(device.type);
              const isSel = selectedPin === pin.deviceId;
              return (
                <DevicePin
                  key={pin.deviceId}
                  pin={pin}
                  device={device}
                  fill={fill}
                  active={active}
                  label={label}
                  glyph={glyph}
                  selected={isSel}
                  draggable={tool === "select"}
                  onPointerDown={(e) => startDragPin(e, pin.deviceId, pin)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool === "select") setSelectedPin(isSel ? null : pin.deviceId);
                  }}
                />
              );
            })}
          </svg>

          {/* Status legend */}
          <div
            className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-xl px-3 py-2 text-[10px]"
            style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
          >
            <LegendDot color="#22c55e" label="Active" />
            <LegendDot color="#38bdf8" label="Idle" />
            <LegendDot color="#f59e0b" label="Motion" />
            <LegendDot color="#ef4444" label="Alert" />
            <LegendDot color="#64748b" label="Offline" />
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Pin placement selector */}
          {tool === "pin" && (
            <Surface>
              <SectionTitle>Pick a device to place</SectionTitle>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {unplaced.length === 0 && (
                  <p className="text-xs py-2" style={{ color: "var(--cv-muted)" }}>All devices are placed.</p>
                )}
                {unplaced.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setPendingDevice(d.id); toast.info(`Click canvas to place ${d.name}`); }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition"
                    style={{
                      background: pendingDevice === d.id ? "color-mix(in srgb, var(--cv-accent) 14%, transparent)" : "var(--cv-card-hi)",
                      border: `1px solid ${pendingDevice === d.id ? "var(--cv-accent)" : "var(--cv-border)"}`,
                    }}
                    aria-pressed={pendingDevice === d.id}
                  >
                    <StatusDot online={d.online} pulse={false} />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="truncate font-semibold" style={{ color: "var(--cv-text)" }}>{d.name}</div>
                      <div style={{ color: "var(--cv-muted)" }}>{d.type}</div>
                    </div>
                    <span className="text-lg">{deviceGlyph(d.type)}</span>
                  </button>
                ))}
              </div>
              {layout.pins.length > 0 && (
                <>
                  <SectionTitle>Placed devices</SectionTitle>
                  <div className="space-y-1.5">
                    {layout.pins.map((pin) => {
                      const d = fleet.devices.find((x) => x.id === pin.deviceId);
                      if (!d) return null;
                      return (
                        <div key={pin.deviceId} className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: "var(--cv-card-hi)" }}>
                          <span className="text-sm">{deviceGlyph(d.type)}</span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--cv-text)" }}>{d.name}</span>
                          <button onClick={() => removePin(d.id)} aria-label={`Remove ${d.name} pin`} className="rounded p-1 transition hover:brightness-110" style={{ color: "var(--cv-muted)" }}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Surface>
          )}

          {/* Selected device info */}
          {tool === "select" && selectedDevice && (
            <Surface>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>{selectedDevice.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                    {selectedDevice.type}{selectedDevice.room ? ` · ${selectedDevice.room}` : ""}
                  </div>
                </div>
                <button onClick={() => setSelectedPin(null)} aria-label="Close device panel" style={{ color: "var(--cv-muted)" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <StatusDot online={selectedDevice.online} />
                <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
                  {selectedDevice.online ? "Online" : "Offline"}
                </span>
                {deviceMetric(selectedDevice) && (
                  <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: "var(--cv-accent-hi)" }}>
                    {deviceMetric(selectedDevice)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <PowerButton
                  device={selectedDevice}
                  status={fleet.cmd.statusOf(selectedDevice.id)}
                  onSend={(cmd) => fleet.cmd.send(selectedDevice, cmd)}
                />
                <Button variant="ghost" onClick={() => removePin(selectedDevice.id)} className="text-xs">
                  Remove pin
                </Button>
              </div>
            </Surface>
          )}

          {/* Selected room info */}
          {tool === "select" && selectedRoom && !selectedPin && (
            <Surface>
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>{selectedRoom}</div>
                <button onClick={() => setSelectedRoom(null)} aria-label="Deselect room" style={{ color: "var(--cv-muted)" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <Button variant="danger" full onClick={() => removeRoom(selectedRoom)}>
                Remove outline
              </Button>
            </Surface>
          )}

          {/* Help card */}
          {tool === "select" && !selectedPin && !selectedRoom && (
            <Surface>
              <SectionTitle>How to use</SectionTitle>
              <ul className="space-y-2 text-xs" style={{ color: "var(--cv-muted)" }}>
                <li><span className="font-semibold" style={{ color: "var(--cv-text)" }}>Select</span> — drag pins and room outlines</li>
                <li><span className="font-semibold" style={{ color: "var(--cv-text)" }}>Pin</span> — choose a device, click canvas to place</li>
                <li><span className="font-semibold" style={{ color: "var(--cv-text)" }}>Room</span> — drag to draw a rectangle outline</li>
                <li>Click a pin to see live status and control it</li>
              </ul>
            </Surface>
          )}

          {tool === "room" && (
            <Surface>
              <SectionTitle>Drawn rooms</SectionTitle>
              {layout.rooms.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--cv-muted)" }}>Drag on the canvas to draw a room outline.</p>
              ) : (
                <div className="space-y-1.5">
                  {layout.rooms.map((r) => (
                    <div key={r.name} className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: "var(--cv-card-hi)" }}>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: "var(--cv-text)" }}>{r.name}</span>
                      <button onClick={() => removeRoom(r.name)} aria-label={`Remove room ${r.name}`} style={{ color: "var(--cv-muted)" }}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          )}
        </div>
      </div>

      {/* Room naming prompt */}
      {namingRoom && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          role="dialog"
          aria-modal
          aria-label="Name new room outline"
        >
          <div className="cv-card rounded-2xl p-6 w-full max-w-xs space-y-4">
            <h2 className="text-base font-extrabold" style={{ color: "var(--cv-text)" }}>Name this room</h2>
            <input
              autoFocus
              value={roomNameInput}
              onChange={(e) => setRoomNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRoomName(); if (e.key === "Escape") setNamingRoom(null); }}
              placeholder="Living room"
              className="cv-input text-sm w-full"
              aria-label="Room name"
            />
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setNamingRoom(null)}>Cancel</Button>
              <Button variant="primary" onClick={confirmRoomName}>Add room</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="Reset floor plan?"
        body="All pins and room outlines will be permanently removed from this browser. Device data is not affected."
        confirmLabel="Reset"
        danger
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ToolButton({ icon: Icon, label, active, onClick }: { icon: typeof MousePointer; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition"
      style={
        active
          ? { background: "var(--cv-gradient)", color: "#fff" }
          : { background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }
      }
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function GridLines() {
  const lines = [];
  for (let i = SNAP; i < GRID; i += SNAP) {
    const major = i % 100 === 0;
    lines.push(
      <line key={`h${i}`} x1={0} y1={i} x2={GRID} y2={i} stroke={major ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.05)"} strokeWidth={major ? 1 : 0.5} />,
      <line key={`v${i}`} x1={i} y1={0} x2={i} y2={GRID} stroke={major ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.05)"} strokeWidth={major ? 1 : 0.5} />,
    );
  }
  return <g style={{ pointerEvents: "none" }}>{lines}</g>;
}

function DevicePin({
  pin, device, fill, active, label, glyph, selected, draggable, onPointerDown, onClick,
}: {
  pin: FloorPin;
  device: Device;
  fill: string;
  active: boolean;
  label: string;
  glyph: string;
  selected: boolean;
  draggable: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const R = 18;
  return (
    <g
      transform={`translate(${pin.x},${pin.y})`}
      style={{ cursor: draggable ? "grab" : "pointer" }}
      role="button"
      aria-label={`${device.name}: ${label}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {/* Pulse ring for active devices */}
      {active && (
        <circle r={R + 8} fill={fill} opacity={0.18} className="animate-pulse" />
      )}
      <circle r={R} fill={fill} opacity={device.online ? 0.9 : 0.5} stroke={selected ? "#fff" : "rgba(255,255,255,0.3)"} strokeWidth={selected ? 3 : 1.5} />
      <text y={5} textAnchor="middle" fontSize={14} style={{ pointerEvents: "none", userSelect: "none" }}>
        {glyph}
      </text>
      <text y={R + 12} textAnchor="middle" fontSize={9} fill="var(--cv-text)" style={{ pointerEvents: "none", userSelect: "none" }}>
        {device.name.slice(0, 14)}
      </text>
      <text y={R + 22} textAnchor="middle" fontSize={8} fill={fill} fontWeight={700} style={{ pointerEvents: "none", userSelect: "none" }}>
        {label}
      </text>
    </g>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1" style={{ color: "var(--cv-muted)" }}>
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
