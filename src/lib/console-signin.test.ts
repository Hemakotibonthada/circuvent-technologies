import { signInToConsole, storedShopToken, type ConsoleSignInDeps, type ConsoleUser } from "./console-signin";

const USER: ConsoleUser = { id: 7, email: "buyer@example.com", name: "Buyer" };

function deps(over: Partial<ConsoleSignInDeps> = {}): ConsoleSignInDeps {
  return {
    consoleLogin: jest.fn(async () => ({ ok: false, error: "Invalid email or password" })),
    shopLogin: jest.fn(async () => ({ ok: false })),
    exchangeShopToken: jest.fn(async () => ({ ok: false })),
    ...over,
  };
}

describe("an existing console account", () => {
  it("signs in without the shop being consulted at all", async () => {
    const d = deps({
      consoleLogin: jest.fn(async () => ({ ok: true, token: "ct", refreshToken: "rt", user: USER })),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);

    expect(r).toMatchObject({ ok: true, token: "ct", refreshToken: "rt", via: "console" });
    expect(d.shopLogin).not.toHaveBeenCalled();
  });
});

describe("a storefront account with no console account", () => {
  it("gets in, which is the whole point", async () => {
    const d = deps({
      shopLogin: jest.fn(async () => ({ ok: true, token: "shop-token" })),
      exchangeShopToken: jest.fn(async () => ({ ok: true, token: "console-token", user: USER })),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);

    expect(r).toMatchObject({ ok: true, token: "console-token", user: USER, via: "shop" });
    expect(d.exchangeShopToken).toHaveBeenCalledWith("shop-token");
  });
});

describe("failures", () => {
  it("says the same thing whether the address is unknown or the password is wrong", async () => {
    const unknown = await signInToConsole("nobody@example.com", "pw", deps());
    const wrongPassword = await signInToConsole("buyer@example.com", "wrong", deps());
    expect(unknown.error).toBe(wrongPassword.error);
    expect(unknown.ok).toBe(false);
  });

  /*
   * The distinction this protects: telling someone their password is wrong when
   * it is right sends them to reset it, and the reset will not help, because
   * the password was never the problem.
   */
  it("does not blame the password when the bridge is switched off", async () => {
    const d = deps({
      shopLogin: jest.fn(async () => ({ ok: true, token: "shop-token" })),
      exchangeShopToken: jest.fn(async () => ({ ok: false, status: 501 })),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/single sign-on is not enabled/i);
    expect(r.error).not.toMatch(/invalid/i);
  });

  it("does not blame the password when the control plane is unreachable", async () => {
    const d = deps({
      shopLogin: jest.fn(async () => ({ ok: true, token: "shop-token" })),
      exchangeShopToken: jest.fn(async () => ({ ok: false, status: 502, message: "Could not reach the smart-home service." })),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/could not reach/i);
    expect(r.error).not.toMatch(/invalid/i);
  });

  it("reports a wrong password normally when the shop itself is down", async () => {
    const d = deps({
      shopLogin: jest.fn(async () => {
        throw new Error("network");
      }),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);

    expect(r.ok).toBe(false);
    expect(r.error).toBe("Invalid email or password");
  });

  it("treats an exchange that returns no token as a failure rather than signing someone in", async () => {
    const d = deps({
      shopLogin: jest.fn(async () => ({ ok: true, token: "shop-token" })),
      exchangeShopToken: jest.fn(async () => ({ ok: true })),
    });
    const r = await signInToConsole("buyer@example.com", "pw", d);
    expect(r.ok).toBe(false);
  });
});

describe("reading the storefront session", () => {
  const store = (raw: string | null) => ({ getItem: () => raw });

  it("finds a token the shop stored", () => {
    expect(storedShopToken(store(JSON.stringify({ account: { email: "a@b.c" }, token: "t" })))).toBe("t");
  });

  it("returns null for nothing, rubbish, or a token-less entry", () => {
    expect(storedShopToken(store(null))).toBeNull();
    expect(storedShopToken(store("not json"))).toBeNull();
    expect(storedShopToken(store(JSON.stringify({ account: { email: "a@b.c" } })))).toBeNull();
    expect(storedShopToken(store(JSON.stringify({ token: 42 })))).toBeNull();
  });
});
