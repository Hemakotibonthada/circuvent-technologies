// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Generic State Machine
// Typed FSM with transitions, guards, actions, history,
// and pre-built machines for Tickets and Tasks.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface Transition<TState extends string, TEvent extends string> {
  from: TState | TState[];
  event: TEvent;
  to: TState;
  guard?: (context: Record<string, unknown>) => boolean;
  action?: (context: Record<string, unknown>) => void | Promise<void>;
}

export interface StateMachineConfig<TState extends string, TEvent extends string> {
  id: string;
  initial: TState;
  states: TState[];
  transitions: Transition<TState, TEvent>[];
  onTransition?: (from: TState, to: TState, event: TEvent, context: Record<string, unknown>) => void;
  onInvalidTransition?: (from: TState, event: TEvent) => void;
}

interface HistoryEntry<TState extends string, TEvent extends string> {
  from: TState;
  to: TState;
  event: TEvent;
  timestamp: number;
  context: Record<string, unknown>;
}

// ══════════════════════════════════════════════════════════════
// StateMachine
// ══════════════════════════════════════════════════════════════

export class StateMachine<TState extends string, TEvent extends string> {
  private currentState: TState;
  private readonly config: StateMachineConfig<TState, TEvent>;
  private context: Record<string, unknown>;
  private history: HistoryEntry<TState, TEvent>[] = [];
  private maxHistory: number;

  constructor(config: StateMachineConfig<TState, TEvent>, context: Record<string, unknown> = {}, maxHistory = 100) {
    if (!config.states.includes(config.initial)) {
      throw new Error(`Initial state "${config.initial}" is not in the states list`);
    }
    this.config = config;
    this.currentState = config.initial;
    this.context = { ...context };
    this.maxHistory = maxHistory;
  }

  // ── Getters ───────────────────────────────────────────────

  getState(): TState {
    return this.currentState;
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  getHistory(): HistoryEntry<TState, TEvent>[] {
    return [...this.history];
  }

  getId(): string {
    return this.config.id;
  }

  // ── Transition ────────────────────────────────────────────

  async transition(event: TEvent, additionalContext: Record<string, unknown> = {}): Promise<boolean> {
    const mergedContext = { ...this.context, ...additionalContext };

    const validTransitions = this.config.transitions.filter((t) => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      return fromStates.includes(this.currentState) && t.event === event;
    });

    if (validTransitions.length === 0) {
      this.config.onInvalidTransition?.(this.currentState, event);
      return false;
    }

    // Find first transition whose guard passes (or has no guard)
    const matched = validTransitions.find(
      (t) => !t.guard || t.guard(mergedContext),
    );

    if (!matched) {
      return false;
    }

    const from = this.currentState;
    const to = matched.to;

    // Execute action
    if (matched.action) {
      await matched.action(mergedContext);
    }

    // Record history
    this.history.push({
      from,
      to,
      event,
      timestamp: Date.now(),
      context: { ...mergedContext },
    });

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.currentState = to;
    this.context = mergedContext;

    this.config.onTransition?.(from, to, event, mergedContext);

    return true;
  }

  // ── Query ─────────────────────────────────────────────────

  can(event: TEvent): boolean {
    return this.config.transitions.some((t) => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      return fromStates.includes(this.currentState) && t.event === event;
    });
  }

  availableEvents(): TEvent[] {
    const events = new Set<TEvent>();
    for (const t of this.config.transitions) {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from];
      if (fromStates.includes(this.currentState)) {
        events.add(t.event);
      }
    }
    return Array.from(events);
  }

  isInState(state: TState): boolean {
    return this.currentState === state;
  }

  isFinal(): boolean {
    return this.availableEvents().length === 0;
  }

  // ── Context ───────────────────────────────────────────────

  setContext(updates: Record<string, unknown>): void {
    this.context = { ...this.context, ...updates };
  }

  // ── Reset ─────────────────────────────────────────────────

  reset(): void {
    this.currentState = this.config.initial;
    this.context = {};
    this.history = [];
  }

  // ── Serialization ─────────────────────────────────────────

  serialize(): { id: string; state: TState; context: Record<string, unknown>; history: HistoryEntry<TState, TEvent>[] } {
    return {
      id: this.config.id,
      state: this.currentState,
      context: { ...this.context },
      history: [...this.history],
    };
  }

  static deserialize<S extends string, E extends string>(
    config: StateMachineConfig<S, E>,
    data: { state: S; context: Record<string, unknown>; history: HistoryEntry<S, E>[] },
  ): StateMachine<S, E> {
    const machine = new StateMachine(config, data.context);
    (machine as any).currentState = data.state;
    (machine as any).history = data.history;
    return machine;
  }
}

