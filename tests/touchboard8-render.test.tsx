/**
 * The 8-gang board must actually draw eight working switches.
 *
 * tests/touchboard8-parity.test.ts proves the type is registered in every list
 * it needs to be in. That is necessary and it is not sufficient: every one of
 * those lists could be right while the panel still renders three tiles,
 * because the component is what decides, and it used to hold its own literal
 * array of gangs.
 *
 * So this one renders it. It counts the switches a person would see and
 * presses one, which is the only version of this check that could have caught
 * a component that ignores the field list it was given.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceControls } from "@/app/smarthome/DeviceControls";
import type { Device } from "@/lib/control-plane";

jest.mock("@/lib/smarthome-realtime", () => ({
  haptic: () => {},
}));

const board = (type: string, gangs: number, over: Record<string, unknown> = {}): Device => {
  const state: Record<string, unknown> = {
    watts: 828, volts: 230, amps: 3.6, pf: 0.97, kwh: 12.5,
    backlight: 60, gangs, pads: gangs,
  };
  // Defaults first, overrides last — the other order silently switches every
  // gang back off and makes a caller's `{ g2: true }` do nothing.
  for (let i = 1; i <= gangs; i++) state[`g${i}`] = false;
  Object.assign(state, over);
  return {
    id: "tb8-1", name: "Hall board", type, online: true, state,
  } as unknown as Device;
};

function draw(d: Device, send: (p: Record<string, unknown>) => void = () => {}) {
  return render(<DeviceControls device={d} send={send} st={() => "idle"} />);
}

describe("the 8-gang touch board renders eight gangs", () => {
  it("draws a switch for every gang", () => {
    draw(board("touchboard-8", 8));
    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`Gang ${i}`)).toBeInTheDocument();
    }
  });

  it("does not draw a ninth", () => {
    draw(board("touchboard-8", 8));
    expect(screen.queryByText("Gang 9")).not.toBeInTheDocument();
  });

  it("still draws exactly three for the 3-gang board", () => {
    /*
     * Both boards share one component now. The failure that would introduce is
     * the 3-gang panel growing five switches that address relays it does not
     * have — every one of them a toggle that pins and never resolves.
     */
    draw(board("touchboard", 3));
    expect(screen.getByText("Gang 3")).toBeInTheDocument();
    expect(screen.queryByText("Gang 4")).not.toBeInTheDocument();
  });

  it("counts the gangs that are on, out of the number that exist", () => {
    const { container } = draw(board("touchboard-8", 8, { g2: true, g5: true }));
    // Matched on the container's text because the count and the label are
    // separate nodes, which getByText treats as different elements.
    expect(container.textContent).toContain("2/8 on");
  });

  it("sends the gang's own field when its switch is pressed", () => {
    /*
     * The point of the whole exercise. A tile that renders but addresses the
     * wrong field is the defect this codebase keeps finding, and it looks
     * identical to a working one until the hardware fails to move.
     *
     * Taken by position rather than by walking up from the label: the switches
     * are rendered in gang order, so index 6 is Gang 7, and asserting that is
     * also asserting the order a person reads them in.
     */
    const sent: Record<string, unknown>[] = [];
    const { container } = draw(board("touchboard-8", 8), (p) => sent.push(p));

    const switches = container.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(8);
    fireEvent.click(switches[6]);

    expect(sent).toEqual([{ g7: true }]);
  });

  it("offers a whole-board switch that the firmware reads", () => {
    // `all` is a real command in touchboard-8.ino; sending eight separate
    // fields instead would defeat the staggering the sketch does deliberately.
    const sent: Record<string, unknown>[] = [];
    draw(board("touchboard-8", 8), (p) => sent.push(p));
    fireEvent.click(screen.getByText("All on"));
    expect(sent).toContainEqual({ all: true });
  });
});
