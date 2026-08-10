// Natural-language command parser for the voice assistant. Turns phrases like
// "turn on the living room lights" or "lock the front door" into concrete
// control-plane commands, and produces a spoken reply. Original RN
// implementation of the old SmartHome app's Jarvis feature, wired to our own
// devices/store (no OpenAI dependency — this runs fully on-device).
import type { Device } from "./api";
import { deviceMeta } from "./theme";
import { capabilities } from "./store";

export interface VoiceResult {
  reply: string;
  commands: { id: string; cmd: Record<string, unknown> }[];
  matched: Device[];
}

const TYPE_WORDS: Record<string, string[]> = {
  "smart-light": ["light", "lights", "lamp", "bulb"],
  "smart-fan": ["fan", "fans"],
  "smart-plug": ["plug", "socket", "outlet"],
  "smart-switch": ["switch", "switchboard"],
  touchboard: ["board", "touchboard", "panel"],
  sentinel: ["sentinel", "safety panel", "gas sensor", "gas detector"],
  curtain: ["curtain", "curtains", "blind", "blinds"],
  "smart-lock": ["lock", "door lock", "deadbolt"],
  facedoor: ["door", "front door", "entry"],
  "rfid-gate": ["gate", "barrier"],
  // Not "gate": that belongs to rfid-gate, and a household with both would get
  // the ANPR camera when it asked for the barrier. These name the camera.
  "anpr-cam": ["anpr", "plate camera", "number plate camera", "vehicle camera"],
  watertank: ["tank", "water", "sump", "overhead"],
  aquaguard: ["tank", "water", "aquaguard"],
  thermostat: ["ac", "air conditioner", "thermostat", "climate"],
  "energy-monitor": ["energy", "power meter"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

type Action = "on" | "off" | "toggle" | "lock" | "unlock" | "open" | "close" | "status" | null;
function detectAction(t: string): Action {
  if (/\b(turn on|switch on|power on|enable|activate|start)\b/.test(t) || /\bon\b/.test(t)) return "on";
  if (/\b(turn off|switch off|power off|disable|deactivate|stop|shut)\b/.test(t) || /\boff\b/.test(t)) return "off";
  if (/\b(unlock|open the (door|lock))\b/.test(t)) return "unlock";
  if (/\block\b/.test(t)) return "lock";
  if (/\b(open|raise)\b/.test(t)) return "open";
  if (/\b(close|shut|lower)\b/.test(t)) return "close";
  if (/\b(status|state|level|how much|what is|what's|show)\b/.test(t)) return "status";
  if (/\btoggle\b/.test(t)) return "toggle";
  return null;
}

// Pick the devices the phrase refers to: by name, room, type word, or "all".
function resolveTargets(t: string, devices: Device[]): Device[] {
  const all = /\ball\b|\bevery\b|\bwhole (home|house)\b/.test(t);
  const byName = devices.filter((d) => d.name && t.includes(norm(d.name)));
  if (byName.length && !all) return byName;

  const rooms = Array.from(new Set(devices.map((d) => (d.room || "").toLowerCase()).filter(Boolean)));
  const room = rooms.find((r) => t.includes(r));

  let typeHit: string | null = null;
  for (const [type, words] of Object.entries(TYPE_WORDS)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) { typeHit = type; break; }
  }

  let out = devices;
  if (room) out = out.filter((d) => (d.room || "").toLowerCase() === room);
  if (typeHit) out = out.filter((d) => d.type === typeHit || TYPE_WORDS[typeHit!]?.includes(d.type));
  if (all && !typeHit && !room) return devices;
  if (typeHit || room) return out;
  return byName; // nothing else matched
}

// Map an action to a concrete command for a device (respecting its toggle field).
function commandFor(d: Device, action: Action): Record<string, unknown> | null {
  const meta = deviceMeta(d.type);
  const cap = capabilities(d.type);
  const field = meta.toggle?.field || cap.power?.field;
  switch (action) {
    case "on": return field ? { action: "set", [field]: true } : null;
    case "off": return field ? { action: "set", [field]: false } : null;
    case "toggle": return field ? { action: "set", [field]: !d.state[field] } : null;
    case "lock": return { action: "set", locked: true };
    case "unlock": return d.type === "facedoor" ? { action: "unlock", method: "voice" } : { action: "set", locked: false };
    case "open": return d.type === "rfid-gate" ? { action: "open" } : d.type === "curtain" ? { action: "set", position: 100 } : field ? { action: "set", [field]: true } : null;
    case "close": return d.type === "rfid-gate" ? { action: "close" } : d.type === "curtain" ? { action: "set", position: 0 } : field ? { action: "set", [field]: false } : null;
    default: return null;
  }
}

function statusOf(d: Device): string {
  const s = d.state || {};
  if (d.type === "watertank") return `${d.name} overhead is ${Number(s.ohPct ?? 0)} percent, sump ${Number(s.sumpPct ?? 0)} percent`;
  if (d.type === "aquaguard") return `${d.name} is at ${Number(s.level ?? 0)} percent`;
  if (d.type === "facedoor" || d.type === "smart-lock") return `${d.name} is ${s.locked ? "locked" : "unlocked"}`;
  if (d.type === "rfid-gate") return `${d.name} barrier is ${s.barrier || "closed"}`;
  if (d.type === "anpr-cam") {
    if (!s.armed) return `${d.name} is disarmed`;
    return s.lastPlate
      ? `${d.name} last read ${String(s.lastPlate).split("").join(" ")}`
      : `${d.name} is watching, no plates read yet`;
  }
  const meta = deviceMeta(d.type);
  const field = meta.toggle?.field || capabilities(d.type).power?.field;
  if (field) return `${d.name} is ${s[field] ? "on" : "off"}`;
  return `${d.name} is ${d.online ? "online" : "offline"}`;
}

export function parseCommand(text: string, devices: Device[]): VoiceResult {
  const t = norm(text);
  if (!t) return { reply: "I didn't catch that.", commands: [], matched: [] };

  const action = detectAction(t);
  const targets = resolveTargets(t, devices);

  if (!targets.length) {
    return { reply: "I couldn't find a matching device. Try naming a device, room, or type — like 'living room lights'.", commands: [], matched: [] };
  }

  if (action === "status" || action === null) {
    const lines = targets.slice(0, 6).map(statusOf);
    return { reply: lines.join(". ") + ".", commands: [], matched: targets };
  }

  const commands: { id: string; cmd: Record<string, unknown> }[] = [];
  for (const d of targets) {
    const cmd = commandFor(d, action);
    if (cmd) commands.push({ id: d.id, cmd });
  }
  if (!commands.length) {
    return { reply: `I found ${targets.length} device${targets.length === 1 ? "" : "s"}, but none support that action.`, commands: [], matched: targets };
  }
  const verb = action === "on" ? "turned on" : action === "off" ? "turned off" : action === "lock" ? "locked" : action === "unlock" ? "unlocked" : action === "open" ? "opened" : action === "close" ? "closed" : "toggled";
  const names = commands.length <= 2 ? targets.filter((d) => commands.some((c) => c.id === d.id)).map((d) => d.name).join(" and ") : `${commands.length} devices`;
  return { reply: `${verb.charAt(0).toUpperCase() + verb.slice(1)} ${names}.`, commands, matched: targets };
}

export const VOICE_EXAMPLES = [
  "Turn on the living room lights",
  "Turn off all fans",
  "Lock the front door",
  "Open the gate",
  "What's the tank level?",
  "Turn off everything",
];
