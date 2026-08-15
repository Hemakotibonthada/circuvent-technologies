import { readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventDetailDrawer from "./EventDetailDrawer";
import type { TelemetryEvent } from "@/lib/app-insights";

function ev(over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id: "evt-1",
    kind: "request",
    at: "2026-08-14T04:32:00.000Z",
    path: "/api/admin/stats",
    session: "sess-abcdef0123",
    durationMs: 446,
    status: 200,
    method: "GET",
    ok: true,
    source: "api",
    ...over,
  };
}

/**
 * Read one value out of the properties panel.
 *
 * Durations and paths appear twice by design — once on the timeline and once
 * in the properties list — so a bare text query is ambiguous. Asserting
 * against the labelled row is also the stronger claim: it checks the value is
 * reported *as that property*, not merely present somewhere on screen.
 */
function propValue(label: string): string {
  const dt = screen.getAllByText(label, { selector: "dt" })[0];
  return dt.nextElementSibling?.textContent?.trim() ?? "";
}

describe("EventDetailDrawer", () => {
  it("renders nothing until a row is opened", () => {
    const { container } = render(<EventDetailDrawer event={null} events={[]} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the operation and its outcome", () => {
    const e = ev();
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);

    expect(screen.getByRole("dialog")).toHaveAccessibleName("End-to-end transaction details");
    expect(screen.getAllByText("GET /api/admin/stats").length).toBeGreaterThan(0);
    expect(propValue("Outcome")).toBe("Success");
    expect(propValue("Duration")).toBe("446 ms");
    expect(propValue("Status")).toBe("200");
    expect(propValue("Source")).toBe("api");
    expect(propValue("Session")).toBe("sess-abcdef0123");
  });

  it("does not report a status for a pageview", () => {
    /*
     * A pageview has no HTTP status. Rendering the stored 0 would read as a
     * response code, and "0" beside a healthy page view is the kind of number
     * somebody opens an incident about.
     */
    const e = ev({ kind: "pageview", status: 0, method: undefined, path: "/shop" });
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);
    expect(screen.getByText("not applicable")).toBeInTheDocument();
  });

  it("distinguishes a missing response from a zero status", () => {
    const e = ev({ kind: "request", status: 0, ok: false });
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);
    expect(screen.getByText("no response")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("says a stack was not captured rather than showing nothing", () => {
    /*
     * Silence reads as "nothing was thrown". The distinction matters: one
     * sends an engineer to the exception, the other to the instrumentation.
     */
    const e = ev({ ok: false, status: 500, errorType: "TypeError", errorMessage: "x is not a function" });
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);

    expect(screen.getByText("TypeError")).toBeInTheDocument();
    expect(screen.getByText("x is not a function")).toBeInTheDocument();
    expect(screen.getByText("No stack was captured for this event.")).toBeInTheDocument();
  });

  it("shows a stack when one exists", () => {
    const e = ev({ ok: false, errorType: "TypeError", stack: "at handler (route.ts:12)" });
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);
    expect(screen.getByText(/at handler \(route\.ts:12\)/)).toBeInTheDocument();
    expect(screen.queryByText("No stack was captured for this event.")).not.toBeInTheDocument();
  });

  it("assembles the surrounding session, not just the clicked row", () => {
    const a = ev({ id: "a", at: "2026-08-14T04:32:00.000Z", path: "/api/one" });
    const b = ev({ id: "b", at: "2026-08-14T04:32:01.000Z", path: "/api/two" });
    const other = ev({ id: "c", session: "different", path: "/api/elsewhere" });

    render(<EventDetailDrawer event={a} events={[a, b, other]} onClose={() => {}} />);

    // Both events of this session are on the timeline; the other session is not.
    expect(screen.getAllByText("/api/one").length).toBeGreaterThan(0);
    expect(screen.getAllByText("/api/two").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("/api/elsewhere")).toHaveLength(0);
    expect(screen.getByText(/2 events over/)).toBeInTheDocument();
  });

  it("labels the grouping as a session, because no operation id exists", () => {
    /*
     * Azure can say "Operation ID" because its SDK writes one. Borrowing the
     * label here would imply a causal chain this telemetry never recorded.
     */
    const e = ev();
    render(<EventDetailDrawer event={e} events={[e]} onClose={() => {}} />);
    expect(screen.getByText("Session")).toBeInTheDocument();
    // No property may be *labelled* Operation ID. Saying in prose that none is
    // recorded is the point of the note, so match the label, not the phrase.
    expect(screen.queryAllByText(/^operation id$/i, { selector: "dt" })).toHaveLength(0);
    expect(screen.getByText(/grouped by session/i)).toBeInTheDocument();
  });

  it("closes on Escape and on the close button", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const e = ev();
    render(<EventDetailDrawer event={e} events={[e]} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close transaction details" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("lets the operator walk to another event in the session", async () => {
    const user = userEvent.setup();
    const a = ev({ id: "a", path: "/api/one", durationMs: 10 });
    const b = ev({ id: "b", path: "/api/two", durationMs: 999, at: "2026-08-14T04:32:02.000Z" });

    render(<EventDetailDrawer event={a} events={[a, b]} onClose={() => {}} />);
    expect(propValue("Duration")).toBe("10 ms");
    expect(propValue("Path")).toBe("/api/one");

    await user.click(screen.getByRole("button", { name: /GET \/api\/two/ }));
    // The property panel now describes the event that was selected.
    expect(propValue("Duration")).toBe("999 ms");
    expect(propValue("Path")).toBe("/api/two");
  });
});

describe("the detail view keeps up with the event shape", () => {
  /*
   * The failure this guards is the house one: a field is added to
   * TelemetryEvent, every producer starts sending it, and the one screen whose
   * entire job is "show me everything about this event" quietly does not. No
   * error, no missing data anywhere else — just a detail view that is subtly
   * incomplete, which nobody notices because you cannot see what is absent.
   */
  it("references every field TelemetryEvent declares", () => {
    const model = readFileSync(join(process.cwd(), "src", "lib", "app-insights.ts"), "utf8");
    const start = model.indexOf("export interface TelemetryEvent");
    const open = model.indexOf("{", start);
    const close = model.indexOf("\n}", open);
    const body = model
      .slice(open + 1, close)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const fields = [...body.matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map((m) => m[1]);

    expect(fields.length).toBeGreaterThan(8);

    const drawer = readFileSync(
      join(process.cwd(), "src", "app", "admin", "insights", "EventDetailDrawer.tsx"),
      "utf8",
    );
    const missing = fields.filter((f) => !new RegExp(`\\b${f}\\b`).test(drawer));
    expect(missing).toEqual([]);
  });
});
