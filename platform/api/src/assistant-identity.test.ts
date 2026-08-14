import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assistantFromRedirect } from "./routes/oauth";

/**
 * Working out which assistant just linked.
 *
 * Google and Alexa both POST /oauth/token from their own servers with nothing
 * in the request that says who they are — same client id, same grant type, no
 * distinguishing header. The redirect the authorization code was bound to is
 * the only signal, so this is the whole of the identification.
 *
 * Getting it wrong is not fatal but it is visible: the customer's account page
 * would say "Alexa" beside a link they made with Google, and unlinking one
 * would appear to do nothing to the other.
 */
describe("assistant identification", () => {
  test("Amazon's regional endpoints are Alexa", () => {
    for (const uri of [
      "https://layla.amazon.com/api/skill/link/M2ABC",
      "https://pitangui.amazon.com/api/skill/link/M2ABC",
      "https://alexa.amazon.co.jp/api/skill/link/M2ABC",
    ]) {
      assert.equal(assistantFromRedirect(uri), "alexa", uri);
    }
  });

  test("Google's endpoints are Google", () => {
    for (const uri of [
      "https://oauth-redirect.googleusercontent.com/r/circuvent",
      "https://oauth-redirect-sandbox.googleusercontent.com/r/circuvent",
    ]) {
      assert.equal(assistantFromRedirect(uri), "google", uri);
    }
  });

  test("anything unrecognised is null rather than a guess", () => {
    /*
     * A local test client or a vendor console. Labelling one of these would
     * put a wrong entry on a customer's account page, and "no record" is more
     * honest than a confident wrong answer.
     */
    for (const uri of ["https://localhost:3000/cb", "https://example.com/x", "", "not a url"]) {
      assert.equal(assistantFromRedirect(uri), null, JSON.stringify(uri));
    }
  });

  test("a lookalike host is not matched", () => {
    // amazon.com.evil.tld ends with neither, and the userinfo trick is caught
    // by the redirect allowlist before it reaches here — but suffix matching
    // is exactly where this kind of check usually goes wrong.
    assert.equal(assistantFromRedirect("https://layla.amazon.com.evil.tld/api/skill/link/x"), null);
    assert.equal(assistantFromRedirect("https://googleusercontent.com.evil.tld/r/x"), null);
  });

  test("subdomains of the real hosts still match", () => {
    // Amazon has added regional endpoints before and will again; matching the
    // registrable domain rather than a fixed list means a new one is labelled
    // correctly rather than showing up as unknown.
    assert.equal(assistantFromRedirect("https://something-new.amazon.com/api/skill/link/x"), "alexa");
  });
});
