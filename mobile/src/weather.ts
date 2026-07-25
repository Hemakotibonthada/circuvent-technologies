// Circuvent mobile weather client — Open-Meteo (no API key). Mirrors the web
// service shapes so the two stay consistent. Persists the chosen location.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface GeoPlace { id: number; name: string; country?: string; admin1?: string; latitude: number; longitude: number; timezone?: string }
export interface CurrentWeather { time: string; temperature: number; apparent: number; humidity: number; isDay: boolean; precipitation: number; weatherCode: number; windSpeed: number; windDir: number; pressure: number | null; cloudCover: number | null }
export interface HourPoint { time: string; temperature: number; precipitationProb: number; weatherCode: number }
export interface DayPoint { date: string; weatherCode: number; tMax: number; tMin: number; sunrise: string; sunset: string; precipProbMax: number; uvIndexMax: number; windMax: number }
export interface AirQuality { usAqi: number | null; pm2_5: number | null; pm10: number | null; ozone: number | null; no2: number | null }
export interface WeatherBundle {
  place: { name: string; country?: string; admin1?: string; latitude: number; longitude: number; timezone: string };
  current: CurrentWeather; hourly: HourPoint[]; daily: DayPoint[]; air: AirQuality | null;
  units: { temp: string; wind: string }; fetchedAt: string;
}

export function wmo(code: number): { label: string; icon: string; group: string } {
  const m: Record<number, [string, string, string]> = {
    0: ["Clear sky", "☀️", "clear"], 1: ["Mainly clear", "🌤️", "clear"], 2: ["Partly cloudy", "⛅", "cloud"], 3: ["Overcast", "☁️", "cloud"],
    45: ["Fog", "🌫️", "fog"], 48: ["Rime fog", "🌫️", "fog"], 51: ["Light drizzle", "🌦️", "rain"], 53: ["Drizzle", "🌦️", "rain"], 55: ["Heavy drizzle", "🌧️", "rain"],
    56: ["Freezing drizzle", "🌧️", "rain"], 57: ["Freezing drizzle", "🌧️", "rain"], 61: ["Light rain", "🌦️", "rain"], 63: ["Rain", "🌧️", "rain"], 65: ["Heavy rain", "🌧️", "rain"],
    66: ["Freezing rain", "🌧️", "rain"], 67: ["Freezing rain", "🌧️", "rain"], 71: ["Light snow", "🌨️", "snow"], 73: ["Snow", "🌨️", "snow"], 75: ["Heavy snow", "❄️", "snow"],
    77: ["Snow grains", "🌨️", "snow"], 80: ["Light showers", "🌦️", "rain"], 81: ["Showers", "🌧️", "rain"], 82: ["Violent showers", "⛈️", "rain"], 85: ["Snow showers", "🌨️", "snow"],
    86: ["Snow showers", "❄️", "snow"], 95: ["Thunderstorm", "⛈️", "storm"], 96: ["Thunderstorm, hail", "⛈️", "storm"], 99: ["Thunderstorm, hail", "⛈️", "storm"],
  };
  const e = m[code] ?? ["Unknown", "🌡️", "cloud"];
  return { label: e[0], icon: e[1], group: e[2] };
}

export function aqiCategory(aqi: number | null | undefined): { label: string; color: string } {
  if (aqi == null) return { label: "—", color: "#94a3b8" };
  if (aqi <= 50) return { label: "Good", color: "#22c55e" };
  if (aqi <= 100) return { label: "Moderate", color: "#eab308" };
  if (aqi <= 150) return { label: "Unhealthy (sensitive)", color: "#f59e0b" };
  if (aqi <= 200) return { label: "Unhealthy", color: "#ef4444" };
  if (aqi <= 300) return { label: "Very unhealthy", color: "#a855f7" };
  return { label: "Hazardous", color: "#7f1d1d" };
}

export type WeatherAction = "close-curtains" | "turn-on-ac" | "turn-off-ac" | "turn-on-fan" | "hydrate" | "umbrella";
export interface WeatherTip { id: string; icon: string; title: string; body: string; action?: WeatherAction }
export function weatherTips(b: WeatherBundle): WeatherTip[] {
  const tips: WeatherTip[] = [];
  const today = b.daily[0];
  const rainSoon = b.hourly.slice(0, 6).some((h) => h.precipitationProb >= 60);
  if (rainSoon || (today && today.precipProbMax >= 60)) {
    tips.push({ id: "rain", icon: "🌧️", title: "Rain likely", body: "Close curtains/blinds and bring the laundry in.", action: "close-curtains" });
    tips.push({ id: "umbrella", icon: "☂️", title: "Carry an umbrella", body: `${Math.round(today?.precipProbMax ?? 0)}% chance of rain today.`, action: "umbrella" });
  }
  if (b.current.apparent >= 33 || (today && today.tMax >= 35)) {
    tips.push({ id: "hot", icon: "🥵", title: "Hot day ahead", body: `Feels like ${Math.round(b.current.apparent)}°C — pre-cool with the AC.`, action: "turn-on-ac" });
    tips.push({ id: "fan", icon: "🌀", title: "Run the fan", body: "Circulate air to stay comfortable.", action: "turn-on-fan" });
  }
  if (b.current.apparent <= 12) tips.push({ id: "cold", icon: "🧊", title: "Cold conditions", body: `Feels like ${Math.round(b.current.apparent)}°C — turn off cooling.`, action: "turn-off-ac" });
  if ((today?.uvIndexMax ?? 0) >= 8) tips.push({ id: "uv", icon: "🧴", title: "Very high UV", body: `UV up to ${Math.round(today.uvIndexMax)} — close blinds at peak sun.`, action: "close-curtains" });
  if ((b.air?.usAqi ?? 0) > 100) tips.push({ id: "aqi", icon: "😷", title: "Poor air quality", body: `AQI ${Math.round(b.air!.usAqi!)} — keep windows shut, run purifier.` });
  if (!tips.length) tips.push({ id: "clear", icon: "✅", title: "All clear", body: "Pleasant conditions — a good time to ventilate the home." });
  return tips;
}

