"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Power,
  Droplets,
  ShieldAlert,
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Home,
  Plug,
  Lightbulb,
  Fan,
  Blinds,
  Lock,
  ToggleRight,
  ToggleLeft,
  Gauge,
  ScanLine,
  Sprout,
  Waves,
  Car,
  Eye,
  DoorOpen,
  LayoutGrid,
  Camera as CameraIcon,
  ScanBarcode,
  ClipboardCheck,
  Plane,
} from "lucide-react";
import { useAccount } from "@/components/shop/AccountProvider";
import AuthForm from "@/components/shop/AuthForm";

interface DeviceView {
  id: string;
  type: string;
  name: string;
  online: boolean;
  lastSeen?: string;
  state: Record<string, unknown>;
}

/*
 * Every type the console knows, with the console's icon.
 *
 * This map used to hold eight entries out of twenty-seven, which was invisible
 * while the page could only ever list devices claimed here. Now that it lists
 * what a customer actually owns, a missing entry means somebody's camera or
 * curtain shows up in their own order history as a generic chip. The console
 * comment that added the last four says it plainly: the same device must not
 * look like two different things on two screens.
 *
 * Kept as its own map rather than importing DEVICE_META, which lives in a
 * five-thousand-line console component that has no business in the shop
 * bundle. tests/shop-device-icons.test.ts holds the two in agreement.
 */
const TYPE_ICON: Record<string, React.ElementType> = {
  aquaguard: Droplets,
  "home-hub": Home,
  "smart-plug": Plug,
  "smart-light": Lightbulb,
  "smart-fan": Fan,
  curtain: Blinds,
  "smart-lock": Lock,
  "smart-switch": ToggleRight,
  "energy-monitor": Gauge,
  meter: Gauge,
  guardian: ShieldAlert,
  "motion-sensor": ScanLine,
  "agri-starter": Sprout,
  watertank: Waves,
  "rfid-gate": Car,
  Eye,
  switchboard: ToggleLeft,
  facedoor: DoorOpen,
  touchboard: LayoutGrid,
  "touchboard-8": LayoutGrid,
  sentinel: ShieldAlert,
  camera: CameraIcon,
  cctv: CameraIcon,
  doorbell: CameraIcon,
  "anpr-cam": ScanBarcode,
  "rfid-attend": ClipboardCheck,
  "drone-link": Plane,
  "drone-x1": Plane,
  rccar: Car,
  witness: Eye,
};

export default function DevicesPage() {
  const { account, ready, authHeaders } = useAccount();

  return (
    <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-8 lg:px-8">
      <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
        My devices
      </h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
        Control and monitor your Circuvent devices — powered end-to-end by the Circuvent cloud.
      </p>

      <div className="mt-8">
        {!ready ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
          </div>
        ) : !account ? (
          <AuthForm heading="Sign in to control your devices" sub="Link and control your Circuvent devices from anywhere." />
        ) : (
          <DevicePanel authHeaders={authHeaders} />
        )}
      </div>
    </section>
  );
}

