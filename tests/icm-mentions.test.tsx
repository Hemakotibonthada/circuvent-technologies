/**
 * Tests for ICM Portal Comment @mention functionality.
 *
 * Verifies:
 * 1. Extraction of mentions from text for notification delivery
 * 2. Visual rendering of @mention pills in timeline comments
 * 3. Autocomplete suggestion dropdown when typing '@'
 * 4. Keyboard navigation and candidate selection
 * 5. Toolbar quick-action '@ Mention' button
 * 6. Inclusion of mentioned users in notification dispatches
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentDetail, renderCommentWithMentions } from "@/app/admin/IcmPanel";
import { extractMentions, planNotifications, type NotifyState } from "@/lib/icm-notify";
import type { Incident } from "@/lib/icm";

const NOW = new Date("2025-02-10T12:00:00.000Z").toISOString();

function createTestIncident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-2001",
    title: "High Latency in Auth Service",
    description: "P99 latency jumped to 1400ms.",
    severity: 1,
    status: "active",
    source: "manual",
    owningTeam: "Security",
    assignedTo: "sarah@circuvent.com",
    createdBy: "devon@circuvent.com",
    createdAt: NOW,
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: NOW,
    affectedServices: ["auth"],
    customersImpacted: 50,
    mitigation: "",
    rootCause: "",
    timeline: [
      {
        id: "t1",
        kind: "created",
        at: NOW,
        actor: "devon@circuvent.com",
        text: "opened the incident",
      },
    ],
    tags: [],
    slaAckMins: 15,
    slaMitigateMins: 60,
    escalations: 0,
    links: [],
    ...over,
  };
}

describe("ICM @mentions parser & notification integration", () => {
  it("extracts single and multiple email mentions accurately", () => {
    const text = "Investigating with @sarah@circuvent.com and @alex.doe@circuvent.com please check DB replica";
    const mentions = extractMentions(text);
    expect(mentions).toEqual(["sarah@circuvent.com", "alex.doe@circuvent.com"]);
  });

  it("handles case insensitivity and deduplication in extractMentions", () => {
    const text = "@Sarah@circuvent.com asked @SARAH@circuvent.com to verify";
    const mentions = extractMentions(text);
    expect(mentions).toEqual(["sarah@circuvent.com"]);
  });

  it("returns empty array when text has no mentions", () => {
    expect(extractMentions("Just a regular status comment without any tags")).toEqual([]);
    expect(extractMentions("")).toEqual([]);
  });

  it("dispatches notifications to mentioned users in timeline comments", () => {
    const inc = createTestIncident({
      timeline: [
        {
          id: "t1",
          kind: "created",
          at: NOW,
          actor: "devon@circuvent.com",
          text: "opened the incident",
        },
        {
          id: "t2",
          kind: "comment",
          at: NOW,
          actor: "devon@circuvent.com",
          text: "commented",
          body: "cc @ops-lead@circuvent.com please inspect redis clusters",
        },
      ],
    });

    const state: NotifyState = { sent: {}, lastPrunedAt: NOW };
    const notifications = planNotifications([inc], state, {
      now: NOW,
      fallback: ["fallback@circuvent.com"],
    });

    const updateNotification = notifications.find((n) => n.reason === "update");
    expect(updateNotification).toBeDefined();
    expect(updateNotification?.to).toContain("ops-lead@circuvent.com");
  });
});

describe("renderCommentWithMentions", () => {
  it("wraps mentions in styled badges with AtSign icons", () => {
    const { container } = render(
      <div>{renderCommentWithMentions("Looping in @sarah@circuvent.com for advice")}</div>
    );

    const badge = screen.getByTestId("mention-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("sarah@circuvent.com");
    expect(container).toHaveTextContent("Looping in");
    expect(container).toHaveTextContent("for advice");
  });

  it("handles text with no mentions gracefully", () => {
    const { container } = render(<div>{renderCommentWithMentions("Plain text comment")}</div>);
    expect(screen.queryByTestId("mention-badge")).toBeNull();
    expect(container).toHaveTextContent("Plain text comment");
  });
});

describe("IncidentDetail Mention Autocomplete UI", () => {
  const members = [
    { email: "alice@circuvent.com", name: "Alice Smith", role: "SRE" },
    { email: "bob@circuvent.com", name: "Bob Jones", role: "DevOps" },
    { email: "sarah@circuvent.com", name: "Sarah Connor", role: "SecOps" },
  ];

  it("opens mention suggestion dropdown when typing '@' into comment box", async () => {
    const user = userEvent.setup();
    render(
      <IncidentDetail
        incident={createTestIncident()}
        now={NOW}
        teams={["Security", "Infra"]}
        members={members}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const textarea = screen.getByLabelText("Comment");
    await user.type(textarea, "Hello @");

    const listbox = await screen.findByRole("listbox", { name: /mention candidates/i });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
  });

  it("filters candidate suggestions as the user types query after '@'", async () => {
    const user = userEvent.setup();
    render(
      <IncidentDetail
        incident={createTestIncident()}
        now={NOW}
        teams={["Security", "Infra"]}
        members={members}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const textarea = screen.getByLabelText("Comment");
    await user.type(textarea, "cc @sar");

    expect(screen.getByText("Sarah Connor")).toBeInTheDocument();
    expect(screen.queryByText("Alice Smith")).toBeNull();
  });

  it("inserts the selected mention when a candidate is clicked", async () => {
    const user = userEvent.setup();
    render(
      <IncidentDetail
        incident={createTestIncident()}
        now={NOW}
        teams={["Security", "Infra"]}
        members={members}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const textarea = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    await user.type(textarea, "Pinging @ali");

    const option = await screen.findByRole("option", { name: /Alice Smith/i });
    await user.click(option);

    expect(textarea.value).toBe("Pinging @alice@circuvent.com ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("inserts '@' and opens suggestions when clicking the toolbar Mention button", async () => {
    const user = userEvent.setup();
    render(
      <IncidentDetail
        incident={createTestIncident()}
        now={NOW}
        teams={["Security", "Infra"]}
        members={members}
        busy={false}
        error=""
        onAct={jest.fn()}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const mentionBtn = screen.getByTitle("Mention a team member (@)");
    await user.click(mentionBtn);

    const textarea = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    expect(textarea.value).toBe("@");

    const listbox = await screen.findByRole("listbox", { name: /mention candidates/i });
    expect(listbox).toBeInTheDocument();
  });

  it("posts comment with mention when clicking Comment button", async () => {
    const user = userEvent.setup();
    const onAct = jest.fn();

    render(
      <IncidentDetail
        incident={createTestIncident()}
        now={NOW}
        teams={["Security", "Infra"]}
        members={members}
        busy={false}
        error=""
        onAct={onAct}
        onIncidentUpdated={jest.fn()}
        onBack={jest.fn()}
      />
    );

    const textarea = screen.getByLabelText("Comment");
    await user.type(textarea, "Check this out @sarah@circuvent.com");

    const commentBtn = screen.getByRole("button", { name: /^comment$/i });
    await user.click(commentBtn);

    expect(onAct).toHaveBeenCalledWith({
      id: "INC-2001",
      action: "comment",
      body: "Check this out @sarah@circuvent.com",
    });
  });
});
