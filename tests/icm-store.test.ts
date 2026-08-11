/**
 * @jest-environment node
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * The store writes to DATA_DIR, and `import` is hoisted above any assignment in
 * the module body — so setting the environment variable at the top of the file
 * would happen *after* the store module had already read it and pointed itself
 * at the repository's real .data directory. Both of those mistakes have been
 * made in this repo before and both quietly polluted developer data.
 *
 * require() after the assignment is the fix.
 */
const dir = mkdtempSync(join(tmpdir(), "cv-icm-"));
process.env.DATA_DIR = dir;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const store = require("@/lib/icm-store") as typeof import("@/lib/icm-store");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const icm = require("@/lib/icm") as typeof import("@/lib/icm");

describe("incident ids", () => {
  /*
   * People read these out on calls and paste them into chat, so they have to be
   * short, ordered and quotable. A UUID would be actively hostile.
   */
  it("are sequential and human-quotable", () => {
    const a = store.fileIncident({ title: "one", severity: 2, owningTeam: "Platform", createdBy: "ada" });
    const b = store.fileIncident({ title: "two", severity: 2, owningTeam: "Platform", createdBy: "ada" });
    expect(a.id).toMatch(/^INC-\d{4}$/);
    expect(Number(b.id.slice(4))).toBe(Number(a.id.slice(4)) + 1);
  });

  it("never reuses an id, even after the newest is acted on", () => {
    const before = store.listIncidents().map((i) => i.id);
    const c = store.fileIncident({ title: "three", severity: 3, owningTeam: "Web", createdBy: "ada" });
    expect(before).not.toContain(c.id);
  });
});

describe("persisting transitions", () => {
  it("writes the result of a pure transition back", () => {
    const inc = store.fileIncident({ title: "hub down", severity: 1, owningTeam: "Platform", createdBy: "ada" });
    const now = new Date().toISOString();

    const { incident, error } = store.updateIncident(inc.id, (i) => icm.acknowledge(i, "grace", now));
    expect(error).toBe("");
    expect(incident!.acknowledgedAt).toBe(now);

    /* And it survives a re-read, rather than only existing in the response. */
    expect(store.getIncident(inc.id)!.acknowledgedAt).toBe(now);
  });

  /*
   * A refused transition must not be written. Persisting the unchanged record
   * would be harmless here, but the store also appends the owning team on
   * write, so a refused action could still mutate the document — which is the
   * kind of thing that shows up as a phantom team in a dropdown.
   */
  it("does not persist a refused transition", () => {
    const inc = store.fileIncident({ title: "x", severity: 2, owningTeam: "Web", createdBy: "ada" });
    const now = new Date().toISOString();
    store.updateIncident(inc.id, (i) => icm.acknowledge(i, "a", now));

    const before = JSON.stringify(store.getIncident(inc.id));
    const second = store.updateIncident(inc.id, (i) => icm.acknowledge(i, "b", now));

    expect(second.error).not.toBe("");
    expect(JSON.stringify(store.getIncident(inc.id))).toBe(before);
  });

  it("reports a missing incident rather than throwing", () => {
    const r = store.updateIncident("INC-9999", (i) => icm.acknowledge(i, "a", new Date().toISOString()));
    expect(r.incident).toBeNull();
    expect(r.error).not.toBe("");
  });
});

describe("teams", () => {
  it("seeds the routing list so the dropdown is never empty", () => {
    expect(store.listTeams().length).toBeGreaterThan(0);
  });

  it("learns a team from an incident filed against it", () => {
    store.fileIncident({ title: "y", severity: 3, owningTeam: "Brand New Team", createdBy: "ada" });
    expect(store.listTeams()).toContain("Brand New Team");
  });

  it("does not add the same team twice", () => {
    store.fileIncident({ title: "z1", severity: 3, owningTeam: "Dupe Team", createdBy: "ada" });
    store.fileIncident({ title: "z2", severity: 3, owningTeam: "Dupe Team", createdBy: "ada" });
    expect(store.listTeams().filter((t) => t === "Dupe Team")).toHaveLength(1);
  });
});

describe("the queue view", () => {
  it("returns incidents, stats and teams together", () => {
    const v = store.icmView({ status: "all" });
    expect(Array.isArray(v.incidents)).toBe(true);
    expect(typeof v.stats.open).toBe("number");
    expect(Array.isArray(v.teams)).toBe(true);
  });

  it("honours the open filter", () => {
    const inc = store.fileIncident({ title: "will resolve", severity: 3, owningTeam: "Web", createdBy: "ada" });
    store.updateIncident(inc.id, (i) => icm.resolve(i, "ada", "done", new Date().toISOString()));

    const open = store.icmView({ status: "open" }).incidents.map((i) => i.id);
    expect(open).not.toContain(inc.id);
    expect(store.icmView({ status: "all" }).incidents.map((i) => i.id)).toContain(inc.id);
  });
});
