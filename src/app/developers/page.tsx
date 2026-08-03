"use client";

/**
 * Public developer documentation.
 *
 * Everything on this page is derived from the code that actually serves the
 * requests — the scope list, the endpoint table, the error codes and the
 * signature recipe all match platform/api/src. Where a guarantee is weaker
 * than a developer might assume (the browser origin allowlist in particular),
 * this says so rather than letting the omission imply otherwise.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Terminal, KeyRound, Webhook, ShieldAlert, Braces } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";

const API_BASE = "https://api.circuvent.com";

/* ------------------------------------------------------------------ */
/* Data — kept in sync with platform/api/src                           */
/* ------------------------------------------------------------------ */

const SCOPES: { scope: string; description: string }[] = [
  { scope: "devices:read", description: "List devices and read their current state." },
  { scope: "devices:control", description: "Send commands to devices — switch relays, set levels, run actions." },
  { scope: "devices:write", description: "Rename devices, assign rooms, and set favourites." },
  { scope: "telemetry:read", description: "Read historical telemetry and energy series." },
  { scope: "rooms:read", description: "List rooms." },
  { scope: "scenes:read", description: "List scenes and their actions." },
  { scope: "scenes:run", description: "Activate a scene." },
  { scope: "automations:read", description: "List automation rules." },
  { scope: "automations:write", description: "Create, update, enable, disable and delete automation rules." },
  { scope: "events:read", description: "Read the event and activity feed." },
];

const ENDPOINTS: { method: string; path: string; scope: string; desc: string }[] = [
  { method: "GET", path: "/v1", scope: "—", desc: "API index: scopes, webhook events and the endpoint list. No auth required." },
  { method: "GET", path: "/v1/me", scope: "devices:read", desc: "The account this credential belongs to, and the scopes it holds." },
  { method: "GET", path: "/v1/devices", scope: "devices:read", desc: "All devices. Filter with ?room=, ?type= and ?online=true|false." },
  { method: "GET", path: "/v1/devices/{id}", scope: "devices:read", desc: "One device with its full current state." },
  { method: "POST", path: "/v1/devices/{id}/commands", scope: "devices:control", desc: "Send a command. Responds 202 — accepted for delivery." },
  { method: "PATCH", path: "/v1/devices/{id}", scope: "devices:write", desc: "Update name, room or favourite. Returns the updated device." },
  { method: "GET", path: "/v1/devices/{id}/telemetry", scope: "telemetry:read", desc: "History, newest first. ?limit= (max 1000) and ?since=<ISO-8601>." },
  { method: "GET", path: "/v1/devices/{id}/energy", scope: "telemetry:read", desc: "Bucketed series and integrated kWh. ?hours= and ?metric=." },
  { method: "GET", path: "/v1/rooms", scope: "rooms:read", desc: "Rooms with device counts." },
  { method: "GET", path: "/v1/scenes", scope: "scenes:read", desc: "Scenes and the actions they perform." },
  { method: "POST", path: "/v1/scenes/{id}/activate", scope: "scenes:run", desc: "Run a scene. Returns how many commands went out." },
  { method: "GET", path: "/v1/automations", scope: "automations:read", desc: "Automation rules with their triggers and actions." },
  { method: "POST", path: "/v1/automations", scope: "automations:write", desc: "Create a rule. Every device it names must be in your account." },
  { method: "PATCH", path: "/v1/automations/{id}", scope: "automations:write", desc: "Update or enable/disable a rule." },
  { method: "DELETE", path: "/v1/automations/{id}", scope: "automations:write", desc: "Delete a rule." },
  { method: "GET", path: "/v1/events", scope: "events:read", desc: "Event feed. ?limit= (max 500) and ?since=<ISO-8601>." },
];

