// Client-side weather automations: rules that fire scenes/devices based on the
// live forecast. Persisted locally; evaluated against a WeatherBundle.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WeatherBundle } from "./weather";

export type RuleMetric = "temp" | "feels" | "rainChance" | "uv" | "aqi";
export type RuleOp = ">" | "<";
export type RuleTarget = "ac" | "fan" | "curtain";
export type RuleAction =
  | { kind: "scene"; sceneId: number; sceneName?: string }
  | { kind: "devices"; target: RuleTarget; on: boolean; label: string };

export interface WeatherRule {
  id: string;
  name: string;
  enabled: boolean;
  metric: RuleMetric;
  op: RuleOp;
  value: number;
  action: RuleAction;
}

const KEY = "cv-weather-rules";
export async function getRules(): Promise<WeatherRule[]> {
  try { const s = await AsyncStorage.getItem(KEY); return s ? (JSON.parse(s) as WeatherRule[]) : []; } catch { return []; }
}
export async function saveRules(rules: WeatherRule[]): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(rules)); } catch { /* ignore */ }
}

export const METRIC_LABEL: Record<RuleMetric, string> = { temp: "Temperature", feels: "Feels-like", rainChance: "Rain chance", uv: "UV index", aqi: "Air quality (AQI)" };
export const METRIC_UNIT: Record<RuleMetric, string> = { temp: "°C", feels: "°C", rainChance: "%", uv: "", aqi: "" };
export const METRIC_STEP: Record<RuleMetric, number> = { temp: 1, feels: 1, rainChance: 10, uv: 1, aqi: 10 };

export function metricValue(b: WeatherBundle, m: RuleMetric): number {
  switch (m) {
    case "temp": return b.current.temperature;
    case "feels": return b.current.apparent;
    case "rainChance": return Math.max(b.daily[0]?.precipProbMax ?? 0, ...b.hourly.slice(0, 6).map((h) => h.precipitationProb));
    case "uv": return b.daily[0]?.uvIndexMax ?? 0;
    case "aqi": return b.air?.usAqi ?? 0;
  }
}
export function ruleMatches(b: WeatherBundle, r: WeatherRule): boolean {
  const v = metricValue(b, r.metric);
  return r.op === ">" ? v > r.value : v < r.value;
}
export function ruleSummary(r: WeatherRule): string {
  return `When ${METRIC_LABEL[r.metric]} ${r.op} ${r.value}${METRIC_UNIT[r.metric]}`;
}
export function actionLabel(a: RuleAction): string {
  return a.kind === "scene" ? `Run scene “${a.sceneName ?? a.sceneId}”` : a.label;
}

/** Maps a device-target action to the device types + command it should send. */
export function targetCommand(a: Extract<RuleAction, { kind: "devices" }>): { types: string[]; command: Record<string, unknown> } {
  if (a.target === "ac") return { types: ["thermostat", "ac"], command: { action: "set", power: a.on } };
  if (a.target === "fan") return { types: ["smart-fan", "fan", "ceiling-fan"], command: { action: "set", power: a.on } };
  return { types: ["curtain"], command: { action: "set", position: a.on ? 100 : 0 } };
}
