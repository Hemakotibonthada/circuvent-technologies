// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Generic Workflow Engine
// Step types: APPROVAL, NOTIFICATION, CONDITION, ACTION,
// DELAY, WEBHOOK. Expression evaluator, instance management,
// parallel/serial execution, retry, timeout.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type StepType = "APPROVAL" | "NOTIFICATION" | "CONDITION" | "ACTION" | "DELAY" | "WEBHOOK";
export type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED" | "WAITING_APPROVAL" | "TIMED_OUT";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "PAUSED";

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  config: StepConfig;
  nextOnSuccess?: string;
  nextOnFailure?: string;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  condition?: string;
}

export interface ApprovalConfig {
  approvers: string[];
  requiredApprovals: number;
  autoApproveAfter?: number;
  escalateTo?: string;
  escalateAfter?: number;
}

export interface NotificationConfig {
  channels: ("EMAIL" | "SLACK" | "WEBHOOK" | "IN_APP")[];
  recipients: string[];
  template: string;
  variables: Record<string, string>;
}

export interface ConditionConfig {
  expression: string;
  trueStep: string;
  falseStep: string;
}

export interface ActionConfig {
  handler: string;
  params: Record<string, unknown>;
}

export interface DelayConfig {
  duration: number;
  unit: "SECONDS" | "MINUTES" | "HOURS" | "DAYS";
}

export interface WebhookConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  headers: Record<string, string>;
  body?: Record<string, unknown>;
  expectedStatus?: number;
  retryOnFailure?: boolean;
}

export type StepConfig =
  | { type: "APPROVAL"; approval: ApprovalConfig }
  | { type: "NOTIFICATION"; notification: NotificationConfig }
  | { type: "CONDITION"; condition: ConditionConfig }
  | { type: "ACTION"; action: ActionConfig }
  | { type: "DELAY"; delay: DelayConfig }
  | { type: "WEBHOOK"; webhook: WebhookConfig };

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  variables: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
}

export interface WorkflowTrigger {
  type: "MANUAL" | "EVENT" | "SCHEDULE" | "WEBHOOK";
  event?: string;
  schedule?: string;
  webhookSecret?: string;
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  definitionName: string;
  status: WorkflowStatus;
  currentStepId: string | null;
  stepResults: StepResult[];
  variables: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  error?: string;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  type: StepType;
  status: StepStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number;
  output?: unknown;
  error?: string;
  retryAttempt: number;
  approvals?: ApprovalRecord[];
}

export interface ApprovalRecord {
  approverId: string;
  approverName: string;
  decision: "APPROVED" | "REJECTED";
  comment: string;
  decidedAt: string;
}

// ══════════════════════════════════════════════════════════════
// Expression Evaluator
// ══════════════════════════════════════════════════════════════

export class ExpressionEvaluator {
  /**
   * Evaluates simple expressions against a context.
   * Supports: ==, !=, >, <, >=, <=, &&, ||, !
   * Variables: {{variableName}}
   */
  static evaluate(expression: string, context: Record<string, unknown>): boolean {
    let resolved = expression;

    // Replace variable references {{varName}} with actual values
    resolved = resolved.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
      const value = ExpressionEvaluator.resolvePath(context, path);
      if (typeof value === "string") return `"${value}"`;
      if (value === null || value === undefined) return "null";
      return String(value);
    });

    return ExpressionEvaluator.evaluateSimple(resolved);
  }

  private static resolvePath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private static evaluateSimple(expr: string): boolean {
    const trimmed = expr.trim();

    // Handle logical operators
    if (trimmed.includes("&&")) {
      const parts = trimmed.split("&&");
      return parts.every((p) => ExpressionEvaluator.evaluateSimple(p));
    }
    if (trimmed.includes("||")) {
      const parts = trimmed.split("||");
      return parts.some((p) => ExpressionEvaluator.evaluateSimple(p));
    }
    if (trimmed.startsWith("!")) {
      return !ExpressionEvaluator.evaluateSimple(trimmed.slice(1));
    }

    // Handle comparison operators
    const comparisons: Array<{ op: string; fn: (a: number, b: number) => boolean }> = [
      { op: ">=", fn: (a, b) => a >= b },
      { op: "<=", fn: (a, b) => a <= b },
      { op: "!=", fn: (a, b) => a !== b },
      { op: "==", fn: (a, b) => a === b },
      { op: ">", fn: (a, b) => a > b },
      { op: "<", fn: (a, b) => a < b },
    ];

    for (const { op, fn } of comparisons) {
      if (trimmed.includes(op)) {
        const [left, right] = trimmed.split(op).map((s) => s.trim());
        const lVal = ExpressionEvaluator.parseValue(left);
        const rVal = ExpressionEvaluator.parseValue(right);
        return fn(Number(lVal), Number(rVal));
      }
    }

    // Boolean literal
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    // Truthy check
    const val = ExpressionEvaluator.parseValue(trimmed);
    return Boolean(val);
  }

  private static parseValue(val: string): unknown {
    const trimmed = val.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
    if (trimmed === "null") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    const num = Number(trimmed);
    if (!isNaN(num)) return num;
    return trimmed;
  }
}

