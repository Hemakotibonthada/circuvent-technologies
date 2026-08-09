import { render, screen, fireEvent } from "@testing-library/react";
import { Slider } from "./Slider";

/*
 * The point of this component is that dragging does NOT send a command per
 * pixel. That is the behaviour worth pinning down: the previous
 * <input type="range"> published about a hundred MQTT messages for one drag,
 * and an ESP32 parses and persists every one of them.
 */

/*
 * jsdom has no PointerEvent, so fireEvent.pointerDown creates a plain Event
 * with no clientX -- every value came out NaN. MouseEvent carries clientX and
 * React listens for the same "pointerdown" name, so this dispatches something
 * the component can actually read.
 */
function pointer(el: Element, type: string, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  fireEvent(el, ev);
}
function setupTrack() {
  // jsdom gives every element a zero-size rect, so a pointer position cannot be
  // turned into a value without one. 200px wide starting at x=0 makes the
  // arithmetic obvious: clientX is the percentage.
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, width: 200, height: 8, right: 200, bottom: 8, x: 0, y: 0, toJSON: () => ({}) }),
  });
}

describe("Slider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setupTrack();
  });
  afterEach(() => jest.useRealTimers());

  it("sends nothing until the drag settles", () => {
    const onCommit = jest.fn();
    render(<Slider label="Brightness" value={0} onCommit={onCommit} min={0} max={100} />);
    const slider = screen.getByRole("slider");

    pointer(slider, "pointerdown", 20);
    for (let x = 20; x <= 120; x += 5) {
      pointer(slider, "pointermove", x);
    }
    // Twenty-one pointer events so far.
    expect(onCommit).not.toHaveBeenCalled();

    pointer(slider, "pointerup", 120);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(60);
  });

  it("commits a drag that is held without releasing", () => {
    const onCommit = jest.fn();
    render(<Slider label="Brightness" value={0} onCommit={onCommit} min={0} max={100} commitMs={180} />);
    const slider = screen.getByRole("slider");

    pointer(slider, "pointerdown", 50);
    jest.advanceTimersByTime(200);
    expect(onCommit).toHaveBeenCalledWith(25);
  });

  it("follows the device again once the drag ends", () => {
    const onCommit = jest.fn();
    const { rerender } = render(<Slider label="Brightness" value={10} onCommit={onCommit} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "10");

    // Someone turns the light down at the wall.
    rerender(<Slider label="Brightness" value={80} onCommit={onCommit} />);
    expect(slider).toHaveAttribute("aria-valuenow", "80");
  });

  it("ignores the device while a finger is down, so the value does not jump", () => {
    const onCommit = jest.fn();
    const { rerender } = render(<Slider label="Brightness" value={10} onCommit={onCommit} />);
    const slider = screen.getByRole("slider");

    pointer(slider, "pointerdown", 100);
    rerender(<Slider label="Brightness" value={3} onCommit={onCommit} />);
    // Still where the finger is, not where a stale echo says.
    expect(slider).toHaveAttribute("aria-valuenow", "50");
  });

  it("can be set from the keyboard", () => {
    const onCommit = jest.fn();
    render(<Slider label="Fan" value={2} onCommit={onCommit} min={0} max={5} step={1} />);
    const slider = screen.getByRole("slider");

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onCommit).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(slider, { key: "End" });
    expect(onCommit).toHaveBeenLastCalledWith(5);

    fireEvent.keyDown(slider, { key: "Home" });
    expect(onCommit).toHaveBeenLastCalledWith(0);
  });

  it("snaps to whole steps, so a fan cannot be asked for speed 2.4", () => {
    const onCommit = jest.fn();
    render(<Slider label="Fan" value={0} onCommit={onCommit} min={0} max={5} step={1} />);
    const slider = screen.getByRole("slider");

    pointer(slider, "pointerdown", 97);
    pointer(slider, "pointerup", 97);
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it("does not send the same value twice", () => {
    const onCommit = jest.fn();
    render(<Slider label="Brightness" value={50} onCommit={onCommit} min={0} max={100} />);
    const slider = screen.getByRole("slider");

    pointer(slider, "pointerdown", 100);
    pointer(slider, "pointerup", 100);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("announces itself to a screen reader", () => {
    render(<Slider label="Brightness" value={40} onCommit={() => {}} unit="%" />);
    const slider = screen.getByRole("slider", { name: "Brightness" });
    expect(slider).toHaveAttribute("aria-valuetext", "40%");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
  });
});
