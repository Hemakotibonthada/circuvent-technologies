/**
 * The view-settings controls.
 *
 * The point of these tests is the wiring, not the markup: the previous version
 * of this control looked correct, persisted a value, and changed nothing on
 * screen. Each case here asserts that pressing a control ends with the
 * document element actually carrying the setting.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ViewMenu, ViewSettingsPanel } from "./ViewSettings";
import { DEFAULT_VIEW_SETTINGS, MAX_SCALE, readViewSettings } from "@/lib/view-settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-density");
  document.documentElement.removeAttribute("data-width");
  document.documentElement.style.removeProperty("--cv-ui-scale");
});

describe("ViewSettingsPanel", () => {
  it("applies a density to the document, not only to storage", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);

    await user.click(screen.getByRole("button", { name: /Compact/ }));

    expect(document.documentElement.dataset.density).toBe("compact");
    expect(readViewSettings().density).toBe("compact");
  });

  it("marks the selected density as pressed for assistive technology", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);

    await user.click(screen.getByRole("button", { name: /Comfortable/ }));

    expect(screen.getByRole("button", { name: /Comfortable/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Compact/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("steps the scale and shows the value", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);

    await user.click(screen.getByLabelText("Increase interface scale"));

    expect(screen.getByText("105%")).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue("--cv-ui-scale")).toBe("1.05");
  });

  it("stops at the maximum scale instead of running away", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);
    const plus = screen.getByLabelText("Increase interface scale");

    for (let i = 0; i < 30; i++) {
      if (plus.hasAttribute("disabled")) break;
      await user.click(plus);
    }

    expect(readViewSettings().scale).toBe(MAX_SCALE);
    expect(plus).toBeDisabled();
  });

  it("applies a content width", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);

    await user.click(screen.getByRole("button", { name: /Full/ }));

    expect(document.documentElement.dataset.width).toBe("full");
  });

  it("puts everything back with one control", async () => {
    const user = userEvent.setup();
    render(<ViewSettingsPanel />);

    await user.click(screen.getByRole("button", { name: /Compact/ }));
    await user.click(screen.getByRole("button", { name: /Full/ }));
    await user.click(screen.getByRole("button", { name: /Reset to defaults/ }));

    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(document.documentElement.dataset.density).toBe(DEFAULT_VIEW_SETTINGS.density);
    expect(document.documentElement.dataset.width).toBe(DEFAULT_VIEW_SETTINGS.width);
  });
});

describe("ViewMenu", () => {
  it("stays closed until asked", () => {
    render(<ViewMenu />);
    expect(screen.queryByRole("dialog", { name: "View settings" })).not.toBeInTheDocument();
  });

  it("opens and changes the density from a toolbar", async () => {
    const user = userEvent.setup();
    render(<ViewMenu />);

    await user.click(screen.getByRole("button", { name: /View/ }));
    const dialog = screen.getByRole("dialog", { name: "View settings" });
    await user.click(within(dialog).getByRole("button", { name: /Compact/ }));

    expect(document.documentElement.dataset.density).toBe("compact");
  });

  it("closes on a click outside, so it cannot sit over the data", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ViewMenu />
        <button type="button">somewhere else</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /View/ }));
    expect(screen.getByRole("dialog", { name: "View settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "somewhere else" }));
    expect(screen.queryByRole("dialog", { name: "View settings" })).not.toBeInTheDocument();
  });

  it("can reset without leaving the screen it is on", async () => {
    const user = userEvent.setup();
    render(<ViewMenu />);

    await user.click(screen.getByRole("button", { name: /View/ }));
    const dialog = screen.getByRole("dialog", { name: "View settings" });
    await user.click(within(dialog).getByRole("button", { name: /Compact/ }));
    expect(readViewSettings().density).toBe("compact");

    await user.click(within(dialog).getByRole("button", { name: /Reset to defaults/ }));
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("agrees with a change made elsewhere on the page", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <div data-testid="toolbar">
          <ViewMenu />
        </div>
        <div data-testid="panel">
          <ViewSettingsPanel />
        </div>
      </>,
    );
    expect(container).toBeTruthy();

    // Change it in the panel; the toolbar menu must show the same thing.
    const panel = screen.getByTestId("panel");
    await user.click(within(panel).getByRole("button", { name: /Comfortable/ }));

    await user.click(within(screen.getByTestId("toolbar")).getByRole("button", { name: /View/ }));

    const dialog = screen.getByRole("dialog", { name: "View settings" });
    expect(within(dialog).getByRole("button", { name: /Comfortable/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
