/**
 * Overlays must inherit the console theme.
 *
 * Overlays render into document.body through a portal, which is correct — it
 * stops a parent with overflow:hidden from clipping a modal. The cost is that
 * the portal sits outside the themed wrapper, so both halves of the theme were
 * unreachable from inside it: the --cv-* custom properties, which were inline
 * styles on that wrapper, and every class-scoped rule written as `.cv-theme x`.
 *
 * The visible result was a dark automation dialog with white fields, because
 * the marketing shell's site-wide `input, textarea, select` rule was the only
 * one that still applied. These tests fail if either half regresses.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { ConsoleThemeProvider } from "../theme";
import { Modal } from "./overlays";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-cv-mode");
  document.documentElement.removeAttribute("data-cv-scheme");
  document.documentElement.style.cssText = "";
});

describe("console theme is reachable from a portal", () => {
  it("publishes the custom properties onto the document element", () => {
    // Inline styles on the provider div are invisible to a portal. Without
    // these on :root, var(--cv-input-bg) inside a modal resolves to nothing.
    render(
      <ConsoleThemeProvider>
        <div>console</div>
      </ConsoleThemeProvider>
    );
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--cv-input-bg")).not.toBe("");
    expect(root.style.getPropertyValue("--cv-text")).not.toBe("");
    expect(root.style.getPropertyValue("--cv-bg")).not.toBe("");
  });

  it("records the mode and scheme where a portal can read them", () => {
    render(
      <ConsoleThemeProvider>
        <div>console</div>
      </ConsoleThemeProvider>
    );
    expect(document.documentElement.getAttribute("data-cv-mode")).toBeTruthy();
    expect(document.documentElement.getAttribute("data-cv-scheme")).toBeTruthy();
  });

  it("removes them again when the console unmounts", () => {
    const { unmount } = render(
      <ConsoleThemeProvider>
        <div>console</div>
      </ConsoleThemeProvider>
    );
    unmount();
    expect(document.documentElement.getAttribute("data-cv-mode")).toBeNull();
    expect(document.documentElement.style.getPropertyValue("--cv-input-bg")).toBe("");
  });

  it("gives the portal the theme classes, so class-scoped rules apply inside a modal", () => {
    render(
      <ConsoleThemeProvider>
        <Modal open onClose={() => {}} title="New automation rule">
          <input aria-label="Rule name" defaultValue="Low tank alert" />
        </Modal>
      </ConsoleThemeProvider>
    );

    expect(screen.getByLabelText("Rule name")).toBeInTheDocument();

    const portal = document.querySelector("[data-cv-portal]");
    expect(portal).not.toBeNull();

    // The theme rides on a wrapper inside the portal rather than on the host,
    // so it stays declarative and updates when the theme changes.
    const themed = portal?.querySelector(".cv-theme");
    expect(themed).not.toBeNull();
    expect(themed?.className).toMatch(/cv-(aurora|glass|neo)/);
    expect(themed?.className).toMatch(/cv-(dark|light)/);
    expect(themed?.contains(screen.getByLabelText("Rule name"))).toBe(true);
  });

  it("puts the field inside the themed portal rather than outside it", () => {
    render(
      <ConsoleThemeProvider>
        <Modal open onClose={() => {}} title="New automation rule">
          <input aria-label="Rule name" />
        </Modal>
      </ConsoleThemeProvider>
    );
    const portal = document.querySelector("[data-cv-portal]");
    expect(portal?.contains(screen.getByLabelText("Rule name"))).toBe(true);
  });
});
