import { actionList, primaryAction } from "./control-plane";
import type { AutomationAction } from "./control-plane";

// The control plane has always accepted `action` as either a single object or
// an ordered list — `runActions` normalises with Array.isArray — but the client
// only declared the single form. Every consumer that read `.action.type`
// therefore mis-read a sequence. These pin the normalising helpers that the
// consumers now share.

const cmd: AutomationAction = { type: "command", deviceId: "d1", command: { power: true } };
const notify: AutomationAction = { type: "notify", title: "Hi" };
const speak: AutomationAction = { type: "tts", deviceId: "d2", text: "Welcome {name}", delayMs: 2000 };

describe("actionList", () => {
  it("wraps a single action", () => {
    expect(actionList(cmd)).toEqual([cmd]);
  });

  it("passes a sequence through in order", () => {
    expect(actionList([cmd, speak, notify])).toEqual([cmd, speak, notify]);
  });

  it("treats a missing action as no steps rather than throwing", () => {
    expect(actionList(undefined)).toEqual([]);
    expect(actionList(null)).toEqual([]);
  });

  it("returns an empty list for an empty sequence", () => {
    expect(actionList([])).toEqual([]);
  });

  it("does not lose steps beyond the first, which was the original bug", () => {
    expect(actionList([cmd, speak, notify])).toHaveLength(3);
  });
});

describe("primaryAction", () => {
  it("is the action itself when there is only one", () => {
    expect(primaryAction(cmd)).toBe(cmd);
  });

  it("is the first step of a sequence", () => {
    expect(primaryAction([speak, cmd])).toBe(speak);
  });

  it("is undefined when there is nothing to do", () => {
    expect(primaryAction(undefined)).toBeUndefined();
    expect(primaryAction([])).toBeUndefined();
  });
});
