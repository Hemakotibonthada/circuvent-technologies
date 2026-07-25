import { NextResponse } from "next/server";
import { geocode, getWeather, getWeatherByQuery } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/weather?search=City         -> { places: GeoPlace[] }
// GET /api/weather?lat=..&lon=..&name= -> WeatherBundle
// GET /api/weather?q=City              -> WeatherBundle (first geocode match)
export async function GET(request: Request) {
  const u = new URL(request.url);
  const search = u.searchParams.get("search");
  const q = u.searchParams.get("q");
  const lat = u.searchParams.get("lat");
  const lon = u.searchParams.get("lon");
  const name = u.searchParams.get("name") || undefined;

  try {
    if (search) {
      const places = await geocode(search);
      return NextResponse.json({ ok: true, places }, { headers: { "Cache-Control": "public, max-age=300" } });
    }
    if (lat && lon) {
      const bundle = await getWeather(Number(lat), Number(lon), name);
      return NextResponse.json({ ok: true, bundle }, { headers: { "Cache-Control": "public, max-age=300" } });
    }
    if (q) {
      const bundle = await getWeatherByQuery(q);
      return NextResponse.json({ ok: true, bundle }, { headers: { "Cache-Control": "public, max-age=300" } });
    }
    return NextResponse.json({ ok: false, error: "Provide ?search=, ?q= or ?lat=&lon=" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Weather lookup failed" }, { status: 502 });
  }
}
