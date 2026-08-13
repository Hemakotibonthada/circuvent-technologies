/** @jest-environment node */
import { GET, POST, DELETE } from "./route";
import { clearTelemetry, ingest } from "@/lib/telemetry-store";

jest.mock("@/lib/admin-auth", () => ({
  guard: () => allowed,
  adminFromRequest: () => ({ email: "ops@circuvent.com" }),
}));
let allowed: unknown = { email: "ops@circuvent.com" };

const url = "https://circuvent.com/api/admin/insights-rules";
const get = () => GET(new Request(url));
const post = (body: unknown) => POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
const del = (qs: string) => DELETE(new Request(`${url}${qs}`, { method: "DELETE" }));

const valid = {
  name: "Checkout is slow",
  metric: "p95",
  splitBy: "none",
  comparison: "above",
  threshold: 2000,
  windowMins: 30,
  minSamples: 20,
  severity: "warning",
};

beforeEach(() => {
  allowed = { email: "ops@circuvent.com" };
  clearTelemetry();
});

describe("alert rules API", () => {
  it("refuses without an admin session", async () => {
    allowed = null;
    expect((await get()).status).toBe(403);
    expect((await post(valid)).status).toBe(403);
    expect((await del("?id=x")).status).toBe(403);
  });

  it("ships the default rules on a fresh install", async () => {
    const b = await (await get()).json();
    expect(b.rules.map((r: { id: string }) => r.id)).toEqual(
      expect.arrayContaining(["rule-failure-rate", "rule-operation-failures", "rule-slow-p95"])
    );
  });

  it("returns what each rule currently evaluates to, not just its threshold", async () => {
    ingest(
      Array.from({ length: 40 }, () => ({
        kind: "request",
        path: "/api/x",
        method: "GET",
        status: 500,
        ok: false,
        durationMs: 50,
      })),
      { session: "s", source: "web", now: new Date(Date.now() - 60_000).toISOString() }
    );

    const b = await (await get()).json();
    const rule = b.rules.find((r: { id: string }) => r.id === "rule-failure-rate");

    expect(rule.current).toBe(100);
    // And it must say why it is or is not firing, so a dead rule is visible.
    expect(rule.evaluations[0].reason).toEqual(expect.any(String));
  });

  it("saves a new rule and returns it with an id", async () => {
    const b = await (await post(valid)).json();
    expect(b.success).toBe(true);
    expect(b.rule.id).toMatch(/^rule-/);
    expect(b.rule.createdBy).toBe("ops@circuvent.com");

    const listed = await (await get()).json();
    expect(listed.rules.some((r: { name: string }) => r.name === "Checkout is slow")).toBe(true);
  });

  it("edits in place when given an existing id", async () => {
    const created = await (await post(valid)).json();
    await post({ ...valid, id: created.rule.id, threshold: 5000 });

    const listed = await (await get()).json();
    const matching = listed.rules.filter((r: { id: string }) => r.id === created.rule.id);
    expect(matching).toHaveLength(1);
    expect(matching[0].threshold).toBe(5000);
  });

  it("rejects an invalid rule with the validator's own words, not a clamp", async () => {
    const res = await post({ ...valid, name: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain("name");

    const noisy = await post({ ...valid, severity: "critical", minSamples: 2 });
    expect(noisy.status).toBe(400);
    expect((await noisy.json()).message).toContain("page on noise");
  });

  it("rejects an unknown metric rather than storing an unfireable rule", async () => {
    const res = await post({ ...valid, metric: "vibes" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Unknown metric.");
  });

  it("deletes a rule, and it stays deleted", async () => {
    const created = await (await post(valid)).json();
    expect((await del(`?id=${created.rule.id}`)).status).toBe(200);

    const listed = await (await get()).json();
    expect(listed.rules.some((r: { id: string }) => r.id === created.rule.id)).toBe(false);
  });

  it("does not resurrect a deleted default rule on the next read", async () => {
    // A smoke alarm that reinstalls itself is not a feature.
    await get();
    expect((await del("?id=rule-slow-p95")).status).toBe(200);

    const listed = await (await get()).json();
    expect(listed.rules.some((r: { id: string }) => r.id === "rule-slow-p95")).toBe(false);
  });

  it("answers 404 for a rule that is not there", async () => {
    expect((await del("?id=nope")).status).toBe(404);
  });

  it("requires an id to delete", async () => {
    expect((await del("")).status).toBe(400);
  });
});
