import {
  link,
  unlink,
  dedupe,
  duplicateIds,
  onCallFor,
  rotationGaps,
  autoAssign,
  visibleViews,
  queue,
  createIncident,
  acknowledge,
  mitigate,
  resolve,
  savePostmortem,
  addActionItem,
  toggleActionItem,
  openActionItems,
  actionsByOwner,
  type Incident,
  type Rotation,
  type SavedView,
} from "./icm";

const NOW = "2026-06-01T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();

const inc = (id: string, over: Partial<Incident> = {}): Incident => ({
  ...createIncident(
    id,
    {
      title: `Incident ${id}`,
      description: "",
      severity: 2,
      source: "manual",
      owningTeam: "Platform",
      createdBy: "ops",
      affectedServices: [],
      customersImpacted: 0,
    },
    NOW
  ),
  ...over,
});

describe("incident linking", () => {
  it("writes the relationship into both records", () => {
    const a = inc("INC-1");
    const b = inc("INC-2");
    const r = link(a, b, "caused-by", "ops", NOW);

    expect(r.error).toBe("");
    expect(r.from.links).toEqual([{ id: "INC-2", kind: "caused-by", at: NOW, by: "ops" }]);
    // The other end must carry the inverse, not a copy: B causes A.
    expect(r.to.links).toEqual([{ id: "INC-1", kind: "causes", at: NOW, by: "ops" }]);
  });

  it("keeps symmetric kinds symmetric", () => {
    const r = link(inc("INC-1"), inc("INC-2"), "duplicate-of", "ops", NOW);
    expect(r.from.links![0].kind).toBe("duplicate-of");
    expect(r.to.links![0].kind).toBe("duplicate-of");

    const rel = link(inc("INC-3"), inc("INC-4"), "related-to", "ops", NOW);
    expect(rel.to.links![0].kind).toBe("related-to");
  });

  it("records the link on both timelines", () => {
    const r = link(inc("INC-1"), inc("INC-2"), "causes", "ops", NOW);
    expect(r.from.timeline.at(-1)!.kind).toBe("linked");
    expect(r.from.timeline.at(-1)!.text).toContain("causes INC-2");
    expect(r.to.timeline.at(-1)!.text).toContain("caused by INC-1");
  });

  it("refuses to link an incident to itself", () => {
    const a = inc("INC-1");
    const r = link(a, a, "related-to", "ops", NOW);
    expect(r.error).toContain("itself");
    expect(r.from.links).toBeUndefined();
  });

  it("refuses a duplicate link rather than adding a second one", () => {
    const first = link(inc("INC-1"), inc("INC-2"), "related-to", "ops", NOW);
    const second = link(first.from, first.to, "caused-by", "ops", NOW);

    expect(second.error).toContain("Already linked");
    expect(second.from.links).toHaveLength(1);
  });

  it("removes the link from both ends", () => {
    const linked = link(inc("INC-1"), inc("INC-2"), "related-to", "ops", NOW);
    const r = unlink(linked.from, linked.to, "ops", at(5));

    expect(r.error).toBe("");
    expect(r.from.links).toEqual([]);
    expect(r.to.links).toEqual([]);
  });

  it("refuses to unlink incidents that are not linked", () => {
    const r = unlink(inc("INC-1"), inc("INC-2"), "ops", NOW);
    expect(r.error).toContain("not linked");
  });
});

describe("dedupe", () => {
  it("keeps the older incident and drops the one that duplicates it", () => {
    const older = inc("INC-1", { createdAt: at(-60) });
    const newer = inc("INC-2", { createdAt: at(-10) });
    const r = link(newer, older, "duplicate-of", "ops", NOW);

    const kept = dedupe([r.from, r.to]);
    expect(kept.map((i) => i.id)).toEqual(["INC-1"]);
  });

  it("does not drop anything for a non-duplicate link", () => {
    const r = link(inc("INC-1", { createdAt: at(-60) }), inc("INC-2", { createdAt: at(-10) }), "related-to", "ops", NOW);
    expect(dedupe([r.from, r.to])).toHaveLength(2);
  });

  it("breaks a tie on id so the result does not depend on array order", () => {
    const a = inc("INC-A", { createdAt: at(-10) });
    const b = inc("INC-B", { createdAt: at(-10) });
    const r = link(a, b, "duplicate-of", "ops", NOW);

    expect(dedupe([r.from, r.to]).map((i) => i.id)).toEqual(["INC-A"]);
    expect(dedupe([r.to, r.from]).map((i) => i.id)).toEqual(["INC-A"]);
  });

  it("ignores a link to an incident that is not in the set", () => {
    const orphan = inc("INC-1", { links: [{ id: "INC-GONE", kind: "duplicate-of", at: NOW, by: "ops" }] });
    expect(dedupe([orphan])).toHaveLength(1);
  });

  it("lists the ids an incident duplicates", () => {
    const r = link(inc("INC-2"), inc("INC-1"), "duplicate-of", "ops", NOW);
    expect(duplicateIds(r.from)).toEqual(["INC-1"]);
    expect(duplicateIds(inc("INC-3"))).toEqual([]);
  });
});

