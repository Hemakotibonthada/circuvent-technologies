/**
 * Choosing which police station to send an emergency to.
 *
 * WHY THE DEVICE CANNOT DO THIS
 *
 * The Guardian has a GPS receiver and a GSM modem and nothing else — no map,
 * no directory, and frequently no data connection. It can tell you where it is
 * and it can text a number, but it cannot work out which number. So the
 * platform resolves the nearest station from the position the device reports
 * and pushes the *number* down, where it is cached in NVS. That cache is what
 * makes an SMS-only alarm — no Wi-Fi, no data, no phone — still reach the
 * right station rather than a national switchboard.
 *
 * WHAT "NEAREST" HAS TO MEAN
 *
 * Straight-line distance, deliberately. Road distance would be better and is
 * not available offline, but the difference matters much less than it looks:
 * this decides which station is *told*, and a station five minutes further
 * away by road is still the right one to tell. What must not happen is
 * choosing a station across a border or an ocean because it happened to be
 * numerically closest, which is what an unconstrained nearest-neighbour search
 * does to anybody near a coast or a frontier.
 *
 * These functions are pure and take the candidate list, so the awkward cases —
 * no fix, no stations, a station with no phone, the antimeridian — can be
 * tested rather than hoped about.
 */

export type Station = {
  id: number;
  name: string;
  phone: string;
  country: string;
  district: string;
  lat: number;
  lng: number;
};

export type NearestResult = {
  station: Station;
  km: number;
};

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the equirectangular approximation: the approximation
 * is faster and wrong by a growing margin away from the equator, and this is
 * used to decide which of two nearby stations gets an emergency. It is not a
 * hot path — a handful of rows, once per incident.
 */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Whether a coordinate pair is a position at all.
 *
 * 0,0 is rejected on purpose. It is a real place — in the Gulf of Guinea — so
 * it passes every range check, and it is what an uninitialised GPS variable
 * looks like. Treating it as a fix means routing an emergency to whichever
 * station is nearest to a point in the Atlantic, with complete confidence.
 * The firmware refuses to send it; this refuses to believe it.
 */
export function isUsableFix(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/**
 * How far away a station may be and still be the one we call.
 *
 * Beyond this the answer is "we do not know a station near this person", which
 * is worth saying out loud: the device falls back to the national emergency
 * number, which will at least reach somebody who can route it. Silently
 * texting a station 400km away would look like the system had worked.
 */
export const MAX_STATION_KM = 60;

export type NearestOptions = {
  /** Only consider stations in this country. Empty means do not filter. */
  country?: string;
  /** Only consider stations we could actually contact. */
  requirePhone?: boolean;
  maxKm?: number;
};

/**
 * The nearest usable station, or null when there is not one.
 *
 * Null is a real answer and callers must handle it — no fix, an empty
 * directory, or nothing within range. Returning a far-away station instead
 * would be worse than returning nothing, because nothing is what makes the
 * caller fall back to the national number.
 */
export function nearestStation(
  lat: number,
  lng: number,
  stations: Station[],
  opts: NearestOptions = {},
): NearestResult | null {
  if (!isUsableFix(lat, lng)) return null;

  const maxKm = opts.maxKm ?? MAX_STATION_KM;
  const country = (opts.country ?? "").trim().toUpperCase();

  let best: NearestResult | null = null;
  for (const s of stations) {
    if (opts.requirePhone && !s.phone.trim()) continue;
    if (country && s.country.trim().toUpperCase() !== country) continue;
    if (!isUsableFix(s.lat, s.lng)) continue;

    const km = haversineKm(lat, lng, s.lat, s.lng);
    if (km > maxKm) continue;
    if (!best || km < best.km) best = { station: s, km };
  }
  return best;
}

/**
 * The number the device should be told to use, given what we resolved.
 *
 * The station's number when we have one; otherwise the wearer's configured
 * national emergency number; otherwise nothing, and the caller must not
 * pretend the device is ready.
 */
export function stationNumberFor(
  nearest: NearestResult | null,
  nationalFallback: string,
): { number: string; reason: "station" | "national" | "none" } {
  const stationPhone = nearest?.station.phone.trim() ?? "";
  if (stationPhone) return { number: stationPhone, reason: "station" };
  const national = (nationalFallback ?? "").trim();
  if (national) return { number: national, reason: "national" };
  return { number: "", reason: "none" };
}

/**
 * Whether a newly resolved station is worth pushing to the device.
 *
 * The wearer moves continuously and the device is on a mobile data plan it
 * pays for by the byte. Re-sending the same number every time a position
 * arrives would be a command every few seconds for no change at all — and each
 * one writes NVS, which has a finite number of erase cycles.
 *
 * So: push when the number actually differs. Distance alone is not the test,
 * because two adjacent stations often share a control-room number.
 */
export function shouldPushStation(current: string, resolved: string): boolean {
  const a = (current ?? "").trim();
  const b = (resolved ?? "").trim();
  if (!b) return false;
  return a !== b;
}
