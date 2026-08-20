/**
 * Which endpoints a scheduled job is allowed to point at.
 *
 * Its own module because both sides need it and neither may import the other:
 * the server rule lives beside a `createFileStore` that pulls in `node:fs`, and
 * the panel that enforces it runs in the browser. Copying the check into both
 * would leave two versions of a security rule to drift apart, and the one that
 * drifts is the one nobody re-reads.
 *
 * Why the rule exists: "Run now" sends the operator's live `x-admin-token` with
 * the request, and that token is a full superadmin session — able to create
 * staff, delete accounts and flip feature flags. An unvalidated endpoint meant
 * a job stored as `https://attacker.example/collect` would make the admin's own
 * browser hand that token over, with no XSS needed, just a plausible row in a
 * job list.
 */
export function isSafeJobEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  const e = endpoint.trim();

  // A relative /api/ path cannot name another host: no scheme, no authority.
  if (!e.startsWith("/api/")) return false;

  // `//host/path` is protocol-relative. It looks like a path and is not one.
  if (e.startsWith("//")) return false;

  // Backslashes are folded to forward slashes by some URL parsers, so `/\evil`
  // escapes the origin exactly the way `//evil` does.
  if (e.includes("\\")) return false;

  return true;
}
