// Geofencing & Presence — location-based zones that trigger scenes when the
// browser (via the Geolocation API) crosses a zone boundary. Zones are
// stored locally; crossing a boundary calls the existing scenes API
// (controlPlane.activateScene) — no new server storage needed.

const KEY = "cv-console-geozones";

export interface GeoZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  sceneOnArriveId?: number;
  sceneOnLeaveId?: number;
  lastState?: "in" | "out";
}

function read(): GeoZone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GeoZone[]) : [];
  } catch {
    return [];
  }
}

function write(zones: GeoZone[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(zones));
  } catch {
    /* ignore */
  }
}

export function listZones(): GeoZone[] {
  return read();
}

export function createZone(input: Omit<GeoZone, "id" | "lastState">): GeoZone {
  const zone: GeoZone = { ...input, id: `geo_${Date.now().toString(36)}` };
  write([zone, ...read()]);
  return zone;
}

export function updateZone(id: string, patch: Partial<GeoZone>): void {
  write(read().map((z) => (z.id === id ? { ...z, ...patch } : z)));
}

export function deleteZone(id: string): void {
  write(read().filter((z) => z.id !== id));
}

/** Great-circle distance in meters between two lat/lng points (Haversine formula). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
