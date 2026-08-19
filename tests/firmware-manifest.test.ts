/**
 * @jest-environment node
 */
import { GET, __resetFirmwareCacheForTests } from "@/app/api/devices/firmware/route";

/**
 * The OTA manifest endpoint.
 *
 * This is the route that decides whether a device in somebody's ceiling
 * downloads new code, so its failure modes are worth pinning:
 *
 *   - answering with an update when there is none reflashes the fleet for
 *     nothing;
 *   - answering with *no* update when there is one is how a fix that has
 *     already been written never reaches anybody, which the home-hub changelog
 *     records happening across the whole fleet;
 *   - answering at all without credentials hands an attacker the URL a device
 *     will flash and reboot into.
 */

const MANIFEST = {
  generatedAt: "2026-08-18T00:00:00.000Z",
  builds: {
    "home-hub": { version: "2.4.0", url: "https://cdn.test/fw/home-hub-2.4.0.bin" },
    camera: { version: "1.14.5", url: "https://cdn.test/fw/camera-1.14.5.bin" },
  },
};

const realFetch = global.fetch;
let fetchCalls = 0;

function mockManifest(body: unknown = MANIFEST, ok = true) {
  fetchCalls = 0;
  global.fetch = jest.fn(async () => {
    fetchCalls++;
    return { ok, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

function req(query: string, headers: Record<string, string> = { "x-device-id": "d", "x-device-key": "k" }) {
  return new Request(`https://circuvent.com/api/devices/firmware?${query}`, { headers });
}

beforeEach(() => {
  __resetFirmwareCacheForTests();
  for (const k of Object.keys(process.env)) if (k.startsWith("OTA_")) delete process.env[k];
  mockManifest();
});

afterAll(() => {
  global.fetch = realFetch;
});

describe("authentication", () => {
  it("refuses a request with no device credentials", async () => {
    // The response names the binary a device will flash and reboot into.
    const res = await GET(req("type=home-hub&ver=2.3.0", {}));
    expect(res.status).toBe(401);
  });
});

describe("answering from the published manifest", () => {
  it("offers the published build to an out-of-date device", async () => {
    const res = await GET(req("type=home-hub&ver=2.3.0"));
    expect(await res.json()).toEqual({
      version: "2.4.0",
      url: "https://cdn.test/fw/home-hub-2.4.0.bin",
    });
  });

  it("offers nothing to a device already on the published build", async () => {
    /*
     * The url must be empty, not merely equal. `checkOTA` treats a non-empty
     * url as an update to apply, so echoing one back to a current device would
     * reflash it on every poll — a fleet permanently rebooting itself.
     */
    const res = await GET(req("type=home-hub&ver=2.4.0"));
    expect(await res.json()).toEqual({ version: "2.4.0", url: "" });
  });

  it("offers nothing for a type that has never been published", async () => {
    const res = await GET(req("type=nonexistent&ver=1.0.0"));
    expect(await res.json()).toEqual({ version: "1.0.0", url: "" });
  });

  it("will move a device backwards, because that is what a rollback is", async () => {
    // A bad build has to be recallable. "Newer only" refuses exactly when it
    // matters most.
    const res = await GET(req("type=camera&ver=1.14.9"));
    expect((await res.json()).version).toBe("1.14.5");
  });
});

describe("the operator override", () => {
  it("lets env pin a version over the manifest", async () => {
    process.env.OTA_HOME_HUB = "2.9.9|https://cdn.test/fw/home-hub-2.9.9.bin";
    const res = await GET(req("type=home-hub&ver=2.4.0"));
    expect(await res.json()).toEqual({
      version: "2.9.9",
      url: "https://cdn.test/fw/home-hub-2.9.9.bin",
    });
  });

  it("maps a hyphenated type to its env name", async () => {
    // OTA_HOME_HUB, not OTA_HOME-HUB. Getting this wrong makes the override
    // silently do nothing, which reads as "the pin did not work".
    process.env.OTA_HOME_HUB = "3.0.0|https://cdn.test/x.bin";
    const res = await GET(req("type=home-hub&ver=1.0.0"));
    expect((await res.json()).version).toBe("3.0.0");
  });
});

describe("when the manifest cannot be fetched", () => {
  it("offers no update rather than guessing", async () => {
    mockManifest({}, false);
    const res = await GET(req("type=home-hub&ver=2.3.0"));
    expect(await res.json()).toEqual({ version: "2.3.0", url: "" });
  });

  it("still answers from env, so a rollback works while the bucket is down", async () => {
    mockManifest({}, false);
    process.env.OTA_HOME_HUB = "2.3.0|https://cdn.test/fw/home-hub-2.3.0.bin";
    const res = await GET(req("type=home-hub&ver=2.4.0"));
    expect((await res.json()).version).toBe("2.3.0");
  });
});

describe("caching", () => {
  it("does not refetch the manifest for every device that polls", async () => {
    /*
     * A fleet checks in on its own timer. Without the cache each device poll
     * is an outbound request, so the busier the deployment the more it costs
     * to answer "nothing has changed".
     */
    await GET(req("type=home-hub&ver=2.3.0"));
    await GET(req("type=camera&ver=1.0.0"));
    await GET(req("type=home-hub&ver=2.3.0"));
    expect(fetchCalls).toBe(1);
  });
});