async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function geocode(q: string, count = 6): Promise<GeoPlace[]> {
  const query = q.trim();
  if (!query) return [];
  const d = await fetchJson<{ results?: Array<Record<string, unknown>> }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}&language=en&format=json`
  );
  return (d.results ?? []).map((r) => ({
    id: Number(r.id), name: String(r.name), country: r.country ? String(r.country) : undefined,
    admin1: r.admin1 ? String(r.admin1) : undefined, latitude: Number(r.latitude), longitude: Number(r.longitude),
    timezone: r.timezone ? String(r.timezone) : undefined,
  }));
}

export async function getWeather(lat: number, lon: number, placeName?: string): Promise<WeatherBundle> {
  const fUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max,wind_speed_10m_max` +
    `&timezone=auto&forecast_days=7&wind_speed_unit=kmh`;
  const aUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`;

  type Forecast = {
    timezone: string; current: Record<string, number>;
    hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
    daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[]; precipitation_probability_max: number[]; uv_index_max: number[]; wind_speed_10m_max: number[] };
  };
  type Air = { current?: Record<string, number> };
  const [f, a] = await Promise.all([fetchJson<Forecast>(fUrl), fetchJson<Air>(aUrl).catch(() => ({ current: undefined }) as Air)]);

  const now = Date.now();
  let nowIdx = 0, bestD = Infinity;
  f.hourly.time.forEach((t, i) => { const d = Math.abs(new Date(t).getTime() - now); if (d < bestD) { bestD = d; nowIdx = i; } });
  const hourly: HourPoint[] = f.hourly.time.slice(nowIdx, nowIdx + 24).map((t, i) => ({
    time: t, temperature: f.hourly.temperature_2m[nowIdx + i], precipitationProb: f.hourly.precipitation_probability?.[nowIdx + i] ?? 0, weatherCode: f.hourly.weather_code[nowIdx + i],
  }));
  const daily: DayPoint[] = f.daily.time.map((date, i) => ({
    date, weatherCode: f.daily.weather_code[i], tMax: f.daily.temperature_2m_max[i], tMin: f.daily.temperature_2m_min[i],
    sunrise: f.daily.sunrise[i], sunset: f.daily.sunset[i], precipProbMax: f.daily.precipitation_probability_max?.[i] ?? 0,
    uvIndexMax: f.daily.uv_index_max?.[i] ?? 0, windMax: f.daily.wind_speed_10m_max?.[i] ?? 0,
  }));
  const c = f.current;
  return {
    place: { name: placeName || "Current location", latitude: lat, longitude: lon, timezone: f.timezone },
    current: {
      time: String((c as unknown as { time?: string }).time ?? new Date().toISOString()),
      temperature: c.temperature_2m, apparent: c.apparent_temperature, humidity: c.relative_humidity_2m, isDay: !!c.is_day,
      precipitation: c.precipitation, weatherCode: c.weather_code, windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m,
      pressure: c.pressure_msl ?? null, cloudCover: c.cloud_cover ?? null,
    },
    hourly, daily,
    air: a.current ? { usAqi: a.current.us_aqi ?? null, pm2_5: a.current.pm2_5 ?? null, pm10: a.current.pm10 ?? null, ozone: a.current.ozone ?? null, no2: a.current.nitrogen_dioxide ?? null } : null,
    units: { temp: "°C", wind: "km/h" }, fetchedAt: new Date().toISOString(),
  };
}

export async function getWeatherByQuery(q: string): Promise<WeatherBundle> {
  const [p] = await geocode(q, 1);
  if (!p) throw new Error("No matching location");
  return getWeather(p.latitude, p.longitude, [p.name, p.admin1, p.country].filter(Boolean).join(", "));
}

const SAVED_KEY = "cv-weather-loc";
export interface SavedLoc { lat: number; lon: number; name: string }
export async function getSavedLocation(): Promise<SavedLoc | null> {
  try { const s = await AsyncStorage.getItem(SAVED_KEY); return s ? (JSON.parse(s) as SavedLoc) : null; } catch { return null; }
}
export async function setSavedLocation(loc: SavedLoc): Promise<void> {
  try { await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(loc)); } catch { /* ignore */ }
}
