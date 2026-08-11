import {
  SLA,
  acknowledge,
  ackClock,
  assign,
  comment,
  createIncident,
  formatMins,
  impactMinutes,
  isOpen,
  mitigate,
  mitigateClock,
  normaliseSeverity,
  overallSla,
  queue,
  reactivate,
  resolve,
  setSeverity,
  stats,
  type Incident,
  type Severity,
} from "@/lib/icm";

/*
 * Every interesting thing in this module is time-dependent, and time-dependent
 * code is where "looks right" and "is right" diverge silently. A breach that is
 * measured from the wrong instant, or judged against the clock at read time
 * instead of at the time it happened, produces numbers that are plausible,
 * stable, and wrong — and the report is only checked when somebody is arguing
 * about it months later.
 *
 * So: fixed timestamps everywhere, and the cases that matter are the boundary
 * ones — the minute before a deadline, the minute after, and exactly on it.
 */
const T = (mins: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + mins * 60_000).toISOString();
const T0 = T(0);

function make(over: Partial<Parameters<typeof createIncident>[1]> = {}, now = T0): Incident {
  return createIncident(
    "INC-1",
    { title: "Hub offline", severity: 1, owningTeam: "Platform", createdBy: "ada", ...over },
    now
  );
}

describe("creating an incident", () => {
  it("starts active, unacknowledged, and owned by nobody until someone takes it", () => {
    const inc = make();
    expect(inc.status).toBe("active");
    expect(inc.acknowledgedAt).toBeNull();
    expect(inc.assignedTo).toBe("");
    expect(isOpen(inc)).toBe(true);
  });

  it("records who filed it and why, in the timeline", () => {
    const inc = make();
    expect(inc.timeline).toHaveLength(1);
    expect(inc.timeline[0].kind).toBe("created");
    expect(inc.timeline[0].actor).toBe("ada");
  });

  /*
   * The SLA is snapshotted, not looked up on display. If the targets are ever
   * edited, last quarter's incidents must still be judged against the promise
   * that was made at the time — otherwise a policy change silently rewrites
   * history and the breach report changes without any incident changing.
   */
  it("snapshots the SLA rather than referring to the table later", () => {
    const inc = make({ severity: 0 });
    expect(inc.slaAckMins).toBe(SLA[0].ack);
    expect(inc.slaMitigateMins).toBe(SLA[0].mitigate);
  });

  it("clamps a future impact time to now", () => {
    /* Otherwise elapsed goes negative and the SLA gets healthier as it ages. */
    const inc = make({ impactStartedAt: T(600) }, T0);
    expect(inc.impactStartedAt).toBe(T0);
  });

  it("accepts an impact time before the report", () => {
    const inc = make({ impactStartedAt: T(-45) }, T0);
    expect(inc.impactStartedAt).toBe(T(-45));
  });

  it.each([
    [-1, 3],
    [5, 3],
    ["nonsense", 3],
    [null, 3],
    [0, 0],
    [4, 4],
  ])("normalises severity %p to Sev%p", (input, expected) => {
    expect(normaliseSeverity(input)).toBe(expected);
  });
});

describe("the acknowledge clock", () => {
  /* Sev1 allows 15 minutes. */
  it("is on track early on", () => {
    const inc = make({ severity: 1 });
    expect(ackClock(inc, T(1)).state).toBe("on-track");
  });

  it("goes at-risk at 80% of the budget, not at 100%", () => {
    const inc = make({ severity: 1 });
    /* 80% of 15 is 12. */
    expect(ackClock(inc, T(11)).state).toBe("on-track");
    expect(ackClock(inc, T(12)).state).toBe("at-risk");
  });

  it("is still only at-risk on the deadline itself", () => {
    const inc = make({ severity: 1 });
    expect(ackClock(inc, T(15)).state).toBe("at-risk");
    expect(ackClock(inc, T(16)).state).toBe("breached");
  });

  /*
   * The important one. A breach is a fact about the past: once an incident is
   * acknowledged, the state must be computed from when that happened, not from
   * the current time. Judging against `now` would turn every historical
   * incident into a breach as soon as enough time passed.
   */
  it("freezes once acknowledged, however long ago that was", () => {
    const inc = acknowledge(make({ severity: 1 }), "ada", T(10)).incident;
    expect(ackClock(inc, T(10)).state).toBe("met");
    expect(ackClock(inc, T(10_000)).state).toBe("met");
    expect(ackClock(inc, T(10)).actualMins).toBe(10);
  });

  it("stays breached once it was acknowledged late", () => {
    const inc = acknowledge(make({ severity: 1 }), "ada", T(40)).incident;
    expect(ackClock(inc, T(41)).state).toBe("breached");
    expect(ackClock(inc, T(99_999)).state).toBe("breached");
  });
});

