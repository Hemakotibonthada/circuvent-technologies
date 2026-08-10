/*
 * Passkeys.
 *
 * A passkey is a key pair held by the device — in a secure enclave, or by a
 * password manager — where the private half never leaves it and the public half
 * is all we store. There is nothing here worth stealing: a dump of this file
 * gives an attacker public keys and counters, not the means to sign in as
 * anybody. That is the whole reason to prefer it over the password it replaces.
 *
 * The ceremonies are handled by @simplewebauthn/server rather than by hand.
 * WebAuthn verification is signature checking, CBOR and attestation parsing,
 * and a list of ways to get it subtly wrong that ends with accepting a forged
 * assertion. This module owns the parts that are ours: which credentials belong
 * to whom, and making a challenge single-use.
 *
 * SERVER ONLY.
 */

import { createFileStore } from "./data-file";
import { logger } from "./logger";

/** How long someone has to touch the sensor before a challenge is stale. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Which sign-in a credential belongs to. They must never be interchangeable. */
export type PasskeyScope = "admin" | "account";

export interface StoredPasskey {
  /** base64url credential ID as issued by the authenticator. */
  id: string;
  scope: PasskeyScope;
  /** Lower-cased email of the owner. */
  owner: string;
  publicKey: string;
  /** Signature counter, for cloned-authenticator detection. */
  counter: number;
  transports?: string[];
  /** What the user called it, e.g. "MacBook Touch ID". */
  label: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface PendingChallenge {
  challenge: string;
  scope: PasskeyScope;
  /** Absent for a sign-in that has not yet named anybody. */
  owner?: string;
  kind: "register" | "authenticate";
  expiresAt: number;
}

interface PasskeyDB {
  credentials: StoredPasskey[];
  challenges: Record<string, PendingChallenge>;
}

const store = createFileStore<PasskeyDB>("passkeys.json", () => ({ credentials: [], challenges: {} }));

const norm = (email: string) => email.trim().toLowerCase();

/* ------------------------------------------------------------ credentials -- */

export function credentialsFor(scope: PasskeyScope, email: string): StoredPasskey[] {
  const owner = norm(email);
  return store.read().credentials.filter((c) => c.scope === scope && c.owner === owner);
}

/**
 * A credential by ID, but only within the scope that is asking.
 *
 * Scope is part of the lookup rather than checked afterwards. A staff passkey
 * and a customer passkey are both just credential IDs, and a lookup that found
 * one and then forgot to compare the scope would let a customer's key satisfy
 * an admin sign-in. Making it impossible to look up cross-scope is cheaper than
 * remembering to check.
 */
export function findCredential(scope: PasskeyScope, id: string): StoredPasskey | null {
  return store.read().credentials.find((c) => c.scope === scope && c.id === id) ?? null;
}

export function saveCredential(cred: StoredPasskey): void {
  const db = store.read();
  /*
   * Normalised on both paths, not just on insert.
   *
   * The update branch used to store whatever case the caller passed, so
   * re-registering an existing credential wrote back "Mixed@Example.COM" and
   * every later lookup — which normalises — stopped finding it. The passkey
   * still existed, still verified, and belonged to nobody. It only appeared on
   * the second save of the same credential, which is why it survived the first
   * run of its own test.
   */
  const record: StoredPasskey = { ...cred, owner: norm(cred.owner) };
  const existing = db.credentials.findIndex((c) => c.scope === record.scope && c.id === record.id);
  if (existing >= 0) db.credentials[existing] = record;
  else db.credentials.push(record);
  store.write(db);
}

export function removeCredential(scope: PasskeyScope, email: string, id: string): boolean {
  const db = store.read();
  const owner = norm(email);
  const before = db.credentials.length;
  db.credentials = db.credentials.filter((c) => !(c.scope === scope && c.owner === owner && c.id === id));
  if (db.credentials.length === before) return false;
  store.write(db);
  return true;
}

/**
 * Records a use and moves the counter forward.
 *
 * A counter that goes backwards means two authenticators are answering for one
 * credential, which is what a cloned key looks like. We refuse the sign-in and
 * say so, rather than quietly accepting the lower value — the alternative is
 * that a clone works indefinitely and nothing ever reports it.
 */
export function recordUse(scope: PasskeyScope, id: string, newCounter: number): { ok: boolean; reason?: string } {
  const db = store.read();
  const cred = db.credentials.find((c) => c.scope === scope && c.id === id);
  if (!cred) return { ok: false, reason: "unknown credential" };

  // A counter of 0 on both sides means the authenticator does not keep one,
  // which is normal and common — platform authenticators often report 0 always.
  if (newCounter !== 0 && newCounter <= cred.counter) {
    logger.warn("passkey.counter_regressed", { scope, id, stored: cred.counter, presented: newCounter });
    return { ok: false, reason: "counter regressed" };
  }

  cred.counter = newCounter;
  cred.lastUsedAt = new Date().toISOString();
  store.write(db);
  return { ok: true };
}

/* ------------------------------------------------------------- challenges -- */

/**
 * Challenges are single use and expire.
 *
 * The signature a browser returns covers the challenge, so a challenge that
 * stays valid is a replayable sign-in for as long as it lives. Taking it means
 * removing it: a second attempt with the same one finds nothing and fails,
 * which is the behaviour that makes a captured response worthless.
 */
export function putChallenge(key: string, c: Omit<PendingChallenge, "expiresAt">): void {
  const db = store.read();
  db.challenges[key] = { ...c, expiresAt: Date.now() + CHALLENGE_TTL_MS };
  sweep(db);
  store.write(db);
}

export function takeChallenge(key: string): PendingChallenge | null {
  const db = store.read();
  const found = db.challenges[key];
  delete db.challenges[key];
  sweep(db);
  store.write(db);
  if (!found) return null;
  if (found.expiresAt < Date.now()) return null;
  return found;
}

function sweep(db: PasskeyDB): void {
  const now = Date.now();
  for (const [k, v] of Object.entries(db.challenges)) {
    if (v.expiresAt < now) delete db.challenges[k];
  }
}

/* ------------------------------------------------------------ environment -- */

/**
 * The relying party ID: the domain the credential is bound to.
 *
 * A passkey created for one RP ID cannot be used for another, which is what
 * makes it unphishable — and also what makes getting this wrong permanent, in
 * the sense that credentials registered under a wrong value are useless and
 * have to be registered again. Derived from the request origin rather than
 * configured, so preview deployments and localhost work without anybody
 * remembering to set something.
 */
export function relyingParty(origin: string): { rpID: string; origin: string } | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      // WebAuthn is refused over plain http by every browser except on
      // localhost. Returning null gives the caller something to report instead
      // of a ceremony that fails inside the browser with no explanation.
      return null;
    }
    return { rpID: url.hostname, origin: url.origin };
  } catch {
    return null;
  }
}

export const RP_NAME = "Circuvent";
