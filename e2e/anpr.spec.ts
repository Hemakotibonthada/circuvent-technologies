import { test, expect } from "@playwright/test";

/**
 * The public ANPR surface.
 *
 * Everything here is a promise made to somebody outside the team. `/v1`
 * advertises the OpenAPI document by absolute URL, `/developers` is the page
 * read before any integration is written, and the shop page is what a customer
 * decides to buy from. All three can rot without a single unit test noticing,
 * because none of them import anything — they are files and pages that other
 * things point at.
 */

test.describe("Published API documentation", () => {
  test("openapi.json is served where /v1 says it is", async ({ request }) => {
    // The /v1 index hands out this exact path. A 404 here is a dead link in
    // the first thing a developer is told to read.
    const res = await request.get("/openapi.json");
    expect(res.status()).toBe(200);

    const doc = await res.json();
    expect(doc.openapi ?? doc.swagger).toBeTruthy();
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/v1/plates",
        "/v1/vehicles",
        "/v1/vehicles/{plate}",
        "/v1/occupancy",
        "/v1/plate-rules",
      ])
    );
  });

  test("every documented scope is one the API can actually issue", async ({ request }) => {
    const doc = await (await request.get("/openapi.json")).json();
    const issued = new Set([
      "devices:read", "devices:control", "devices:write", "telemetry:read",
      "rooms:read", "scenes:read", "scenes:run", "automations:read",
      "automations:write", "events:read", "plates:read", "plates:write",
    ]);
    const methods = new Set(["get", "put", "post", "delete", "patch"]);

    for (const [path, ops] of Object.entries<Record<string, { security?: Record<string, string[]>[] }>>(doc.paths)) {
      for (const [method, op] of Object.entries(ops)) {
        if (!methods.has(method)) continue; // `parameters` is a path-level key
        for (const requirement of op.security ?? []) {
          for (const scopes of Object.values(requirement)) {
            for (const scope of scopes) {
              expect(issued, `${method.toUpperCase()} ${path}`).toContain(scope);
            }
          }
        }
      }
    }
  });
});

test.describe("Developer documentation", () => {
  test("lists the plate endpoints and their scopes", async ({ page }) => {
    await page.goto("/developers");
    await expect(page.getByText("/v1/vehicles", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("plates:read", { exact: false }).first()).toBeVisible();
  });

  test("documents the plate.read webhook", async ({ page }) => {
    // Split out of device.telemetry. A developer who does not know it exists
    // would subscribe to every telemetry sample in the fleet to find plates.
    await page.goto("/developers");
    await expect(page.getByText("plate.read", { exact: false }).first()).toBeVisible();
  });
});

test.describe("ANPR camera product page", () => {
  test("renders, and is honest about the two things a buyer cannot discover later", async ({ page }) => {
    await page.goto("/shop/circuvent-anpr-camera");
    await expect(page.getByRole("heading", { name: /ANPR Camera/i }).first()).toBeVisible();

    const body = await page.locator("body").innerText();
    // Plate reading happens on the control plane, and the camera is for a
    // vehicle that stops. Both change whether this is the right product, and
    // neither is discoverable after the box arrives.
    expect(body).toMatch(/control plane/i);
    expect(body).toMatch(/gate, driveway or parking entry/i);
  });
});
