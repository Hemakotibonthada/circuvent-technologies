import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import OverviewDiagnostics from "./OverviewDiagnostics";
import { useHomeAnalysis } from "@/lib/ai/useHomeAnalysis";
import type { Finding, HomeAnalysis } from "@/lib/ai/analysis";

// The console overview is entirely client-rendered behind an auth gate, so a
// server-side HTML check proves nothing about this panel. These tests render it
// directly. They cover the decisions the panel actually makes: which findings
// are worth an overview, what to do when there are none, and — importantly —
// staying silent rather than duplicating the console's own sign-in message.

jest.mock("@/lib/ai/useHomeAnalysis", () => ({ useHomeAnalysis: jest.fn() }));

const mockHook = useHomeAnalysis as jest.MockedFunction<typeof useHomeAnalysis>;

const finding = (over: Partial<Finding> = {}): Finding => ({
  id: "f1",
  severity: "warning",
  title: "A thing happened",
  detail: "Some detail.",
  deviceIds: [],
  evidence: {},
  ...over,
});

const analysis = (findings: Finding[]): HomeAnalysis => ({
  findings,
  energy: {
    totalWatts: 0, meteredDevices: 0, estimatedKWhPerDay: 0,
    estimatedKWhPerMonth: 0, topConsumers: [],
  },
  counts: { total: 3, online: 3, offline: 0 },
  generatedAt: new Date().toISOString(),
});

const state = (over: Partial<ReturnType<typeof useHomeAnalysis>> = {}) => ({
  analysis: null, loading: false, error: null, needsAuth: false, reload: jest.fn(),
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe("OverviewDiagnostics", () => {
  it("renders nothing when the user is not signed in", () => {
    // The console already tells them to sign in. A second copy of that message
    // on the same screen is noise.
    mockHook.mockReturnValue(state({ needsAuth: true, error: "Sign in." }));
    const { container } = render(<OverviewDiagnostics />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no analysis and no error", () => {
    mockHook.mockReturnValue(state());
    const { container } = render(<OverviewDiagnostics />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a heading while loading rather than collapsing the layout", () => {
    mockHook.mockReturnValue(state({ loading: true }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
  });

  it("says so plainly when every check passed", () => {
    mockHook.mockReturnValue(state({ analysis: analysis([]) }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("Nothing looks wrong")).toBeInTheDocument();
  });

  it("renders a finding with its detail and suggestion", () => {
    mockHook.mockReturnValue(state({
      analysis: analysis([finding({
        title: "Kettle has stopped reporting",
        detail: "Last seen 45 minutes ago.",
        suggestion: "Check its power.",
      })]),
    }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("Kettle has stopped reporting")).toBeInTheDocument();
    expect(screen.getByText("Last seen 45 minutes ago.")).toBeInTheDocument();
    expect(screen.getByText("Check its power.")).toBeInTheDocument();
  });

  it("puts the most severe finding first", () => {
    mockHook.mockReturnValue(state({
      analysis: analysis([
        finding({ id: "a", severity: "info", title: "Info item" }),
        finding({ id: "b", severity: "critical", title: "Critical item" }),
        finding({ id: "c", severity: "warning", title: "Warning item" }),
      ]),
    }));
    render(<OverviewDiagnostics />);
    const titles = screen.getAllByText(/item$/).map((n) => n.textContent);
    expect(titles).toEqual(["Critical item", "Warning item", "Info item"]);
  });

  it("caps the list and links to the rest rather than flooding the overview", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding ${i}` }));
    mockHook.mockReturnValue(state({ analysis: analysis(many) }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("5 more findings")).toBeInTheDocument();
    expect(screen.queryByText("Finding 8")).not.toBeInTheDocument();
  });

  it("uses the singular when exactly one finding is hidden", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding ${i}` }));
    mockHook.mockReturnValue(state({ analysis: analysis(many) }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("1 more finding")).toBeInTheDocument();
  });

  it("offers a retry when the analysis failed", () => {
    const reload = jest.fn();
    mockHook.mockReturnValue(state({ error: "Could not analyse your home.", reload }));
    render(<OverviewDiagnostics />);
    expect(screen.getByText("Could not analyse your home.")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("always links through to the full analysis", () => {
    mockHook.mockReturnValue(state({ analysis: analysis([finding()]) }));
    render(<OverviewDiagnostics />);
    const link = screen.getByRole("link", { name: /full analysis/i });
    expect(link).toHaveAttribute("href", "/smarthome/insights?tab=analysis");
  });
});
