/**
 * Tests for ICM incident link sharing & deep linking.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IcmPanel, {
  copyText,
  getIncidentShareUrl,
  formatIncidentShareSummary,
  IncidentDetail,
} from "@/app/admin/IcmPanel";
import type { Incident, Severity } from "@/lib/icm";

const NOW = new Date("2026-02-10T12:00:00.000Z").toISOString();
const NOW_MS = Date.parse(NOW);

function makeIncident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1001",
    title: "Broker down and disconnecting devices",
    description: "MQTT gateway dropping TCP connections.",
    severity: 1 as Severity,
    status: "active",
    source: "monitor",
    owningTeam: "Cloud",
    assignedTo: "alice@circuvent.com",
    createdBy: "monitor",
    createdAt: new Date(NOW_MS - 20 * 60_000).toISOString(),
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: new Date(NOW_MS - 20 * 60_000).toISOString(),
    affectedServices: ["mqtt-gw", "auth"],
    customersImpacted: 150,
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

describe("ICM Incident Link Sharing Helpers", () => {
  it("generates correct canonical incident share URL", () => {
    const url = getIncidentShareUrl("INC-1001");
    expect(url).toContain("incident=INC-1001");
  });

  it("formats incident summary for chat", () => {
    const inc = makeIncident();
    const shareUrl = "https://icm.circuvent.com/?incident=INC-1001";
    const summary = formatIncidentShareSummary(inc, shareUrl);

    expect(summary).toContain("[INC-1001]");
    expect(summary).toContain("Broker down");
    expect(summary).toContain("Status: Active");
    expect(summary).toContain("Team: Cloud");
    expect(summary).toContain("Services: mqtt-gw, auth");
    expect(summary).toContain(shareUrl);
  });

  it("copies text using navigator.clipboard", async () => {
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const success = await copyText("https://icm.circuvent.com/?incident=INC-1001");
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("https://icm.circuvent.com/?incident=INC-1001");
  });
});

describe("IncidentDetail Share Controls", () => {
  it("renders Copy Link and Share for Chat buttons with feedback", async () => {
    const user = userEvent.setup();
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const inc = makeIncident();
    render(
      <IncidentDetail
        incident={inc}
        now={NOW}
        teams={["Cloud", "Firmware"]}
        busy={false}
        error=""
        onAct={() => {}}
        onIncidentUpdated={() => {}}
        onBack={() => {}}
      />
    );

    const copyBtn = screen.getByRole("button", { name: /copy incident link/i });
    expect(copyBtn).toBeInTheDocument();

    const chatBtn = screen.getByRole("button", { name: /share incident for chat/i });
    expect(chatBtn).toBeInTheDocument();

    // Click Copy Link
    await user.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalled();
    expect(await screen.findByText(/link copied!/i)).toBeInTheDocument();

    // Click Share for Chat
    await user.click(chatBtn);
    expect(await screen.findByText(/chat summary copied!/i)).toBeInTheDocument();
  });
});

describe("IncidentRow Copy Link", () => {
  it("allows copying link directly from queue table without opening row", async () => {
    const user = userEvent.setup();
    const writeTextMock = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const inc = makeIncident();

    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          incidents: [inc],
          stats: null,
          teams: ["Cloud"],
          views: [],
          onCall: {},
          teamContacts: {},
          postmortemsDue: [],
          actionsOutstanding: [],
          now: NOW,
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    render(<IcmPanel />);
    await waitFor(() => expect(screen.getByText("Broker down and disconnecting devices")).toBeInTheDocument());

    const copyBtn = screen.getByRole("button", { name: `Copy link for ${inc.id}` });
    expect(copyBtn).toBeInTheDocument();

    await user.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });
});

describe("IcmPanel Deep Linking", () => {
  it("auto-opens incident detail when ?incident=INC-1001 is present in URL", async () => {
    const inc = makeIncident();
    window.history.pushState({}, "", "/?incident=INC-1001");

    global.fetch = jest.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          success: true,
          incidents: [inc],
          stats: null,
          teams: ["Cloud"],
          views: [],
          onCall: {},
          teamContacts: {},
          postmortemsDue: [],
          actionsOutstanding: [],
          now: NOW,
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    render(<IcmPanel />);

    // Should immediately show Back to queue and detail view rather than queue list
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back to queue/i })).toBeInTheDocument();
    });

    expect(screen.getByText("MQTT gateway dropping TCP connections.")).toBeInTheDocument();

    // Click Back to queue: URL should be updated to remove incident parameter
    const user = userEvent.setup();
    const backBtn = screen.getByRole("button", { name: /back to queue/i });
    await user.click(backBtn);

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get("incident")).toBeNull();
    });
  });

  it("fetches single incident if not in initial queue list and renders it", async () => {
    const singleInc = makeIncident({
      id: "INC-8888",
      title: "Isolated incident outside filter",
      description: "Resolved earlier today.",
      status: "resolved",
    });

    window.history.pushState({}, "", "/?incident=INC-8888");

    global.fetch = jest.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes("id=INC-8888")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            incident: singleInc,
            now: NOW,
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          success: true,
          incidents: [], // Queue is empty for current filter
          stats: null,
          teams: ["Cloud"],
          views: [],
          onCall: {},
          teamContacts: {},
          postmortemsDue: [],
          actionsOutstanding: [],
          now: NOW,
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    render(<IcmPanel />);

    await waitFor(() => {
      expect(screen.getByText("Isolated incident outside filter")).toBeInTheDocument();
    });
    expect(screen.getByText("Resolved earlier today.")).toBeInTheDocument();
  });
});
