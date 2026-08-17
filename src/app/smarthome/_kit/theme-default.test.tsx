/**
 * What a fresh visitor actually gets.
 *
 * The constants next door say neo/light; this checks the provider resolves to
 * it, which is a different claim. A stored preference, a legacy-default rule
 * that matches too eagerly, or a dark-only override would each leave the
 * constants correct and the console wrong.
 */
import { render, cleanup } from "@testing-library/react";
import { useEffect } from "react";
import { ConsoleThemeProvider, useConsoleTheme } from "../theme";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-cv-mode");
  document.documentElement.style.cssText = "";
});

function Report({ onto }: { onto: { mode?: string; scheme?: string } }) {
  const { mode, scheme } = useConsoleTheme();
  useEffect(() => {
    onto.mode = mode;
    onto.scheme = scheme;
  }, [mode, scheme, onto]);
  return null;
}

function resolve(stored?: unknown) {
  if (stored !== undefined) localStorage.setItem("cv-console-theme", JSON.stringify(stored));
  const seen: { mode?: string; scheme?: string } = {};
  render(
    <ConsoleThemeProvider>
      <Report onto={seen} />
    </ConsoleThemeProvider>
  );
  return seen;
}

describe("a visitor who has never chosen", () => {
  it("gets Neo White", () => {
    expect(resolve()).toMatchObject({ mode: "neo", scheme: "light" });
  });

  it("gets it through the provider, not just the constant", () => {
    // The document attribute is what the stylesheet keys off, so this is the
    // form of the answer that actually reaches the pixels.
    resolve();
    expect(document.documentElement.getAttribute("data-cv-mode")).toBe("neo");
  });
});

describe("a visitor who has chosen", () => {
  it("keeps a deliberate choice", () => {
    /*
     * The direction that would be rude: somebody picked OLED for a wall tablet
     * and a deploy quietly moved them to a white theme.
     */
    expect(resolve({ mode: "oled", scheme: "dark", accentKey: "violet" })).toMatchObject({
      mode: "oled",
    });
  });

  it("keeps a choice that merely looks like an old default", () => {
    // glass/dark with a non-brand accent is somebody's decision, not a default
    // that was stamped on them.
    expect(resolve({ mode: "glass", scheme: "dark", accentKey: "teal" })).toMatchObject({
      mode: "glass",
    });
  });

  it("adopts the new default over a previous default that was stamped on them", () => {
    /*
     * Older builds persisted their own default on first paint, so these exact
     * triples cannot be distinguished from "never chose anything". Treating
     * them as choices would leave everybody who has ever loaded the console on
     * the old look for ever.
     */
    expect(resolve({ mode: "aurora", scheme: "dark", accentKey: "brand" })).toMatchObject({
      mode: "neo",
      scheme: "light",
    });
    cleanup();
    localStorage.clear();
    expect(resolve({ mode: "glass", scheme: "dark", accentKey: "brand" })).toMatchObject({
      mode: "neo",
      scheme: "light",
    });
  });

  it("is not derailed by a corrupt preference", () => {
    localStorage.setItem("cv-console-theme", "{not json");
    const seen: { mode?: string; scheme?: string } = {};
    render(
      <ConsoleThemeProvider>
        <Report onto={seen} />
      </ConsoleThemeProvider>
    );
    expect(seen).toMatchObject({ mode: "neo", scheme: "light" });
  });
});
