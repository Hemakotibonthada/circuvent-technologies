/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * These routes expose the incident queue and every path a user has walked. An
 * unguarded one is not a bug that shows up in testing — it works perfectly, for
 * everybody, including people who are not signed in.
 *
 * The telemetry *ingest* endpoint is the deliberate exception and is checked
 * separately below.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

describe("admin telemetry and incident routes are guarded", () => {
  it.each([
    ["incidents", join("app", "api", "admin", "icm", "route.ts"), "icm"],
    ["telemetry query", join("app", "api", "admin", "insights-telemetry", "route.ts"), "insights"],
  ])("%s checks the guard on every exported handler", (_name, rel, area) => {
    const src = read(rel);

    /* Every exported HTTP method, not just the first one. A POST that forgot
       the guard while GET has one is the classic version of this. */
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\s*\(/g)].map((m) => m[1]);
    expect(handlers.length).toBeGreaterThan(0);

    for (const method of handlers) {
      const start = src.indexOf(`export async function ${method}(`);
      const next = handlers
        .map((h) => src.indexOf(`export async function ${h}(`))
        .filter((i) => i > start)
        .sort((a, b) => a - b)[0];
      const body = src.slice(start, next === undefined ? src.length : next);

      expect(body).toContain(`guard(request, "${area}")`);
      expect(body).toContain("403");
    }
  });

  /*
   * The window drives a bucketed pass over the whole buffer, so an unbounded
   * value is a cheap way to make an authenticated endpoint do arbitrary work.
   */
  it("clamps the telemetry window rather than trusting it", () => {
    const src = read("app", "api", "admin", "insights-telemetry", "route.ts");
    expect(src).toMatch(/Math\.min\(\s*168/);
    expect(src).toMatch(/Math\.max\(\s*1/);
  });
});

describe("the public telemetry beacon", () => {
  const src = read("app", "api", "telemetry", "route.ts");

  /*
   * Unauthenticated on purpose — a crash on the login page is exactly the crash
   * worth knowing about — which makes every other protection load-bearing.
   */
  it("is not behind the admin guard, by design", () => {
    expect(src).not.toContain("guard(request");
  });

  it("derives the session server-side instead of trusting the client", () => {
    /* A client-supplied session id would be attacker-controlled, and could be
       used to write events into somebody else's journey. */
    expect(src).toContain("sessionId(ip, ua)");
    expect(src).not.toMatch(/session:\s*body/);
  });

  it("honours Do Not Track", () => {
    expect(src).toContain("optedOut");
  });

  /*
   * Always 204. An error response teaches the client to retry, and a retry
   * storm during an outage turns a partial failure into a total one.
   */
  it("never answers with an error status", () => {
    expect(src).not.toMatch(/status:\s*(4|5)\d\d/);
    const codes = [...src.matchAll(/status:\s*(\d{3})/g)].map((m) => m[1]);
    expect(new Set(codes)).toEqual(new Set(["204"]));
  });
});

describe("who can see what", () => {
  /*
   * Read as source rather than imported: admin-auth pulls in the shop store,
   * which has a top-level await that this environment cannot load. The role
   * table is a literal, so the text is the thing being checked either way.
   */
  const auth = read("lib", "admin-auth.ts");

  /** The area list for one role, from the ROLE_AREAS literal. */
  function areasOf(role: string): string[] {
    const start = auth.indexOf(`  ${role}: [`);
    if (start < 0) return [];
    const end = auth.indexOf("],", start);
    return [...auth.slice(start, end).matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  }

  it("gives superadmin both areas", () => {
    const areas = areasOf("superadmin");
    expect(areas).toContain("icm");
    expect(areas).toContain("insights");
  });

  /*
   * Support are usually the first to hear that something is broken, and an
   * incident nobody can file is an incident nobody responds to. They do not get
   * telemetry, which is an engineering tool that exposes every path walked.
   */
  it("lets support file incidents but not read telemetry", () => {
    const areas = areasOf("support");
    expect(areas).toContain("icm");
    expect(areas).not.toContain("insights");
  });

  it("keeps both away from the warehouse roles", () => {
    for (const role of ["inventory", "orders"]) {
      expect(areasOf(role)).not.toContain("icm");
      expect(areasOf(role)).not.toContain("insights");
    }
  });

  it("declares both as real areas, or the guard would never pass", () => {
    expect(auth).toMatch(/\|\s*"icm"/);
    expect(auth).toMatch(/\|\s*"insights"/);
  });
});

describe("the panels are wired into the console", () => {
  const page = read("app", "admin", "page.tsx");

  /* A panel that exists but is not reachable is a panel nobody uses. */
  it("registers both tabs and renders both panels", () => {
    expect(page).toContain('icm: { label: "Incidents (ICM)"');
    expect(page).toContain('insights: { label: "App Insights"');
    expect(page).toContain("<IcmPanel />");
    expect(page).toContain("<AppInsightsPanel />");
  });

  it("puts them in a category that exists", () => {
    expect(page).toContain('{ id: "reliability"');
  });
});

describe("the collector is mounted", () => {
  it("runs on every page, or it collects nothing", () => {
    const layout = read("app", "layout.tsx");
    expect(layout).toContain("<TelemetryCollector />");
  });
});
