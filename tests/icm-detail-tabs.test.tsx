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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentDetail, csvCell, timelineToCsv } from "@/app/admin/IcmPanel";
import type { Attachment, Incident, TimelineEntry } from "@/lib/icm";

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

function attachment(over: Partial<Attachment> = {}): Attachment {
  return {
    id: "att1",
    key: "icm/INC-1042/att1-x9f.png",
    name: "dashboard.png",
    size: 4096,
    contentType: "image/png",
    uploadedBy: "asha",
    uploadedAt: NOW,
    ...over,
  };
}

function renderDetail(
  over: Partial<Incident> = {},
  handlers: { onIncidentUpdated?: (incident: Incident) => void } = {}
) {
  return render(
    <IncidentDetail
      incident={incident(over)}
      now={NOW}
      teams={["Firmware", "Cloud"]}
      busy={false}
      error=""
      onAct={jest.fn()}
      onIncidentUpdated={handlers.onIncidentUpdated ?? jest.fn()}
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

/**
 * Attachments: R2-backed, but the panel only ever sees an authenticated fetch
 * or an incident object back — never a bucket URL or a bare `<a href>`.
 */
describe("attachments", () => {
  afterEach(() => jest.restoreAllMocks());

  it("says plainly that nothing is attached, rather than an empty list a stalled load could also produce", () => {
    renderDetail();
    expect(screen.getByText(/no files attached yet/i)).toBeInTheDocument();
  });

  it("lists a file with a download control that is a button, not a link", () => {
    renderDetail({ attachments: [attachment()] });
    expect(screen.getByText("dashboard.png")).toBeInTheDocument();
    expect(screen.getByText(/4\.0 KB/)).toBeInTheDocument();
    /*
     * The bug this codebase shipped twice: a download reachable only with an
     * Authorization header must not be a plain navigation, because a browser
     * navigation carries no such header. Asserting the tag name is what would
     * have caught the GDPR export and attendance CSV buttons before shipping.
     */
    const dl = screen.getByRole("button", { name: "Download" });
    expect(dl.tagName).toBe("BUTTON");
  });

  it("uploads through a fetch carrying the admin token, and adopts the server's incident back", async () => {
    const user = userEvent.setup();
    const updated = incident({ attachments: [attachment({ id: "att-new", name: "log.txt" })] });
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => ({ success: true, incident: updated }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const onIncidentUpdated = jest.fn();

    renderDetail({}, { onIncidentUpdated });
    const file = new File(["hello"], "log.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText(/attach a file/i), file);

    await waitFor(() => expect(onIncidentUpdated).toHaveBeenCalledWith(updated));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/icm/attachments");
    expect(calls[0].init?.method).toBe("POST");
    const body = calls[0].init?.body as FormData;
    expect(body.get("incidentId")).toBe("INC-1042");
    expect((body.get("file") as File).name).toBe("log.txt");
  });

  /*
   * Never claim success for something that did not happen: a monitor here
   * once logged its own expected-400 probe as a failure, the opposite defect,
   * but the same root cause — the UI trusting a status it never checked.
   */
  it("reports an upload failure instead of leaving the list looking unchanged", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ success: false, message: "That file type isn't supported for attachments." }),
    })) as unknown as typeof fetch;
    const onIncidentUpdated = jest.fn();

    renderDetail({}, { onIncidentUpdated });
    const file = new File(["hello"], "virus.exe", { type: "application/x-msdownload" });
    await user.upload(screen.getByLabelText(/attach a file/i), file);

    expect(await screen.findByText("That file type isn't supported for attachments.")).toBeInTheDocument();
    expect(onIncidentUpdated).not.toHaveBeenCalled();
  });

  it("resolves a presigned link through an authenticated fetch, then opens only that link", async () => {
    const user = userEvent.setup();
    const presignedUrl = "https://r2.example.com/bucket/att1?X-Amz-Signature=abc";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => ({ success: true, url: presignedUrl }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    renderDetail({ attachments: [attachment()] });
    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(presignedUrl, "_blank", "noopener,noreferrer"));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/api/admin/icm/attachments?");
    expect(calls[0].url).toContain("attachmentId=att1");
    expect(calls[0].init?.method ?? "GET").toBe("GET");
    expect((calls[0].init?.headers as Record<string, string>)["x-admin-token"]).toBeDefined();
  });

  it("shows the failure against that file rather than opening a blank tab", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ success: false, message: "That file has expired from storage." }),
    })) as unknown as typeof fetch;
    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    renderDetail({ attachments: [attachment()] });
    await user.click(screen.getByRole("button", { name: "Download" }));

    expect(await screen.findByText("That file has expired from storage.")).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("asks for confirmation before removing, and adopts the server's incident once it agrees", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const updated = incident({ attachments: [] });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, incident: updated }),
    })) as unknown as typeof fetch;
    const onIncidentUpdated = jest.fn();

    renderDetail({ attachments: [attachment()] }, { onIncidentUpdated });
    await user.click(screen.getByRole("button", { name: /remove dashboard\.png/i }));

    await waitFor(() => expect(onIncidentUpdated).toHaveBeenCalledWith(updated));
  });

  it("removes nothing when the confirmation is declined", async () => {
    const user = userEvent.setup();
    jest.spyOn(window, "confirm").mockReturnValue(false);
    global.fetch = jest.fn();

    renderDetail({ attachments: [attachment()] });
    await user.click(screen.getByRole("button", { name: /remove dashboard\.png/i }));

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

/**
 * "What actually happened, and who decided" needs the timeline to tell code
 * apart from a person — otherwise a monitor's routine sweep and an on-call
 * engineer's judgement call read as the same kind of entry.
 */
describe("timeline: automated vs. human", () => {
  function mixedTimeline(): TimelineEntry[] {
    return [
      {
        id: "t1",
        kind: "created",
        at: new Date(NOW_MS - 45 * 60_000).toISOString(),
        actor: "monitor",
        text: "opened the incident",
      },
      {
        id: "t2",
        kind: "acknowledged",
        at: new Date(NOW_MS - 40 * 60_000).toISOString(),
        actor: "asha",
        text: "acknowledged",
      },
      {
        id: "t3",
        kind: "escalated",
        at: new Date(NOW_MS - 30 * 60_000).toISOString(),
        actor: "icm-escalation",
        text: "escalated to Sev1",
      },
    ];
  }

  it("badges only the actors that are code, not a person", () => {
    renderDetail({ timeline: mixedTimeline() });
    // monitor and icm-escalation are automated; asha is not — two badges, not three.
    expect(screen.getAllByText("auto")).toHaveLength(2);
  });

  it("shows only the automated entries once that filter is picked", async () => {
    const user = userEvent.setup();
    renderDetail({ timeline: mixedTimeline() });

    await user.click(screen.getByRole("button", { name: "Automated" }));

    expect(screen.getByText("opened the incident")).toBeInTheDocument();
    expect(screen.getByText("escalated to Sev1")).toBeInTheDocument();
    expect(screen.queryByText("acknowledged")).not.toBeInTheDocument();
  });

  it("shows only the human entries once that filter is picked", async () => {
    const user = userEvent.setup();
    renderDetail({ timeline: mixedTimeline() });

    await user.click(screen.getByRole("button", { name: "People" }));

    expect(screen.getByText("acknowledged")).toBeInTheDocument();
    expect(screen.queryByText("opened the incident")).not.toBeInTheDocument();
    expect(screen.queryByText("escalated to Sev1")).not.toBeInTheDocument();
  });

  /*
   * An empty attachment list must not be what an outage looks like — the same
   * rule applies here: a filter with nothing behind it must say which filter,
   * not reuse the "no history at all" message.
   */
  it("names the empty filter rather than reusing the no-history message", async () => {
    const user = userEvent.setup();
    renderDetail({
      timeline: [{ id: "t1", kind: "created", at: NOW, actor: "asha", text: "opened the incident" }],
    });

    expect(screen.queryByText(/no automated entries/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Automated" }));
    expect(screen.getByText("No automated entries.")).toBeInTheDocument();
  });

  it("offers a download only on the timeline row whose file still exists, not the one recording its removal", () => {
    renderDetail({
      timeline: [
        { id: "att-live", kind: "attachment", at: NOW, actor: "asha", text: "attached dashboard.png" },
        { id: "att-gone", kind: "attachment", at: NOW, actor: "asha", text: "removed dashboard-old.png" },
      ],
      attachments: [attachment({ id: "att-live" })],
    });

    const liveRow = screen.getByText("attached dashboard.png").closest("li")!;
    const goneRow = screen.getByText("removed dashboard-old.png").closest("li")!;
    expect(within(liveRow).getByRole("button", { name: /download/i })).toBeInTheDocument();
    expect(within(goneRow).queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
  });
});

/**
 * The timeline CSV export shares the exact hazard the repo already has a rule
 * for: a comment is attacker-controlled text, and a cell that opens with
 * `=`, `+`, `-` or `@` is a live formula the moment the file is opened.
 * Exported and tested directly (see csvCell/timelineToCsv's own doc comment)
 * rather than through a mocked Blob, matching admin-bulk.ts's toCsv tests.
 */
describe("timeline CSV export", () => {
  const entries: TimelineEntry[] = [
    { id: "t1", kind: "created", at: "2025-02-10T11:00:00.000Z", actor: "monitor", text: "opened the incident" },
    {
      id: "t2",
      kind: "comment",
      at: "2025-02-10T11:05:00.000Z",
      actor: "asha",
      text: "commented",
      body: '=HYPERLINK("http://evil","x")',
    },
  ];

  it("carries an automated column a filter can't strip out downstream", () => {
    const lines = timelineToCsv(entries).split("\n");
    expect(lines[0]).toBe("time,actor,automated,kind,text,detail");
    expect(lines[1]).toContain(",monitor,yes,created,");
    expect(lines[2]).toContain(",asha,no,comment,");
  });

  it("defuses a formula planted in a comment body", () => {
    const csv = timelineToCsv(entries);
    expect(csv).not.toContain('=HYPERLINK("http://evil","x")');
    expect(csv).toContain('HYPERLINK(""http://evil"",""x"")');
  });

  it("defuses every formula-leading character, not just '='", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      expect(csvCell(`${lead}cmd`).startsWith("'")).toBe(true);
    }
  });

  it("leaves ordinary values alone", () => {
    expect(csvCell("asha")).toBe("asha");
  });
});
