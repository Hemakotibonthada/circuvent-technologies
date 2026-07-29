import type { Device } from "../../../api";

export type EnvCapability =
  | "tank"
  | "air"
  | "climate"
  | "occupancy"
  | "pump"
  | "purifier"
  | "hvac";

export interface ReportedField {
  field: string;
  label: string;
  unit?: string;
  value: number | boolean | string;
  numeric?: number;
  source: "state" | "telemetry";
}

export interface DeviceFields {
  device: Device;
  telemetryFields: string[];
  level?: ReportedField;
  temperature?: ReportedField;
  humidity?: ReportedField;
  aqi?: ReportedField;
  pollutants: ReportedField[];
  occupancy?: ReportedField;
  motion?: ReportedField;
  pump?: ReportedField;
  dryRun?: ReportedField;
  purifier?: ReportedField;
  fan?: ReportedField;
  setpoint?: ReportedField;
  mode?: ReportedField;
  fanSpeed?: ReportedField;
  capabilities: EnvCapability[];
}

type Alias = { label: string; unit?: string; keys: string[] };

const ALIASES = {
  level: { label: "Tank level", unit: "%", keys: ["level", "percent", "percentage", "tank_level", "tankLevel", "water_level", "waterLevel", "fill", "fill_pct"] },
  temperature: { label: "Temperature", unit: "°C", keys: ["temperature", "temp", "tempC", "temperature_c", "ambient_temp", "room_temp", "currentTemperature"] },
  humidity: { label: "Humidity", unit: "%", keys: ["humidity", "rh", "relative_humidity", "humid", "room_humidity"] },
  aqi: { label: "AQI", keys: ["aqi", "air_quality_index", "airQualityIndex"] },
  pm25: { label: "PM2.5", unit: "µg/m³", keys: ["pm25", "pm2_5", "pm2.5", "pm_2_5", "particulate25"] },
  pm10: { label: "PM10", unit: "µg/m³", keys: ["pm10", "pm_10", "particulate10"] },
  co2: { label: "CO₂", unit: "ppm", keys: ["co2", "co₂", "carbon_dioxide", "eco2", "eCO2"] },
  voc: { label: "VOC", unit: "ppb", keys: ["voc", "tvoc", "volatileOrganicCompounds"] },
  occupancy: { label: "Occupancy", keys: ["occupancy", "occupied", "presence", "people_present"] },
  motion: { label: "Motion", keys: ["motion", "pir", "motion_detected", "movement"] },
  pump: { label: "Pump", keys: ["pump", "motor", "relay", "pump_on", "motor_on", "relay1"] },
  dryRun: { label: "Dry-run protection", keys: ["dry_run", "dryRun", "dry_run_protection", "dryRunProtection", "dry_run_ok", "pump_protection"] },
  purifier: { label: "Purifier", keys: ["purifier", "purifier_on", "air_purifier", "filter", "ionizer"] },
  fan: { label: "Fan", keys: ["fan", "fan_on", "fanPower", "blower"] },
  setpoint: { label: "Setpoint", unit: "°C", keys: ["setpoint", "target_temp", "targetTemperature", "target_temperature", "desired_temp", "thermostat_setpoint"] },
  mode: { label: "Mode", keys: ["mode", "hvac_mode", "climate_mode", "operation_mode"] },
  fanSpeed: { label: "Fan speed", keys: ["fan_speed", "fanSpeed", "speed", "blower_speed"] },
} satisfies Record<string, Alias>;

const AIR_KEYS = ["aqi", "pm25", "pm10", "co2", "voc"] as const;

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function boolish(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (["true", "on", "1", "yes", "active", "detected", "occupied"].includes(s)) return true;
    if (["false", "off", "0", "no", "idle", "clear", "vacant"].includes(s)) return false;
  }
  return undefined;
}

function find(device: Device, telemetry: string[], alias: Alias): ReportedField | undefined {
  const state = device.state ?? {};
  for (const key of alias.keys) {
    if (Object.prototype.hasOwnProperty.call(state, key)) {
      const value = state[key];
      return { field: key, label: alias.label, unit: alias.unit, value, numeric: num(value), source: "state" };
    }
  }
  const lower = new Map(telemetry.map((f) => [f.toLowerCase(), f]));
  for (const key of alias.keys) {
    const field = lower.get(key.toLowerCase());
    if (field) return { field, label: alias.label, unit: alias.unit, value: "reported in telemetry", source: "telemetry" };
  }
  return undefined;
}

export function readField(device: Device, aliases: string[], telemetry: string[] = []): ReportedField | undefined {
  return find(device, telemetry, { label: aliases[0] ?? "Field", keys: aliases });
}

export function asNumber(field?: ReportedField): number | undefined {
  return field?.numeric;
}

export function asBoolean(field?: ReportedField): boolean | undefined {
  return field ? boolish(field.value) : undefined;
}

export function fieldText(field?: ReportedField, digits = 0): string {
  if (!field) return "not reported";
  if (field.numeric != null) return `${field.numeric.toLocaleString(undefined, { maximumFractionDigits: digits })}${field.unit ? ` ${field.unit}` : ""}`;
  if (typeof field.value === "boolean") return field.value ? "on" : "off";
  return String(field.value);
}

export function commandForToggle(field: ReportedField, next: boolean): Record<string, unknown> {
  return { [field.field]: next, field: field.field, value: next, action: next ? "on" : "off" };
}

export function environmentalFields(device: Device, telemetryFields: string[] = []): DeviceFields {
  const level = find(device, telemetryFields, ALIASES.level);
  const temperature = find(device, telemetryFields, ALIASES.temperature);
  const humidity = find(device, telemetryFields, ALIASES.humidity);
  const pollutants = AIR_KEYS.map((k) => find(device, telemetryFields, ALIASES[k])).filter(Boolean) as ReportedField[];
  const aqi = pollutants.find((p) => p.label === "AQI");
  const occupancy = find(device, telemetryFields, ALIASES.occupancy);
  const motion = find(device, telemetryFields, ALIASES.motion);
  const pump = find(device, telemetryFields, ALIASES.pump);
  const dryRun = find(device, telemetryFields, ALIASES.dryRun);
  const purifier = find(device, telemetryFields, ALIASES.purifier);
  const fan = find(device, telemetryFields, ALIASES.fan);
  const setpoint = find(device, telemetryFields, ALIASES.setpoint);
  const mode = find(device, telemetryFields, ALIASES.mode);
  const fanSpeed = find(device, telemetryFields, ALIASES.fanSpeed);
  const capabilities: EnvCapability[] = [];
  if (level || device.type === "watertank") capabilities.push("tank");
  if (pollutants.length || device.type === "aquaguard") capabilities.push("air");
  if (temperature || humidity || setpoint || mode || device.type === "sensors") capabilities.push("climate");
  if (occupancy || motion || device.type === "guardian") capabilities.push("occupancy");
  if (pump) capabilities.push("pump");
  if (purifier || fan) capabilities.push("purifier");
  if (setpoint || mode || fanSpeed) capabilities.push("hvac");
  return { device, telemetryFields, level, temperature, humidity, aqi, pollutants, occupancy, motion, pump, dryRun, purifier, fan, setpoint, mode, fanSpeed, capabilities };
}

export function hasCapability(fields: DeviceFields, cap: EnvCapability): boolean {
  return fields.capabilities.includes(cap);
}

export function isActive(field?: ReportedField): boolean | undefined {
  return asBoolean(field);
}
