import type { Device } from "./api";

/*
 * A device always has a state object by the time the app sees it.
 *
 * `Device.state` is typed as required, which says nothing about what actually
 * arrives: the control plane omits it for a device that has been claimed but
 * has never reported, and TypeScript cannot see through a JSON boundary. Every
 * screen then reads `d.state[field]` and the one that gets there first throws.
 *
 * That is what crashed the Rooms screen. It reads a power field for each device
 * in a room, so a single never-reported device took the whole screen down —
 * while the device list, which happens to read a different way, stayed up. The
 * crash therefore looked like it was about rooms.
 *
 * Fixed here, where devices enter, rather than at each read: there are dozens
 * of reads and one entrance, and the next screen someone writes will not know
 * to guard.
 */
export function withState(d: Device): Device {
  if (d && d.state && typeof d.state === "object") return d;
  return { ...d, state: {} };
}
