/**
 * Neo has to be visibly neo.
 *
 * The theme existed and could not be sensed: cards and range tracks carried
 * the extrusion and nothing else did, so the console read as a flat dark panel
 * set with slightly soft boxes. The controls are what the style is made of —
 * buttons that stand out of the surface and press into it, fields recessed
 * rather than outlined — and none of them had it.
 *
 * These assert the difference between modes rather than exact shadow values,
 * so the design can be tuned without rewriting the tests, but a regression
 * back to "neo looks like glass" fails.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { ConsoleThemeProvider, useConsoleTheme } from "../theme";
import { Button, Surface, SwitchRow, neoSurface } from "./primitives";
import { useEffect } from "react";

afterEach(() => {
  cleanup();
  // ConsoleThemeProvider persists the chosen mode. Without clearing it, the
  // neo tests above set the mode for the glass tests below and the "flat modes
  // are left alone" assertions fail against a console that is still in neo.
  localStorage.clear();
  document.documentElement.removeAttribute("data-cv-mode");
  document.documentElement.style.cssText = "";
});

/** Switches the console into a mode, since the provider owns that state. */
function Mode({ mode }: { mode: "glass" | "neo" | "aurora" }) {
  const { setMode } = useConsoleTheme();
  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);
  return null;
}

function renderIn(mode: "glass" | "neo" | "aurora", ui: React.ReactNode) {
  return render(
    <ConsoleThemeProvider>
      <Mode mode={mode} />
      {ui}
    </ConsoleThemeProvider>
  );
}

describe("neoSurface", () => {
  it("raises with two shadows, because one is just a drop shadow", () => {
    const s = neoSurface("raised");
    expect(s.boxShadow).toContain("var(--cv-neo-dark)");
    expect(s.boxShadow).toContain("var(--cv-neo-light)");
    expect(s.boxShadow).not.toContain("inset");
  });

  it("recesses with the same two shadows inverted", () => {
    const s = neoSurface("inset");
    expect(s.boxShadow).toContain("inset");
    expect(s.boxShadow).toContain("var(--cv-neo-dark)");
    expect(s.boxShadow).toContain("var(--cv-neo-light)");
  });

  it("drops the border, because a border plus an extrusion reads as a sticker", () => {
    expect(neoSurface("raised").border).toBe("none");
    expect(neoSurface("inset").border).toBe("none");
  });

  it("uses smaller offsets than a card, so a 44px control is not detached", () => {
    // The card rule is 5px/16px. A button carrying that looks like it is
    // floating above the panel rather than part of it.
    expect(neoSurface("raised").boxShadow).toContain("3px 3px 8px");
  });
});

describe("Button in neo mode", () => {
  it("is extruded rather than outlined", () => {
    renderIn("neo", <Button>Add device</Button>);
    const btn = screen.getByRole("button", { name: "Add device" });
    expect(btn.style.boxShadow).toContain("var(--cv-neo-light)");
    // jsdom normalises `border: none` to an empty string, so assert what
    // actually matters: no visible border is drawn alongside the extrusion.
    expect(btn.style.border).not.toContain("var(--cv-border)");
    expect(btn.style.border === "" || btn.style.border === "none").toBe(true);
  });

  it("presses in when touched", () => {
    renderIn("neo", <Button>Add device</Button>);
    // The inset-on-active rule is applied by class, since :active cannot be
    // expressed inline.
    expect(screen.getByRole("button", { name: "Add device" }).className).toContain("cv-neo-press");
  });

  it("keeps the gradient on a primary button and puts the extrusion under it", () => {
    renderIn("neo", <Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.style.background).toContain("var(--cv-gradient)");
    expect(btn.style.boxShadow).toContain("var(--cv-neo-dark)");
  });
});

describe("Button in the flat modes is left alone", () => {
  it("keeps its border in glass", () => {
    renderIn("glass", <Button>Add device</Button>);
    const btn = screen.getByRole("button", { name: "Add device" });
    expect(btn.style.border).toContain("var(--cv-border)");
    expect(btn.style.boxShadow).not.toContain("var(--cv-neo-light)");
  });

  it("keeps its border in aurora", () => {
    renderIn("aurora", <Button>Add device</Button>);
    expect(screen.getByRole("button", { name: "Add device" }).style.border).toContain("var(--cv-border)");
  });

  it("does not add the press class outside neo", () => {
    renderIn("glass", <Button>Add device</Button>);
    expect(screen.getByRole("button", { name: "Add device" }).className).not.toContain("cv-neo-press");
  });
});

describe("Surface carries the theme's mode", () => {
  it("is neo in neo mode", () => {
    // The primitive hardcoded `cv-card`, so most of the console rendered
    // without its mode class and neo applied to almost nothing.
    renderIn("neo", <Surface>panel</Surface>);
    const card = screen.getByText("panel");
    expect(card.className).toContain("cv-card");
    expect(card.className).toContain("cv-neo");
  });

  it("is glass in glass mode", () => {
    renderIn("glass", <Surface>panel</Surface>);
    expect(screen.getByText("panel").className).toContain("cv-glass");
  });

  it("still renders with no provider", () => {
    expect(() => render(<Surface>panel</Surface>)).not.toThrow();
    expect(screen.getByText("panel").className).toContain("cv-card");
  });
});

describe("SwitchRow in neo mode", () => {
  it("cuts the off-state track into the surface rather than raising it", () => {
    // A raised track would compete with the raised knob and the control would
    // read as two stacked pills instead of one switch.
    renderIn("neo", <SwitchRow label="Away mode" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Away mode" });
    expect(sw.style.boxShadow).toContain("inset");
    expect(sw.style.border === "" || sw.style.border === "none").toBe(true);
  });

  it("keeps the gradient when on", () => {
    renderIn("neo", <SwitchRow label="Away mode" checked onChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Away mode" }).style.background).toContain("var(--cv-gradient)");
  });

  it("keeps its border in the flat themes", () => {
    renderIn("glass", <SwitchRow label="Away mode" checked={false} onChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Away mode" }).style.border).toContain("var(--cv-border)");
  });
});

describe("Button outside the console does not crash", () => {
  it("renders with no theme provider at all", () => {
    // The kit is shared; a missing provider must degrade, not throw.
    expect(() => render(<Button>Standalone</Button>)).not.toThrow();
    expect(screen.getByRole("button", { name: "Standalone" })).toBeInTheDocument();
  });
});
