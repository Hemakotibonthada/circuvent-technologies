import { toolsFor, runTool } from "./tools";
import type { AssistantContext } from "./types";

// `tools.ts` is the trust boundary: the model can ask for anything, and this is
// what decides what it actually gets. The tests below are about permission and
// refusal, not about formatting — a regression here is a data leak, not a
// cosmetic bug.

// The shop store runs a top-level bootstrap that Jest's CommonJS transform
// cannot parse, and none of it is needed to test permissions.
jest.mock("../store", () => ({
  listOrdersByEmail: jest.fn(() => []),
  revalidate: jest.fn(async () => undefined),
}));

const ctx = (over: Partial<AssistantContext> = {}): AssistantContext => ({
  persona: "guest", ...over,
});

const names = (c: AssistantContext) => toolsFor(c).map((t) => t.name).sort();

describe("toolsFor — what each persona is even told exists", () => {
  it("offers a guest nothing but the catalogue", () => {
    expect(names(ctx({ persona: "guest" }))).toEqual(["search_products"]);
  });

  it("offers a customer their own devices and orders", () => {
    const t = names(ctx({ persona: "customer" }));
    expect(t).toContain("list_devices");
    expect(t).toContain("home_analysis");
    expect(t).toContain("list_orders");
  });

  it("never offers a customer the fleet", () => {
    expect(names(ctx({ persona: "customer" }))).not.toContain("fleet_overview");
  });

  it("offers an admin the fleet on top of everything a customer gets", () => {
    const customer = names(ctx({ persona: "customer" }));
    const admin = names(ctx({ persona: "admin" }));
    expect(admin).toContain("fleet_overview");
    for (const t of customer) expect(admin).toContain(t);
  });

  it("gives every tool a schema the provider will accept", () => {
    for (const t of toolsFor(ctx({ persona: "admin" }))) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.parameters.type).toBe("object");
    }
  });
});

describe("runTool — permission is re-derived, never taken from the model", () => {
  it("refuses a tool the persona was never offered", async () => {
    const r = await runTool("list_devices", {}, ctx({ persona: "guest" }));
    expect(r.refused).toBe(true);
    expect(r.data).toBeUndefined();
  });

  it("refuses the fleet to a customer", async () => {
    const r = await runTool("fleet_overview", {}, ctx({ persona: "customer" }));
    expect(r.refused).toBe(true);
  });

  it("refuses a tool that does not exist, rather than throwing", async () => {
    // A model can hallucinate a tool name. That must be a refusal, not a 500.
    const r = await runTool("delete_everything", {}, ctx({ persona: "admin" }));
    expect(r.refused).toBe(true);
  });

  it("refuses orders when there is no signed-in shop account", async () => {
    const r = await runTool("list_orders", {}, ctx({ persona: "customer" }));
    expect(r.refused).toBe(true);
  });

  it("refuses device history when no device id was given", async () => {
    const r = await runTool("device_history", {}, ctx({ persona: "customer", consoleToken: "t" }));
    expect(r.refused).toBe(true);
  });

  it("tells the model plainly when there is no console session", async () => {
    // No token means no control-plane read is possible. The model must be told
    // to say so rather than guess at device names.
    const r = await runTool("list_devices", {}, ctx({ persona: "customer" }));
    expect(r.refused).toBe(true);
    expect(r.content).toMatch(/sign in/i);
  });
});

describe("search_products — the one tool a guest can reach", () => {
  const guest = ctx({ persona: "guest" });

  it("refuses an empty query", async () => {
    expect((await runTool("search_products", { query: "  " }, guest)).refused).toBe(true);
  });

  it("finds real catalogue entries", async () => {
    const r = await runTool("search_products", { query: "camera" }, guest);
    expect(r.refused).toBeFalsy();
    expect(r.content.toLowerCase()).toContain("camera");
  });

  it("says nothing matched instead of inventing a product", async () => {
    const r = await runTool("search_products", { query: "zzzznotathing" }, guest);
    expect(r.content).toMatch(/do not invent/i);
  });

  it("returns links that point into the shop", async () => {
    const r = await runTool("search_products", { query: "water" }, guest);
    if (!r.refused && r.content.includes("Link:")) {
      expect(r.content).toContain("/shop/");
    }
  });
});
