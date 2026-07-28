// Device Groups & Bulk Actions — purely client-side organizational layer on
// top of the existing device list (control-plane.ts). Lets a user group
// devices (e.g. "Downstairs lights") and act on the whole group at once.
// Stored in localStorage, namespaced like the console's theme/recently-viewed
// modules (`cv-console-*`) — no server changes required.

const KEY = "cv-console-groups";

export interface DeviceGroup {
  id: string;
  name: string;
  icon: string;
  deviceIds: string[];
  createdAt: string;
}

function read(): DeviceGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeviceGroup[]) : [];
  } catch {
    return [];
  }
}

function write(groups: DeviceGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(groups));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function listGroups(): DeviceGroup[] {
  return read();
}

export function createGroup(name: string, icon: string, deviceIds: string[]): DeviceGroup {
  const groups = read();
  const group: DeviceGroup = { id: `grp_${Date.now().toString(36)}`, name, icon, deviceIds, createdAt: new Date().toISOString() };
  write([group, ...groups]);
  return group;
}

export function updateGroup(id: string, patch: Partial<Pick<DeviceGroup, "name" | "icon" | "deviceIds">>): void {
  write(read().map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export function deleteGroup(id: string): void {
  write(read().filter((g) => g.id !== id));
}
