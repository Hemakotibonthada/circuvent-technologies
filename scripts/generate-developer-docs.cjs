/**
 * Turns the OpenAPI description into the tables the developer portal renders.
 *
 * The same facts were written down three times: `public/openapi.json`, the
 * `/v1` index the API server publishes, and a hand-maintained array inside the
 * documentation page. Three copies of one fact is three chances to be wrong,
 * and the documentation copy is the one nobody notices going stale — it looks
 * right until somebody writes an integration against an endpoint that no
 * longer takes that scope.
 *
 * So the endpoint table is generated from the specification, which is the file
 * the API server is described by, and `developer-docs-parity.test.ts`
 * regenerates it and compares so it cannot drift back.
 *
 *   node scripts/generate-developer-docs.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const SPEC = path.join(root, "public", "openapi.json");
const OUT = path.join(root, "src", "lib", "developer-api.generated.ts");

/** Methods an OpenAPI path item can carry. Anything else is not an operation. */
const METHODS = ["get", "put", "post", "delete", "patch", "head", "options", "trace"];

function build() {
  const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));

  const endpoints = [];
  const scopes = new Set();

  for (const [route, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;

      /*
       * The scope is read off the operation's own security requirement rather
       * than a separate list, because that requirement is what the server
       * actually enforces. An endpoint with no requirement is open, and `/v1`
       * genuinely is -- it is how a client discovers everything else.
       */
      const granted = [];
      for (const requirement of op.security ?? []) {
        for (const names of Object.values(requirement)) {
          for (const s of names ?? []) {
            granted.push(s);
            scopes.add(s);
          }
        }
      }

      endpoints.push({
        method: method.toUpperCase(),
        path: route,
        scope: granted.length ? granted.join(", ") : null,
        summary: op.summary ?? "",
        tag: (op.tags && op.tags[0]) || "Other",
      });
    }
  }

  // Sorted so a reordering of the specification cannot show up as a diff here.
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return {
    endpoints,
    scopes: [...scopes].sort(),
    servers: (spec.servers ?? []).map((s) => s.url),
    version: spec.info?.version ?? "",
    tags: (spec.tags ?? []).map((t) => ({ name: t.name, description: t.description ?? "" })),
  };
}

function render(data) {
  return `// GENERATED FILE — do not edit.
//
// Written by scripts/generate-developer-docs.cjs from public/openapi.json,
// which is the description the API server is built against. Edit the
// specification and re-run the script; \`developer-docs-parity.test.ts\`
// regenerates this and fails if the two disagree.

export interface ApiEndpoint {
  method: string;
  path: string;
  /** The scope the server requires, or null where the endpoint is open. */
  scope: string | null;
  summary: string;
  tag: string;
}

export interface ApiTag {
  name: string;
  description: string;
}

export const API_VERSION = ${JSON.stringify(data.version)};
export const API_SERVERS: string[] = ${JSON.stringify(data.servers, null, 2)};
export const API_TAGS: ApiTag[] = ${JSON.stringify(data.tags, null, 2)};

/** Every scope the specification requires anywhere. */
export const API_SCOPES: string[] = ${JSON.stringify(data.scopes, null, 2)};

export const API_ENDPOINTS: ApiEndpoint[] = ${JSON.stringify(data.endpoints, null, 2)};
`;
}

if (require.main === module) {
  const out = render(build());
  fs.writeFileSync(OUT, out, "utf8");
  const n = build().endpoints.length;
  console.log(`wrote ${path.relative(root, OUT)} — ${n} endpoints`);
}

module.exports = { build, render };
