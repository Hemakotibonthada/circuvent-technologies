/**
 * Maps `/v1` payloads into the shapes the rest of this app reads.
 *
 * WHY THIS IS NEEDED AT ALL
 *
 * The control plane has two of everything, and they do not agree:
 *
 *   GET /devices      requireAuth       → last_seen, fw_version   (snake_case)
 *   GET /v1/devices   requireApiAccess  → lastSeen,  firmware     (camelCase)
 *   GET /events       requireAuth       → device_id, ts
 *   GET /v1/events    requireApiAccess  → deviceId,  at
 *
 * Everything in the web app types these as `Device` and `AppEvent` from
 * control-plane.ts, which are the snake_case shapes. So the two families are
 * not interchangeable even though they return the same envelopes over the same
 * rows.
 *
 * THE BUG THIS EXISTS FOR
 *
 * The unattended anomaly sweep called `/devices`, `/events` and `/automations`.
 * All three are `requireAuth` — a **user JWT only**. The sweep is documented to
 * authenticate with CIRCUVENT_SWEEP_TOKEN, "a control-plane developer key", and
 * a developer key cannot call any of them. The feature could never have worked:
 * configure the token exactly as instructed and every request 401s.
 *
 * Moving to `/v1` fixes the authentication and introduces a quieter problem in
 * its place. `staleness()` in ai/analysis.ts reads `d.last_seen` and returns
 * null when it is absent, and `findRecurringEvents` keys on `ts`. Handed
 * camelCase rows, the sweep would find no stale device and no recurring event
 * ever — running on schedule, reporting a clean result, and blind. Renaming
 * four fields is the entire difference between that and a working monitor,
 * which is why it lives in one tested place rather than inline in a route.
 *
 * Automations need no mapping: `/v1/automations` already returns the id, name,
 * enabled, trigger and action that `findScheduleConflicts` reads, plus a
 * `createdAt` it ignores.
 */
import type { Device, AppEvent } from "./control-plane";

/** As returned by `deviceShape()` in platform/api/src/routes/v1.ts. */
export interface V1Device {
  id: string;
  name?: string;
  type?: string;
  room?: string | null;
  favorite?: boolean;
  online?: boolean;
  lastSeen?: string | null;
  firmware?: string | null;
  state?: Record<string, unknown>;
}

/** As returned by the `/v1/events` handler. */
export interface V1Event {
  id: number;
  deviceId?: string | null;
  kind?: string;
  title?: string;
  body?: string;
  read?: boolean;
  at?: string;
}

export function fromV1Device(d: V1Device): Device {
  return {
    id: d.id,
    name: d.name ?? "",
    type: d.type ?? "generic",
    // `room` is nullable on the wire and optional here; keep it absent rather
    // than turning it into the string "null".
    ...(d.room ? { room: d.room } : {}),
    ...(typeof d.favorite === "boolean" ? { favorite: d.favorite } : {}),
    online: d.online === true,
    last_seen: d.lastSeen ?? null,
    state: d.state ?? {},
    ...(d.firmware ? { fw_version: d.firmware } : {}),
  };
}

export function fromV1Event(e: V1Event): AppEvent {
  return {
    id: e.id,
    device_id: e.deviceId ?? null,
    kind: e.kind ?? "",
    title: e.title ?? "",
    body: e.body ?? "",
    read: e.read === true,
    ts: e.at ?? "",
  };
}

/**
 * Maps a whole `{ devices: [...] }` payload, or returns null.
 *
 * Null rather than an empty array when the payload is not what was expected,
 * because the caller has to tell "no devices" from "could not tell". An empty
 * finding set resolves every open alert and reports a recovery that never
 * happened — the sweep already guards on exactly this and must keep being able
 * to.
 */
export function fromV1DeviceList(payload: unknown): Device[] | null {
  const list = listOf(payload, "devices");
  if (!list) return null;
  return list
    .filter((d): d is V1Device => isObj(d) && typeof (d as unknown as V1Device).id === "string")
    .map(fromV1Device);
}

/** Same contract as above. Events are advisory, so callers may treat null as empty. */
export function fromV1EventList(payload: unknown): AppEvent[] | null {
  const list = listOf(payload, "events");
  if (!list) return null;
  return list
    .filter((e): e is V1Event => isObj(e) && Number.isFinite(Number((e as unknown as V1Event).id)))
    .map(fromV1Event);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function listOf(payload: unknown, key: string): unknown[] | null {
  if (!isObj(payload)) return null;
  const list = (payload as Record<string, unknown>)[key];
  return Array.isArray(list) ? list : null;
}
