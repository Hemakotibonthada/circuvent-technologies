import { render } from "@testing-library/react";
import { DeviceTile } from "@/app/smarthome/_kit/device";
import type { Device } from "@/lib/control-plane";

/*
 * The maths is covered by tile-visual.test.ts. This checks the parts that only
 * exist once it is rendered: that the ring is actually drawn, that the spin is
 * actually attached, and — the one that matters — that neither appears on a
 * device that is off or unreachable. A tile animating for a device that is not
 * answering states something untrue about the hardware.
 */

jest.mock("@/lib/smarthome-realtime", () => ({
  haptic: () => {},
}));

const device = (over: Partial<Device> = {}): Device =>
  ({
    id: "d1",
    name: "Living room",
    type: "smart-light",
    online: true,
    state: { power: true, brightness: 60 },
    ...over,
  }) as unknown as Device;

function draw(d: Device) {
  return render(<DeviceTile device={d} status="idle" onSend={() => {}} />);
}

describe("DeviceTile visuals", () => {
  it("draws a level ring for a dimmable light that is on", () => {
    const { container } = draw(device());
    const arcs = container.querySelectorAll("circle[stroke-dasharray]");
    expect(arcs.length).toBe(1);
  });

  it("draws no ring for a device with no level", () => {
    const { container } = draw(device({ type: "smart-plug", state: { power: true } }));
    expect(container.querySelectorAll("circle[stroke-dasharray]").length).toBe(0);
  });

  it("spins a fan that is running", () => {
    const { container } = draw(device({ type: "smart-fan", state: { power: true, level: 80 } }));
    expect(container.querySelector(".cv-spin")).not.toBeNull();
  });

  it("does not spin a fan that is switched off", () => {
    const { container } = draw(device({ type: "smart-fan", state: { power: false, level: 0 } }));
    expect(container.querySelector(".cv-spin")).toBeNull();
  });

  it("does not animate a device that is offline", () => {
    // The state is stale by definition; animating it claims the hardware is
    // doing something we have no evidence for.
    const { container } = draw(device({ type: "smart-fan", online: false, state: { power: true, level: 80 } }));
    expect(container.querySelector(".cv-spin")).toBeNull();
    expect(container.querySelector(".cv-breathe")).toBeNull();
  });

  it("keeps the ring on an offline device, because the last level is still a fact", () => {
    const { container } = draw(device({ online: false, state: { power: true, brightness: 60 } }));
    expect(container.querySelectorAll("circle[stroke-dasharray]").length).toBe(1);
  });

  it("renders a coloured lamp in its own colour, not the type accent", () => {
    const { container } = draw(device({ state: { power: true, brightness: 90, color: "#FF0000" } }));
    const arc = container.querySelector("circle[stroke-dasharray]");
    expect(arc?.getAttribute("stroke")).toBe("#FF0000");
  });

  it("still names the device and its state for a screen reader", () => {
    // The graphics are additive: nothing here may replace the text.
    const { getByText, getByLabelText } = draw(device());
    expect(getByText("Living room")).toBeInTheDocument();
    expect(getByLabelText(/turn off living room/i)).toBeInTheDocument();
  });
});
