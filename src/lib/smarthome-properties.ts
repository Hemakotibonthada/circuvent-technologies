// Multi-Property Manager — a local organizational layer for users who manage
// more than one home/site. Properties group existing room names (rooms
// themselves still live on the control plane); switching the "active
// property" is used by other console pages to filter by room tag.

const KEY = "cv-console-properties";
const ACTIVE_KEY = "cv-console-active-property";

export interface Property {
  id: string;
  name: string;
  address?: string;
  roomNames: string[];
  createdAt: string;
}

export function listProperties(): Property[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Property[]) : [];
  } catch {
    return [];
  }
}

function write(properties: Property[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(properties));
  } catch {
    /* ignore */
  }
}

export function createProperty(name: string, address: string, roomNames: string[]): Property {
  const property: Property = { id: `prop_${Date.now().toString(36)}`, name, address, roomNames, createdAt: new Date().toISOString() };
  write([property, ...listProperties()]);
  return property;
}

export function updateProperty(id: string, patch: Partial<Pick<Property, "name" | "address" | "roomNames">>): void {
  write(listProperties().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function deleteProperty(id: string): void {
  write(listProperties().filter((p) => p.id !== id));
}

export function getActivePropertyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setActivePropertyId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}
