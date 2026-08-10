import { withState } from "../mobile/src/device-shape";
import type { Device } from "../mobile/src/api";

/*
 * The Rooms screen crashed on opening any room.
 *
 * It reads a power field for each device in the room — `d.state[field]` — and
 * `Device.state` is typed as required, which says nothing about what actually
 * arrives over JSON. The control plane omits it for a device that has been
 * claimed but has never reported, so one such device took the whole screen
 * down, while the device list happened to read a different way and stayed up.
 * The crash therefore looked like it was about rooms.
 *
 * Normalised where devices enter rather than at each read: dozens of reads, one
 * entrance, and the next screen someone writes will not know to guard.
 */
const bare = (over: Partial<Device> = {}) =>
  ({ id: "d1", type: "smart-switch", name: "Lamp", online: true, ...over }) as Device;

describe("a device always has a state object by the time a screen sees it", () => {
  it("gives one to a device that has never reported", () => {
    const d = withState(bare({ state: undefined as never }));
    expect(d.state).toEqual({});
    expect(() => d.state["power"]).not.toThrow();
  });

  it("gives one when the field is null rather than missing", () => {
    expect(withState(bare({ state: null as never })).state).toEqual({});
  });

  it("does not disturb a device that has state", () => {
    const original = bare({ state: { power: true, watts: 12 } });
    const out = withState(original);
    expect(out).toBe(original);
    expect(out.state.power).toBe(true);
  });

  /*
   * A string would pass a truthiness check and then index to characters, which
   * is worse than throwing: `state["power"]` would quietly be undefined.
   */
  it("replaces a state that is not an object at all", () => {
    expect(withState(bare({ state: "on" as never })).state).toEqual({});
    expect(withState(bare({ state: 5 as never })).state).toEqual({});
  });

  it("keeps everything else about the device", () => {
    const out = withState(bare({ state: undefined as never, room: "Kitchen", name: "Kettle" }));
    expect(out.room).toBe("Kitchen");
    expect(out.name).toBe("Kettle");
    expect(out.id).toBe("d1");
  });
});
