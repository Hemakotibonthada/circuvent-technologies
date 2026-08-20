/*
 * Signing in to the console with a storefront account.
 *
 * The shop and the smart-home console keep separate user tables. The shop's
 * lives in this application; the console's lives in the control plane, which
 * issues its own tokens and knows nothing about shop customers. So somebody who
 * bought a device, created an account at the checkout, and then went to
 * /smarthome to set it up was told their password was wrong -- by a service
 * that had simply never heard of them. Which is indistinguishable, from the
 * outside, from having mistyped it.
 *
 * Rather than copy password hashes between two different schemes, the shop
 * backend vouches for a customer it has already authenticated and the control
 * plane issues its own session for that address. That exchange already existed
 * (POST /api/account/sso/console -> POST /auth/federated); nothing on the
 * console ever called it.
 *
 * The order matters. The console is tried first, so an existing console account
 * keeps working exactly as before and nothing about this is load-bearing for
 * people who already had one.
 */

export interface ConsoleUser {
  id: number;
  email: string;
  name: string;
  /** Profile picture from the identity provider. Empty when none was asserted. */
  avatarUrl?: string;
}

export interface ConsoleSignInResult {
  ok: boolean;
  token?: string;
  refreshToken?: string | null;
  user?: ConsoleUser;
  error?: string;
  /** Which account actually got them in. For logging and tests, not for display. */
  via?: "console" | "shop";
}

export interface ConsoleSignInDeps {
  consoleLogin(
    email: string,
    password: string
  ): Promise<{ ok: boolean; token?: string; refreshToken?: string | null; user?: ConsoleUser; error?: string }>;
  shopLogin(email: string, password: string): Promise<{ ok: boolean; token?: string }>;
  exchangeShopToken(
    shopToken: string
  ): Promise<{ ok: boolean; status?: number; token?: string; user?: ConsoleUser; message?: string }>;
}

/**
 * The same sentence for "no such account" and "wrong password".
 *
 * Now that two directories are consulted, the ways to fail have multiplied, and
 * a helpful message for each would tell an attacker which addresses exist in
 * which system.
 */
const GENERIC = "Invalid email or password";

export async function signInToConsole(
  email: string,
  password: string,
  deps: ConsoleSignInDeps
): Promise<ConsoleSignInResult> {
  const direct = await deps.consoleLogin(email, password);
  if (direct.ok && direct.token && direct.user) {
    return { ok: true, token: direct.token, refreshToken: direct.refreshToken ?? null, user: direct.user, via: "console" };
  }

  let shop: { ok: boolean; token?: string };
  try {
    shop = await deps.shopLogin(email, password);
  } catch {
    // The shop being unreachable must not turn a plain wrong password into an
    // error about the shop, which would be confusing and would also disclose
    // that a second directory was consulted.
    shop = { ok: false };
  }

  if (!shop.ok || !shop.token) {
    return { ok: false, error: direct.error || GENERIC };
  }

  const exchanged = await deps.exchangeShopToken(shop.token);
  if (exchanged.ok && exchanged.token && exchanged.user) {
    return { ok: true, token: exchanged.token, refreshToken: null, user: exchanged.user, via: "shop" };
  }

  /*
   * Past this point the password was right and the bridge is what failed.
   *
   * Reporting "invalid email or password" here would send somebody to reset a
   * password that already works, and they would find that the new one does not
   * work either -- because the password was never the problem.
   */
  if (exchanged.status === 501) {
    return {
      ok: false,
      error: "Your shop account is valid, but single sign-on is not enabled on this deployment yet.",
    };
  }
  return {
    ok: false,
    error: exchanged.message || "Your account is valid, but the smart-home service could not be reached. Please try again.",
  };
}

/** Where the storefront keeps its session. Read, never written, from here. */
const SHOP_STORAGE_KEY = "circuvent-account";

/**
 * The storefront token held by this browser, if any.
 *
 * Read out of storage rather than through the shop's React context because the
 * console is a separate provider tree and is not wrapped by it. That makes this
 * a read of someone else's format, so it is defensive about what it finds: a
 * half-written or outdated entry should mean "not signed in", not a crash on
 * the console's first render.
 */
export function storedShopToken(storage?: Pick<Storage, "getItem">): string | null {
  try {
    const store = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!store) return null;
    const raw = store.getItem(SHOP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed?.token === "string" && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}
