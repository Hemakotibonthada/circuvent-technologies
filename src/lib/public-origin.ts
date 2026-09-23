/**
 * Public browser origin for OIDC redirect_uri / post-login Location headers.
 *
 * Shared by attendance SSO and staff (admin) SSO. Must NOT prefer FRONTEND_URL
 * / NEXT_PUBLIC_SITE_URL: this app serves many hostnames (attendance / home /
 * iot / icm / insights / apex) and Auth allowlists each one. Behind Traefik,
 * Next often sees request.url as http://0.0.0.0:3022 when HOSTNAME is the
 * Docker bind address — that must never be minted into a Location or
 * redirect_uri.
 */

/** Hostnames that mean "listen address", never a browser-facing origin. */
const BIND_HOSTS = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "::",
  "::1",
  "localhost",
  "host.docker.internal",
]);

export function publicRequestOrigin(request: {
  url: string;
  headers: { get(name: string): string | null };
}): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || "";
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim() || "";
  const candidate = forwardedHost || hostHeader;
  const hostname = (candidate.split(":")[0] || "").toLowerCase();

  if (hostname && !BIND_HOSTS.has(hostname) && !hostname.endsWith(".internal")) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (/\.circuvent\.com$/i.test(hostname) ? "https" : new URL(request.url).protocol.replace(/:$/, ""));
    // Traefik sets X-Forwarded-Host without a port; keep Host ports for local dev.
    const hostPart = forwardedHost ? hostname : candidate;
    return `${proto}://${hostPart}`;
  }

  const configured =
    process.env.FRONTEND_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const fallback = new URL(request.url).origin;
  if (!BIND_HOSTS.has(new URL(fallback).hostname.toLowerCase())) return fallback;
  return "https://circuvent.com";
}
