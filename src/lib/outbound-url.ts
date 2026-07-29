import dns from "dns/promises";
import net from "net";

/**
 * Guard for URLs the server will fetch on a user's behalf (webhooks).
 *
 * Without it, "deliver an event to my endpoint" is a request forgery
 * primitive: the caller picks the host, the server reaches it from inside the
 * network, and the status code and timing come back — enough to read cloud
 * metadata endpoints and map internal services. Many homeowners share one
 * deployment, so the co-located control plane is also in reach.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

/** RFC1918, loopback, link-local, CGNAT, and their IPv6 equivalents. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local (cloud metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded address.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // unparseable — refuse
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Validates a user-supplied webhook URL: https only, a public host, and a name
 * that does not resolve into private space. Resolution is re-run at send time
 * because DNS can change between registration and delivery.
 */
export async function checkOutboundUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(String(raw || ""));
  } catch {
    return { ok: false, reason: "Enter a valid URL." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Webhook URLs must use https." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Webhook URLs cannot contain credentials." };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, reason: "That host is not reachable from Circuvent." };
  }

  // A literal IP needs no lookup; a name does, and every answer must be public.
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) return { ok: false, reason: "That host is not reachable from Circuvent." };
    return { ok: true, url: url.toString() };
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(host, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { ok: false, reason: "That hostname could not be resolved." };
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    return { ok: false, reason: "That host is not reachable from Circuvent." };
  }
  return { ok: true, url: url.toString() };
}
