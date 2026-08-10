import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "cv-passkeys-"));
process.env.DATA_DIR = dir;

/*
 * require, not import.
 *
 * import declarations are hoisted above everything else in the module, so an
 * `import` here would load the store — and with it the DATA_DIR it captures at
 * module scope — before the line above runs. The tests then pass while writing
 * into the real .data directory, which is how a run of this file left thirteen
 * fake credentials in it.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pk = require("./passkeys") as typeof import("./passkeys");

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows may hold the handle briefly */
  }
});

const cred = (over: Partial<pk.StoredPasskey> = {}): pk.StoredPasskey => ({
  id: "cred-1",
  scope: "account",
  owner: "buyer@example.com",
  publicKey: "pub",
  counter: 0,
  label: "Phone",
  createdAt: new Date().toISOString(),
  ...over,
});

describe("credentials belong to one sign-in", () => {
  /*
   * A staff passkey and a customer passkey are both just credential IDs. If a
   * lookup could find one and leave the scope to be compared afterwards, the
   * day somebody forgets that comparison is the day a customer's key signs in
   * to the admin console.
   */
  it("cannot be found from the wrong side", () => {
    pk.saveCredential(cred({ id: "shared-id", scope: "account" }));
    expect(pk.findCredential("account", "shared-id")).not.toBeNull();
    expect(pk.findCredential("admin", "shared-id")).toBeNull();
  });

  it("lists only the owner's own, and only in that scope", () => {
    pk.saveCredential(cred({ id: "a1", owner: "a@x.com", scope: "account" }));
    pk.saveCredential(cred({ id: "b1", owner: "b@x.com", scope: "account" }));
    pk.saveCredential(cred({ id: "a2", owner: "a@x.com", scope: "admin" }));

    expect(pk.credentialsFor("account", "a@x.com").map((c) => c.id)).toEqual(["a1"]);
    expect(pk.credentialsFor("admin", "a@x.com").map((c) => c.id)).toEqual(["a2"]);
  });

  it("matches the owner regardless of how the address was typed", () => {
    pk.saveCredential(cred({ id: "case-1", owner: "Mixed@Example.COM" }));
    expect(pk.credentialsFor("account", "mixed@example.com").map((c) => c.id)).toContain("case-1");
    expect(pk.credentialsFor("account", "  MIXED@example.com  ").map((c) => c.id)).toContain("case-1");
  });

  /*
   * Saving the same credential twice takes the update path rather than the
   * insert path, and only the insert path normalised the owner. So a
   * re-registration wrote back the address exactly as typed, every later lookup
   * normalised, and the passkey went on verifying while belonging to nobody.
   *
   * Invisible on a first run, which is how it passed its own test once.
   */
  it("keeps the owner normalised when the same credential is saved again", () => {
    pk.saveCredential(cred({ id: "resave-1", owner: "resave@example.com" }));
    pk.saveCredential(cred({ id: "resave-1", owner: "ReSave@Example.COM", counter: 2 }));

    expect(pk.credentialsFor("account", "resave@example.com").map((c) => c.id)).toContain("resave-1");
    expect(pk.findCredential("account", "resave-1")?.owner).toBe("resave@example.com");
  });

  it("removes only the one asked for, and only from its owner", () => {
    pk.saveCredential(cred({ id: "del-1", owner: "owner@x.com" }));
    expect(pk.removeCredential("account", "someone-else@x.com", "del-1")).toBe(false);
    expect(pk.findCredential("account", "del-1")).not.toBeNull();
    expect(pk.removeCredential("account", "owner@x.com", "del-1")).toBe(true);
    expect(pk.findCredential("account", "del-1")).toBeNull();
  });
});

describe("the signature counter", () => {
  it("moves forward", () => {
    pk.saveCredential(cred({ id: "ctr-1", counter: 4 }));
    expect(pk.recordUse("account", "ctr-1", 5)).toEqual({ ok: true });
    expect(pk.findCredential("account", "ctr-1")?.counter).toBe(5);
  });

  /*
   * Two authenticators answering for one credential is what a clone looks like.
   * Accepting the lower value would let it work indefinitely and report nothing.
   */
  it("refuses a value that went backwards, which is what a clone looks like", () => {
    pk.saveCredential(cred({ id: "ctr-2", counter: 9 }));
    const r = pk.recordUse("account", "ctr-2", 8);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/counter/i);
    expect(pk.findCredential("account", "ctr-2")?.counter).toBe(9);
  });

  it("refuses a repeat of the same value", () => {
    pk.saveCredential(cred({ id: "ctr-3", counter: 3 }));
    expect(pk.recordUse("account", "ctr-3", 3).ok).toBe(false);
  });

  /*
   * Platform authenticators commonly do not keep a counter and report 0 every
   * time. Treating that as a regression would break Touch ID and Windows Hello
   * on the second sign-in.
   */
  it("allows a constant zero, which is what platform authenticators report", () => {
    pk.saveCredential(cred({ id: "ctr-4", counter: 0 }));
    expect(pk.recordUse("account", "ctr-4", 0).ok).toBe(true);
    expect(pk.recordUse("account", "ctr-4", 0).ok).toBe(true);
  });

  it("does not invent a credential it has never seen", () => {
    expect(pk.recordUse("account", "never-registered", 1).ok).toBe(false);
  });
});

describe("challenges", () => {
  it("can be taken once", () => {
    pk.putChallenge("k1", { challenge: "abc", scope: "account", kind: "authenticate" });
    expect(pk.takeChallenge("k1")?.challenge).toBe("abc");
    expect(pk.takeChallenge("k1")).toBeNull();
  });

  it("is refused once stale", () => {
    pk.putChallenge("k2", { challenge: "abc", scope: "account", kind: "register", owner: "a@x.com" });
    const realNow = Date.now;
    Date.now = () => realNow() + pk.CHALLENGE_TTL_MS + 1;
    try {
      expect(pk.takeChallenge("k2")).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });

  it("carries what it was issued for, so a sign-in cannot spend a registration", () => {
    pk.putChallenge("k3", { challenge: "abc", scope: "admin", kind: "register", owner: "staff@x.com" });
    const taken = pk.takeChallenge("k3");
    expect(taken).toMatchObject({ scope: "admin", kind: "register", owner: "staff@x.com" });
  });
});

describe("the relying party", () => {
  it("is the hostname, which is what binds a passkey to this site", () => {
    expect(pk.relyingParty("https://circuvent.com")).toEqual({
      rpID: "circuvent.com",
      origin: "https://circuvent.com",
    });
  });

  it("works on localhost, where browsers allow it without https", () => {
    expect(pk.relyingParty("http://localhost:3000")?.rpID).toBe("localhost");
  });

  /*
   * Browsers refuse WebAuthn over plain http anywhere else. Reporting it here
   * gives something to show the user instead of a ceremony that dies inside the
   * browser with no explanation.
   */
  it("reports plain http elsewhere rather than starting a ceremony that cannot work", () => {
    expect(pk.relyingParty("http://staging.example.com")).toBeNull();
  });

  it("returns null for something that is not a URL", () => {
    expect(pk.relyingParty("not a url")).toBeNull();
  });
});
