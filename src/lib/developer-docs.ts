/**
 * The parts of the developer documentation that are not in the OpenAPI file.
 *
 * Endpoints, scopes and the API version come from `developer-api.generated.ts`,
 * which is written from `public/openapi.json` — the description the server is
 * built against. What lives here is everything the specification has no place
 * for: what each scope means in a sentence, the error codes, the webhook
 * catalogue, and the worked examples.
 *
 * Scope *descriptions* are the one overlap, and they are checked: the parity
 * test fails if the specification requires a scope this file cannot describe,
 * so a new permission cannot ship undocumented.
 */

import { API_SERVERS } from "./developer-api.generated";

/** Where requests go. Taken from the specification rather than repeated. */
export const API_BASE = API_SERVERS[0] ?? "https://api.circuvent.com";

export interface ScopeDoc {
  scope: string;
  description: string;
}

export const SCOPE_DESCRIPTIONS: ScopeDoc[] = [
  { scope: "devices:read", description: "List devices and read their current state." },
  {
    scope: "devices:control",
    description: "Send commands to devices — switch relays, set levels, run actions.",
  },
  { scope: "devices:write", description: "Rename devices, assign rooms, and set favourites." },
  { scope: "telemetry:read", description: "Read historical telemetry and energy series." },
  { scope: "rooms:read", description: "List rooms." },
  { scope: "scenes:read", description: "List scenes and their actions." },
  { scope: "scenes:run", description: "Activate a scene." },
  { scope: "automations:read", description: "List automation rules." },
  {
    scope: "automations:write",
    description: "Create, update, enable, disable and delete automation rules.",
  },
  { scope: "events:read", description: "Read the event and activity feed." },
  {
    scope: "plates:read",
    description: "Read ANPR number-plate reads, the vehicle register and site occupancy.",
  },
  {
    scope: "plates:write",
    description: "Add, change and remove entries on the plate allow / deny / watch list.",
  },
];

export interface ErrorDoc {
  status: string;
  code: string;
  meaning: string;
}

export const ERRORS: ErrorDoc[] = [
  { status: "400", code: "invalid_body", meaning: "The request body was missing or not a JSON object." },
  {
    status: "400",
    code: "invalid_query",
    meaning: "A query parameter was malformed — usually a bad `since` timestamp.",
  },
  { status: "401", code: "key_invalid", meaning: "No key was sent, or it is not a key we issued." },
  { status: "401", code: "key_expired", meaning: "The key passed its expiry date. Create a new one." },
  { status: "401", code: "key_revoked", meaning: "The key was revoked in the console." },
  { status: "401", code: "key_blocked", meaning: "The account that owns the key is disabled." },
  {
    status: "403",
    code: "insufficient_scope",
    meaning:
      "Valid key, but it lacks the scope this endpoint needs. The response lists both required and granted.",
  },
  {
    status: "403",
    code: "origin_not_allowed",
    meaning: "Called from a browser on an origin the key does not permit.",
  },
  {
    status: "403",
    code: "device_not_owned",
    meaning:
      "An automation named a device that is not in this account — checked on the trigger as well as the actions.",
  },
  {
    status: "404",
    code: "not_found",
    meaning: "No such device, scene or endpoint — or it belongs to another account.",
  },
  { status: "429", code: "rate_limited", meaning: "More than 600 requests in a minute for this key." },
];

export interface WebhookEventDoc {
  event: string;
  when: string;
}

export const WEBHOOK_EVENTS: WebhookEventDoc[] = [
  { event: "device.state", when: "A device published new state — a relay flipped, a level changed." },
  { event: "device.telemetry", when: "A device published a telemetry sample." },
  { event: "device.online", when: "A device connected to the broker." },
  { event: "device.offline", when: "A device's last-will fired, or it disconnected." },
  {
    event: "plate.read",
    when:
      "An ANPR camera read a number plate. Carries the plate, direction, decision and visit — so a receiver never has to re-derive the pairing. Deliberately NOT also delivered as device.telemetry: an integration should not subscribe to every power reading in the fleet to find plate reads.",
  },
];

export interface CodeSample {
  id: string;
  label: string;
  lang: string;
  code: string;
}

