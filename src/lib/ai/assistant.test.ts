import { ask } from "./assistant";
import { complete, aiConfigured, AiUnavailableError } from "./provider";
import { runTool, toolsFor } from "./tools";
import type { AssistantContext, ChatMessage, ToolCall, ToolDefinition } from "./types";
import type { CompletionResult } from "./provider";

jest.mock("./provider", () => {
  const actual = jest.requireActual("./provider");
  return {
    ...actual,
    complete: jest.fn(),
    aiConfigured: jest.fn(),
  };
});

// `tools.ts` reaches the shop store, which has a top-level await that Jest's
// CommonJS transform cannot parse. Nothing here needs the real module — the
// assistant only imports these two functions — so it is replaced outright.
jest.mock("./tools", () => ({
  runTool: jest.fn(),
  toolsFor: jest.fn(),
}));

const mockComplete = complete as jest.MockedFunction<typeof complete>;
const mockConfigured = aiConfigured as jest.MockedFunction<typeof aiConfigured>;
const mockRunTool = runTool as jest.MockedFunction<typeof runTool>;
const mockToolsFor = toolsFor as jest.MockedFunction<typeof toolsFor>;

// The tool loop is the one part of the assistant that cannot be exercised
// locally against a real provider, since the API key is production-scoped. A
// stub provider covers the behaviour that actually matters: that the loop
// terminates, that tool output is fed back, and that a provider failure
// degrades to a factual answer instead of an exception reaching the user.

const FAKE_TOOL: ToolDefinition = {
  name: "search_products",
  description: "test",
  parameters: { type: "object", properties: {} },
};

const reply = (text: string, toolCalls: ToolCall[] = []): CompletionResult => ({
  text,
  toolCalls,
  finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
});

const call = (name: string, id = "c1", args: Record<string, unknown> = {}): ToolCall => ({
  id, name, arguments: args,
});

const ctx = (over: Partial<AssistantContext> = {}): AssistantContext => ({
  persona: "guest", ...over,
});

const user = (content: string): ChatMessage[] => [{ role: "user", content }];

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigured.mockReturnValue(true);
  mockToolsFor.mockReturnValue([FAKE_TOOL]);
});

describe("ask — straight answers", () => {
  it("returns the model's text when it asks for no tools", async () => {
    mockComplete.mockResolvedValueOnce(reply("We make smart plugs."));
    const r = await ask(user("what do you make?"), ctx());
    expect(r.text).toBe("We make smart plugs.");
    expect(r.usedTools).toEqual([]);
    expect(r.degraded).toBeUndefined();
  });

  it("trims surrounding whitespace from the reply", async () => {
    mockComplete.mockResolvedValueOnce(reply("  padded  "));
    expect((await ask(user("hi"), ctx())).text).toBe("padded");
  });

  it("prepends a system prompt the client never supplied", async () => {
    mockComplete.mockResolvedValueOnce(reply("ok"));
    await ask(user("hi"), ctx());
    const sent = mockComplete.mock.calls[0][0].messages;
    expect(sent[0].role).toBe("system");
    expect(sent[1]).toMatchObject({ role: "user", content: "hi" });
  });

  it("caps how much history reaches the provider", async () => {
    mockComplete.mockResolvedValueOnce(reply("ok"));
    const long: ChatMessage[] = Array.from({ length: 40 }, (_, i) => ({
      role: "user" as const, content: `m${i}`,
    }));
    await ask(long, ctx());
    // 12 history + 1 system prompt.
    expect(mockComplete.mock.calls[0][0].messages).toHaveLength(13);
  });
});