describe("on-call rotation", () => {
  const rota: Rotation[] = [
    {
      team: "Platform",
      shifts: [
        { team: "Platform", who: "asha", startsAt: at(-120), endsAt: at(-60) },
        { team: "Platform", who: "ben", startsAt: at(-60), endsAt: at(60) },
      ],
    },
  ];

  it("names whoever holds the shift covering now", () => {
    expect(onCallFor(rota, "Platform", NOW)!.who).toBe("ben");
    expect(onCallFor(rota, "Platform", at(-90))!.who).toBe("asha");
  });

  it("treats a shift as half-open so back-to-back shifts do not both match", () => {
    // at(-60) is ben's start and asha's end: exactly one of them is on call.
    expect(onCallFor(rota, "Platform", at(-60))!.who).toBe("ben");
  });

  it("returns null for a hole in the rota rather than naming somebody", () => {
    expect(onCallFor(rota, "Platform", at(600))).toBeNull();
    expect(onCallFor(rota, "Platform", at(-600))).toBeNull();
  });

  it("returns null for a team with no rota at all", () => {
    expect(onCallFor(rota, "Firmware", NOW)).toBeNull();
  });

  it("prefers the later shift when two overlap", () => {
    const overlapping: Rotation[] = [
      {
        team: "Platform",
        shifts: [
          { team: "Platform", who: "asha", startsAt: at(-120), endsAt: at(120) },
          { team: "Platform", who: "ben", startsAt: at(-30), endsAt: at(120) },
        ],
      },
    ];
    expect(onCallFor(overlapping, "Platform", NOW)!.who).toBe("ben");
  });

  it("finds the gaps in a window", () => {
    const gaps = rotationGaps(rota[0], at(-180), at(180));
    expect(gaps).toEqual([
      { from: at(-180), to: at(-120) },
      { from: at(60), to: at(180) },
    ]);
  });

  it("reports a fully uncovered window as one gap", () => {
    expect(rotationGaps({ team: "X", shifts: [] }, at(0), at(60))).toEqual([{ from: at(0), to: at(60) }]);
  });

  it("reports no gaps when the window is covered", () => {
    expect(rotationGaps(rota[0], at(-30), at(30))).toEqual([]);
  });
});

describe("autoAssign", () => {
  const rota: Rotation[] = [
    { team: "Platform", shifts: [{ team: "Platform", who: "ben", startsAt: at(-60), endsAt: at(60) }] },
  ];

  it("assigns an unowned incident to the person on call", () => {
    const r = autoAssign(inc("INC-1", { assignedTo: "" }), rota, NOW);
    expect(r.error).toBe("");
    expect(r.incident.assignedTo).toBe("ben");
    expect(r.incident.timeline.at(-1)!.text).toContain("on call");
  });

  it("leaves an incident somebody is already working on alone", () => {
    const r = autoAssign(inc("INC-1", { assignedTo: "asha" }), rota, NOW);
    expect(r.error).toBe("Already assigned.");
    expect(r.incident.assignedTo).toBe("asha");
  });

  it("does not assign a closed incident", () => {
    const r = autoAssign(inc("INC-1", { assignedTo: "", status: "resolved", resolvedAt: NOW }), rota, NOW);
    expect(r.error).toBe("Not open.");
  });

  it("says so when nobody is on call, instead of picking someone", () => {
    const r = autoAssign(inc("INC-1", { assignedTo: "", owningTeam: "Firmware" }), rota, NOW);
    expect(r.error).toContain("Nobody is on call");
    expect(r.incident.assignedTo).toBe("");
  });
});

describe("saved views", () => {
  const views: SavedView[] = [
    { id: "1", name: "Zulu", filters: {}, createdBy: "asha", createdAt: NOW, shared: false },
    { id: "2", name: "Alpha", filters: {}, createdBy: "ben", createdAt: NOW, shared: true },
    { id: "3", name: "Bravo", filters: {}, createdBy: "ben", createdAt: NOW, shared: false },
    { id: "4", name: "Charlie", filters: {}, createdBy: "asha", createdAt: NOW, shared: true },
  ];

  it("shows shared views and the viewer's own, and nobody else's private ones", () => {
    expect(visibleViews(views, "asha").map((v) => v.name)).toEqual(["Alpha", "Charlie", "Zulu"]);
    expect(visibleViews(views, "ben").map((v) => v.name)).toEqual(["Alpha", "Charlie", "Bravo"]);
  });

  it("puts shared views first so the list does not reorder as views are added", () => {
    const seen = visibleViews(views, "asha");
    expect(seen.slice(0, 2).every((v) => v.shared)).toBe(true);
  });
});