function DevicePanel({ authHeaders }: { authHeaders: () => Record<string, string> }) {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/devices", { headers: authHeaders() });
      if (res.ok) {
        const d = await res.json();
        setDevices(d.devices || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [authHeaders]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live refresh
    return () => clearInterval(t);
  }, [load]);

  const sendCommand = async (deviceId: string, action: string, params?: Record<string, unknown>) => {
    try {
      await fetch("/api/devices/command", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ deviceId, action, params }),
      });
      load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <AddDevice authHeaders={authHeaders} onAdded={load} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : devices.length === 0 ? (
        <div
          className="mt-4 rounded-2xl border p-10 text-center"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
        >
          <Cpu className="mx-auto h-8 w-8" style={{ color: "var(--text-muted)" }} />
          <p className="mt-3 text-sm" style={{ color: "var(--text-tertiary)" }}>
            No devices linked yet. Add one using the ID and key printed on your device.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} onCommand={sendCommand} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  onCommand,
}: {
  device: DeviceView;
  onCommand: (id: string, action: string, params?: Record<string, unknown>) => void;
}) {
  const Icon = TYPE_ICON[device.type] || Cpu;
  const s = device.state || {};
  const num = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : undefined);
  const bool = (k: string) => s[k] === true;

  const power = "power" in s ? bool("power") : undefined;
  const pump = "pump" in s ? bool("pump") : undefined;
  const armed = "armed" in s ? bool("armed") : undefined;
  const level = num("level");
  const watts = num("watts");
  const kwh = num("kwh");
  const battery = num("battery");
  const motion = "motion" in s ? bool("motion") : undefined;

  return (
    <div className="rounded-2xl border p-5" style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {device.name}
            </p>
            <p className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
              {device.id}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs" style={{ color: device.online ? "var(--status-success-text)" : "var(--text-muted)" }}>
          {device.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {device.online ? "Online" : "Offline"}
        </span>
      </div>

      {/* Readouts */}
      <div className="mt-4 flex flex-wrap gap-2">
        {level !== undefined && <Readout label="Tank level" value={`${level}%`} />}
        {watts !== undefined && <Readout label="Power" value={`${watts} W`} />}
        {kwh !== undefined && <Readout label="Energy" value={`${kwh} kWh`} />}
        {battery !== undefined && <Readout label="Battery" value={`${battery}%`} />}
        {motion !== undefined && <Readout label="Motion" value={motion ? "Detected" : "Clear"} />}
        {power !== undefined && <Readout label="State" value={power ? "ON" : "OFF"} />}
        {pump !== undefined && <Readout label="Pump" value={pump ? "Running" : "Stopped"} />}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap gap-2">
        {power !== undefined && (
          <ControlButton
            on={power}
            labelOn="Turn off"
            labelOff="Turn on"
            onClick={() => onCommand(device.id, "set", { power: !power })}
          />
        )}
        {pump !== undefined && (
          <ControlButton
            on={pump}
            labelOn="Stop pump"
            labelOff="Start pump"
            onClick={() => onCommand(device.id, "set", { pump: !pump })}
          />
        )}
        {armed !== undefined && (
          <ControlButton
            on={armed}
            labelOn="Disarm"
            labelOff="Arm"
            onClick={() => onCommand(device.id, "set", { armed: !armed })}
          />
        )}
        <button
          onClick={() => onCommand(device.id, "refresh")}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Ping
        </button>
      </div>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-glass)" }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function ControlButton({
  on,
  labelOn,
  labelOff,
  onClick,
}: {
  on: boolean;
  labelOn: string;
  labelOff: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white"
      style={{ background: on ? "var(--status-danger-text)" : "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
    >
      <Power className="h-3.5 w-3.5" /> {on ? labelOn : labelOff}
    </button>
  );
}

function AddDevice({ authHeaders, onAdded }: { authHeaders: () => Record<string, string>; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const claim = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/devices/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ deviceId, key, name }),
      });
      const d = await res.json();
      if (d.success) {
        setDeviceId("");
        setKey("");
        setName("");
        setOpen(false);
        onAdded();
      } else {
        setMsg(d.message || "Could not link the device.");
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const inp = "rounded-lg border px-3 py-2 text-sm outline-none";
  const inpStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm font-medium"
        style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan)" }}
      >
        <Plus className="h-4 w-4" /> Add a device
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
      <div className="grid gap-2 sm:grid-cols-3">
        <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="Device ID (on the sticker)" className={inp} style={inpStyle} />
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Device key" className={inp} style={inpStyle} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Living room)" className={inp} style={inpStyle} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={claim}
          disabled={busy || !deviceId || !key}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Link device
        </button>
        <button onClick={() => setOpen(false)} className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Cancel
        </button>
        {msg && <span className="text-xs text-rose-500">{msg}</span>}
      </div>
    </div>
  );
}
