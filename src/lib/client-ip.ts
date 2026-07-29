/**
 * Resolves the client IP for rate limiting and abuse logging.
 *
 * `X-Forwarded-For` is a client-appendable list: the *leftmost* entry is
 * whatever the caller typed. Keying a limiter on it means an attacker rotates
 * one header value and gets unlimited login, OTP, and coupon attempts.
 *
 * Trust order:
 *  1. Headers a proxy sets itself and overwrites on every request
 *     (Vercel / Cloudflare / a correctly configured nginx). These cannot be
 *     forged from outside.
 *  2. Otherwise the Nth-from-the-right XFF entry, where N is the number of
 *     reverse proxies actually in front of the app (TRUSTED_PROXY_HOPS,
 *     default 1). Everything to the left of the trusted hops is caller data.
 */

const HOPS = (() => {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
})();

export function clientIp(request: Request): string {
  // Platform-controlled single-value headers first.
  const direct =
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("true-client-ip") ||
    request.headers.get("fly-client-ip");
  if (direct) return normalise(direct.split(",")[0]);

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length) {
      // Walk in from the right past our own proxies; clamp so a short list
      // still yields the least attacker-influenced value available.
      const idx = Math.max(0, hops.length - HOPS);
      return normalise(hops[idx]);
    }
  }

  const real = request.headers.get("x-real-ip");
  if (real) return normalise(real);
  return "unknown";
}

function normalise(ip: string): string {
  const v = ip.trim().replace(/^\[|\]$/g, "");
  // Strip a trailing :port on IPv4 forms so one client isn't many keys.
  const m = v.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  return (m ? m[1] : v).toLowerCase() || "unknown";
}
