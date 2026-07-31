import { complete, aiConfigured, AiUnavailableError } from "./provider";
import type { ChatMessage, ToolDefinition } from "./types";

// The provider client is the only code that touches an external API, and the
// API key is production-scoped, so it is never exercised locally against the
// real thing. These tests stand in for that: they pin the wire format we send,
// the way a provider failure is translated into something a user can read, and
// the tolerance for malformed tool arguments — models really do emit those, and
// one bad argument should not collapse the whole turn.

const OLD_ENV = process.env;
let fetchMock: jest.Mock;
const originalFetch = globalThis.fetch;

const ok = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

const completion = (message: Record<string, unknown>, finish = "stop") => ({
  choices: [{ message, finish_reason: finish }],
});

const msgs: ChatMessage[] = [{ role: "user", content: "hi" }];

beforeEach(() => {
  process.env = { ...OLD_ENV, AI_API_KEY: "test-key" };
  delete process.env.AI_BASE_URL;
  fetchMock = jest.fn();
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

afterAll(() => {
  process.env = OLD_ENV;
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
});

describe("aiConfigured", () => {
  it("is true with a key", () => {
    expect(aiConfigured()).toBe(true);
  });

  it("is true with a base URL and no key, for a local endpoint that needs none", () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_BASE_URL = "http://localhost:1234/v1";
    expect(aiConfigured()).toBe(true);
  });

  it("is false with neither", () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_BASE_URL;
    expect(aiConfigured()).toBe(false);
  });
});

describe("complete — the request we send", () => {
  it("refuses to call out when nothing is configured", async () => {
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_BASE_URL;
    await expect(complete({ messages: msgs })).rejects.toThrow(AiUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a low temperature by default", async () => {
    fetchMock.mockResolvedValue(ok(completion({ content: "hello" })));
    await complete({ messages: msgs });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // This assistant reports facts about someone's home. Creative variation is
    // not a feature.
    expect(body.temperature).toBe(0.2);
  });

  it("sends the key as a bearer token", async () => {
    fetchMock.mockResolvedValue(ok(completion({ content: "hello" })));
    await complete({ messages: msgs });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toContain("test-key");
  });

  it("omits the tools block entirely when no tools are offered", async () => {
    fetchMock.mockResolvedValue(ok(completion({ content: "hello" })));
    await complete({ messages: msgs });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("sends tools in the function-calling shape when offered", async () => {
    const tool: ToolDefinition = {
      name: "list_devices",
      description: "list them",
      parameters: { type: "object", properties: {} },
    };
    fetchMock.mockResolvedValue(ok(completion({ content: "hello" })));
    await complete({ messages: msgs, tools: [tool] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tool_choice).toBe("auto");
    expect(body.tools[0]).toMatchObject({ type: "function", function: { name: "list_devices" } });
  });

  it("honours a custom base URL", async () => {
    process.env.AI_BASE_URL = "https://example.test/v1";
    fetchMock.mockResolvedValue(ok(completion({ content: "hello" })));
    await complete({ messages: msgs });
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/v1/chat/completions");
  });
});

describe("complete — reading the response", () => {
  it("returns plain text", async () => {
    fetchMock.mockResolvedValue(ok(completion({ content: "We make smart plugs." })));
    const r = await complete({ messages: msgs });
    expect(r.text).toBe("We make smart plugs.");
    expect(r.toolCalls).toEqual([]);
  });

  it("treats a null content as empty rather than the string 'null'", async () => {
    fetchMock.mockResolvedValue(ok(completion({ content: null })));
    expect((await complete({ messages: msgs })).text).toBe("");
  });

  it("parses tool calls and their arguments", async () => {
    fetchMock.mockResolvedValue(ok(completion({
      content: null,
      tool_calls: [{
        id: "call_1",
        function: { name: "search_products", arguments: '{"query":"pump"}' },
      }],
    }, "tool_calls")));

    const r = await complete({ messages: msgs });
    expect(r.toolCalls).toEqual([
      { id: "call_1", name: "search_products", arguments: { query: "pump" } },
    ]);
  });

  it("survives tool arguments that are not valid JSON", async () => {
    // A malformed argument should reach the tool's own validation as an empty
    // object, not take down the entire turn.
    fetchMock.mockResolvedValue(ok(completion({
      content: null,
      tool_calls: [{ id: "c", function: { name: "search_products", arguments: "{oops" } }],
    }, "tool_calls")));

    const r = await complete({ messages: msgs });
    expect(r.toolCalls[0].arguments).toEqual({});
  });

  it("rejects a JSON array of arguments, which is not an argument object", async () => {
    fetchMock.mockResolvedValue(ok(completion({
      content: null,
      tool_calls: [{ id: "c", function: { name: "x", arguments: "[1,2]" } }],
    }, "tool_calls")));
    expect((await complete({ messages: msgs })).toolCalls[0].arguments).toEqual({});
  });

  it("treats empty arguments as an empty object", async () => {
    fetchMock.mockResolvedValue(ok(completion({
      content: null,
      tool_calls: [{ id: "c", function: { name: "x", arguments: "" } }],
    }, "tool_calls")));
    expect((await complete({ messages: msgs })).toolCalls[0].arguments).toEqual({});
  });

  it("reports usage when the provider supplies it", async () => {
    fetchMock.mockResolvedValue(ok({
      ...completion({ content: "hi" }),
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    }));
    expect((await complete({ messages: msgs })).usage).toEqual({
      promptTokens: 10, completionTokens: 4, totalTokens: 14,
    });
  });

  it("fails clearly when the provider returns no choices", async () => {
    fetchMock.mockResolvedValue(ok({ choices: [] }));
    await expect(complete({ messages: msgs })).rejects.toThrow(/no choices/i);
  });
});

describe("complete — turning failures into something readable", () => {
  const failing = (status: number, body = "boom") => ({
    ok: false, status, text: async () => body, json: async () => ({}),
  });

  it("names a credential problem rather than echoing a raw 401", async () => {
    fetchMock.mockResolvedValue(failing(401));
    await expect(complete({ messages: msgs })).rejects.toThrow(/credentials/i);
  });

  it("names rate limiting on a 429", async () => {
    fetchMock.mockResolvedValue(failing(429));
    await expect(complete({ messages: msgs })).rejects.toThrow(/rate-limiting/i);
  });

  it("includes the status for anything else", async () => {
    fetchMock.mockResolvedValue(failing(500));
    await expect(complete({ messages: msgs })).rejects.toThrow(/500/);
  });

  it("truncates the provider's error body, which can echo user data", async () => {
    fetchMock.mockResolvedValue(failing(500, "x".repeat(5000)));
    const err = await complete({ messages: msgs }).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message.length).toBeLessThan(300);
  });

  it("reports a network failure as unavailable, not as a crash", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    await expect(complete({ messages: msgs })).rejects.toThrow(AiUnavailableError);
  });

  it("reports a timeout in plain language", async () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);
    await expect(complete({ messages: msgs })).rejects.toThrow(/too long/i);
  });

  it("every failure is an AiUnavailableError, so the assistant can degrade", async () => {
    // assistant.ts only degrades on AiUnavailableError; anything else escapes
    // to the user as a 500. This is the contract that keeps that from happening.
    for (const f of [failing(401), failing(429), failing(503)]) {
      fetchMock.mockResolvedValueOnce(f);
      await expect(complete({ messages: msgs })).rejects.toBeInstanceOf(AiUnavailableError);
    }
  });
});
