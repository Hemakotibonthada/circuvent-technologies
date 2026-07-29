// Session-signing secrets. SERVER ONLY.
//
// These keys are the whole of the authentication system: a session token is
// just `base64(email + ":" + HMAC(secret, email))`, so anyone who knows the
// secret can mint a session for any account — including the super-admin.
//
// A hardcoded fallback therefore fails *open*: every deployment that has not
// provisioned its env (preview builds, fresh containers, self-hosted clones)
// silently shares one publicly-readable key. Production now refuses to start
// without a real secret; development mints a random one per process, so local
// work keeps running but the value never leaves the machine and never becomes
// a shared constant.

import crypto from "crypto";

const MIN_LENGTH = 32;

const ephemeral = new Map<string, string>();

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolves a signing secret.
 *
 * @param names Env vars to try, in order of preference.
 * @param label Human name used in the failure message.
 */
export function requireSecret(names: string[], label: string): string {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (!v) continue;
    if (v.length < MIN_LENGTH && isProd()) {
      throw new Error(
        `${n} is too short to sign ${label} (need at least ${MIN_LENGTH} characters). ` +
          `Generate one with: openssl rand -base64 48`
      );
    }
    return v;
  }

  if (isProd()) {
    throw new Error(
      `${names[0]} is not set. ${label} cannot be signed without it. ` +
        `Generate one with: openssl rand -base64 48`
    );
  }

  // Dev/test: a per-process random key. Sessions do not survive a restart,
  // which is the correct trade for never shipping a shared constant.
  const key = names[0];
  let v = ephemeral.get(key);
  if (!v) {
    v = crypto.randomBytes(48).toString("base64");
    ephemeral.set(key, v);
    if (process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.warn(
        `[secrets] ${key} is not set — using a random key for this process. ` +
          `Sessions will be invalidated on restart. Set ${key} to keep them.`
      );
    }
  }
  return v;
}

/**
 * The seed password for the bootstrap super-admin.
 *
 * When unset, a strong random password is generated and printed once so the
 * owner can still get in on a fresh install without a credential ever being
 * committed to source.
 */
export function seedAdminPassword(): string {
  const configured = process.env.ADMIN_DEFAULT_PASSWORD?.trim();
  if (configured) return configured;
  const generated = crypto.randomBytes(12).toString("base64url");
  // eslint-disable-next-line no-console
  console.warn(
    `[secrets] ADMIN_DEFAULT_PASSWORD is not set. Seeding the owner account with a one-time password: ${generated}\n` +
      `          Sign in with it now and change it, or set ADMIN_DEFAULT_PASSWORD and reseed.`
  );
  return generated;
}