describe("queue with hideDuplicates", () => {
  it("folds a duplicate into the incident it duplicates", () => {
    const older = inc("INC-1", { createdAt: at(-60) });
    const newer = inc("INC-2", { createdAt: at(-10) });
    const { from, to } = link(newer, older, "duplicate-of", "ops", NOW);

    expect(queue([from, to], { status: "open" }, NOW).map((i) => i.id).sort()).toEqual(["INC-1", "INC-2"]);
    expect(queue([from, to], { status: "open", hideDuplicates: true }, NOW).map((i) => i.id)).toEqual(["INC-1"]);
  });

  it("dedupes against the whole set, not the filtered view", () => {
    // The original is acknowledged and so falls outside a status:active filter.
    // Its duplicate must still be folded away — otherwise filtering makes a
    // duplicate reappear as though it were the incident.
    const original = acknowledge(inc("INC-1", { createdAt: at(-60) }), "ops", at(-50)).incident;
    const { from } = link(inc("INC-2", { createdAt: at(-10) }), original, "duplicate-of", "ops", NOW);

    const shown = queue([from, original], { status: "active", hideDuplicates: true }, NOW);
    expect(shown).toHaveLength(0);
  });
});

describe("outstanding action items", () => {
  /** An incident all the way through to a postmortem with actions on it. */
  const withActions = (
    id: string,
    severity: 0 | 1 | 2 | 3 | 4,
    items: { what: string; owner: string; due?: string }[]
  ) => {
    let i = inc(id, { severity });
    i = acknowledge(i, "ops", at(1)).incident;
    i = mitigate(i, "ops", "restarted", at(2)).incident;
    i = resolve(i, "ops", "a bad deploy", at(3)).incident;
    i = savePostmortem(i, "ops", { summary: "s", cause: "c", detection: "d" }, at(4)).incident;
    for (const item of items) {
      i = addActionItem(i, "ops", { what: item.what, owner: item.owner, due: item.due ?? "" }, at(5)).incident;
    }
    return i;
  };

  it("collects unfinished actions from across every incident", () => {
    const a = withActions("INC-1", 2, [{ what: "Add a retry", owner: "asha" }]);
    const b = withActions("INC-2", 3, [{ what: "Alert on queue depth", owner: "ben" }]);

    expect(openActionItems([a, b]).map((x) => x.what)).toEqual(["Add a retry", "Alert on queue depth"]);
  });

  it("leaves out the ones that are done", () => {
    let a = withActions("INC-1", 2, [
      { what: "Add a retry", owner: "asha" },
      { what: "Write the runbook", owner: "asha" },
    ]);
    const first = a.postmortem!.actionItems[0].id;
    a = toggleActionItem(a, "asha", first, at(10)).incident;

    expect(openActionItems([a]).map((x) => x.what)).toEqual(["Write the runbook"]);
  });

  it("carries the incident it came from, so it can be opened", () => {
    const a = withActions("INC-1", 1, [{ what: "Add a retry", owner: "asha", due: "next sprint" }]);
    const [item] = openActionItems([a]);

    expect(item.incidentId).toBe("INC-1");
    expect(item.incidentTitle).toBe("Incident INC-1");
    expect(item.severity).toBe(1);
    expect(item.due).toBe("next sprint");
    expect(item.since).toBe(at(3));
  });

  it("orders by the severity of the incident that produced it", () => {
    // An action from a Sev1 is not the same commitment as one from a Sev4.
    const low = withActions("INC-9", 4, [{ what: "Tidy the logs", owner: "ben" }]);
    const high = withActions("INC-1", 1, [{ what: "Fix the root cause", owner: "asha" }]);

    expect(openActionItems([low, high]).map((x) => x.what)).toEqual([
      "Fix the root cause",
      "Tidy the logs",
    ]);
  });

  it("returns nothing for incidents with no postmortem", () => {
    expect(openActionItems([inc("INC-1")])).toEqual([]);
  });

  it("groups by owner, most-owed first", () => {
    const a = withActions("INC-1", 2, [
      { what: "one", owner: "asha" },
      { what: "two", owner: "asha" },
      { what: "three", owner: "ben" },
    ]);

    expect(actionsByOwner([a]).map((g) => `${g.owner}:${g.items.length}`)).toEqual(["asha:2", "ben:1"]);
  });

  it("cannot produce an ownerless action, because the model refuses to store one", () => {
    // Worth pinning: the grouping had an "unassigned" bucket that could never
    // be reached, which is the same dead-control defect this codebase keeps
    // growing. addActionItem is where the rule lives.
    const base = withActions("INC-1", 2, [{ what: "real one", owner: "asha" }]);
    const rejected = addActionItem(base, "ops", { what: "somebody should", owner: "  ", due: "" }, at(6));

    expect(rejected.error).toContain("owner");
    expect(actionsByOwner([base]).map((g) => g.owner)).toEqual(["asha"]);
  });
});