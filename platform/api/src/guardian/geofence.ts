/**
 * Safe zones — "tell me when they leave school".
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is not tracking. The wearer's position is already reported for the sake of
 * an emergency; a zone turns that into one useful sentence — "left school at
 * 15:42" — instead of a map somebody has to sit and watch. The parents of a
 * child with one of these want to know that they set off, not where they are
 * every minute.
 *
 * THE HARD PART IS NOT THE GEOMETRY
 *
 * It is the boundary. A wearer standing at the edge of a zone, or a GPS fix
 * wandering by thirty metres while they sit still, crosses in and out
 * repeatedly — and a naive implementation sends "left school" and "arrived at
 * school" every ninety seconds until somebody turns the whole feature off,
 * taking the useful alerts with it.
 *
 * Two things prevent that:
 *
 *   1. A hysteresis band. Leaving requires being further out than arriving
 *      required being in. A fix jittering across one line does not cross two.
 *   2. State. A transition is only reported when it differs from what was last
 *      reported, so a wearer who stays out does not generate an alert on every
 *      position report for the rest of the day.
 *
 * And one refusal: a position with no usable fix produces *no* transition at
 * all, rather than "left the zone". A device that goes indoors and loses GPS
 * has not gone anywhere, and telling a parent their child left school because
 * the sky went away is the fastest way to make this untrustworthy.
 */
import { haversineKm, isUsableFix } from "./nearest";

export type Zone = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** Whether to say anything when the wearer arrives, as well as when they go. */
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
};

/**
 * How much further out than the radius the wearer must be before "left" is
 * believed.
 *
 * Consumer GPS is good to roughly five to ten metres in the open and much worse
 * beside a building, which is exactly where a school gate is. Fifty metres is
 * comfortably outside that noise and still well inside "they have gone".
 */
export const ZONE_HYSTERESIS_M = 50;

export type ZonePresence = "inside" | "outside";

/** What we last told anybody about this wearer and this zone. */
export type ZoneState = Record<number, ZonePresence>;

export type ZoneTransition = {
  zone: Zone;
  kind: "entered" | "left";
  distanceM: number;
};

/**
 * Where a position sits relative to a zone, given where it was last known to be.
 *
 * The asymmetry is the point: entering requires being within the radius,
 * leaving requires being beyond the radius *plus* the band. In between, the
 * previous answer stands.
 */
export function presenceFor(
  zone: Zone,
  distanceM: number,
  previous: ZonePresence | undefined,
): ZonePresence {
  if (distanceM <= zone.radiusM) return "inside";
  if (distanceM > zone.radiusM + ZONE_HYSTERESIS_M) return "outside";
  return previous ?? "outside";
}

/**
 * Transitions worth telling somebody about.
 *
 * `state` is updated in place — it is the caller's record of what has already
 * been reported, and the whole guard against repeating an alert forever.
 *
 * Returns nothing at all when the fix is unusable. Silence is the correct
 * output for "we do not know where they are"; the alternative is announcing a
 * departure every time somebody walks into a building.
 */
export function evaluateZones(
  lat: number,
  lng: number,
  zones: Zone[],
  state: ZoneState,
): ZoneTransition[] {
  if (!isUsableFix(lat, lng)) return [];

  const out: ZoneTransition[] = [];
  for (const zone of zones) {
    if (!isUsableFix(zone.lat, zone.lng)) continue;

    const distanceM = haversineKm(lat, lng, zone.lat, zone.lng) * 1000;
    const previous = state[zone.id];
    const now = presenceFor(zone, distanceM, previous);

    if (previous === undefined) {
      /*
       * First sighting. Recorded, never announced: the wearer did not just
       * arrive anywhere, we have only just started looking. Announcing here
       * would fire "arrived at school" for every zone the moment one is
       * created, at whatever time of night that happened to be.
       */
      state[zone.id] = now;
      continue;
    }

    if (now === previous) continue;
    state[zone.id] = now;

    if (now === "outside" && zone.notifyOnExit) {
      out.push({ zone, kind: "left", distanceM });
    } else if (now === "inside" && zone.notifyOnEnter) {
      out.push({ zone, kind: "entered", distanceM });
    }
  }
  return out;
}

/** One line a person can read, for a push notification or an SMS. */
export function describeTransition(t: ZoneTransition, who: string): string {
  return t.kind === "left"
    ? `${who} left ${t.zone.name}.`
    : `${who} arrived at ${t.zone.name}.`;
}