const ERRORS: { status: string; code: string; meaning: string }[] = [
  { status: "400", code: "invalid_body", meaning: "The request body was missing or not a JSON object." },
  { status: "400", code: "invalid_query", meaning: "A query parameter was malformed — usually a bad `since` timestamp." },
  { status: "401", code: "key_invalid", meaning: "No key was sent, or it is not a key we issued." },
  { status: "401", code: "key_expired", meaning: "The key passed its expiry date. Create a new one." },
  { status: "401", code: "key_revoked", meaning: "The key was revoked in the console." },
  { status: "401", code: "key_blocked", meaning: "The account that owns the key is disabled." },
  { status: "403", code: "insufficient_scope", meaning: "Valid key, but it lacks the scope this endpoint needs. The response lists both required and granted." },
  { status: "403", code: "origin_not_allowed", meaning: "Called from a browser on an origin the key does not permit." },
  { status: "403", code: "device_not_owned", meaning: "An automation named a device that is not in this account — checked on the trigger as well as the actions." },
  { status: "404", code: "not_found", meaning: "No such device, scene or endpoint — or it belongs to another account." },
  { status: "429", code: "rate_limited", meaning: "More than 600 requests in a minute for this key." },
];

const WEBHOOK_EVENTS: { event: string; when: string }[] = [
  { event: "device.state", when: "A device published new state — a relay flipped, a level changed." },
  { event: "device.telemetry", when: "A device published a telemetry sample." },
  { event: "device.online", when: "A device connected to the broker." },
  { event: "device.offline", when: "A device's last-will fired, or it disconnected." },
];

/* ------------------------------------------------------------------ */
/* Code samples                                                        */
/* ------------------------------------------------------------------ */