describe("the mitigate clock", () => {
  /*
   * Measured from impact, not from when somebody got round to filing. Starting
   * the clock at creation would flatter the number by exactly the time it took
   * to notice — rewarding poor detection.
   */
  it("runs from when customers started hurting, not from the report", () => {
    const inc = make({ severity: 1, impactStartedAt: T(-120) }, T0);
    /* Sev1 allows 240 minutes; 120 are already gone. */
    const c = mitigateClock(inc, T0);
    expect(c.minutesRemaining).toBe(120);
  });

  it("can be breached the moment it is filed, if impact started long ago", () => {
    const inc = make({ severity: 1, impactStartedAt: T(-500) }, T0);
    expect(mitigateClock(inc, T0).state).toBe("breached");
  });

  /* Sev4 is a "fix it eventually" bucket; a deadline there only teaches
     people to ignore deadlines. The acknowledge clock still applies — an
     ignored Sev4 is still ignored — so this checks mitigation alone. */
  it("does not apply to Sev4", () => {
    const acked = acknowledge(make({ severity: 4 }), "ada", T(1)).incident;
    expect(mitigateClock(acked, T(100_000)).state).toBe("n/a");
    expect(overallSla(acked, T(100_000))).not.toBe("breached");
  });

  it("still holds Sev4 to its acknowledge target", () => {
    const inc = make({ severity: 4 });
    expect(overallSla(inc, T(100_000))).toBe("breached");
  });

  it("stops at mitigation, not at resolution", () => {
    let inc = make({ severity: 1 });
    inc = mitigate(inc, "ada", "failed over", T(30)).incident;
    inc = resolve(inc, "ada", "bad deploy", T(5000)).incident;
    expect(mitigateClock(inc, T(6000)).actualMins).toBe(30);
    expect(impactMinutes(inc, T(6000))).toBe(30);
  });
});

describe("acknowledging", () => {
  it("assigns whoever acknowledged, if nobody owned it", () => {
    const inc = acknowledge(make(), "grace", T(3)).incident;
    expect(inc.status).toBe("acknowledged");
    expect(inc.assignedTo).toBe("grace");
  });

  it("does not steal an existing assignment", () => {
    const inc = acknowledge(make({ assignedTo: "ada" }), "grace", T(3)).incident;
    expect(inc.assignedTo).toBe("ada");
  });

  it("refuses to acknowledge twice", () => {
    const first = acknowledge(make(), "ada", T(3)).incident;
    const second = acknowledge(first, "grace", T(4));
    expect(second.error).not.toBe("");
    expect(second.incident.acknowledgedAt).toBe(T(3));
  });
});

describe("mitigating and resolving", () => {
  /*
   * Mitigating without acknowledging is normal — somebody fixes it before
   * touching the ticket. Backfilling keeps TTA honest instead of leaving the
   * incident eternally "unacknowledged", but it is stamped at the time of
   * mitigation, so a late response still reads as late.
   */
  it("backfills the acknowledgement, and it still counts as late", () => {
    const inc = mitigate(make({ severity: 1 }), "ada", "restarted", T(200)).incident;
    expect(inc.acknowledgedAt).toBe(T(200));
    expect(ackClock(inc, T(201)).state).toBe("breached");
  });

  it("resolving backfills both earlier milestones", () => {
    const inc = resolve(make(), "ada", "disk full", T(90)).incident;
    expect(inc.acknowledgedAt).toBe(T(90));
    expect(inc.mitigatedAt).toBe(T(90));
    expect(inc.status).toBe("resolved");
    expect(isOpen(inc)).toBe(false);
  });

  it("keeps the real mitigation time when resolving later", () => {
    let inc = mitigate(make(), "ada", "failed over", T(30)).incident;
    inc = resolve(inc, "ada", "bad config", T(900)).incident;
    expect(inc.mitigatedAt).toBe(T(30));
  });

  it("refuses to mitigate or resolve twice", () => {
    const done = resolve(make(), "ada", "x", T(10)).incident;
    expect(resolve(done, "ada", "y", T(20)).error).not.toBe("");
    expect(mitigate(done, "ada", "y", T(20)).error).not.toBe("");
  });
});

describe("reactivating", () => {
  /*
   * A recurrence is evidence the first fix did not work. Restarting the impact
   * clock would hide exactly that, so the original impact time stands.
   */
  it("reopens without resetting the impact clock", () => {
    let inc = resolve(make({ impactStartedAt: T(-10) }, T0), "ada", "fixed", T(30)).incident;
    inc = reactivate(inc, "grace", "came back", T(60)).incident;
    expect(inc.status).toBe("acknowledged");
    expect(inc.mitigatedAt).toBeNull();
    expect(inc.resolvedAt).toBeNull();
    expect(inc.impactStartedAt).toBe(T(-10));
  });

  it("refuses to reactivate something already open", () => {
    expect(reactivate(make(), "ada", "", T(5)).error).not.toBe("");
  });
});

