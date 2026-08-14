/** @jest-environment node */

/**
 * A refused command has to say so.
 *
 * The optimistic paint makes silence actively misleading: the control moves
 * the instant it is pressed, so a failure that says nothing looks like a lock
 * opening and closing again. Before this, the server's sentence went into a
 * latency-diagnostics sink and the person saw a red flash.
 *
 * These tests are about the broadcast rather than the rendering, because the
 * broadcast is the part that must not be forgotten — there are a dozen
 * surfaces that send commands, and the one nobody wires up is a control that
 * silently does nothing.
 */

import { notifyCommandError, onCommandError, type CommandError } from "@/lib/smarthome-realtime";

describe("command failure broadcast", () => {
  it("delivers a refusal to every listener", () => {
    const seen: CommandError[] = [];
    const off1 = onCommandError((e) => seen.push(e));
    const off2 = onCommandError((e) => seen.push(e));

    notifyCommandError({
      message: "Guests cannot unlock doors. Ask the home owner to change your access.",
      refused: true,
      at: 1,
      deviceId: "lock-1",
    });

    expect(seen).toHaveLength(2);
    expect(seen[0].refused).toBe(true);
    expect(seen[0].message).toContain("Guests cannot unlock doors");
    off1();
    off2();
  });

  it("stops delivering once unsubscribed", () => {
    const seen: CommandError[] = [];
    const off = onCommandError((e) => seen.push(e));
    off();
    notifyCommandError({ message: "x", refused: false, at: 1 });
    expect(seen).toHaveLength(0);
  });

  it("one broken listener does not swallow the message for the rest", () => {
    // A console with a crashing panel must still tell somebody why their door
    // did not open.
    const seen: CommandError[] = [];
    const offBad = onCommandError(() => {
      throw new Error("listener blew up");
    });
    const offGood = onCommandError((e) => seen.push(e));

    expect(() => notifyCommandError({ message: "still delivered", refused: true, at: 2 })).not.toThrow();
    expect(seen).toHaveLength(1);
    expect(seen[0].message).toBe("still delivered");
    offBad();
    offGood();
  });

  it("keeps refusals and faults apart", () => {
    /*
     * They need different words. A fault invites a retry and a refusal does
     * not — telling somebody with view-only access that the lock "failed"
     * sends them to press it again, and again.
     */
    const seen: CommandError[] = [];
    const off = onCommandError((e) => seen.push(e));

    notifyCommandError({ message: "Your access to this home is view-only.", refused: true, at: 3 });
    notifyCommandError({ message: "The device broker is temporarily unavailable — please retry.", refused: false, at: 4 });

    expect(seen.map((e) => e.refused)).toEqual([true, false]);
    off();
  });

  it("carries the device so a surface can point at the right control", () => {
    const seen: CommandError[] = [];
    const off = onCommandError((e) => seen.push(e));
    notifyCommandError({ message: "no", refused: true, at: 5, deviceId: "front-door" });
    expect(seen[0].deviceId).toBe("front-door");
    off();
  });
});
