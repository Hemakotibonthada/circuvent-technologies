/**
 * The incident queue: severity at a glance, and bulk work.
 *
 * IcM's queue is readable before any of it is read — a colour bar down the left
 * edge says how bad each row is, and a checkbox column lets one person clear
 * eleven incidents filed by one rollout without opening eleven pages.
 *
 * Both are easy to build so they look right and do nothing: a bar drawn in one
 * colour for every severity, a checkbox that ticks but is not counted, a bulk
 * toolbar whose buttons are permanently disabled. So these tests assert the bar
 * differs per severity, the selection is counted, and the buttons fire.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IcmPanel from "@/app/admin/IcmPanel";
import type { Incident, Severity } from "@/lib/icm";

const NOW = new Date("2026-02-10T12:00:00.000Z").toISOString();
const NOW_MS = Date.parse(NOW);

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1000",
    title: "Camera streams dropping frames",
    description: "",
    severity: 2 as Severity,
    status: "active",
    source: "monitor",
    owningTeam: "Firmware",
    assignedTo: "",
    createdBy: "monitor",
    createdAt: new Date(NOW_MS - 20 * 60_000).toISOString(),
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: new Date(NOW_MS - 20 * 60_000).toISOString(),
    affectedServices: ["camera"],
    customersImpacted: 10,
    mitigation: "",
    rootCause: "",
    timeline: [],
    tags: [],
    slaAckMins: 15,
    slaMitigateMins: 120,
    escalations: 0,
    links: [],
    ...over,
  };
}

const QUEUE = [
  incident({ id: "INC-1001", severity: 0 as Severity, title: "Broker down", affectedServices: ["mqtt"] }),
  incident({ id: "INC-1002", severity: 4 as Severity, title: "Docs typo", affectedServices: [] }),
];

/** Every PATCH the bulk toolbar sends, so the test can count them. */
let patches: Array<Record<string, unknown>> = [];

function mockFetch(queue: Incident[] = QUEUE) {
  patches = [];
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "PATCH") {
      patches.push(JSON.parse(String(init.body)));
      return {
        ok: true,
        json: async () => ({ success: true, incident: queue[0] }),
      } as unknown as Response;
    }
    if (u.startsWith("/api/admin/icm")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          incidents: queue,
          stats: null,
          teams: ["Firmware", "Cloud"],
          views: [],
          onCall: {},
          teamContacts: {},
          postmortemsDue: [],
          actionsOutstanding: [],
          now: NOW,
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ success: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  mockFetch();
  jest.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

async function rows() {
  const broker = await screen.findByText("Broker down");
  const typo = await screen.findByText("Docs typo");
  return {
    sev0: broker.closest("tr") as HTMLTableRowElement,
    sev4: typo.closest("tr") as HTMLTableRowElement,
  };
}

describe("incident queue", () => {
  it("colours the left edge by severity, not by one colour for everything", async () => {
    render(<IcmPanel />);
    const { sev0, sev4 } = await rows();

    const a = sev0.getAttribute("style") || "";
    const b = sev4.getAttribute("style") || "";
    expect(a).toContain("inset 4px 0 0");
    expect(b).toContain("inset 4px 0 0");
    // A bar that renders identically for Sev 0 and Sev 4 conveys nothing.
    expect(a).not.toEqual(b);
  });

  it("gives the owning service its own column instead of a subtitle", async () => {
    render(<IcmPanel />);
    expect(await screen.findByRole("columnheader", { name: /owning service/i })).toBeInTheDocument();
    const { sev0 } = await rows();
    expect(within(sev0).getByText("mqtt")).toBeInTheDocument();
  });

  it("says an incident is unassigned rather than leaving a dash to interpret", async () => {
    render(<IcmPanel />);
    const { sev0 } = await rows();
    expect(within(sev0).getByText("unassigned")).toBeInTheDocument();
  });

  it("hides the bulk toolbar until something is selected", async () => {
    render(<IcmPanel />);
    await rows();
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it("counts the selection", async () => {
    const user = userEvent.setup();
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });

  it("selects every row from the header checkbox", async () => {
    const user = userEvent.setup();
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: /select every incident/i }));
    expect(await screen.findByText("2 selected")).toBeInTheDocument();
  });

  /*
   * The load-bearing one. A checkbox that ticks and a button that is enabled
   * still add up to nothing unless the request is actually sent, once per
   * selected incident.
   */
  it("sends one request per selected incident", async () => {
    const user = userEvent.setup();
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: /select every incident/i }));
    await user.click(await screen.findByRole("button", { name: /^Acknowledge$/ }));

    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches.map((p) => p.id).sort()).toEqual(["INC-1001", "INC-1002"]);
    expect(patches.every((p) => p.action === "acknowledge")).toBe(true);
  });

  it("does not open the incident when the checkbox is ticked", async () => {
    const user = userEvent.setup();
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    // The detail replaces the table; the queue header proves we are still on it.
    expect(screen.getByRole("columnheader", { name: /owning service/i })).toBeInTheDocument();
  });

  it("clears the selection after the bulk action runs", async () => {
    const user = userEvent.setup();
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    await user.click(await screen.findByRole("button", { name: /^Acknowledge$/ }));

    await waitFor(() => expect(screen.queryByText("1 selected")).not.toBeInTheDocument());
  });

  /*
   * Mitigate and resolve write their note into the incident's mitigation and
   * root cause. A canned string would be stamped onto every selected record and
   * would still be there at the postmortem, so the note has to come from the
   * person doing it.
   */
  it("asks for a note before bulk mitigating, and sends what was typed", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "prompt").mockReturnValue("Rolled the fleet back to 1.11.4.");
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    await user.click(await screen.findByRole("button", { name: /^Mitigate$/ }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].note).toBe("Rolled the fleet back to 1.11.4.");
  });

  it("sends nothing when the note is left blank", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "prompt").mockReturnValue("   ");
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    await user.click(await screen.findByRole("button", { name: /^Resolve$/ }));

    await new Promise((r) => setTimeout(r, 50));
    expect(patches).toHaveLength(0);
  });

  it("does not demand a note to acknowledge, which records no text", async () => {
    const user = userEvent.setup();
    const p = jest.spyOn(window, "prompt");
    render(<IcmPanel />);
    await rows();

    await user.click(screen.getByRole("checkbox", { name: "Select INC-1001" }));
    await user.click(await screen.findByRole("button", { name: /^Acknowledge$/ }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(p).not.toHaveBeenCalled();
  });
});
