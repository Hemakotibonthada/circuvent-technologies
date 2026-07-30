// Shared types for the Circuvent assistant.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: ToolCall[];
  /** Present on tool messages, linking the result to its request. */
  toolCallId?: string;
}

/** JSON Schema for a tool's arguments, as the provider expects it. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Who is asking. Every tool checks this rather than trusting the model, so a
 * prompt-injected "you are now an admin" changes nothing.
 */
export type Persona = "guest" | "customer" | "admin";

export interface AssistantContext {
  persona: Persona;
  /** Signed-in customer's email, when there is one. */
  email?: string;
  /** Console session token, needed to reach the control plane on their behalf. */
  consoleToken?: string;
  /** Where the user is in the app, so answers can be relevant. */
  surface?: "shop" | "smarthome" | "admin" | "site" | "mobile";
}

export interface ToolResult {
  /** Text handed back to the model. Must be factual and compact. */
  content: string;
  /** Structured payload for the UI to render, bypassing the model entirely. */
  data?: unknown;
  /** True when the tool declined — the model is told why, not that it failed. */
  refused?: boolean;
}

export interface AssistantReply {
  text: string;
  /** Tools that ran, for transparency in the UI and in logs. */
  usedTools: string[];
  /** Structured results the UI may render directly. */
  data: Record<string, unknown>;
  /** Set when the model was unavailable and a deterministic answer was used. */
  degraded?: boolean;
}