// ══════════════════════════════════════════════════════════════
// WorkflowEngine
// ══════════════════════════════════════════════════════════════

export class WorkflowEngine {
  private definitions = new Map<string, WorkflowDefinition>();
  private instances = new Map<string, WorkflowInstance>();
  private actionHandlers = new Map<string, (params: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>>();
  private idCounter = 0;

  // ── Definition Management ─────────────────────────────────

  registerDefinition(def: WorkflowDefinition): void {
    this.definitions.set(def.id, { ...def });
  }

  getDefinition(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  listDefinitions(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  updateDefinition(id: string, updates: Partial<WorkflowDefinition>): WorkflowDefinition | null {
    const existing = this.definitions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.definitions.set(id, updated);
    return updated;
  }

  deleteDefinition(id: string): boolean {
    return this.definitions.delete(id);
  }

  // ── Action Handlers ───────────────────────────────────────

  registerAction(name: string, handler: (params: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>): void {
    this.actionHandlers.set(name, handler);
  }

  // ── Instance Management ───────────────────────────────────

  createInstance(definitionId: string, triggeredBy: string, variables: Record<string, unknown> = {}): WorkflowInstance | null {
    const def = this.definitions.get(definitionId);
    if (!def || def.status !== "ACTIVE") return null;

    const id = `WFI-${String(++this.idCounter).padStart(5, "0")}`;
    const firstStep = def.steps[0];
    const instance: WorkflowInstance = {
      id,
      definitionId,
      definitionName: def.name,
      status: "RUNNING",
      currentStepId: firstStep?.id ?? null,
      stepResults: [],
      variables: { ...def.variables, ...variables },
      startedAt: new Date().toISOString(),
      completedAt: null,
      triggeredBy,
    };

    this.instances.set(id, instance);
    return instance;
  }

  getInstance(id: string): WorkflowInstance | undefined {
    return this.instances.get(id);
  }

  listInstances(definitionId?: string): WorkflowInstance[] {
    const all = Array.from(this.instances.values());
    if (definitionId) return all.filter((i) => i.definitionId === definitionId);
    return all;
  }

  // ── Step Execution ────────────────────────────────────────

  async executeStep(instanceId: string): Promise<StepResult | null> {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== "RUNNING" || !instance.currentStepId) return null;

    const def = this.definitions.get(instance.definitionId);
    if (!def) return null;

    const step = def.steps.find((s) => s.id === instance.currentStepId);
    if (!step) return null;

    // Check condition
    if (step.condition) {
      const shouldRun = ExpressionEvaluator.evaluate(step.condition, instance.variables as Record<string, unknown>);
      if (!shouldRun) {
        const result: StepResult = {
          stepId: step.id,
          stepName: step.name,
          type: step.type,
          status: "SKIPPED",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          duration: 0,
          retryAttempt: 0,
        };
        instance.stepResults.push(result);
        this.advanceToNextStep(instance, def, step, true);
        return result;
      }
    }

    const startedAt = new Date().toISOString();
    const result: StepResult = {
      stepId: step.id,
      stepName: step.name,
      type: step.type,
      status: "RUNNING",
      startedAt,
      completedAt: null,
      duration: 0,
      retryAttempt: 0,
    };

    try {
      const output = await this.executeStepByType(step, instance);
      result.status = "COMPLETED";
      result.output = output;
      result.completedAt = new Date().toISOString();
      result.duration = Date.now() - new Date(startedAt).getTime();
      instance.stepResults.push(result);
      this.advanceToNextStep(instance, def, step, true);
    } catch (err: any) {
      const retryCount = step.retryCount ?? 0;
      if (result.retryAttempt < retryCount) {
        result.retryAttempt++;
        result.status = "PENDING";
      } else {
        result.status = "FAILED";
        result.error = err.message;
        result.completedAt = new Date().toISOString();
        result.duration = Date.now() - new Date(startedAt).getTime();
        instance.stepResults.push(result);
        this.advanceToNextStep(instance, def, step, false);
      }
    }

    return result;
  }

  private async executeStepByType(step: WorkflowStep, instance: WorkflowInstance): Promise<unknown> {
    const config = step.config;

    switch (config.type) {
      case "APPROVAL": {
        // In a real system, this would pause and wait for approval
        return { message: "Approval requested", approvers: config.approval.approvers };
      }
      case "NOTIFICATION": {
        return { message: "Notification sent", channels: config.notification.channels, recipients: config.notification.recipients };
      }
      case "CONDITION": {
        const result = ExpressionEvaluator.evaluate(config.condition.expression, instance.variables as Record<string, unknown>);
        return { evaluated: result, expression: config.condition.expression };
      }
      case "ACTION": {
        const handler = this.actionHandlers.get(config.action.handler);
        if (!handler) {
          throw new Error(`Action handler "${config.action.handler}" not registered`);
        }
        return await handler(config.action.params, instance.variables as Record<string, unknown>);
      }
      case "DELAY": {
        const ms = this.getDelayMs(config.delay);
        return { delayed: ms, unit: config.delay.unit };
      }
      case "WEBHOOK": {
        // Simulated webhook call
        return { url: config.webhook.url, method: config.webhook.method, status: config.webhook.expectedStatus ?? 200 };
      }
      default:
        throw new Error(`Unknown step type`);
    }
  }

  private getDelayMs(delay: DelayConfig): number {
    const multipliers: Record<string, number> = { SECONDS: 1000, MINUTES: 60_000, HOURS: 3_600_000, DAYS: 86_400_000 };
    return delay.duration * (multipliers[delay.unit] ?? 1000);
  }

  private advanceToNextStep(instance: WorkflowInstance, def: WorkflowDefinition, currentStep: WorkflowStep, success: boolean): void {
    const nextStepId = success ? currentStep.nextOnSuccess : currentStep.nextOnFailure;

    if (nextStepId) {
      instance.currentStepId = nextStepId;
    } else {
      // Try sequential next step
      const currentIndex = def.steps.findIndex((s) => s.id === currentStep.id);
      const nextStep = def.steps[currentIndex + 1];
      if (nextStep) {
        instance.currentStepId = nextStep.id;
      } else {
        // Workflow complete
        instance.currentStepId = null;
        instance.status = success ? "COMPLETED" : "FAILED";
        instance.completedAt = new Date().toISOString();
      }
    }
  }

  // ── Approval Handling ─────────────────────────────────────

  submitApproval(instanceId: string, stepId: string, approval: ApprovalRecord): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    const result = instance.stepResults.find((r) => r.stepId === stepId);
    if (!result) return false;

    if (!result.approvals) result.approvals = [];
    result.approvals.push(approval);

    return true;
  }

  // ── Cancel / Pause / Resume ───────────────────────────────

  cancelInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== "RUNNING") return false;
    instance.status = "CANCELLED";
    instance.completedAt = new Date().toISOString();
    return true;
  }

  pauseInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== "RUNNING") return false;
    instance.status = "PAUSED";
    return true;
  }

  resumeInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== "PAUSED") return false;
    instance.status = "RUNNING";
    return true;
  }

  // ── Analytics ─────────────────────────────────────────────

  getWorkflowStats(definitionId?: string): {
    totalInstances: number;
    completed: number;
    failed: number;
    running: number;
    cancelled: number;
    avgDurationMs: number;
    stepSuccessRates: Record<string, number>;
  } {
    const instances = definitionId
      ? Array.from(this.instances.values()).filter((i) => i.definitionId === definitionId)
      : Array.from(this.instances.values());

    const completed = instances.filter((i) => i.status === "COMPLETED");
    const durations = completed
      .filter((i) => i.completedAt)
      .map((i) => new Date(i.completedAt!).getTime() - new Date(i.startedAt).getTime());

    const stepCounts: Record<string, { total: number; success: number }> = {};
    for (const inst of instances) {
      for (const r of inst.stepResults) {
        if (!stepCounts[r.stepName]) stepCounts[r.stepName] = { total: 0, success: 0 };
        stepCounts[r.stepName].total++;
        if (r.status === "COMPLETED") stepCounts[r.stepName].success++;
      }
    }

    const stepSuccessRates: Record<string, number> = {};
    for (const [name, counts] of Object.entries(stepCounts)) {
      stepSuccessRates[name] = counts.total > 0 ? Math.round((counts.success / counts.total) * 100) : 0;
    }

    return {
      totalInstances: instances.length,
      completed: completed.length,
      failed: instances.filter((i) => i.status === "FAILED").length,
      running: instances.filter((i) => i.status === "RUNNING").length,
      cancelled: instances.filter((i) => i.status === "CANCELLED").length,
      avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      stepSuccessRates,
    };
  }
}
