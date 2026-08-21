import {
  addAttachment,
  removeAttachment,
  isAutomatedActor,
  formatBytes,
  createIncident,
  type Incident,
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

describe("addAttachment", () => {
  it("records the file and writes a timeline entry in the same step", () => {
    const r = addAttachment(
      inc("INC-1"),
      "asha",
      { key: "icm/INC-1/abc123.png", name: "graph.png", size: 4096, contentType: "image/png" },
      at(1)
    );

    expect(r.error).toBe("");
    expect(r.incident.attachments).toHaveLength(1);
    const att = r.incident.attachments![0];
    expect(att).toMatchObject({
      key: "icm/INC-1/abc123.png",
      name: "graph.png",
      size: 4096,
      contentType: "image/png",
      uploadedBy: "asha",
      uploadedAt: at(1),
    });

    const last = r.incident.timeline.at(-1)!;
    expect(last.kind).toBe("attachment");
    expect(last.actor).toBe("asha");
    expect(last.text).toContain("graph.png");
    expect(last.text).toContain("4.0 KB");
  });

  it("gives the timeline entry the attachment's own id, so a row can be looked up back to its file", () => {
    // This is the whole point of the design: a download button on a timeline
    // row is `attachments.find(a => a.id === entry.id)`, not a parse of the
    // human-readable text. If the ids ever drift apart, that lookup silently
    // stops finding anything and every "attached x" row loses its download.
    const r = addAttachment(
      inc("INC-1"),
      "asha",
      { key: "icm/INC-1/abc.png", name: "a.png", size: 10, contentType: "image/png" },
      at(1)
    );
    const att = r.incident.attachments![0];
    const entry = r.incident.timeline.at(-1)!;
    expect(entry.id).toBe(att.id);
  });

  it("appends to any attachments already on the incident rather than replacing them", () => {
    let i = addAttachment(inc("INC-1"), "asha", { key: "k1", name: "one.png", size: 1, contentType: "image/png" }, at(1))
      .incident;
    i = addAttachment(i, "ben", { key: "k2", name: "two.png", size: 2, contentType: "image/png" }, at(2)).incident;

    expect(i.attachments!.map((a) => a.name)).toEqual(["one.png", "two.png"]);
  });

  it("refuses a record with no stored key", () => {
    const r = addAttachment(inc("INC-1"), "asha", { key: "  ", name: "a.png", size: 1, contentType: "image/png" }, at(1));
    expect(r.error).toContain("stored file");
    expect(r.incident.attachments).toBeUndefined();
  });

  it("falls back to a generic name and a safe content type rather than storing empty ones", () => {
    const r = addAttachment(inc("INC-1"), "asha", { key: "k1", name: "   ", size: 1, contentType: "" }, at(1));
    expect(r.incident.attachments![0].name).toBe("attachment");
    expect(r.incident.attachments![0].contentType).toBe("application/octet-stream");
  });

  it("clamps a negative or non-numeric size to zero rather than storing garbage", () => {
    const negative = addAttachment(inc("INC-1"), "asha", { key: "k1", name: "a", size: -5, contentType: "text/plain" }, at(1));
    expect(negative.incident.attachments![0].size).toBe(0);

    const notANumber = addAttachment(
      inc("INC-2"),
      "asha",
      { key: "k1", name: "a", size: Number.NaN, contentType: "text/plain" },
      at(1)
    );
    expect(notANumber.incident.attachments![0].size).toBe(0);
  });
});

describe("removeAttachment", () => {
  it("drops the attachment and records who removed it", () => {
    const withFile = addAttachment(
      inc("INC-1"),
      "asha",
      { key: "k1", name: "a.png", size: 10, contentType: "image/png" },
      at(1)
    ).incident;
    const id = withFile.attachments![0].id;

    const r = removeAttachment(withFile, "ben", id, at(2));
    expect(r.error).toBe("");
    expect(r.incident.attachments).toEqual([]);
    const last = r.incident.timeline.at(-1)!;
    expect(last.kind).toBe("attachment");
    expect(last.actor).toBe("ben");
    expect(last.text).toContain("a.png");
  });

  it("does not reuse the attachment's id for the removal entry", () => {
    // Deliberately the opposite of addAttachment: nothing should be
    // downloadable from a row that says a file is gone, so the removal gets a
    // fresh id from entry() rather than the (now-deleted) attachment's own.
    const withFile = addAttachment(
      inc("INC-1"),
      "asha",
      { key: "k1", name: "a.png", size: 10, contentType: "image/png" },
      at(1)
    ).incident;
    const id = withFile.attachments![0].id;

    const r = removeAttachment(withFile, "ben", id, at(2));
    expect(r.incident.timeline.at(-1)!.id).not.toBe(id);
  });

  it("leaves other attachments alone", () => {
    let i = addAttachment(inc("INC-1"), "asha", { key: "k1", name: "one.png", size: 1, contentType: "image/png" }, at(1))
      .incident;
    i = addAttachment(i, "asha", { key: "k2", name: "two.png", size: 1, contentType: "image/png" }, at(2)).incident;
    const keepId = i.attachments!.find((a) => a.name === "two.png")!.id;
    const dropId = i.attachments!.find((a) => a.name === "one.png")!.id;

    const r = removeAttachment(i, "ben", dropId, at(3));
    expect(r.incident.attachments!.map((a) => a.id)).toEqual([keepId]);
  });

  it("errors on an attachment id that does not exist, and changes nothing", () => {
    const base = inc("INC-1");
    const r = removeAttachment(base, "ben", "no-such-id", at(1));
    expect(r.error).toBe("No such attachment.");
    expect(r.incident).toBe(base);
  });
});

describe("isAutomatedActor", () => {
  it("is true for the platform's own actors", () => {
    expect(isAutomatedActor("monitor")).toBe(true);
    expect(isAutomatedActor("icm-release")).toBe(true);
    expect(isAutomatedActor("icm-escalation")).toBe(true);
    expect(isAutomatedActor("icm-oncall")).toBe(true);
  });

  it("is false for a person", () => {
    expect(isAutomatedActor("asha")).toBe(false);
    expect(isAutomatedActor("asha@example.com")).toBe(false);
  });

  it("is false for 'unknown', on purpose", () => {
    // unknown is the guard's own fallback for a request it could not
    // attribute — marking it automated would hide the one case that should
    // look most suspicious in an audit: a change nobody can be shown to have
    // made.
    expect(isAutomatedActor("unknown")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("shows small sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(480)).toBe("480 B");
  });

  it("switches units at 1024 and keeps one decimal place under 10", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12 * 1024 * 1024)).toBe("12 MB");
  });

  it("returns a dash for a negative or non-finite size rather than a nonsense number", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