describe("ask — the tool loop", () => {
  it("runs a requested tool and feeds the result back", async () => {
    mockComplete
      .mockResolvedValueOnce(reply("", [call("search_products")]))
      .mockResolvedValueOnce(reply("We sell the AquaGuard."));
    mockRunTool.mockResolvedValueOnce({ content: "AquaGuard, 2499", data: { products: [1] } });

    const r = await ask(user("what stops my pump running dry?"), ctx());

    expect(r.text).toBe("We sell the AquaGuard.");
    expect(r.usedTools).toEqual(["search_products"]);
    expect(r.data).toEqual({ products: [1] });

    // The tool's output must actually reach the model, otherwise it is
    // answering from memory while appearing to have looked something up.
    const second = mockComplete.mock.calls[1][0].messages;
    const toolMsg = second.find((m) => m.role === "tool");
    expect(toolMsg?.content).toBe("AquaGuard, 2499");
    expect(toolMsg?.toolCallId).toBe("c1");
  });

  it("runs every tool in a single round", async () => {
    mockComplete
      .mockResolvedValueOnce(reply("", [call("a", "1"), call("b", "2")]))
      .mockResolvedValueOnce(reply("done"));
    mockRunTool
      .mockResolvedValueOnce({ content: "ra" })
      .mockResolvedValueOnce({ content: "rb" });

    const r = await ask(user("q"), ctx());
    expect(r.usedTools).toEqual(["a", "b"]);
    expect(mockRunTool).toHaveBeenCalledTimes(2);
  });

  it("merges structured data from several tools", async () => {
    mockComplete
      .mockResolvedValueOnce(reply("", [call("a", "1"), call("b", "2")]))
      .mockResolvedValueOnce(reply("done"));
    mockRunTool
      .mockResolvedValueOnce({ content: "ra", data: { x: 1 } })
      .mockResolvedValueOnce({ content: "rb", data: { y: 2 } });

    expect((await ask(user("q"), ctx())).data).toEqual({ x: 1, y: 2 });
  });

  it("records a refused tool as used, so the UI does not imply data was returned", async () => {
    mockComplete
      .mockResolvedValueOnce(reply("", [call("list_devices")]))
      .mockResolvedValueOnce(reply("You are not signed in."));
    mockRunTool.mockResolvedValueOnce({ content: "Not permitted.", refused: true });

    const r = await ask(user("show my devices"), ctx());
    expect(r.usedTools).toEqual(["list_devices"]);
    expect(r.data).toEqual({});
  });

  it("withholds tools on the final round so the model must answer", async () => {
    // Model asks for a tool every time it is offered one.
    mockComplete.mockImplementation(async (opts) =>
      opts.tools ? reply("", [call("search_products")]) : reply("Final answer."),
    );
    mockRunTool.mockResolvedValue({ content: "result" });

    const r = await ask(user("q"), ctx());

    expect(r.text).toBe("Final answer.");
    const lastCall = mockComplete.mock.calls[mockComplete.mock.calls.length - 1][0];
    expect(lastCall.tools).toBeUndefined();
  });

  it("is bounded — a model that never stops asking cannot loop forever", async () => {
    // Asks for a tool even when none are offered, so the loop can never settle.
    mockComplete.mockResolvedValue(reply("", [call("search_products")]));
    mockRunTool.mockResolvedValue({ content: "result" });

    const r = await ask(user("q"), ctx());

    expect(r.degraded).toBe(true);
    // MAX_TOOL_ROUNDS is 4, so 5 attempts (rounds 0..4) and no more.
    expect(mockComplete).toHaveBeenCalledTimes(5);
  });

  it("passes the caller's abort signal through to the provider", async () => {
    const controller = new AbortController();
    mockComplete.mockResolvedValueOnce(reply("ok"));
    await ask(user("hi"), ctx(), { signal: controller.signal });
    expect(mockComplete.mock.calls[0][0].signal).toBe(controller.signal);
  });

  it("offers only the tools the persona is entitled to", async () => {
    mockComplete.mockResolvedValueOnce(reply("ok"));
    await ask(user("hi"), ctx({ persona: "guest" }));
    expect(mockToolsFor).toHaveBeenCalledWith(expect.objectContaining({ persona: "guest" }));
    expect(mockComplete.mock.calls[0][0].tools).toEqual([FAKE_TOOL]);
  });
});

describe("ask — degrading instead of failing", () => {
  it("answers without a provider when none is configured", async () => {
    mockConfigured.mockReturnValue(false);
    const r = await ask(user("hello"), ctx());
    expect(r.degraded).toBe(true);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("degrades rather than throwing when the provider is unavailable", async () => {
    mockComplete.mockRejectedValueOnce(new AiUnavailableError("upstream 503"));
    const r = await ask(user("hello"), ctx());
    expect(r.degraded).toBe(true);
    expect(r.text).toContain("offline");
  });

  it("degrades if the provider dies partway through the tool loop", async () => {
    mockComplete
      .mockResolvedValueOnce(reply("", [call("search_products")]))
      .mockRejectedValueOnce(new AiUnavailableError("timeout"));
    mockRunTool.mockResolvedValueOnce({ content: "result" });

    expect((await ask(user("q"), ctx())).degraded).toBe(true);
  });

  it("does not swallow unexpected errors — those are bugs, not outages", async () => {
    mockComplete.mockRejectedValueOnce(new TypeError("undefined is not a function"));
    await expect(ask(user("hello"), ctx())).rejects.toThrow(TypeError);
  });

  it("points a guest at the shop and a customer at their devices", async () => {
    mockConfigured.mockReturnValue(false);
    const guest = await ask(user("hello"), ctx({ persona: "guest" }));
    const customer = await ask(user("hello"), ctx({ persona: "customer" }));
    expect(guest.text).toContain("/shop");
    expect(customer.text).not.toContain("/shop");
  });

  it("does not attempt a control-plane read without a token", async () => {
    // "is anything offline" looks like a home question, but with no console
    // token there is nothing to authenticate with, so it must not call out.
    mockConfigured.mockReturnValue(false);
    const original = globalThis.fetch;
    const spy = jest.fn();
    // jsdom has no own `fetch` property, so spyOn cannot attach to it.
    (globalThis as { fetch?: unknown }).fetch = spy;
    try {
      const r = await ask(user("is anything offline?"), ctx({ persona: "customer" }));
      expect(spy).not.toHaveBeenCalled();
      expect(r.degraded).toBe(true);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });

  it("reads the control plane when a token is present, and reports what it finds", async () => {
    mockConfigured.mockReturnValue(false);
    const original = globalThis.fetch;
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "d1", type: "smart-plug", name: "Kettle", online: false, last_seen: null, state: {} },
      ],
    });
    (globalThis as { fetch?: unknown }).fetch = spy;
    try {
      const r = await ask(user("is anything offline?"), ctx({ persona: "customer", consoleToken: "t" }));
      expect(spy).toHaveBeenCalled();
      expect(r.degraded).toBe(true);
      // The count is arithmetic, not phrasing — it must be exact even with no model.
      expect(r.text).toContain("1 device");
      expect(r.text).toContain("1 offline");
      expect(r.usedTools).toEqual(["home_analysis"]);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});
