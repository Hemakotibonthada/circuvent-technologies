import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const dir = mkdtempSync(join(tmpdir(), "cv-passkey-ceremony-"));
process.env.DATA_DIR = dir;

// require, not import: import is hoisted above the line above, and the store
// captures DATA_DIR when it loads. See passkeys.test.ts.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { finishAuthentication, startAuthentication, startRegistration } =
  require("./passkey-ceremony") as typeof import("./passkey-ceremony");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { saveCredential } = require("./passkeys") as typeof import("./passkeys");
type StoredPasskey = import("./passkeys").StoredPasskey;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows may hold the handle briefly */
  }
});

const ORIGIN = "https://circuvent.com";

const cred = (over: Partial<StoredPasskey> = {}): StoredPasskey => ({
  id: "cred-abc",
  scope: "account",
  owner: "buyer@example.com",
  publicKey: Buffer.from("pub").toString("base64url"),
  counter: 0,
  label: "Phone",
  createdAt: new Date().toISOString(),
  ...over,
});

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected success, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("starting a sign-in", () => {
  /*
   * Answering "there are no passkeys for that address" would turn this into a
   * way to ask which addresses have an account — the exact disclosure the
   * password form goes out of its way not to make.
   */
  it("issues a challenge for an address with no passkeys, rather than saying so", async () => {
    const unknown = ok(await startAuthentication("account", "nobody@example.com", ORIGIN));
    expect(unknown.options.challenge).toBeTruthy();
    expect(unknown.options.allowCredentials).toEqual([]);
  });

  it("requires the user to prove themselves, not merely hold the device", async () => {
    const r = ok(await startAuthentication("account", "buyer@example.com", ORIGIN));
    expect(r.options.userVerification).toBe("required");
  });

  it("refuses to start over plain http, where the browser would fail silently", async () => {
    const r = await startAuthentication("account", "buyer@example.com", "http://staging.example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/https/i);
  });
});

describe("starting a registration", () => {
  it("also requires user verification, or a passkey would be one factor", async () => {
    const r = ok(await startRegistration("admin", "staff@example.com", ORIGIN));
    expect(r.options.authenticatorSelection?.userVerification).toBe("required");
  });

  /*
   * Without this an authenticator happily creates a second credential for the
   * same account on the same device, and the user ends up with two entries in
   * the list, both working, and no way to tell them apart.
   */
  it("offers what is already registered so the device does not make a duplicate", async () => {
    saveCredential(cred({ id: "already-here", owner: "dup@example.com" }));
    const r = ok(await startRegistration("account", "dup@example.com", ORIGIN));
    expect(r.options.excludeCredentials?.map((c) => c.id)).toContain("already-here");
  });
});

describe("finishing a sign-in", () => {
  it("refuses a response with no challenge outstanding", async () => {
    // An address that never started a ceremony. Reusing one from an earlier
    // test here found ITS challenge still outstanding and failed later, on the
    // credential, which is a different rejection than the one being asserted.
    const r = await finishAuthentication("account", "never-started@example.com", ORIGIN, {
      id: "cred-abc",
    } as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  /*
   * The signature only proves the holder controls SOME registered credential.
   * Without tying it to the address that asked, one customer's passkey answers
   * a challenge issued for another.
   */
  it("refuses a credential that belongs to somebody else", async () => {
    saveCredential(cred({ id: "someone-elses", owner: "owner@example.com" }));
    await startAuthentication("account", "attacker@example.com", ORIGIN);

    const r = await finishAuthentication("account", "attacker@example.com", ORIGIN, {
      id: "someone-elses",
    } as never);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("refuses a credential registered for the other sign-in", async () => {
    saveCredential(cred({ id: "customer-key", scope: "account", owner: "person@example.com" }));
    await startAuthentication("admin", "person@example.com", ORIGIN);

    const r = await finishAuthentication("admin", "person@example.com", ORIGIN, {
      id: "customer-key",
    } as never);

    expect(r.ok).toBe(false);
  });

  /*
   * The signature covers the challenge, so a challenge that survives its use is
   * a replayable sign-in for as long as it lives.
   */
  it("cannot spend the same challenge twice", async () => {
    saveCredential(cred({ id: "replay-key", owner: "replay@example.com" }));
    await startAuthentication("account", "replay@example.com", ORIGIN);

    const first = await finishAuthentication("account", "replay@example.com", ORIGIN, { id: "replay-key" } as never);
    const second = await finishAuthentication("account", "replay@example.com", ORIGIN, { id: "replay-key" } as never);

    // The first fails too, on the signature — there is no real authenticator
    // here. What matters is that the second failed earlier, with the challenge
    // already gone rather than still waiting to be reused.
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/expired/i);
  });
});