export const SAMPLES: CodeSample[] = [
  {
    id: "curl",
    label: "cURL",
    lang: "bash",
    code: `# List your devices
curl ${API_BASE}/v1/devices \\
  -H "Authorization: Bearer $CIRCUVENT_API_KEY"

# Turn on channel 1 of a home hub
curl -X POST ${API_BASE}/v1/devices/hub-a1b2/commands \\
  -H "Authorization: Bearer $CIRCUVENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"ch": 0, "on": true}'`,
  },
  {
    id: "node",
    label: "Node.js",
    lang: "javascript",
    code: `const KEY = process.env.CIRCUVENT_API_KEY;

async function cv(path, init = {}) {
  const res = await fetch("${API_BASE}/v1" + path, {
    ...init,
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(\`\${body.code}: \${body.error}\`);
  return body;
}

// Read the fleet
const { devices } = await cv("/devices");
console.log(devices.map((d) => \`\${d.name}: \${d.online ? "online" : "offline"}\`));

// Switch a light on
await cv("/devices/light-01/commands", {
  method: "POST",
  body: JSON.stringify({ power: true }),
});`,
  },
  {
    id: "python",
    label: "Python",
    lang: "python",
    code: `import os, requests

BASE = "${API_BASE}/v1"
S = requests.Session()
S.headers["Authorization"] = f"Bearer {os.environ['CIRCUVENT_API_KEY']}"

def check(r):
    if not r.ok:
        raise RuntimeError(f"{r.json().get('code')}: {r.json().get('error')}")
    return r.json()

devices = check(S.get(f"{BASE}/devices"))["devices"]
for d in devices:
    print(d["id"], d["name"], "online" if d["online"] else "offline")

# Run a scene
check(S.post(f"{BASE}/scenes/12/activate"))`,
  },
  {
    id: "browser",
    label: "Browser",
    lang: "javascript",
    code: `// Only works with a key that has your site registered as an allowed
// origin. Read "Calling from a browser" before you ship this —
// a key in front-end code is readable by anyone who visits the page.

const KEY = "cvk_live_...";           // origin-restricted, read-only

const res = await fetch("${API_BASE}/v1/devices", {
  headers: { Authorization: \`Bearer \${KEY}\` },
});
const { devices } = await res.json();

document.querySelector("#fleet").innerHTML = devices
  .map((d) => \`<li>\${d.name} — \${d.online ? "online" : "offline"}</li>\`)
  .join("");`,
  },
];

export const WEBHOOK_VERIFY = `import crypto from "node:crypto";
import express from "express";

const app = express();

// The signature covers the RAW body. Parsing it to JSON and re-serialising
// changes the bytes (key order, whitespace) and the HMAC will not match.
app.post("/hooks/circuvent", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-Circuvent-Signature") || "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const body = req.body.toString("utf8");

  const expected = crypto
    .createHmac("sha256", process.env.CIRCUVENT_WEBHOOK_SECRET)
    .update(\`\${parts.t}.\${body}\`)
    .digest("hex");

  // timingSafeEqual, not ===. A plain comparison returns early on the first
  // differing byte, which leaks the correct prefix to anyone who can measure it.
  const ok =
    parts.v1 &&
    parts.v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));

  if (!ok) return res.status(400).send("bad signature");

  // Reject anything older than five minutes so a captured delivery cannot be
  // replayed at you later.
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) {
    return res.status(400).send("stale");
  }

  const event = JSON.parse(body);
  console.log(event.event, event.deviceId, event.data);

  // Answer 2xx quickly. We time out after 5 seconds, and 20 consecutive
  // failures disable the webhook.
  res.sendStatus(200);
});`;

/**
 * The portal's pages, in reading order.
 *
 * One list drives the sidebar, the overview cards and the previous/next
 * links, so a page cannot be added to the site and missed by the navigation.
 */
export interface DocPage {
  slug: string;
  title: string;
  blurb: string;
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    blurb: "Create a key and read a real device in three steps.",
  },
  {
    slug: "authentication",
    title: "Authentication",
    blurb: "How keys are sent, what they can reach, and what they deliberately cannot.",
  },
  {
    slug: "scopes",
    title: "Scopes",
    blurb: "Every permission a key can carry. Scopes never imply one another.",
  },
  {
    slug: "endpoints",
    title: "Endpoints",
    blurb: "The full REST surface, generated from the OpenAPI description.",
  },
  {
    slug: "commands",
    title: "Sending commands",
    blurb: "What a device accepts, and why 202 does not mean the relay closed.",
  },
  {
    slug: "browser",
    title: "Calling from a browser",
    blurb: "Origin restrictions, and what they do and do not protect.",
  },
  {
    slug: "webhooks",
    title: "Webhooks",
    blurb: "Signed deliveries pushed as devices report, and how to verify them.",
  },
  { slug: "errors", title: "Errors", blurb: "Stable codes to branch on, and what each one means." },
  {
    slug: "limits",
    title: "Rate limits & versioning",
    blurb: "600 requests a minute per key, and the compatibility promise for /v1.",
  },
];

export function docPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

/** The page before and after this one, for the footer links. */
export function docNeighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug);
  if (i < 0) return {};
  return { prev: DOC_PAGES[i - 1], next: DOC_PAGES[i + 1] };
}
