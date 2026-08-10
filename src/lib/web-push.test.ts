/**
 * Web push.
 *
 * Two behaviours are worth protecting and neither is "a notification was
 * sent". The first is that an unconfigured deployment says so instead of
 * silently doing nothing — a push system that quietly fails is discovered when
 * somebody asks why they were never told their hub died. The second is that
 * dead subscriptions are deleted: a browser discards its subscription without
 * telling anyone, and the only signal is a 404 or 410 on send. Anything that
 * does not delete on those accumulates dead endpoints forever.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cv-push-"));
process.env.CIRCUVENT_DATA_DIR = dir;

const sendNotification = jest.fn();
jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const push = require("./web-push") as typeof import("./web-push");

const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "p", auth: "a" } });

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows may hold the handle briefly */
  }
});

beforeEach(() => {
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
});

describe("configuration", () => {
  it("reports being unconfigured rather than pretending", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(push.pushConfigured()).toBe(false);
    expect(push.publicKey()).toBeNull();
  });

  it("does not attempt a send when there are no keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const r = await push.sendToAccount("acct", { title: "t", body: "b" });
    expect(r.configured).toBe(false);
    expect(r.sent).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  /*
   * The deployed key came back ending in CRLF, from the file it was set out of.
   * The browser base64-decodes this to subscribe and a newline is not in the
   * alphabet, so subscribe() rejects and no one can turn notifications on --
   * a failure that only ever appears in the user's browser.
   */
  it("serves a key with no surrounding whitespace, however it was set", () => {
    process.env.VAPID_PUBLIC_KEY = "BMMKevJh08j71N7\r\n";
    expect(push.publicKey()).toBe("BMMKevJh08j71N7");
  });

  it("treats a key that is only whitespace as absent", () => {
    process.env.VAPID_PUBLIC_KEY = "  \r\n";
    expect(push.pushConfigured()).toBe(false);
    expect(push.publicKey()).toBeNull();
  });
});

describe("subscriptions", () => {
  it("stores one per browser and scopes it to an account", () => {
    push.saveSubscription("acct-a", sub("https://push.example/a"));
    expect(push.subscriptionsFor("acct-a")).toHaveLength(1);
    expect(push.subscriptionsFor("acct-b")).toHaveLength(0);
  });

  it("does not store the same endpoint twice", () => {
    // Re-subscribing produces the same endpoint; storing it again would send
    // every notification twice to one browser.
    push.saveSubscription("acct-dup", sub("https://push.example/dup"));
    push.saveSubscription("acct-dup", sub("https://push.example/dup"));
    expect(push.subscriptionsFor("acct-dup")).toHaveLength(1);
  });

  it("ignores a malformed subscription rather than storing a broken one", () => {
    push.saveSubscription("acct-bad", { endpoint: "", keys: { p256dh: "", auth: "" } });
    expect(push.subscriptionsFor("acct-bad")).toHaveLength(0);
  });

  it("removes one on request", () => {
    push.saveSubscription("acct-rm", sub("https://push.example/rm"));
    push.removeSubscription("https://push.example/rm");
    expect(push.subscriptionsFor("acct-rm")).toHaveLength(0);
  });
});

describe("sending", () => {
  it("sends to every browser the account registered", async () => {
    push.saveSubscription("acct-multi", sub("https://push.example/1"));
    push.saveSubscription("acct-multi", sub("https://push.example/2"));
    const r = await push.sendToAccount("acct-multi", { title: "Hub offline", body: "…" });
    expect(r.sent).toBe(2);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("carries the payload the service worker expects", async () => {
    push.saveSubscription("acct-payload", sub("https://push.example/p"));
    await push.sendToAccount("acct-payload", {
      title: "Hub offline",
      body: "no reports in 40 minutes",
      url: "/smarthome/insights",
      tag: "device-offline::hub-1",
      severity: "critical",
    });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload).toMatchObject({
      title: "Hub offline",
      url: "/smarthome/insights",
      tag: "device-offline::hub-1",
      severity: "critical",
    });
  });

  it("deletes a subscription the push service says is gone", async () => {
    // 404 and 410 mean the browser discarded it. Keeping it means every future
    // send spends time failing on it, forever.
    push.saveSubscription("acct-dead", sub("https://push.example/dead"));
    sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    const r = await push.sendToAccount("acct-dead", { title: "t", body: "b" });
    expect(r.removed).toBe(1);
    expect(push.subscriptionsFor("acct-dead")).toHaveLength(0);
  });

  it("keeps a subscription that failed for a temporary reason", async () => {
    // A 500 from the push service is not evidence the browser is gone.
    push.saveSubscription("acct-temp", sub("https://push.example/temp"));
    sendNotification.mockRejectedValueOnce({ statusCode: 500 });
    const r = await push.sendToAccount("acct-temp", { title: "t", body: "b" });
    expect(r.failed).toBe(1);
    expect(r.removed).toBe(0);
    expect(push.subscriptionsFor("acct-temp")).toHaveLength(1);
  });

  it("does nothing quietly when an account has no browsers", async () => {
    const r = await push.sendToAccount("acct-none", { title: "t", body: "b" });
    expect(r).toMatchObject({ sent: 0, failed: 0, removed: 0, configured: true });
  });
});
