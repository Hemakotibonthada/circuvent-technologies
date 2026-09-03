/**
 * Staff single sign-on against auth.circuvent.com.
 *
 * Every assertion here is a refusal. The failures this code can have are all
 * silent ones: a handoff code that works without its cookie is a credential
 * anybody can lift out of a server log; a flow cookie that is not checked lets
 * somebody nominate the PKCE verifier; a challenge computed the wrong way just
 * makes the token exchange fail with a message about the client.
 */

process.env.ADMIN_SECRET = "test-admin-secret-at-least-32-characters-long";

import crypto from "node:crypto";
import {
  beginSso,
  packFlow,
  unpackFlow,
  pkcePair,
  signHandoff,
  verifyHandoff,
  newNonce,
  safeAvatarUrl,
  FLOW_TTL_MS,
  HANDOFF_TTL_MS,
} from "@/lib/admin-sso";

describe("PKCE", () => {
  it("derives the challenge as base64url(sha256(verifier))", () => {
    // Getting this wrong is not a security hole, it is an outage: the identity
    // service rejects the exchange and the console reports a client error.
    const { verifier, challenge } = pkcePair();
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("never repeats a verifier", () => {
    const seen = new Set(Array.from({ length: 50 }, () => pkcePair().verifier));
    expect(seen.size).toBe(50);
  });
});

describe("the authorize URL", () => {
  const { url } = beginSso("https://circuvent.com/api/admin/auth/sso/callback");
  const parsed = new URL(url);

  it("asks for a code with S256, not a plain challenge", () => {
    // `plain` means the challenge *is* the verifier, which defeats the point.
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("asks for the email, because staff are matched on it", () => {
    expect(parsed.searchParams.get("scope")).toContain("email");
  });

  it("targets the account portal, not the legacy auth host", () => {
    expect(parsed.origin).toBe("https://myaccount.circuvent.com");
  });
});

describe("the flow cookie", () => {
  it("round-trips the state and verifier", () => {
    const packed = packFlow("st", "ver");
    expect(unpackFlow(packed)).toEqual({ state: "st", verifier: "ver" });
  });

  it("refuses a cookie somebody has edited", () => {
    /*
     * The attack this stops: supplying your own verifier alongside a code you
     * intercepted. Without the signature the callback would happily use it.
     */
    const packed = packFlow("st", "ver");
    const mac = packed.slice(packed.lastIndexOf(".") + 1);
    expect(unpackFlow(`${packed.slice(0, packed.lastIndexOf("."))}.0000`)).toBeNull();

    const forged = Buffer.from(
      JSON.stringify({ state: "st", verifier: "attacker-verifier", iat: Date.now() })
    ).toString("base64url");
    expect(unpackFlow(`${forged}.${mac}`)).toBeNull();
  });

  it("refuses a sign-in left open too long", () => {
    const packed = packFlow("st", "ver");
    expect(unpackFlow(packed, Date.now() + FLOW_TTL_MS + 1000)).toBeNull();
  });

  it("refuses nonsense without throwing", () => {
    for (const bad of [undefined, null, "", "x", "...", "@@@.@@@"]) {
      expect(unpackFlow(bad as string | undefined)).toBeNull();
    }
  });
});

describe("the handoff code", () => {
  const nonce = newNonce();

  it("is redeemable with its nonce", () => {
    expect(verifyHandoff(signHandoff("ada@circuvent.com", nonce), nonce)).toBe(
      "ada@circuvent.com"
    );
  });

  it("is worthless without the nonce cookie", () => {
    /*
     * The reason the token itself is not put in the URL. This code does travel
     * in one - browser history, proxy logs, the next referrer header - so on
     * its own it must not be enough to obtain a staff session.
     */
    const code = signHandoff("ada@circuvent.com", nonce);
    expect(verifyHandoff(code, undefined)).toBeNull();
    expect(verifyHandoff(code, "")).toBeNull();
    expect(verifyHandoff(code, newNonce())).toBeNull();
  });

  it("expires", () => {
    const code = signHandoff("ada@circuvent.com", nonce);
    expect(verifyHandoff(code, nonce, Date.now() + HANDOFF_TTL_MS + 1000)).toBeNull();
  });

  it("cannot be rewritten to name somebody else", () => {
    // Swapping the email in the payload must not survive the signature.
    const code = signHandoff("ada@circuvent.com", nonce);
    const mac = code.slice(code.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ email: "root@circuvent.com", nonce, iat: Date.now() })
    ).toString("base64url");
    expect(verifyHandoff(`${forged}.${mac}`, nonce)).toBeNull();
  });

  it("survives an email address full of dots", () => {
    /*
     * The regression. Fields used to be joined with a dot and split back out,
     * so every real address - all of which contain dots - parsed into the
     * wrong number of pieces and was rejected. Nobody could ever have signed
     * in, and the message said the link had expired.
     */
    for (const address of [
      "ada.lovelace@circuvent.com",
      "a.b.c@sub.domain.co.in",
      "hema.k.n@circuvent.com",
    ]) {
      expect(verifyHandoff(signHandoff(address, nonce), nonce)).toBe(address);
    }
  });

  it("refuses nonsense without throwing", () => {
    for (const bad of [undefined, null, "", "x", "...."]) {
      expect(verifyHandoff(bad as string | undefined, nonce)).toBeNull();
    }
  });
});

/**
 * The profile picture from userinfo.
 *
 * This one is not a credential, but it is the only field here that gets
 * written straight into an `<img src>` on a page where the viewer is an
 * administrator, so the scheme has to be pinned to http(s).
 */
describe("staff profile picture", () => {
  it("accepts an ordinary directory photo", () => {
    expect(safeAvatarUrl("https://auth.circuvent.com/u/42.jpg")).toBe("https://auth.circuvent.com/u/42.jpg");
    expect(safeAvatarUrl("  https://auth.circuvent.com/u/42.jpg  ")).toBe("https://auth.circuvent.com/u/42.jpg");
  });

  it("refuses a scripting scheme", () => {
    expect(safeAvatarUrl("javascript:alert(1)")).toBe("");
    expect(safeAvatarUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe("");
    expect(safeAvatarUrl("vbscript:msgbox(1)")).toBe("");
  });

  it("refuses anything that is not a usable string", () => {
    for (const bad of [undefined, null, "", "   ", 42, {}, []]) {
      expect(safeAvatarUrl(bad)).toBe("");
    }
  });

  it("refuses an absurdly long value rather than persisting it", () => {
    expect(safeAvatarUrl("https://auth.circuvent.com/" + "a".repeat(4000))).toBe("");
  });
});
