/**
 * Alexa Smart Home → Circuvent proxy.
 *
 * Alexa will not call an HTTPS endpoint for a Smart Home skill; the skill's
 * endpoint must be a Lambda. This is that Lambda, and it does as little as
 * possible: forward the directive to the control plane and return the answer.
 * Every decision — authentication, which devices exist, what may be
 * controlled — is made server-side, where it can be changed without
 * redeploying anything to AWS.
 *
 * DEPLOYING
 *
 *   1. Lambda → Create function → Author from scratch, Node.js 20.x.
 *      Region matters and must match the skill's language:
 *        EN-US / EN-CA        us-east-1
 *        EN-GB / EN-IN / DE   eu-west-1
 *        JA-JP / EN-AU        us-west-2
 *   2. Paste this file as index.mjs.
 *   3. Configuration → Triggers → Add → Alexa Smart Home, and paste the skill
 *      ID. Without that trigger anybody could invoke the function.
 *   4. Copy the function ARN into the skill's Smart Home → Default endpoint.
 *
 * Optional environment variable:
 *   CIRCUVENT_ENDPOINT   default https://api.circuvent.com/smarthome/alexa
 *
 * WHY THIS IS LONGER THAN THE OBVIOUS FIVE LINES
 *
 * A Smart Home skill that throws, times out, or returns something Alexa cannot
 * parse produces "Sorry, something went wrong" with nothing to look at. The
 * failures below are the ones that actually happen — a cold start against a
 * restarting API, a transient blip, a slow first request — and each returns a
 * well-formed Alexa error instead, so the customer hears something true and
 * the reason lands in CloudWatch.
 */

const ENDPOINT = process.env.CIRCUVENT_ENDPOINT || "https://api.circuvent.com/smarthome/alexa";

/**
 * Alexa gives a Smart Home skill 8 seconds before it gives up.
 *
 * Timing out below that is the difference between an error we chose and
 * Alexa's generic failure: at 6 seconds there is still room to answer. Left to
 * the default, the request would be abandoned mid-flight and the customer
 * would hear nothing useful.
 */
const TIMEOUT_MS = 6000;

/**
 * One retry, and only for the failures a retry can fix.
 *
 * The control plane restarts on deploy, which is a second or two of connection
 * refused. Without this, a light switched during that window fails audibly for
 * no reason the customer could understand. A 4xx is never retried — it is an
 * answer, not a fault.
 */
const RETRY_DELAY_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function errorResponse(directive, type, message) {
  const header = directive?.header ?? {};
  return {
    event: {
      header: {
        namespace: "Alexa",
        name: "ErrorResponse",
        payloadVersion: "3",
        messageId: `${header.messageId ?? "cv"}-err-${Date.now()}`,
        ...(header.correlationToken ? { correlationToken: header.correlationToken } : {}),
      },
      endpoint: directive?.endpoint,
      payload: { type, message },
    },
  };
}

async function callOnce(event) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      /* Distinguished from a parse failure below: this is the API answering,
         and the status is worth having in the log. */
      const err = new Error(`control plane returned ${res.status}`);
      err.status = res.status;
      err.body = text.slice(0, 500);
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("control plane returned a non-JSON body");
      err.body = text.slice(0, 500);
      err.retryable = false;
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

export const handler = async (event) => {
  const directive = event?.directive;

  try {
    return await callOnce(event);
  } catch (first) {
    /* A 4xx is the server's considered answer and will be the same next time.
       A 5xx, a timeout or a refused connection may not be. */
    const worthRetrying =
      first.retryable !== false && (!first.status || first.status >= 500 || first.name === "AbortError");

    if (worthRetrying) {
      await sleep(RETRY_DELAY_MS);
      try {
        return await callOnce(event);
      } catch (second) {
        console.error("circuvent proxy failed twice", {
          directive: `${directive?.header?.namespace}/${directive?.header?.name}`,
          error: second.message,
          status: second.status,
          body: second.body,
        });
        return errorResponse(
          directive,
          second.name === "AbortError" ? "BRIDGE_UNREACHABLE" : "INTERNAL_ERROR",
          second.name === "AbortError"
            ? "Circuvent did not respond in time. Please try again."
            : "Circuvent could not be reached. Please try again."
        );
      }
    }

    console.error("circuvent proxy failed", {
      directive: `${directive?.header?.namespace}/${directive?.header?.name}`,
      error: first.message,
      status: first.status,
      body: first.body,
    });
    return errorResponse(directive, "INTERNAL_ERROR", "Circuvent could not handle that request.");
  }
};
