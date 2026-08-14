/**
 * The new device controls, held to the contract that makes them usable.
 *
 * A switch is a native element that comes with keyboard support, a role, and a
 * state a screen reader can announce. Every one of these replaces that with a
 * div and a gesture, which means all of it has to be rebuilt deliberately —
 * and the failure mode is silent: the control looks right, works with a mouse,
 * and is simply unreachable for anyone using a keyboard or a screen reader.
 *
 * So these tests are mostly about the parts you cannot see.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { Sun } from "lucide-react";
import { LevelSlider, PowerDial, ModeSelector, SlideToConfirm } from "@/app/smarthome/_kit/controls";

describe("LevelSlider", () => {
  it("is a real slider, not a div that happens to move", () => {
    render(<LevelSlider value={40} onChange={() => {}} label="Brightness" min={0} max={100} />);
    const s = screen.getByRole("slider", { name: "Brightness" });
    expect(s).toHaveAttribute("aria-valuenow", "40");
    expect(s).toHaveAttribute("aria-valuemin", "0");
    expect(s).toHaveAttribute("aria-valuemax", "100");
    expect(s).toHaveAttribute("aria-orientation", "vertical");
  });

  it("is reachable by keyboard", () => {
    render(<LevelSlider value={40} onChange={() => {}} label="Brightness" />);
    expect(screen.getByRole("slider")).toHaveAttribute("tabindex", "0");
  });

  it("moves in coarse steps with arrows and fine steps with shift", () => {
    // The same convention as a native range, so nobody has to learn anything.
    const onChange = jest.fn();
    render(<LevelSlider value={50} onChange={onChange} label="Brightness" min={0} max={100} step={1} />);
    const s = screen.getByRole("slider");

    fireEvent.keyDown(s, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(55);

    fireEvent.keyDown(s, { key: "ArrowUp", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(51);
  });

  it("jumps to the ends with Home and End", () => {
    const onChange = jest.fn();
    render(<LevelSlider value={50} onChange={onChange} label="Brightness" min={10} max={90} />);
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(10);
    fireEvent.keyDown(s, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it("never leaves the range", () => {
    const onChange = jest.fn();
    render(<LevelSlider value={100} onChange={onChange} label="Brightness" min={0} max={100} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("commits once on a keyboard change, so one press is one command", () => {
    // A keypress is a finished gesture. Streaming here would publish twice for
    // every arrow key.
    const onCommit = jest.fn();
    render(<LevelSlider value={50} onChange={() => {}} onCommit={onCommit} label="Brightness" />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("speaks a name rather than a number when one is given", () => {
    // "Medium" is the setting somebody asked for; 66 percent is a number they
    // have to translate.
    render(
      <LevelSlider
        value={66}
        onChange={() => {}}
        label="Fan"
        valueText={(v) => (v > 33 ? "Medium" : "Low")}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Medium");
  });

  it("says Off rather than 0% when the device is switched off", () => {
    // A lamp at 0% and a lamp switched off are different states, and only one
    // of them comes back at the level you left it.
    render(<LevelSlider value={0} onChange={() => {}} label="Brightness" off />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("cannot be driven or focused while disabled", () => {
    const onChange = jest.fn();
    render(<LevelSlider value={50} onChange={onChange} label="Brightness" disabled />);
    const s = screen.getByRole("slider");
    expect(s).toHaveAttribute("tabindex", "-1");
    expect(s).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(s, { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an icon when given one", () => {
    const { container } = render(
      <LevelSlider value={50} onChange={() => {}} label="Brightness" icon={Sun} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("PowerDial", () => {
  it("announces its state as a toggle", () => {
    render(<PowerDial on onToggle={() => {}} label="Desk lamp" />);
    const b = screen.getByRole("button", { name: /turn off desk lamp/i });
    expect(b).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the word as well as the colour", () => {
    // Colour alone fails in sunlight and for anyone with a colour vision
    // deficiency, so the state is always written out.
    render(<PowerDial on={false} onToggle={() => {}} label="Desk lamp" />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("toggles on press", () => {
    const onToggle = jest.fn();
    render(<PowerDial on={false} onToggle={onToggle} label="Desk lamp" />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled", () => {
    const onToggle = jest.fn();
    render(<PowerDial on={false} onToggle={onToggle} label="Desk lamp" disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("draws the level ring only when there is a level", () => {
    const withLevel = render(<PowerDial on level={50} onToggle={() => {}} label="Lamp" />);
    expect(withLevel.container.querySelectorAll("circle").length).toBe(2);
    const without = render(<PowerDial on onToggle={() => {}} label="Plug" />);
    expect(without.container.querySelectorAll("circle").length).toBe(0);
  });
});

describe("ModeSelector", () => {
  it("is a radio group, so the choices are announced as alternatives", () => {
    render(
      <ModeSelector
        label="Fan speed"
        value="med"
        options={[
          { value: "low", label: "Low" },
          { value: "med", label: "Medium" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Fan speed" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Low" })).toHaveAttribute("aria-checked", "false");
  });

  it("reports the chosen value", () => {
    const onChange = jest.fn();
    render(
      <ModeSelector
        label="Fan speed"
        value="low"
        options={[
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onChange).toHaveBeenCalledWith("high");
  });
});

describe("SlideToConfirm", () => {
  it("does not fire on a plain click", () => {
    /*
     * The entire point. A control that opens a front door must not be one tap
     * from a phone that lives in a pocket next to that door.
     */
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to unlock" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Slide to unlock" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fires on a deliberate keyboard activation", () => {
    // Keyboard users need an equivalent commitment, not an exemption — but it
    // still cannot happen by brushing past.
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to unlock" onConfirm={onConfirm} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("stays inert while disabled", () => {
    const onConfirm = jest.fn();
    render(<SlideToConfirm label="Slide to unlock" onConfirm={onConfirm} disabled />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("describes the knob by the instruction", () => {
    render(<SlideToConfirm label="Slide to unlock" onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Slide to unlock" })).toBeInTheDocument();
  });
});
