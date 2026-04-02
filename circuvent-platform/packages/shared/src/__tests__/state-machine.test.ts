// ──────────────────────────────────────────────────────────────
// StateMachine — Test Suite
// Tests for generic state machine, transitions, guards,
// actions, history, serialization, and pre-built machines.
// ──────────────────────────────────────────────────────────────

import {
  StateMachine,
  createTicketStateMachine,
  createTaskStateMachine,
} from "../utils/state-machine";
import type { Transition, StateMachineConfig } from "../utils/state-machine";

// ══════════════════════════════════════════════════════════════
// Generic StateMachine
// ══════════════════════════════════════════════════════════════

describe("StateMachine — Generic", () => {
  type TrafficState = "RED" | "YELLOW" | "GREEN";
  type TrafficEvent = "NEXT" | "EMERGENCY";

  const trafficConfig: StateMachineConfig<TrafficState, TrafficEvent> = {
    id: "traffic-light",
    initial: "RED",
    states: ["RED", "YELLOW", "GREEN"],
    transitions: [
      { from: "RED", event: "NEXT", to: "GREEN" },
      { from: "GREEN", event: "NEXT", to: "YELLOW" },
      { from: "YELLOW", event: "NEXT", to: "RED" },
      { from: ["RED", "GREEN", "YELLOW"], event: "EMERGENCY", to: "RED" },
    ],
  };

  it("should initialize with correct state", () => {
    const sm = new StateMachine(trafficConfig);
    expect(sm.getState()).toBe("RED");
  });

  it("should throw for invalid initial state", () => {
    expect(() => new StateMachine({ ...trafficConfig, initial: "BLUE" as any })).toThrow();
  });

  it("should transition to next state", async () => {
    const sm = new StateMachine(trafficConfig);
    const result = await sm.transition("NEXT");
    expect(result).toBe(true);
    expect(sm.getState()).toBe("GREEN");
  });

  it("should handle full cycle", async () => {
    const sm = new StateMachine(trafficConfig);
    await sm.transition("NEXT"); // RED -> GREEN
    await sm.transition("NEXT"); // GREEN -> YELLOW
    await sm.transition("NEXT"); // YELLOW -> RED
    expect(sm.getState()).toBe("RED");
  });

  it("should handle emergency from any state", async () => {
    const sm = new StateMachine(trafficConfig);
    await sm.transition("NEXT"); // GREEN
    await sm.transition("EMERGENCY");
    expect(sm.getState()).toBe("RED");
  });

  it("should return false for invalid transitions", async () => {
    const sm = new StateMachine(trafficConfig);
    // RED doesn't have EMERGENCY from itself... wait it does. Let's test a different invalid one
    // Actually "EMERGENCY" from RED goes to RED. Let's create a scenario with no valid transition
    const config: StateMachineConfig<"A" | "B", "GO" | "STOP"> = {
      id: "simple",
      initial: "A",
      states: ["A", "B"],
      transitions: [{ from: "A", event: "GO", to: "B" }],
    };
    const sm2 = new StateMachine(config);
    const result = await sm2.transition("STOP");
    expect(result).toBe(false);
    expect(sm2.getState()).toBe("A");
  });

  it("should check if event is available", () => {
    const sm = new StateMachine(trafficConfig);
    expect(sm.can("NEXT")).toBe(true);
    expect(sm.can("EMERGENCY")).toBe(true);
  });

  it("should list available events", () => {
    const sm = new StateMachine(trafficConfig);
    const events = sm.availableEvents();
    expect(events).toContain("NEXT");
    expect(events).toContain("EMERGENCY");
  });

  it("should record history", async () => {
    const sm = new StateMachine(trafficConfig);
    await sm.transition("NEXT");
    await sm.transition("NEXT");
    const history = sm.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].from).toBe("RED");
    expect(history[0].to).toBe("GREEN");
  });

  it("should support guards", async () => {
    const config: StateMachineConfig<"LOCKED" | "UNLOCKED", "INSERT_COIN" | "PUSH"> = {
      id: "turnstile",
      initial: "LOCKED",
      states: ["LOCKED", "UNLOCKED"],
      transitions: [
        { from: "LOCKED", event: "INSERT_COIN", to: "UNLOCKED", guard: (ctx) => (ctx.coins as number) >= 1 },
        { from: "UNLOCKED", event: "PUSH", to: "LOCKED" },
      ],
    };
    const sm = new StateMachine(config, { coins: 0 });
    const fail = await sm.transition("INSERT_COIN");
    expect(fail).toBe(false);
    expect(sm.getState()).toBe("LOCKED");

    const success = await sm.transition("INSERT_COIN", { coins: 1 });
    expect(success).toBe(true);
    expect(sm.getState()).toBe("UNLOCKED");
  });

  it("should execute actions on transition", async () => {
    let actionCalled = false;
    const config: StateMachineConfig<"A" | "B", "GO"> = {
      id: "action-test",
      initial: "A",
      states: ["A", "B"],
      transitions: [
        { from: "A", event: "GO", to: "B", action: async () => { actionCalled = true; } },
      ],
    };
    const sm = new StateMachine(config);
    await sm.transition("GO");
    expect(actionCalled).toBe(true);
  });

  it("should support onTransition callback", async () => {
    let callbackData: any = null;
    const config = {
      ...trafficConfig,
      onTransition: (from: any, to: any, event: any) => { callbackData = { from, to, event }; },
    };
    const sm = new StateMachine(config);
    await sm.transition("NEXT");
    expect(callbackData).toEqual({ from: "RED", to: "GREEN", event: "NEXT" });
  });

  it("should serialize and deserialize", async () => {
    const sm = new StateMachine(trafficConfig, { counter: 1 });
    await sm.transition("NEXT");
    const serialized = sm.serialize();

    const restored = StateMachine.deserialize(trafficConfig, serialized);
    expect(restored.getState()).toBe("GREEN");
    expect(restored.getContext().counter).toBe(1);
  });

  it("should reset to initial state", async () => {
    const sm = new StateMachine(trafficConfig);
    await sm.transition("NEXT");
    sm.reset();
    expect(sm.getState()).toBe("RED");
    expect(sm.getHistory().length).toBe(0);
  });

  it("should detect final states", () => {
    const config: StateMachineConfig<"A" | "B", "GO"> = {
      id: "final-test",
      initial: "A",
      states: ["A", "B"],
      transitions: [{ from: "A", event: "GO", to: "B" }],
    };
    const sm = new StateMachine(config);
    expect(sm.isFinal()).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// TicketStateMachine
// ══════════════════════════════════════════════════════════════

describe("TicketStateMachine", () => {
  it("should start in OPEN state", () => {
    const sm = createTicketStateMachine("ticket-1");
    expect(sm.getState()).toBe("OPEN");
  });

  it("should transition OPEN -> IN_PROGRESS via ASSIGN", async () => {
    const sm = createTicketStateMachine("ticket-1");
    await sm.transition("ASSIGN");
    expect(sm.getState()).toBe("IN_PROGRESS");
  });

  it("should support full ticket lifecycle", async () => {
    const sm = createTicketStateMachine("ticket-1");
    await sm.transition("START_WORK");                // -> IN_PROGRESS
    await sm.transition("REQUEST_INFO");               // -> WAITING_ON_CUSTOMER
    await sm.transition("CUSTOMER_REPLY");             // -> IN_PROGRESS
    await sm.transition("RESOLVE");                    // -> RESOLVED
    await sm.transition("CLOSE");                      // -> CLOSED
    expect(sm.getState()).toBe("CLOSED");
  });

  it("should support escalation", async () => {
    const sm = createTicketStateMachine("ticket-1");
    await sm.transition("ESCALATE");
    expect(sm.getState()).toBe("ESCALATED");
  });

  it("should support reopen from CLOSED", async () => {
    const sm = createTicketStateMachine("ticket-1");
    await sm.transition("START_WORK");
    await sm.transition("RESOLVE");
    await sm.transition("CLOSE");
    await sm.transition("REOPEN");
    expect(sm.getState()).toBe("REOPENED");
  });
});

// ══════════════════════════════════════════════════════════════
// TaskStateMachine
// ══════════════════════════════════════════════════════════════

describe("TaskStateMachine", () => {
  it("should start in TODO state", () => {
    const sm = createTaskStateMachine("task-1");
    expect(sm.getState()).toBe("TODO");
  });

  it("should support task lifecycle", async () => {
    const sm = createTaskStateMachine("task-1");
    await sm.transition("START");           // -> IN_PROGRESS
    await sm.transition("SUBMIT_REVIEW");   // -> IN_REVIEW
    await sm.transition("APPROVE");         // -> DONE
    expect(sm.getState()).toBe("DONE");
  });

  it("should support request changes flow", async () => {
    const sm = createTaskStateMachine("task-1");
    await sm.transition("START");
    await sm.transition("SUBMIT_REVIEW");
    await sm.transition("REQUEST_CHANGES");
    expect(sm.getState()).toBe("IN_PROGRESS");
  });

  it("should support blocking and unblocking", async () => {
    const sm = createTaskStateMachine("task-1");
    await sm.transition("START");
    await sm.transition("BLOCK");
    expect(sm.getState()).toBe("BLOCKED");
    await sm.transition("UNBLOCK");
    expect(sm.getState()).toBe("IN_PROGRESS");
  });

  it("should support cancellation and reopen", async () => {
    const sm = createTaskStateMachine("task-1");
    await sm.transition("CANCEL");
    expect(sm.getState()).toBe("CANCELLED");
    await sm.transition("REOPEN");
    expect(sm.getState()).toBe("TODO");
  });
});
