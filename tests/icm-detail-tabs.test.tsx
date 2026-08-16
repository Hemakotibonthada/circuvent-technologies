/**
 * The incident detail tabs have to actually switch.
 *
 * This panel was reorganised into tabs to match IcM, and a tab bar is the
 * purest form of the mistake this codebase keeps making: it looks completely
 * finished while doing nothing. Every tab renders a label, every label has a
 * hover state, and if the panel body is not wired to the selected tab it all
 * still looks right in a screenshot. The only way to know is to click.
 *
 * So each test here clicks a tab and asserts that content which belongs to
 * another tab has gone away — not merely that the new content appeared, which
 * would also pass if the panel were rendering all tabs at once.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentDetail } from "@/app/admin/IcmPanel";
import type { Incident } from "@/lib/icm";

const NOW = new Date("2025-02-10T12:00:00.000Z").toISOString();
const NOW_MS = Date.parse(NOW);

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1042",
    title: "Camera stream dropping frames",
    description: "Streams fell to 3 fps across the Hyderabad fleet.",
    severity: 2,
    status: "active",
    source: "monitor",
    owningTeam: "Firmware",
    assignedTo: "asha",
    createdBy: "monitor",
    createdAt: new Date(NOW_MS - 45 * 60_000).toISOString(),
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: new Date(NOW_MS - 45 * 60_000).toISOString(),
    affectedServices: ["camera"],
    customersImpacted: 120,
    mitigation: "",
    rootCause: "",
    timeline: [
      {
        id: "t1",
        kind: "created",
        at: new Date(NOW_MS - 45 * 60_000).toISOString(),
        actor: "monitor",
        text: "opened the incident",
      },
    ],
    tags: [],
    slaAckMins: 15,
    slaMitigateMins: 120,
    escalations: 0,
    links: [],
    ...over,
  };
}

function renderDetail(over: Partial<Incident> = {}) {
  return render(
    <IncidentDetail
      incident={incident(over)}
      now={NOW}
      teams={["Firmware", "Cloud"]}
      busy={false}
      error=""
      onAct={jest.fn()}
      onBack={jest.fn()}
    />
  );
}

describe("incident detail tabs", () => {
  it("opens on the summary, with the discussion box in reach", () => {
    renderDetail();
    expect(screen.getByRole("tab", { name: /summary/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Comment")).toBeInTheDocument();
  });

  it("shows what is known without being asked", () => {
    renderDetail();
    expect(screen.getByText(/what we know/i)).toBeInTheDocument();
    // Derived, not echoed: the impact line is the card's own work.
    expect(screen.getByText(/120 customers affected/)).toBeInTheDocument();
  });

  /*
   * The header already prints the description in full. Repeating it in the card
   * directly below pushes the derived facts off the screen to tell the reader
   * something they have just read.
   */
  it("does not repeat the description the header already shows", () => {
    const { container } = renderDetail();
    const hits = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && el.textContent?.includes("Streams fell to 3 fps")
    );
    expect(hits).toHaveLength(1);
  });

  /*
   * The load-bearing test. If the body ignores `tab`, the comment box stays on
   * screen under every tab and this fails.
   */
  it("swaps the body when another tab is chosen", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole("tab", { name: /routing/i }));

    expect(screen.getByRole("tab", { name: /routing/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByLabelText("Comment")).not.toBeInTheDocument();
  });

  it("keeps the retrospective out of the way until it is asked for", async () => {
    const user = userEvent.setup();
    // Mitigated, because the editor deliberately refuses a postmortem before
    // then — until the bleeding stops, the time is better spent on the incident.
    renderDetail({
      status: "mitigated",
      mitigatedAt: new Date(NOW_MS - 5 * 60_000).toISOString(),
      postmortem: {
        summary: "Broker cap was too low.",
        cause: "Per-client message cap left at the default.",
        detection: "No alert on broker rejections.",
        actionItems: [],
        authoredBy: "asha",
        updatedAt: NOW,
        publishedAt: null,
      },
    });

    expect(screen.queryByDisplayValue(/Broker cap was too low\./)).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /retrospective/i }));
    expect(screen.getByDisplayValue(/Broker cap was too low\./)).toBeInTheDocument();
  });

  /*
   * The header, the clocks and the action bar are the reason somebody opened
   * the page. They must not be inside a tab — an acknowledge button you have to
   * go looking for is an acknowledge button that gets pressed late.
   */
  it("keeps the title and the actions visible from every tab", async () => {
    const user = userEvent.setup();
    renderDetail();

    for (const name of [/routing/i, /related/i, /retrospective/i, /summary/i]) {
      await user.click(screen.getByRole("tab", { name }));
      expect(screen.getByText("Camera stream dropping frames")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /acknowledge/i })).toBeInTheDocument();
    }
  });

  it("puts a count on the related tab so a duplicate is noticed", () => {
    renderDetail({
      links: [{ id: "INC-0994", kind: "duplicate-of", at: NOW, by: "asha" }],
    });
    expect(screen.getByRole("tab", { name: /related/i })).toHaveTextContent("1");
  });
});
