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
import { recordCurrentBuild } from "@/lib/deployments";

let who = "ops@circuvent.com";
jest.mock("@/lib/admin-auth", () => ({
  guard: () => ({ email: who }),
  adminFromRequest: () => ({ email: who }),
}));

const sentMail: { to: string; subject: string }[] = [];
jest.mock("@/lib/order-core", () => ({
  sendMail: jest.fn(async (to: string, subject: string) => {
    sentMail.push({ to, subject });
    return true;
  }),
}));

/*
 * The route starts a durable workflow when an incident is filed.
 *
 * `workflow/api` ships as ESM and Jest parses this project as CommonJS, so
 * importing the route pulls in a module it cannot read — the suite fails to
 * load with "Cannot use import statement outside a module", which names
 * neither this route nor the SDK. Mocked rather than transformed because what
 * these tests are about is the HTTP behaviour of the route; that the workflow
 * is started, and what it then does, is covered in icm-watch.test.ts.
 *
 * Recorded rather than discarded so the tests can still assert that filing an
 * incident asks for a watch — silently dropping the call would let that
 * regress unnoticed.
 */
const started: { name: string; args: unknown[] }[] = [];
jest.mock("workflow/api", () => ({
  start: jest.fn(async (fn: { name?: string }, args: unknown[]) => {
    started.push({ name: fn?.name ?? "unknown", args });
    return { runId: `run-${started.length}` };
  }),
}));

/* The workflow module itself is ESM for the same reason, and the route only
   needs an opaque function reference to hand to `start`. */
