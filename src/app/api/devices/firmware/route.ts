import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices/firmware?type=<type>&id=<id>&ver=<current>
 * Auth: x-device-id + x-device-key headers (must be present).
 *
 * The manifest a device polls to find out whether there is a newer build for
 * it (see `CircuventDevice::checkOTA`). Answered from two sources, in order:
 *
 *   1. `OTA_<TYPE>` in the environment — an explicit operator decision. Pins a
 *      type to a version, or rolls one back, without touching the bucket.
 *   2. `fw/manifest.json` in the public firmware bucket, written by
 *      `scripts/publish-firmware.cjs`.
 *
 * WHY THE MANIFEST, AND NOT ENV ALONE
 *
 * Env was the only source, and it made a release two hand-copied strings that
 * had to agree: the version in `OTA_HOME_HUB` and the version compiled into
 * the `.bin` whose filename the same variable names. Nothing checked them.
 * Get it wrong one way and devices download a build reporting a different
 * version, so they offer themselves the same update on every poll forever.
 * Get it wrong the other way and the rollout silently does not happen — which
 * the home-hub changelog records happening across the entire fleet once
 * already.
 *
 * The publish script reads the version out of `CV_FW_VERSION` in the source
 * and writes it into the manifest beside the object it just uploaded, so the
 * filename, the manifest and the version a device reports after flashing are
 * one fact from one place. Publishing becomes a single action with nothing to
 * remember.
 *
 * Env still wins where it is set, because "roll this type back right now" has
 * to be possible without a rebuild.
 */

interface ManifestEntry {
  version: string;
  url: string;
  sha256?: string;
  bytes?: number;
}

const MANIFEST_URL =
  process.env.FIRMWARE_MANIFEST_URL ||
  "https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/manifest.json";

/**
 * Cached across requests in this instance.
 *
 * A fleet checks in on its own six-hourly timer, so without this every device
 * poll is an outbound fetch. Five minutes is short enough that a release goes
 * live almost immediately and long enough that a herd of devices costs one
 * request; it matches the `max-age` the publish script sets on the object.
 */
let cache: { at: number; builds: Record<string, ManifestEntry> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function manifest(): Promise<Record<string, ManifestEntry>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.builds;
  try {
    const res = await fetch(MANIFEST_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { builds?: Record<string, ManifestEntry> };
    cache = { at: Date.now(), builds: body.builds ?? {} };
  } catch {
    /*
     * A manifest that cannot be fetched must not be mistaken for "no update".
     *
     * The answer is the same either way — a device stays where it is rather
     * than acting on a guess — but the previous cache is returned without
     * refreshing its timestamp, so the next request retries instead of serving
     * an empty list for five minutes because one fetch timed out.
     */
    return cache?.builds ?? {};
  }
  return cache.builds;
}

export async function GET(request: Request) {
  const id = request.headers.get("x-device-id") || "";
  const key = request.headers.get("x-device-key") || "";
  if (!id || !key) {
    return NextResponse.json({ error: "Missing device credentials" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get("type") || "").trim();
  const current = (searchParams.get("ver") || "").trim();
  if (!type) return NextResponse.json({ version: current, url: "" });

  // 1. The operator's explicit decision.
  const envKey = "OTA_" + type.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const raw = process.env[envKey] || "";
  let [version, url] = raw.split("|").map((s) => (s || "").trim());

  // 2. What was actually published.
  if (!version || !url) {
    const entry = (await manifest())[type];
    if (entry?.version && entry?.url) {
      version = entry.version;
      url = entry.url;
    }
  }

  /*
   * Different, not newer.
   *
   * Deliberate: it is what makes a rollback work. Pinning an older version in
   * env, or republishing an older manifest, has to be able to move the fleet
   * *down* — and a "newer only" comparison would quietly refuse at the moment
   * somebody most needs it. Versions are compared as opaque strings for the
   * same reason, and `checkOTA` on the device does the same.
   */
  if (version && url && version !== current) {
    return NextResponse.json({ version, url });
  }
  return NextResponse.json({ version: current, url: "" });
}

/** Test seam: drops the cached manifest so a suite can vary it. */
export function __resetFirmwareCacheForTests(): void {
  cache = null;
}