describe("changing severity", () => {
  /*
   * Upgrading an old low-severity incident should immediately show a breach.
   * It was always this urgent; the response was always this late. Re-basing the
   * clocks to the moment of the upgrade would erase that.
   */
  it("re-judges the existing clocks against the new target", () => {
    const inc = make({ severity: 3 }, T0);
    expect(ackClock(inc, T(120)).state).toBe("on-track");

    const raised = setSeverity(inc, "grace", 1, "worse than we thought", T(120)).incident;
    expect(raised.slaAckMins).toBe(SLA[1].ack);
    expect(ackClock(raised, T(120)).state).toBe("breached");
  });

  it("records the direction in words", () => {
    const raised = setSeverity(make({ severity: 3 }), "g", 1, "", T(5)).incident;
    const lowered = setSeverity(make({ severity: 1 }), "g", 3, "", T(5)).incident;
    expect(raised.timeline.at(-1)!.text).toContain("raised");
    expect(lowered.timeline.at(-1)!.text).toContain("lowered");
  });

  it("refuses a no-op", () => {
    expect(setSeverity(make({ severity: 2 }), "g", 2, "", T(5)).error).not.toBe("");
  });
});

describe("assignment and discussion", () => {
  it("routes to a team without an individual", () => {
    const inc = assign(make(), "g", "", "Networking", T(5)).incident;
    expect(inc.owningTeam).toBe("Networking");
    expect(inc.timeline.at(-1)!.text).toContain("routed to Networking");
  });

  it("keeps the comment body, not just the summary", () => {
    const inc = comment(make(), "ada", "  looks like DNS  ", T(5)).incident;
    expect(inc.timeline.at(-1)!.body).toBe("looks like DNS");
  });

  it("refuses an empty comment", () => {
    expect(comment(make(), "ada", "   ", T(5)).error).not.toBe("");
  });
});

describe("the queue", () => {
  const now = T(1000);
  const incidents: Incident[] = [
    make({ title: "old sev3", severity: 3 }, T(0)),
    make({ title: "new sev0", severity: 0 }, T(990)),
    make({ title: "sev1 breached", severity: 1 }, T(0)),
    resolve(make({ title: "done sev0", severity: 0 }, T(0)), "ada", "x", T(5)).incident,
  ];

  it("puts the worst severity first, regardless of age", () => {
    const q = queue(incidents, { status: "open" }, now);
    expect(q[0].title).toBe("new sev0");
  });

  it("hides resolved incidents from the open queue", () => {
    const q = queue(incidents, { status: "open" }, now);
    expect(q.map((i) => i.title)).not.toContain("done sev0");
    expect(queue(incidents, { status: "all" }, now)).toHaveLength(4);
  });

  it("filters by severity, team and free text", () => {
    expect(queue(incidents, { status: "all", severity: 0 }, now)).toHaveLength(2);
    expect(queue(incidents, { status: "all", team: "Nope" }, now)).toHaveLength(0);
    expect(queue(incidents, { status: "all", search: "breached" }, now)).toHaveLength(1);
  });

  it("filters by SLA state so a queue can show only what is going wrong", () => {
    const breached = queue(incidents, { status: "open", slaState: "breached" }, now);
    expect(breached.length).toBeGreaterThan(0);
    for (const inc of breached) expect(overallSla(inc, now)).toBe("breached");
  });
});

describe("statistics", () => {
  const now = T(1000);

  it("counts attainment only over incidents whose clocks have stopped", () => {
    /*
     * Otherwise a quiet afternoon improves the score simply by containing
     * incidents that have not had time to breach yet.
     */
    const open = make({ severity: 0 }, T(0)); // wide open and long breached
    const goodClosed = resolve(make({ severity: 2 }, T(0)), "ada", "x", T(5)).incident;

    const s = stats([open, goodClosed], now);
    expect(s.slaAttainment).toBe(100);
    expect(s.breached).toBe(1);
    expect(s.open).toBe(1);
  });

  it("reports medians over incidents that reached the milestone", () => {
    const a = acknowledge(make({ severity: 1 }, T(0)), "x", T(4)).incident;
    const b = acknowledge(make({ severity: 1 }, T(0)), "x", T(10)).incident;
    const c = make({ severity: 1 }, T(0)); // never acknowledged
    expect(stats([a, b, c], now).medianTta).toBe(7);
  });

  it("is defined for an empty estate", () => {
    const s = stats([], now);
    expect(s.slaAttainment).toBe(100);
    expect(s.medianTta).toBeNull();
    expect(s.open).toBe(0);
  });
});

describe("formatting durations", () => {
  it.each([
    [null, "—"],
    [0, "0m"],
    [59, "59m"],
    [60, "1h"],
    [130, "2h 10m"],
    [1440, "1d"],
    [1740, "1d 5h"],
    [-5, "5m"],
  ])("%p becomes %p", (mins, expected) => {
    expect(formatMins(mins as number | null)).toBe(expected);
  });
});

describe("severity targets", () => {
  it("gets stricter as severity rises", () => {
    const sevs: Severity[] = [0, 1, 2, 3, 4];
    for (let i = 1; i < sevs.length; i++) {
      expect(SLA[sevs[i]].ack).toBeGreaterThan(SLA[sevs[i - 1]].ack);
    }
  });

  it("describes every severity for the UI", () => {
    for (const s of [0, 1, 2, 3, 4] as Severity[]) {
      expect(SLA[s].label).toMatch(/^Sev \d$/);
      expect(SLA[s].blurb.length).toBeGreaterThan(0);
    }
  });
});
