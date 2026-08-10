import fs from "node:fs";
import path from "node:path";

/**
 * The published API surface must match the router.
 *
 * `/v1` advertises `https://circuvent.com/openapi.json` by URL, and
 * `/developers` is the page a human reads before writing any code. Both had
 * silently fallen a whole feature behind the router — the entire ANPR surface
 * existed, was scoped, rate-limited and live, and appeared in neither.
 *
 * Nothing errors when that happens. The endpoint simply cannot be discovered,
 * which is indistinguishable from it not existing. These tests make the drift
 * fail the build instead.
 */

// This file lives in tests/, so the repository root is one level up.
const root = path.join(__dirname, "..");
const openapi = JSON.parse(fs.readFileSync(path.join(root, "public", "openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, { operationId?: string; security?: Record<string, string[]>[] }>>;
  components?: { responses?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
  tags?: { name: string }[];
};
const devPage = fs.readFileSync(path.join(root, "src", "app", "developers", "page.tsx"), "utf8");

/** Scopes the control plane actually issues — mirrors API_SCOPES. */
const SCOPES = [
  "devices:read", "devices:control", "devices:write", "telemetry:read",
  "rooms:read", "scenes:read", "scenes:run", "automations:read",
  "automations:write", "events:read", "plates:read", "plates:write",
];

/** Every path the /v1 router serves, as advertised by its own index. */
const V1_PATHS = [
  "/v1/me",
  "/v1/devices",
  "/v1/devices/{id}",
  "/v1/devices/{id}/commands",
  "/v1/devices/{id}/telemetry",
  "/v1/devices/{id}/energy",
  "/v1/rooms",
  "/v1/scenes",
  "/v1/scenes/{id}/activate",
  "/v1/automations",
  "/v1/automations/{id}",
  "/v1/events",
  "/v1/plates",
  "/v1/plates/{id}/image",
  "/v1/vehicles",
  "/v1/vehicles/{plate}",
  "/v1/occupancy",
  "/v1/plate-rules",
  "/v1/plate-rules/{id}",
];

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "head", "options", "trace"]);

describe("openapi.json describes the whole API", () => {
  it.each(V1_PATHS)("documents %s", (p) => {
    expect(Object.keys(openapi.paths)).toContain(p);
  });

  it("gives every operation a unique operationId", () => {
    // A generated client collides on a duplicate, and silently drops an
    // operation with none.
    const ids: string[] = [];
    for (const ops of Object.values(openapi.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (!HTTP_METHODS.has(method)) continue; // `parameters` is path-level
        expect(op.operationId).toBeTruthy();
        ids.push(op.operationId as string);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only requires scopes the API actually issues", () => {
    // A documented scope that cannot be granted is an endpoint nobody can call.
    for (const [p, ops] of Object.entries(openapi.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (!HTTP_METHODS.has(method)) continue;
        for (const requirement of op.security ?? []) {
          for (const scopes of Object.values(requirement)) {
            for (const scope of scopes) {
              // Jest's expect takes a single argument, so the operation is put
              // in the assertion itself to keep a failure diagnosable.
              expect({ operation: `${method.toUpperCase()} ${p}`, scope, known: SCOPES.includes(scope) }).toEqual({
                operation: `${method.toUpperCase()} ${p}`,
                scope,
                known: true,
              });
            }
          }
        }
      }
    }
  });

  it("resolves every internal $ref", () => {
    const unresolved: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "$ref" && typeof v === "string") {
          let cur: unknown = openapi;
          for (const part of v.replace(/^#\//, "").split("/")) {
            cur = (cur as Record<string, unknown> | undefined)?.[part];
          }
          if (cur === undefined) unresolved.push(v);
        } else walk(v);
      }
    };
    walk(openapi);
    expect(unresolved).toEqual([]);
  });
});

describe("the developers page matches the API", () => {
  it.each(SCOPES)("lists the %s scope", (scope) => {
    expect(devPage).toContain(scope);
  });

  it.each(V1_PATHS)("lists %s", (p) => {
    expect(devPage).toContain(p);
  });

  it("documents the plate.read webhook", () => {
    // Split out of device.telemetry, so a developer who does not know it exists
    // would subscribe to every telemetry sample in the fleet to find plates.
    expect(devPage).toContain("plate.read");
  });
});
