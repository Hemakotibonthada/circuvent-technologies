/**
 * Circuvent device-label QR payloads.
 *
 * Because every device flashes IDENTICAL firmware (no baked id/secret), the QR
 * label carries only NON-secret setup hints so onboarding can skip manual type
 * selection and point the app at the right hotspot. The real trust still comes
 * from the A+B flow (encrypted Wi-Fi handoff + TLS self-provision).
 *
 * Accepted encodings (any one):
 *   1. URI   :  circuvent://setup?type=smart-plug&ssid=Circuvent-Setup-ab12&name=Tank
 *   2. JSON  :  {"t":"smart-plug","s":"Circuvent-Setup-ab12","n":"Tank"}
 *   3. Bare  :  smart-plug            (just the device type id)
 */

export interface SetupHint {
  type?: string;
  ssid?: string;
  name?: string;
}

const TYPE_IDS = [
  "smart-plug",
  "smart-switch",
  "aquaguard",
  "home-hub",
  "energy-monitor",
  "guardian",
  "motion-sensor",
  "agri-starter",
  "smart-light",
  "smart-fan",
  "curtain",
  "smart-lock",
];

function clean(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s.slice(0, 64) : undefined;
}

/** Parse a `k=v&k=v` query string without depending on URLSearchParams (flaky in RN). */
function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of q.split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const k = i < 0 ? pair : pair.slice(0, i);
    const v = i < 0 ? "" : pair.slice(i + 1);
    try {
      out[decodeURIComponent(k).trim()] = decodeURIComponent(v.replace(/\+/g, " ")).trim();
    } catch {
      out[k.trim()] = v.trim();
    }
  }
  return out;
}

/** Parse a scanned QR string into setup hints, or null if it isn't ours. */
export function parseSetupQr(raw: string): SetupHint | null {
  if (!raw) return null;
  const text = raw.trim();

  // 1. circuvent://setup?...  (also tolerates circuvent:setup?... )
  const lower = text.toLowerCase();
  if (lower.startsWith("circuvent://setup") || lower.startsWith("circuvent:setup")) {
    const qi = text.indexOf("?");
    const params = parseQuery(qi < 0 ? "" : text.slice(qi + 1));
    const hint: SetupHint = {
      type: normalizeType(clean(params.type || params.t)),
      ssid: clean(params.ssid || params.s),
      name: clean(params.name || params.n),
    };
    return hint.type || hint.ssid ? hint : null;
  }

  // 2. JSON object
  if (text.startsWith("{")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      const hint: SetupHint = {
        type: normalizeType(clean(o.type ?? o.t)),
        ssid: clean(o.ssid ?? o.s),
        name: clean(o.name ?? o.n),
      };
      return hint.type || hint.ssid ? hint : null;
    } catch {
      return null;
    }
  }

  // 3. Bare device-type id
  const t = normalizeType(text);
  if (t) return { type: t };

  // 4. A bare "Circuvent-Setup-xxxx" SSID
  if (lower.startsWith("circuvent-setup-")) return { ssid: clean(text) };

  return null;
}

/** Map/verify a device-type id; returns undefined for unknown types. */
export function normalizeType(v?: string): string | undefined {
  if (!v) return undefined;
  const id = v.trim().toLowerCase();
  return TYPE_IDS.includes(id) ? id : undefined;
}

/** Build the canonical QR string for a device label (used to print stickers). */
export function buildSetupQr(hint: SetupHint): string {
  const parts: string[] = [];
  if (hint.type) parts.push(`type=${encodeURIComponent(hint.type)}`);
  if (hint.ssid) parts.push(`ssid=${encodeURIComponent(hint.ssid)}`);
  if (hint.name) parts.push(`name=${encodeURIComponent(hint.name)}`);
  return `circuvent://setup?${parts.join("&")}`;
}
