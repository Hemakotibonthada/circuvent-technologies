import { deviceMeta } from "./theme";
import { useEffect } from "react";
import { capabilities, useDevices } from "./store";
import { type Device } from "./api";
import { API_BASE } from "./config";
import { getToken } from "./api";
import { syncSiri, clearSiri, siriAvailable, type SiriDevicePayload } from "../modules/circuvent-siri";

/**
 * Keeps Siri's cached view of the home up to date.
 *
 * The native intents answer without starting JavaScript, so everything they
 * need has to be on disk before Siri is asked. This is what puts it there.
 *
 * Which state field a device toggles is decided here rather than in Swift, so
 * the device-type tables stay in one place. Adding a device type means editing
 * `theme.ts` / `store.ts` as usual — never the intents.
 */

/**
 * How a device behaves when spoken to, which decides both the command sent and
 * the words Siri uses back.
 *
 * Classification follows what the firmware actually accepts in `onCommand`, not
 * what the device is called. Guardian and the motion sensor look like sensors
 * but both take `{action:"set", armed}`; the water tank looks like a gauge but
 * drives a pump; the energy monitor is the only one here with no `onCommand` at
 * all.
 */
function kindOf(type: string): SiriDevicePayload["kind"] {
  switch (type) {
    case "smart-lock":
    case "facedoor":
      return "lock";
    case "rfid-gate":
      return "gate";
    case "curtain":
      return "curtain";
    case "guardian":
    case "motion-sensor":
      // Armable alarms. Reporting these as "on" and "off" would be technically
      // true and actively confusing for something that guards a house.
      return "security";
    case "energy-monitor":
    case "camera":
      return "sensor";
    default:
      return "switch";
  }
}

/** The same resolution the in-app voice parser uses, so the two agree. */
function toggleFieldOf(d: Device): string {
  if (d.type === "guardian" || d.type === "motion-sensor") return "armed";
  return deviceMeta(d.type).toggle?.field || capabilities(d.type).power?.field || "";
}

function isOnOf(d: Device, kind: SiriDevicePayload["kind"], field: string): boolean {
  const s = d.state ?? {};
  // `isOn` means "in the affirmative state Siri would report", which for a lock
  // is unlocked and for a gate is open. Reporting a locked door as "on" would
  // be technically consistent and completely useless to a person.
  switch (kind) {
    case "lock":
      return !s.locked;
    case "gate":
      return String(s.barrier ?? "closed") === "open";
    case "curtain":
      return Number(s.position ?? 0) > 50;
    case "security":
      return Boolean(s.armed);
    default:
      return field ? Boolean(s[field]) : false;
  }
}

export function toSiriPayload(devices: Device[]): SiriDevicePayload[] {
  return devices.map((d) => {
    const kind = kindOf(d.type);
    const toggleField = toggleFieldOf(d);
    return {
      id: d.id,
      name: d.name || d.id,
      room: d.room ?? null,
      type: d.type,
      toggleField,
      isOn: isOnOf(d, kind, toggleField),
      kind,
    };
  });
}

/**
 * Pushes the current device list to Siri.
 *
 * Cheap enough to call whenever the list changes: it serialises and writes,
 * with no network involved.
 */
export async function pushDevicesToSiri(devices: Device[]): Promise<void> {
  if (!siriAvailable()) return;
  const token = await getToken();
  syncSiri(API_BASE, token, toSiriPayload(devices));
}

/** Called on sign-out so Siri stops offering devices nobody can control. */
export function forgetSiri(): void {
  if (!siriAvailable()) return;
  clearSiri();
}

/**
 * Mount inside DevicesProvider to keep Siri's cache current.
 *
 * A component rather than an effect inside the provider itself, because
 * store.tsx importing this file would form a cycle — this file needs
 * `capabilities` and `Device` from the store. Mounting it from App.tsx keeps
 * the dependency pointing one way.
 *
 * Watching the device list rather than instrumenting each mutation means a
 * future code path cannot forget to update Siri.
 */
export function SiriSync(): null {
  const { devices } = useDevices();

  useEffect(() => {
    void pushDevicesToSiri(devices);
  }, [devices]);

  return null;
}