const SAMPLES: { id: string; label: string; lang: string; code: string }[] = [
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
// origin. Read "Calling from a browser" below before you ship this —
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

const WEBHOOK_VERIFY = `import crypto from "node:crypto";
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

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the code is still selectable */
    }
  };
  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {label ?? "example"}
        </span>
        <button
          onClick={copy}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition hover:opacity-80"
          style={{ color: copied ? "var(--accent-cyan)" : "var(--text-tertiary)" }}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono" style={{ color: "var(--text-secondary)" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon?: typeof Terminal;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <ScrollReveal>
        <h2 className="mb-4 flex items-center gap-2.5 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          {Icon && <Icon className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} />}
          {title}
        </h2>
        <div className="space-y-4">{children}</div>
      </ScrollReveal>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 font-mono text-[13px]"
      style={{ background: "var(--bg-elevated)", color: "var(--accent-cyan)" }}
    >
      {children}
    </code>
  );
}

const METHOD_COLOR: Record<string, string> = {
  GET: "#0e9f6e",
  POST: "#3b82f6",
  PATCH: "#f59e0b",
  DELETE: "#ef4444",
};

const NAV = [
  { id: "quickstart", label: "Quickstart" },
  { id: "auth", label: "Authentication" },
  { id: "scopes", label: "Scopes" },
  { id: "endpoints", label: "Endpoints" },
  { id: "commands", label: "Sending commands" },
  { id: "browser", label: "Calling from a browser" },
  { id: "webhooks", label: "Webhooks" },
  { id: "errors", label: "Errors" },
  { id: "limits", label: "Rate limits & versioning" },
];

export default function DevelopersPage() {
  const [sample, setSample] = useState("curl");
  const active = SAMPLES.find((s) => s.id === sample) ?? SAMPLES[0];

  return (
    <>
      <PageHeader
        eyebrow="Developer Platform"
        title="Build on"
        titleHighlight="Circuvent"
        description="A REST API and signed webhooks for the same control plane our own console and apps run on. Read device state, send commands, and stream events straight into your dashboard."
        stats={[
          { value: "16", label: "Endpoints" },
          { value: "10", label: "Scopes" },
          { value: "4", label: "Webhook events" },
          { value: "600/min", label: "Rate limit" },
        ]}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
          {/* On-page nav */}
          <nav className="mb-10 lg:sticky lg:top-28 lg:mb-0 lg:self-start">
            <div
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: "var(--text-tertiary)" }}
            >
              On this page
            </div>
            <ul className="space-y-1">
              {NAV.map((n) => (
                <li key={n.id}>
                  <a
                    href={`#${n.id}`}
                    className="block rounded-lg px-3 py-1.5 text-[13px] transition hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-14">
            {/* ── Quickstart ─────────────────────────── */}
            <Section id="quickstart" icon={Terminal} title="Quickstart">
              <P>
                Every request goes to <Code>{API_BASE}/v1</Code> and carries an API key. Three steps
                and you are reading real devices.
              </P>
              <ol className="ml-5 list-decimal space-y-2 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                <li>
                  Open{" "}
                  <Link
                    href="/smarthome/settings?tab=developer"
                    className="font-semibold underline"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Console → Settings → Developer
                  </Link>{" "}
                  and create a key. Grant only the scopes you need.
                </li>
                <li>Copy the key when it is shown — we store a hash, so it cannot be displayed again.</li>
                <li>
                  Send it as <Code>Authorization: Bearer &lt;key&gt;</Code> on every request.
                </li>
              </ol>

              <div className="flex flex-wrap gap-2 pt-2">
                {SAMPLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSample(s.id)}
                    className="min-h-9 rounded-lg border px-3 text-[13px] font-semibold transition"
                    style={{
                      borderColor: sample === s.id ? "var(--accent-cyan)" : "var(--border-subtle)",
                      color: sample === s.id ? "var(--accent-cyan)" : "var(--text-secondary)",
                      background: sample === s.id ? "var(--bg-elevated)" : "transparent",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <CodeBlock code={active.code} label={active.lang} />
            </Section>

            {/* ── Auth ───────────────────────────────── */}
            <Section id="auth" icon={KeyRound} title="Authentication">
              <P>
                Keys look like <Code>cvk_live_…</Code> or <Code>cvk_test_…</Code>. Both are real keys
                against real devices — the environment marker is a label to help you tell a staging
                integration from a production one, not a sandbox.
              </P>
              <P>
                Send the key in the <Code>Authorization</Code> header as a bearer token. An{" "}
                <Code>X-API-Key</Code> header works too, if that is what your HTTP client makes easy.
              </P>
              <CodeBlock
                label="http"
                code={`GET /v1/devices HTTP/1.1
Host: api.circuvent.com
Authorization: Bearer cvk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
              />
              <P>
                A key is tied to the account that created it and can do nothing that account cannot.
                It is <strong>not</strong> able to manage keys, provision or unclaim devices, change
                account settings, or reach admin endpoints — those require a signed-in session. That
                boundary is what stops a leaked read-only key from issuing itself a broader one.
              </P>
              <P>
                Keys never expire unless you give them an expiry, and revoking one in the console
                takes effect immediately. Call <Code>GET /v1/me</Code> at any time to see which
                account and scopes a key resolves to — it is the fastest way to debug a 403.
              </P>
            </Section>

            {/* ── Scopes ─────────────────────────────── */}
            <Section id="scopes" title="Scopes">
              <P>
                A key carries exactly the scopes you grant it. Scopes do not imply one another:{" "}
                <Code>devices:read</Code> does not confer <Code>devices:control</Code>, so a
                dashboard that only displays state cannot switch anything even if its key leaks.
              </P>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
                {SCOPES.map((s, i) => (
                  <div
                    key={s.scope}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    style={{
                      borderTop: i ? "1px solid var(--border-subtle)" : undefined,
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <code
                      className="w-48 shrink-0 font-mono text-[12.5px] font-bold"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      {s.scope}
                    </code>
                    <span className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
                      {s.description}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── Endpoints ──────────────────────────── */}
            <Section id="endpoints" icon={Braces} title="Endpoints">
              <P>
                All paths are relative to <Code>{API_BASE}</Code>. Responses are JSON.{" "}
                <Code>GET /v1</Code> returns this same list machine-readably, and{" "}
                <a
                  href="/openapi.json"
                  className="font-semibold underline"
                  style={{ color: "var(--accent-cyan)" }}
                >
                  an OpenAPI 3.1 document
                </a>{" "}
                is published if you would rather generate a client.
              </P>
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
                <table className="w-full min-w-[720px] text-left">
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      {["Method", "Path", "Scope", "Description"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map((e, i) => (
                      <tr
                        key={`${e.method}${e.path}`}
                        style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}
                      >
                        <td className="px-4 py-2.5">
                          <span
                            className="font-mono text-[11px] font-bold"
                            style={{ color: METHOD_COLOR[e.method] ?? "var(--text-secondary)" }}
                          >
                            {e.method}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12.5px]" style={{ color: "var(--text-primary)" }}>
                          {e.path}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11.5px]" style={{ color: "var(--text-tertiary)" }}>
                          {e.scope}
                        </td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                          {e.desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <CodeBlock
                label="GET /v1/devices"
                code={`{
  "devices": [
    {
      "id": "hub-a1b2",
      "name": "Living room hub",
      "type": "home-hub",
      "room": "Living Room",
      "favorite": true,
      "online": true,
      "lastSeen": "2026-08-03T09:12:44.201Z",
      "firmware": "1.4.2",
      "state": { "power": true, "power2": false, "power3": false, "power4": false }
    }
  ]
}`}
              />
            </Section>

            {/* ── Commands ───────────────────────────── */}
            <Section id="commands" title="Sending commands">
              <P>
                <Code>POST /v1/devices/{"{id}"}/commands</Code> forwards the body to the device
                unchanged. We deliberately do not validate it against a per-type schema: what a board
                accepts is defined by its firmware, which ships independently of this API, so a
                whitelist here would silently block every new capability until somebody remembered to
                update it.
              </P>
              <P>
                The response is <strong>202 Accepted</strong>, not 200. It means the broker has taken
                the command for delivery — not that the relay has closed. To observe the result,
                either read the device back a moment later or take a{" "}
                <a href="#webhooks" className="font-semibold underline" style={{ color: "var(--accent-cyan)" }}>
                  webhook
                </a>
                , which is pushed as soon as the device reports.
              </P>
              <CodeBlock
                label="common commands"
                code={`// Multi-channel hub / touch switchboard — channel index is zero-based
{ "ch": 0, "on": true }

// Everything on, in one message
{ "relays": [true, true, true, true] }

// Single-relay devices (plug, light, switch)
{ "power": true }

// Dimmable light — 0-100
{ "power": true, "brightness": 60 }

// Fan speed — 0-5
{ "speed": 3 }

// Named scene on a hub
{ "scene": "movie" }`}
              />
              <P>
                Fields a device does not understand are ignored by the firmware rather than rejected,
                so sending an extra key is safe. The exact fields each product accepts are listed on
                its page in the shop and in <Code>firmware/&lt;type&gt;/</Code> in the open-source
                repository.
              </P>
            </Section>

            {/* ── Browser ────────────────────────────── */}
            <Section id="browser" icon={ShieldAlert} title="Calling from a browser">
              <P>
                By default a key is refused if it arrives with an <Code>Origin</Code> header — that
                is, from browser JavaScript. Pasting a server key into front-end code should break
                loudly rather than quietly publish your credential.
              </P>
              <P>
                If you do want to call the API directly from your website, register that site as an
                allowed origin when you create the key. We will then accept it from that origin and
                answer with the matching CORS headers.
              </P>
              <div
                className="rounded-xl border-l-4 p-4"
                style={{ borderColor: "#f59e0b", background: "var(--bg-elevated)" }}
              >
                <div
                  className="mb-1.5 flex items-center gap-2 text-[14px] font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  <ShieldAlert className="h-4 w-4" style={{ color: "#f59e0b" }} />
                  What the origin allowlist actually protects
                </div>
                <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  The <Code>Origin</Code> header is set by the browser and cannot be forged by page
                  JavaScript, so the allowlist genuinely stops somebody embedding a key scraped from
                  your site into a page on their own domain. It is <strong>not</strong> a defence
                  against a server-side caller — <Code>curl</Code> can send any origin it likes. A
                  key shipped to a browser is readable by every visitor, so treat it as public: grant
                  it <Code>devices:read</Code> and nothing more, and keep anything that switches
                  hardware on your own backend.
                </p>
              </div>
              <P>
                The pattern we would recommend for a customer-facing dashboard: hold a full-scope key
                on your server, expose your own endpoint that applies your own authorisation rules,
                and let the browser talk to that. Your users never see a Circuvent credential at all.
              </P>
            </Section>

            {/* ── Webhooks ───────────────────────────── */}
            <Section id="webhooks" icon={Webhook} title="Webhooks">
              <P>
                Rather than polling, register an https endpoint and we will POST to it as devices
                report. Add one in{" "}
                <Link
                  href="/smarthome/settings?tab=developer"
                  className="font-semibold underline"
                  style={{ color: "var(--accent-cyan)" }}
                >
                  Settings → Developer
                </Link>
                , then use the <em>Send test</em> button to check your receiver before a real device
                depends on it.
              </P>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
                {WEBHOOK_EVENTS.map((e, i) => (
                  <div
                    key={e.event}
                    className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    style={{
                      borderTop: i ? "1px solid var(--border-subtle)" : undefined,
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <code
                      className="w-44 shrink-0 font-mono text-[12.5px] font-bold"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      {e.event}
                    </code>
                    <span className="text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
                      {e.when}
                    </span>
                  </div>
                ))}
              </div>
              <CodeBlock
                label="delivery body"
                code={`POST /your/endpoint
X-Circuvent-Event: device.state
X-Circuvent-Signature: t=1785312764,v1=8f3c…

{
  "id": "evt_9Kd2mQpX7bTz",
  "event": "device.state",
  "deviceId": "hub-a1b2",
  "data": { "power": true, "power2": false },
  "at": "2026-08-03T09:12:44.201Z"
}`}
              />
              <P>
                <strong>Always verify the signature before trusting the body.</strong> Anyone can
                POST to your URL; the HMAC is what proves it came from us. The timestamp is inside
                the signed material, so a captured delivery cannot be replayed later with a fresh
                one.
              </P>
              <CodeBlock code={WEBHOOK_VERIFY} label="node — verifying a delivery" />
              <P>
                We wait 5 seconds for a 2xx. Non-2xx responses count as failures, and 20 consecutive
                failures disable the webhook — a dead endpoint would otherwise burn a socket and five
                seconds for every device message, forever. Re-enable it in the console once the
                receiver is healthy; that also resets the counter. Redirects are not followed, and
                the URL must resolve to a publicly routable address.
              </P>
            </Section>

            {/* ── Errors ─────────────────────────────── */}
            <Section id="errors" title="Errors">
              <P>
                Failures return a JSON body with a human <Code>error</Code> and a stable{" "}
                <Code>code</Code>. Branch on the code, not the message — messages get reworded.
              </P>
              <CodeBlock
                label="403"
                code={`{
  "error": "This key is missing the 'devices:control' scope.",
  "code": "insufficient_scope",
  "required": "devices:control",
  "granted": ["devices:read", "telemetry:read"]
}`}
              />
              <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      {["Status", "Code", "Meaning"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ERRORS.map((e, i) => (
                      <tr key={e.code} style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
                        <td
                          className="px-4 py-2.5 font-mono text-[12.5px] font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {e.status}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: "var(--accent-cyan)" }}>
                          {e.code}
                        </td>
                        <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                          {e.meaning}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P>
                A device that belongs to another account returns <Code>404</Code>, not{" "}
                <Code>403</Code>. That is deliberate: a 403 would confirm the id exists.
              </P>
            </Section>

            {/* ── Limits ─────────────────────────────── */}
            <Section id="limits" title="Rate limits & versioning">
              <P>
                600 requests per minute, counted per key rather than per IP — an integration running
                from one server should not have to share a budget with every other caller on that
                address. Over the limit you get <Code>429</Code> with{" "}
                <Code>code: &quot;rate_limited&quot;</Code>. Standard <Code>RateLimit-*</Code>{" "}
                headers are on every response, so you can back off before hitting it.
              </P>
              <P>
                If you need per-device updates faster than polling allows, use webhooks — they are
                pushed as the device reports and do not count against this budget.
              </P>
              <div
                className="rounded-xl border-l-4 p-4"
                style={{ borderColor: "var(--accent-cyan)", background: "var(--bg-elevated)" }}
              >
                <div className="mb-1.5 text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
                  Our compatibility promise for /v1
                </div>
                <ul
                  className="ml-4 list-disc space-y-1 text-[14px] leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <li>Fields are added, never removed or retyped within a version.</li>
                  <li>Unknown fields in a request body are ignored, not rejected.</li>
                  <li>
                    A breaking change means <Code>/v2</Code>, with <Code>/v1</Code> kept working.
                  </li>
                </ul>
                <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)" }}>
                  Parse defensively anyway: tolerate fields you do not recognise rather than
                  rejecting the response.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>

      <CTASection
        title="Something missing from"
        titleHighlight="the API?"
        description="Tell us what you are building and what you need it to expose. The control plane is ours, so we can add it."
        primaryCTA={{ label: "Get in touch", href: "/contact" }}
        secondaryCTA={{ label: "Create a key", href: "/smarthome/settings?tab=developer" }}
      />
    </>
  );
}
