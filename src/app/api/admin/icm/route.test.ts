/**
 * @jest-environment node
 *
 * jsdom has no Request/Response; a route handler cannot be imported there.
 *
 * This exercises the routes rather than the model — icm.linking.test.ts covers
 * the rules. What is proved here is that the rules are reachable: every feature
 * in this repo's audit that was "present and did nothing" was present as a
 * tested pure function nobody called.
 */
import { GET, POST, PATCH, DELETE } from "./route";
import { listRotations } from "@/lib/icm-store";

let who = "ops@circuvent.com";
jest.mock("@/lib/admin-auth", () => ({
  guard: () => ({ email: who }),
  adminFromRequest: () => ({ email: who }),
}));

const url = "https://circuvent.com/api/admin/icm";
const get = (qs = "") => GET(new Request(`${url}${qs}`));
const post = (body: unknown) =>
  POST(new Request(url, { method: "POST", body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new Request(url, { method: "PATCH", body: JSON.stringify(body) }));
const del = (qs: string) => DELETE(new Request(`${url}${qs}`, { method: "DELETE" }));

const file = async (title: string, over: Record<string, unknown> = {}) => {
  const b = await (await post({ title, severity: 2, owningTeam: "Platform", ...over })).json();
  return b.incident.id as string;
};

const at = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();

beforeEach(() => {
  who = "ops@circuvent.com";
});

describe("linking over the API", () => {
  it("links two incidents and shows the relationship from both", async () => {
    const a = await file("Database is down");
    const b = await file("Checkout is failing");

    const res = await patch({ id: b, action: "link", otherId: a, kind: "caused-by" });
    expect(res.status).toBe(200);

    const from = await (await get(`?id=${b}`)).json();
    const to = await (await get(`?id=${a}`)).json();

    expect(from.incident.links).toEqual([expect.objectContaining({ id: a, kind: "caused-by" })]);
    expect(to.incident.links).toEqual([expect.objectContaining({ id: b, kind: "causes" })]);
  });

  it("attributes the link to the signed-in admin, not to the system", async () => {
    const a = await file("A");
    const b = await file("B");
    await patch({ id: a, action: "link", otherId: b, kind: "related-to" });

    const body = await (await get(`?id=${a}`)).json();
    expect(body.incident.links[0].by).toBe("ops@circuvent.com");
    expect(body.incident.timeline.at(-1).actor).toBe("ops@circuvent.com");
  });

  it("falls back to related-to rather than inventing a causal link", async () => {
    const a = await file("A");
    const b = await file("B");
    await patch({ id: a, action: "link", otherId: b, kind: "definitely-caused-by" });

    const body = await (await get(`?id=${a}`)).json();
    expect(body.incident.links[0].kind).toBe("related-to");
  });

  it("answers 409 for a link that is refused, not 500", async () => {
    const a = await file("A");
    const b = await file("B");
    await patch({ id: a, action: "link", otherId: b, kind: "related-to" });

    const again = await patch({ id: a, action: "link", otherId: b, kind: "related-to" });
    expect(again.status).toBe(409);
    expect((await again.json()).message).toContain("Already linked");
  });

  it("answers 404 for an incident that is not there", async () => {
    const a = await file("A");
    expect((await patch({ id: a, action: "link", otherId: "INC-9999", kind: "related-to" })).status).toBe(404);
  });

  it("unlinks from both ends", async () => {
    const a = await file("A");
    const b = await file("B");
    await patch({ id: a, action: "link", otherId: b, kind: "related-to" });
    expect((await patch({ id: a, action: "unlink", otherId: b })).status).toBe(200);

    expect((await (await get(`?id=${a}`)).json()).incident.links).toEqual([]);
    expect((await (await get(`?id=${b}`)).json()).incident.links).toEqual([]);
  });

  it("hides duplicates from the queue when asked", async () => {
    const original = await file("Meter readings stalled");
    const dupe = await file("Meter readings stalled");
    await patch({ id: dupe, action: "link", otherId: original, kind: "duplicate-of" });

    const shown = await (await get("?status=open")).json();
    const folded = await (await get("?status=open&hideDuplicates=1")).json();

    const ids = (b: { incidents: { id: string }[] }) => b.incidents.map((i) => i.id);
    expect(ids(shown)).toEqual(expect.arrayContaining([original, dupe]));
    expect(ids(folded)).toContain(original);
    expect(ids(folded)).not.toContain(dupe);
  });
});

describe("on-call rotation over the API", () => {
  it("saves a rota and routes an unassigned incident to whoever is on call", async () => {
    await post({
      kind: "rotation",
      team: "Platform",
      shifts: [{ who: "ben", startsAt: at(-60), endsAt: at(60) }],
    });
    expect(listRotations().some((r) => r.team === "Platform")).toBe(true);

    const id = await file("Unowned incident", { assignedTo: "" });
    // Routing happens on read, so the queue is what applies it.
    const body = await (await get("?status=open")).json();

    expect(body.onCall.Platform).toBe("ben");
    expect(body.incidents.find((i: { id: string }) => i.id === id).assignedTo).toBe("ben");
  });

  it("does not reassign an incident that already has an owner", async () => {
    await post({ kind: "rotation", team: "Platform", shifts: [{ who: "ben", startsAt: at(-60), endsAt: at(60) }] });
    const id = await file("Owned", { assignedTo: "asha" });

    const body = await (await get("?status=open")).json();
    expect(body.incidents.find((i: { id: string }) => i.id === id).assignedTo).toBe("asha");
  });

  it("drops a shift that ends before it starts instead of storing a hole", async () => {
    const body = await (
      await post({
        kind: "rotation",
        team: "Firmware",
        shifts: [
          { who: "ben", startsAt: at(60), endsAt: at(-60) },
          { who: "", startsAt: at(-60), endsAt: at(60) },
          { who: "asha", startsAt: at(-60), endsAt: at(60) },
        ],
      })
    ).json();

    expect(body.rotation.shifts).toHaveLength(1);
    expect(body.rotation.shifts[0].who).toBe("asha");
  });

  it("requires a team", async () => {
    expect((await post({ kind: "rotation", shifts: [] })).status).toBe(400);
  });
});

describe("saved views over the API", () => {
  it("always offers the built-in views", async () => {
    const body = await (await get("?status=open")).json();
    expect(body.views.map((v: { id: string }) => v.id)).toEqual(
      expect.arrayContaining(["all-open", "breaching", "unacked"])
    );
  });

  it("saves a private view and hides it from everybody else", async () => {
    await post({ kind: "view", name: "My queue", filters: { status: "open", team: "Platform" }, shared: false });

    const mine = await (await get("")).json();
    expect(mine.views.some((v: { name: string }) => v.name === "My queue")).toBe(true);

    who = "someone-else@circuvent.com";
    const theirs = await (await get("")).json();
    expect(theirs.views.some((v: { name: string }) => v.name === "My queue")).toBe(false);
  });

  it("shows a shared view to everybody", async () => {
    await post({ kind: "view", name: "Team queue", filters: { status: "open" }, shared: true });

    who = "someone-else@circuvent.com";
    const body = await (await get("")).json();
    expect(body.views.some((v: { name: string }) => v.name === "Team queue")).toBe(true);
  });

  it("edits rather than duplicates when the same person saves the same name", async () => {
    await post({ kind: "view", name: "Mine", filters: { status: "open" }, shared: false });
    await post({ kind: "view", name: "Mine", filters: { status: "all" }, shared: false });

    const body = await (await get("")).json();
    const matching = body.views.filter((v: { name: string }) => v.name === "Mine");
    expect(matching).toHaveLength(1);
    expect(matching[0].filters.status).toBe("all");
  });

  it("refuses to delete somebody else's view", async () => {
    const saved = await (await post({ kind: "view", name: "Theirs", filters: {}, shared: true })).json();

    who = "someone-else@circuvent.com";
    const res = await del(`?viewId=${saved.view.id}`);
    expect(res.status).toBe(403);
  });

  it("refuses to delete a built-in view", async () => {
    expect((await del("?viewId=all-open")).status).toBe(403);
  });

  it("deletes the caller's own view", async () => {
    const saved = await (await post({ kind: "view", name: "Scratch", filters: {}, shared: false })).json();
    expect((await del(`?viewId=${saved.view.id}`)).status).toBe(200);

    const body = await (await get("")).json();
    expect(body.views.some((v: { name: string }) => v.name === "Scratch")).toBe(false);
  });

  it("requires a name", async () => {
    expect((await post({ kind: "view", filters: {} })).status).toBe(400);
  });
});
