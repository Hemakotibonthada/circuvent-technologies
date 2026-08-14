import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handler } from "./index.mjs";

/**
 * The Alexa proxy's behaviour when the control plane is unhappy.
 *
 * A Smart Home skill that throws, times out, or returns something Alexa cannot
 * parse produces "Sorry, something went wrong" with nothing to look at. This
 * is the file that decides what a customer hears instead, so the cases below
 * are the ones that actually happen: a restart during a deploy, a slow first
 * request, an API answering with HTML because a proxy is misconfigured.
 *
 * The Lambda is plain JavaScript because that is what gets pasted into the AWS
 * console. Testing it here is what stops it being the one piece of this
 * integration nobody ever runs before a customer does.
 */

const DIRECTIVE = {
  directive: {
    header: {
      namespace: "Alexa.PowerController",
      name: "TurnOn",
      payloadVersion: "3",
      messageId: "m1",
      correlationToken: "tok-1",
    },
    endpoint: { endpointId: "lamp-1", scope: { type: "BearerToken", token: "t" } },
    payload: {},
  },
};

let calls = [];
const realFetch = globalThis.fetch;

/** Replaces fetch with a scripted sequence of outcomes. */
function scriptFetch(...outcomes) {
  calls = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const outcome = outcomes[Math.min(i++, outcomes.length - 1)];
    if (outcome.abort) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    return {
      ok: outcome.status >= 200 && outcome.status < 300,
      status: outcome.status,
      text: async () => outcome.body ?? "",
    };
  };
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ok = (payload) => ({ status: 200, body: JSON.stringify(payload) });

describe("the happy path", () => {
  test("forwards the event unchanged and returns the answer", async () => {
    const answer = { event: { header: { namespace: "Alexa", name: "Response" } } };
    scriptFetch(ok(answer));

    const res = await handler(DIRECTIVE);

    assert.deepEqual(res, answer);
    assert.equal(calls.length, 1, "no retry when the first call worked");
    assert.deepEqual(calls[0].body, DIRECTIVE, "the directive must arrive verbatim");
  });
});

describe("failures a retry can fix", () => {
  test("a restarting control plane is retried, not reported", async () => {
    /*
     * The control plane restarts on deploy — a second or two of 502. Without
     * the retry, a light switched during that window fails audibly for a
     * reason the customer could never understand.
     */
    const answer = { event: { header: { name: "Response" } } };
    scriptFetch({ status: 502, body: "bad gateway" }, ok(answer));

    const res = await handler(DIRECTIVE);

    assert.deepEqual(res, answer);
    assert.equal(calls.length, 2);
  });

  test("a timeout is retried once and then reported as unreachable", async () => {
    scriptFetch({ abort: true }, { abort: true });

    const res = await handler(DIRECTIVE);

    assert.equal(calls.length, 2);
    assert.equal(res.event.header.name, "ErrorResponse");
    assert.equal(res.event.payload.type, "BRIDGE_UNREACHABLE");
    assert.match(res.event.payload.message, /in time/i);
  });

  test("two server errors produce a well-formed error, never a throw", async () => {
    // A thrown Lambda is what Alexa turns into "something went wrong".
    scriptFetch({ status: 500, body: "boom" });

    const res = await handler(DIRECTIVE);

    assert.equal(res.event.header.name, "ErrorResponse");
    assert.equal(res.event.payload.type, "INTERNAL_ERROR");
  });
});

describe("failures a retry cannot fix", () => {
  test("a 4xx is not retried", async () => {
    /* An answer, not a fault. Retrying doubles the load on an API that has
       already made up its mind. */
    scriptFetch({ status: 401, body: "unauthorized" });

    const res = await handler(DIRECTIVE);

    assert.equal(calls.length, 1, "a considered answer must not be retried");
    assert.equal(res.event.header.name, "ErrorResponse");
  });

  test("a non-JSON body is not retried", async () => {
    // A proxy returning an HTML error page will return it again.
    scriptFetch({ status: 200, body: "<html>gateway</html>" });

    const res = await handler(DIRECTIVE);

    assert.equal(calls.length, 1);
    assert.equal(res.event.header.name, "ErrorResponse");
  });
});

describe("the error Alexa is given", () => {
  test("carries the correlation token, or Alexa cannot match it to the request", async () => {
    scriptFetch({ status: 500, body: "x" });
    const res = await handler(DIRECTIVE);
    assert.equal(res.event.header.correlationToken, "tok-1");
  });

  test("carries the endpoint, so the failure is attributed to the right device", async () => {
    scriptFetch({ status: 500, body: "x" });
    const res = await handler(DIRECTIVE);
    assert.deepEqual(res.event.endpoint, DIRECTIVE.directive.endpoint);
  });

  test("is shaped correctly even for a directive with no header at all", async () => {
    // Discovery and AcceptGrant have no correlation token, and a malformed
    // invocation has nothing. None of them may crash the handler.
    scriptFetch({ status: 500, body: "x" });
    const res = await handler({});
    assert.equal(res.event.header.namespace, "Alexa");
    assert.equal(res.event.header.name, "ErrorResponse");
    assert.equal(res.event.header.payloadVersion, "3");
    assert.ok(!("correlationToken" in res.event.header));
  });
});
