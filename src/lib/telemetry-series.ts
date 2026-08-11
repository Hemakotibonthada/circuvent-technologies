// Turning a device's raw telemetry into chartable series.
//
// The device page listed readings as a wall of JSON — one `{"watts":41.8,
// "power":true}` per line, newest first. Everything needed to see a trend was
// on screen and none of it was legible: whether a plug's load is climbing, or a
// tank draining, is a shape, and a shape is the one thing a list of numbers
// cannot show.
//
// Deliberately one series per field rather than all of them on a single axis.
// A plug reports watts in the hundreds and a tank reports a percentage; drawn
// together the percentage is a flat line along the bottom and the chart implies
// nothing ever changes. Separate charts keep each field's own scale.

export interface TelemetryRecord {
  at: string;
  data: Record<string, unknown>;
}

export interface TelemetryPoint {
  t: number;
  v: number;
}

export interface TelemetrySeries {
  field: string;
  label: string;
  unit: string;
  points: TelemetryPoint[];
}

/** Fields worth a chart, with how to present them. Anything else is skipped. */
const KNOWN: Record<string, { label: string; unit: string }> = {
  watts: { label: "Power", unit: "W" },
  volts: { label: "Voltage", unit: "V" },
  amps: { label: "Current", unit: "A" },
  kwh: { label: "Energy", unit: "kWh" },
  level: { label: "Level", unit: "%" },
  brightness: { label: "Brightness", unit: "%" },
  battery: { label: "Battery", unit: "%" },
  temp: { label: "Temperature", unit: "°C" },
  humidity: { label: "Humidity", unit: "%" },
  rssi: { label: "Signal", unit: "dBm" },
  speed: { label: "Speed", unit: "" },
  target: { label: "Target", unit: "°C" },
  gas: { label: "Gas", unit: "" },
  pressure: { label: "Pressure", unit: "hPa" },
};

function labelFor(field: string): { label: string; unit: string } {
  return KNOWN[field] ?? { label: field, unit: "" };
}

/**
 * Numeric series from a device's telemetry, newest-last.
 *
 * Booleans are excluded even though JavaScript would happily plot them as 0/1:
 * a relay's on/off is a state, and drawing it as a continuous line between
 * samples asserts it was half-on in between, which never happened.
 *
 * A field carried by only one reading is dropped — a single point is not a
 * trend, and a chart with one dot invites a conclusion there is no evidence
 * for.
 */
export function telemetrySeries(records: TelemetryRecord[], opts: { minPoints?: number } = {}): TelemetrySeries[] {
  const minPoints = opts.minPoints ?? 2;
  if (!Array.isArray(records) || records.length === 0) return [];

  const byField = new Map<string, TelemetryPoint[]>();

  for (const rec of records) {
    if (!rec || typeof rec !== "object" || !rec.data || typeof rec.data !== "object") continue;
    const t = Date.parse(rec.at);
    // A reading whose timestamp will not parse cannot be placed on a time axis;
    // including it at NaN silently corrupts the whole series.
    if (!Number.isFinite(t)) continue;

    for (const [field, raw] of Object.entries(rec.data)) {
      // typeof NaN and Infinity are both "number"; neither can be drawn.
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      const list = byField.get(field) ?? [];
      list.push({ t, v: raw });
      byField.set(field, list);
    }
  }

  const out: TelemetrySeries[] = [];
  for (const [field, points] of byField) {
    if (points.length < minPoints) continue;
    // The transport does not promise an order, and a line drawn through
    // unsorted points doubles back on itself.
    points.sort((a, b) => a.t - b.t);
    const { label, unit } = labelFor(field);
    out.push({ field, label, unit, points });
  }

  // Known fields first and in the order declared above, so the reading that
  // matters for a device type leads rather than appearing wherever the JSON
  // key happened to fall.
  const rank = Object.keys(KNOWN);
  out.sort((a, b) => {
    const ia = rank.indexOf(a.field);
    const ib = rank.indexOf(b.field);
    if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.field.localeCompare(b.field);
  });

  return out;
}

/** True when a series never changes — worth saying so rather than drawing a flat line. */
export function isFlat(series: TelemetrySeries): boolean {
  if (series.points.length < 2) return true;
  const first = series.points[0].v;
  return series.points.every((p) => p.v === first);
}