jest.mock("@/workflows/icm-watch", () => ({
  watchIncident: function watchIncident() {
    throw new Error("the workflow body is not run here — see icm-watch.test.ts");
  },
}));
jest.mock("@/workflows/icm-postmortem", () => ({
  chasePostmortem: function chasePostmortem() {
    throw new Error("the workflow body is not run here — see icm-postmortem.test.ts");
  },
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
  started.length = 0;
});

describe("the escalation watch", () => {
  it("starts a durable watch when a person files an incident", async () => {
    /*
     * Escalation used to happen only inside the queue view, so an incident
     * escalated when somebody opened the admin panel and not before. The watch
     * is what makes the clock run on its own; if this call is ever dropped the
     * feature reverts silently to needing an observer.
     */
    const id = await file("Gateway timeouts");

    expect(started).toHaveLength(1);
    expect(started[0].name).toBe("watchIncident");
    expect(started[0].args).toEqual([id]);
  });

  it("starts one for an incident the monitor files, which is the least attended kind", async () => {
    await post({
      kind: "from-failure",
      key: "TypeError:/api/orders",
      title: "TypeError on /api/orders",
      owningTeam: "Platform",
    });

    expect(started).toHaveLength(1);
    expect(started[0].name).toBe("watchIncident");
  });

  it("does not start a second watch when the same failure is filed twice", async () => {
    const body = {
      kind: "from-failure",
      key: "TypeError:/api/duplicate",
      title: "TypeError on /api/duplicate",
      owningTeam: "Platform",
    };
    await post(body);
    started.length = 0;

    await post(body);
    expect(started).toHaveLength(0);
  });

  it("does not start one for an action on an existing incident", async () => {
    const id = await file("Already watched");
    started.length = 0;

    await patch({ id, action: "acknowledge" });
    await patch({ id, action: "comment", body: "looking" });

    expect(started).toHaveLength(0);
  });
});

describe("the postmortem chase", () => {
  const resolveIt = async (id: string) => {
    await patch({ id, action: "acknowledge" });
    await patch({ id, action: "mitigate", note: "restarted" });
    await patch({ id, action: "resolve", note: "fixed" });
  };

  it("starts when a severity that owes a write-up is resolved", async () => {
    /* A resolution is the one transition that creates an obligation rather than
       discharging one, and nothing chased it before: the queue listed it, which
       only reaches somebody who goes looking at an incident that is closed. */
    const id = await file("Owes a postmortem", { severity: 2 });
    started.length = 0;

    await resolveIt(id);

    const chases = started.filter((s) => s.name === "chasePostmortem");
    expect(chases).toHaveLength(1);
    expect(chases[0].args).toEqual([id]);
  });

  it("does not start for a severity that owes nothing", async () => {
    // Requiring one for every Sev3 produces documents nobody reads.
    const id = await file("Minor", { severity: 3 });
    started.length = 0;

    await resolveIt(id);

    expect(started.filter((s) => s.name === "chasePostmortem")).toHaveLength(0);
  });

  it("does not start on the way to resolution", async () => {
    const id = await file("In progress", { severity: 1 });
    started.length = 0;

    await patch({ id, action: "acknowledge" });
    await patch({ id, action: "mitigate", note: "restarted" });

    expect(started.filter((s) => s.name === "chasePostmortem")).toHaveLength(0);
  });

  it("does not start when the resolution was refused", async () => {
    const id = await file("Never resolved", { severity: 1 });
    started.length = 0;

    /* Resolving without mitigating first is refused by the model; a chase
       started here would be for an obligation that does not exist. */
    const res = await patch({ id, action: "resolve", note: "skipping ahead" });
    if (res.status === 200) return; // the model allows it; nothing to assert

    expect(started.filter((s) => s.name === "chasePostmortem")).toHaveLength(0);
  });
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

describe("notification on the human write paths", () => {
  beforeEach(() => {
    sentMail.length = 0;
    process.env.ICM_NOTIFY_EMAIL = "oncall@circuvent.com";
  });

  it("emails when a person files an incident, without waiting for the daily sweep", async () => {
    const id = await file("Payments are down", { severity: 1 });

    expect(sentMail.length).toBeGreaterThan(0);
    const filed = sentMail.find((m) => m.subject.includes(id));
    expect(filed).toBeDefined();
    expect(filed!.to).toContain("oncall@circuvent.com");
    // The severity is in the subject, because it decides whether somebody
    // reads it now or in the morning.
    expect(filed!.subject).toContain("Sev 1");
  });

  it("emails the resolution, so the thread does not end on the outage", async () => {
    const id = await file("Brief blip", { severity: 3 });
    sentMail.length = 0;

    await patch({ id, action: "acknowledge" });
    await patch({ id, action: "mitigate", note: "restarted the worker" });
    await patch({ id, action: "resolve", note: "a bad config push" });

    const resolved = sentMail.find((m) => m.subject.startsWith("Resolved:") && m.subject.includes(id));
    expect(resolved).toBeDefined();
  });

  it("does not re-send the filing notice on every subsequent action", async () => {
    const id = await file("Noisy incident", { severity: 3 });
    const filedCount = sentMail.filter((m) => m.subject.includes(id) && !m.subject.includes(":")).length;

    await patch({ id, action: "comment", body: "looking" });
    await patch({ id, action: "comment", body: "still looking" });

    const after = sentMail.filter((m) => m.subject.includes(id) && !m.subject.includes(":")).length;
    expect(after).toBe(filedCount);
  });
});

describe("filing from an Insights failure group", () => {
  beforeEach(() => {
    sentMail.length = 0;
    process.env.ICM_NOTIFY_EMAIL = "oncall@circuvent.com";
  });

  const failure = {
    kind: "from-failure",
    key: "TypeError|/smarthome/devices|at renderTile",
    title: "TypeError on /smarthome/devices",
    detail: "Cannot read properties of undefined — 42 occurrences across 9 sessions.",
    errorType: "TypeError",
    path: "/smarthome/devices",
    count: 42,
    sessions: 9,
  };

  it("files an incident carrying the failure's detail", async () => {
    const b = await (await post(failure)).json();

    expect(b.success).toBe(true);
    expect(b.incident.title).toBe("TypeError on /smarthome/devices");
    expect(b.incident.source).toBe("monitor");
    expect(b.incident.description).toContain("42 occurrences");
  });

  it("does not open a second incident when clicked twice", async () => {
    // Its own key: the test above already filed the shared one, and the whole
    // point of this path is that a key files exactly once.
    const own = { ...failure, key: "TypeError|/smarthome/scenes|at renderScene" };
    const first = await (await post(own)).json();
    const second = await (await post(own)).json();

    expect(first.incident).not.toBeNull();
    // Success, but nothing new — a queue with three incidents for one exception
    // is what this prevents.
    expect(second.success).toBe(true);
    expect(second.incident).toBeNull();
    expect(second.message).toContain("already open");
  });

  it("notifies on the first filing only", async () => {
    const distinct = { ...failure, key: "RangeError|/api/x|at parse" };
    await post(distinct);
    const after = sentMail.length;
    expect(after).toBeGreaterThan(0);

    await post(distinct);
    expect(sentMail.length).toBe(after);
  });

  it("requires a failure key", async () => {
    const res = await post({ kind: "from-failure", title: "Something" });
    expect(res.status).toBe(400);
  });
});

describe("release correlation on a filed incident", () => {
  const ENV = ["VERCEL_GIT_COMMIT_SHA", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_MESSAGE", "VERCEL_GIT_COMMIT_AUTHOR_LOGIN"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k];
    process.env.VERCEL_GIT_COMMIT_SHA = "feedface00112233";
    process.env.VERCEL_GIT_COMMIT_REF = "develop";
    process.env.VERCEL_GIT_COMMIT_MESSAGE = "Rewrite the retry policy\n\nlong body";
    process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN = "hema";
  });

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("notes a recent deployment on an incident the monitor files", async () => {
    // The build is recorded the way the sweep records it: on first sight.
    recordCurrentBuild(new Date(Date.now() - 8 * 60_000).toISOString());

    const res = await post({
      kind: "sync-alerts",
      alerts: [
        {
          fingerprint: "release-correlation-test",
          severity: "critical",
          title: "Checkout is failing",
          detail: "100% of calls failed",
          deviceIds: [],
          evidence: {},
          state: "open",
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          occurrences: 1,
        },
      ],
    });
    const body = await res.json();
    expect(body.filed.length).toBe(1);

    const incident = (await (await get(`?id=${body.filed[0]}`)).json()).incident;
    const note = incident.timeline.find((t: { text: string }) => t.text.includes("Possibly related"));

    expect(note).toBeDefined();
    expect(note.text).toContain("feedfac");
    expect(note.text).toContain("8 minutes earlier");
    expect(note.text).toContain("Rewrite the retry policy");
    // The body of a multi-paragraph commit has no place on a timeline.
    expect(note.text).not.toContain("long body");
  });

  it("says nothing when no deployment is near, rather than reaching further back", async () => {
    recordCurrentBuild(new Date(Date.now() - 10 * 3600_000).toISOString());

    const id = await file("Unrelated incident");
    const incident = (await (await get(`?id=${id}`)).json()).incident;

    expect(incident.timeline.some((t: { text: string }) => t.text.includes("Possibly related"))).toBe(false);
  });

  it("offers recent deployments beside the queue", async () => {
    recordCurrentBuild(new Date(Date.now() - 30 * 60_000).toISOString());
    const body = await (await get("?status=open")).json();

    expect(body.deployments.some((d: { sha: string }) => d.sha === "feedface00112233")).toBe(true);
  });
});