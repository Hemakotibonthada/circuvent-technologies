import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices/firmware?type=<type>&id=<id>&ver=<current>
 * Auth: x-device-id + x-device-key headers (must be present).
 *
 * Returns the latest published firmware manifest for a device type so the unit
 * can self-update (see CircuventDevice::checkOTA). Publishing is env-driven so
 * ops can roll out a build without a code change:
 *
 *   OTA_AQUAGUARD = "2.1.0|https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/aquaguard-2.1.0.bin"
 *   OTA_HOME_HUB  = "2.1.0|https://pub-d7f0dba2b9e5487092a2a1de50a12a2c.r2.dev/fw/home-hub-2.3.0.bin"
 *
 * When no newer build is configured, an empty manifest is returned and the
 * device stays on its current firmware.
 */
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

  const envKey = "OTA_" + type.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const raw = process.env[envKey] || "";
  const [version, url] = raw.split("|").map((s) => (s || "").trim());

  if (version && url && version !== current) {
    return NextResponse.json({ version, url });
  }
  // No update available.
  return NextResponse.json({ version: current, url: "" });
}
