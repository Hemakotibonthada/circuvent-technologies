import { checkTrigger } from "./trigger-checks";

describe("checkTrigger — silence when there is nothing useful to say", () => {
  it("says nothing before a field is typed", () => {
    expect(checkTrigger({ field: "", op: ">", state: { level: 40 } }).message).toBeNull();
  });

  it("says nothing when the device has never reported", () => {
    // A device can be claimed before it first publishes. Warning here would be
    // noise on every new device, and noise trains people to ignore the line.
    expect(checkTrigger({ field: "level", op: ">", state: null }).message).toBeNull();
    expect(checkTrigger({ field: "level", op: ">", state: {} }).message).toBeNull();
  });

  it("says nothing about a field that exists and a sane comparison", () => {
    expect(checkTrigger({ field: "level", op: "<", state: { level: 40 } }).message).toBeNull();
    expect(checkTrigger({ field: "leak", op: "truthy", state: { leak: false } }).message).toBeNull();
    expect(checkTrigger({ field: "mode", op: "==", state: { mode: "auto" } }).message).toBeNull();
  });
});

describe("checkTrigger — a field the device has not reported", () => {
  it("warns rather than refuses, because the field may appear later", () => {
    // This is the important case. A leak sensor does not publish `leak` until
    // there is a leak, so refusing an unreported field would block precisely
    // the safety rules worth writing.
    const r = checkTrigger({ field: "leak", op: "truthy", state: { level: 40, temp: 22 } });
    expect(r.level).toBe("warn");
    expect(r.message).toMatch(/has not reported/i);
    expect(r.message).toMatch(/will not fire until/i);
  });

  it("lists what the device does report, so the operator can correct it", () => {
    const r = checkTrigger({ field: "somethingElse", op: "truthy", state: { level: 40, temp: 22 } });
    expect(r.message).toContain("level");
    expect(r.message).toContain("temp");
  });

  it("suggests the abbreviation the device actually uses", () => {
    // The commonest real mistake: typing the full word when firmware reports a
    // short one. Seven edits apart, so only the prefix arm catches it.
    const r = checkTrigger({ field: "temperature", op: ">", state: { temp: 22 } });
    expect(r.message).toMatch(/did you mean "temp"/i);
  });

  it("suggests the longer name when firmware is the verbose one", () => {
    const r = checkTrigger({ field: "power", op: "truthy", state: { power2: true } });
    expect(r.message).toMatch(/did you mean "power2"/i);
  });

  it("does not guess when several keys share the prefix", () => {
    // power2 / power3 / power4 are all plausible. Listing beats picking.
    const r = checkTrigger({ field: "power", op: "truthy", state: { power2: true, power3: false } });
    expect(r.message).not.toMatch(/did you mean/i);
    expect(r.message).toContain("power2");
  });

  it("does not let a short stub match everything", () => {
    // `plug` matching `plumbing` was a real bug in the shop's search.
    const r = checkTrigger({ field: "le", op: ">", state: { level: 40, leak: false } });
    expect(r.message).not.toMatch(/did you mean/i);
  });

  it("catches a transposition, the commonest typo", () => {
    // `levle` is two edits under plain Levenshtein and one under OSA. Without
    // transposition handling this suggestion would not be offered at all.
    const r = checkTrigger({ field: "levle", op: ">", state: { level: 40 } });
    expect(r.message).toMatch(/did you mean "level"/i);
  });

  it("does not offer a confidently wrong suggestion", () => {
    // "pump" and "temp" differ by two on a four-letter word: a different word,
    // not a typo. A wrong suggestion is worse than none.
    const r = checkTrigger({ field: "pump", op: "truthy", state: { temp: 22 } });
    expect(r.message).not.toMatch(/did you mean/i);
    expect(r.message).toContain("temp");
  });
});

describe("checkTrigger — comparisons that cannot work", () => {
  it("rejects a numeric comparison on a boolean and offers the fix", () => {
    const r = checkTrigger({ field: "power", op: ">", state: { power: true } });
    expect(r.level).toBe("error");
    expect(r.message).toMatch(/true\/false/i);
    expect(r.message).toMatch(/truthy/i);
  });

  it.each([">", ">=", "<", "<="] as const)("rejects %s on a boolean", (op) => {
    expect(checkTrigger({ field: "power", op, state: { power: false } }).level).toBe("error");
  });

  it("allows equality on a boolean", () => {
    // `power == false` is unusual but it does work, so it is not our business.
    expect(checkTrigger({ field: "power", op: "==", state: { power: true } }).message).toBeNull();
  });

  it("warns that a numeric comparison on text sorts alphabetically", () => {
    const r = checkTrigger({ field: "mode", op: ">", state: { mode: "auto" } });
    expect(r.level).toBe("error");
    expect(r.message).toMatch(/alphabetically/i);
  });

  it("leaves real numeric comparisons alone", () => {
    for (const op of ["<", "<=", ">", ">="] as const) {
      expect(checkTrigger({ field: "level", op, state: { level: 40 } }).message).toBeNull();
    }
  });
});