// ══════════════════════════════════════════════════════════════
// Pre-built: TicketStateMachine
// ══════════════════════════════════════════════════════════════

export type TicketState = "OPEN" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "ESCALATED" | "RESOLVED" | "CLOSED" | "REOPENED";
export type TicketEvent = "ASSIGN" | "START_WORK" | "REQUEST_INFO" | "CUSTOMER_REPLY" | "ESCALATE" | "RESOLVE" | "CLOSE" | "REOPEN";

const TICKET_TRANSITIONS: Transition<TicketState, TicketEvent>[] = [
  { from: "OPEN", event: "ASSIGN", to: "IN_PROGRESS" },
  { from: "OPEN", event: "START_WORK", to: "IN_PROGRESS" },
  { from: "OPEN", event: "ESCALATE", to: "ESCALATED" },
  { from: "OPEN", event: "CLOSE", to: "CLOSED" },
  { from: "IN_PROGRESS", event: "REQUEST_INFO", to: "WAITING_ON_CUSTOMER" },
  { from: "IN_PROGRESS", event: "ESCALATE", to: "ESCALATED" },
  { from: "IN_PROGRESS", event: "RESOLVE", to: "RESOLVED" },
  { from: "WAITING_ON_CUSTOMER", event: "CUSTOMER_REPLY", to: "IN_PROGRESS" },
  { from: "WAITING_ON_CUSTOMER", event: "ESCALATE", to: "ESCALATED" },
  { from: "WAITING_ON_CUSTOMER", event: "CLOSE", to: "CLOSED" },
  { from: "ESCALATED", event: "ASSIGN", to: "IN_PROGRESS" },
  { from: "ESCALATED", event: "RESOLVE", to: "RESOLVED" },
  { from: "RESOLVED", event: "CLOSE", to: "CLOSED" },
  { from: "RESOLVED", event: "REOPEN", to: "REOPENED" },
  { from: "CLOSED", event: "REOPEN", to: "REOPENED" },
  { from: "REOPENED", event: "ASSIGN", to: "IN_PROGRESS" },
  { from: "REOPENED", event: "START_WORK", to: "IN_PROGRESS" },
  { from: "REOPENED", event: "ESCALATE", to: "ESCALATED" },
];

export function createTicketStateMachine(id: string, context: Record<string, unknown> = {}): StateMachine<TicketState, TicketEvent> {
  return new StateMachine<TicketState, TicketEvent>(
    {
      id,
      initial: "OPEN",
      states: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED", "REOPENED"],
      transitions: TICKET_TRANSITIONS,
    },
    context,
  );
}

// ══════════════════════════════════════════════════════════════
// Pre-built: TaskStateMachine
// ══════════════════════════════════════════════════════════════

export type TaskState = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
export type TaskEvent = "START" | "SUBMIT_REVIEW" | "APPROVE" | "REQUEST_CHANGES" | "BLOCK" | "UNBLOCK" | "COMPLETE" | "CANCEL" | "REOPEN";

const TASK_TRANSITIONS: Transition<TaskState, TaskEvent>[] = [
  { from: "TODO", event: "START", to: "IN_PROGRESS" },
  { from: "TODO", event: "CANCEL", to: "CANCELLED" },
  { from: "IN_PROGRESS", event: "SUBMIT_REVIEW", to: "IN_REVIEW" },
  { from: "IN_PROGRESS", event: "BLOCK", to: "BLOCKED" },
  { from: "IN_PROGRESS", event: "COMPLETE", to: "DONE" },
  { from: "IN_PROGRESS", event: "CANCEL", to: "CANCELLED" },
  { from: "IN_REVIEW", event: "APPROVE", to: "DONE" },
  { from: "IN_REVIEW", event: "REQUEST_CHANGES", to: "IN_PROGRESS" },
  { from: "IN_REVIEW", event: "CANCEL", to: "CANCELLED" },
  { from: "BLOCKED", event: "UNBLOCK", to: "IN_PROGRESS" },
  { from: "BLOCKED", event: "CANCEL", to: "CANCELLED" },
  { from: "DONE", event: "REOPEN", to: "TODO" },
  { from: "CANCELLED", event: "REOPEN", to: "TODO" },
];

export function createTaskStateMachine(id: string, context: Record<string, unknown> = {}): StateMachine<TaskState, TaskEvent> {
  return new StateMachine<TaskState, TaskEvent>(
    {
      id,
      initial: "TODO",
      states: ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"],
      transitions: TASK_TRANSITIONS,
    },
    context,
  );
}
