/*
 * The WebAuthn ceremonies, in one place for both sign-ins.
 *
 * /admin and /smarthome need the same four steps and differ only in who the
 * credential belongs to and what a successful assertion is worth. Written twice
 * they would drift, and the half that drifts is the half that stops checking
 * something.
 *
 * SERVER ONLY.
 */

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  RP_NAME,
  credentialsFor,
  findCredential,
  putChallenge,
  recordUse,
  relyingParty,
  saveCredential,
  takeChallenge,
  type PasskeyScope,
} from "./passkeys";
import { logger } from "./logger";

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

const key = (scope: PasskeyScope, kind: string, email: string) => `${scope}:${kind}:${email.trim().toLowerCase()}`;

export type CeremonyError = { ok: false; status: number; message: string };
const fail = (status: number, message: string): CeremonyError => ({ ok: false, status, message });

const NO_WEBAUTHN =
  "Passkeys need a secure connection. Open this site over https and try again.";

/* ---------------------------------------------------------- registration -- */

export async function startRegistration(scope: PasskeyScope, email: string, origin: string) {
  const rp = relyingParty(origin);
  if (!rp) return fail(400, NO_WEBAUTHN);

  const existing = credentialsFor(scope, email);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: email,
    userDisplayName: email,
    attestationType: "none",
    /*
     * Offering the ones already registered stops the authenticator creating a
     * second credential for the same account on the same device. Without it a
     * user who taps "add a passkey" twice ends up with two, both working, and
     * no way to tell which is which in the list.
     */
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports as never,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      /*
       * The user must prove it is them, not merely that they hold the device —
       * a biometric or the device PIN. Without this a passkey is one factor,
       * and it is replacing a password plus a second factor.
       */
      userVerification: "required",
    },
  });

  putChallenge(key(scope, "register", email), {
    challenge: options.challenge,
    scope,
    owner: email.trim().toLowerCase(),
    kind: "register",
  });

  return { ok: true as const, options };
}

export async function finishRegistration(
  scope: PasskeyScope,
  email: string,
  origin: string,
  response: RegistrationResponseJSON,
  label: string
) {
  const rp = relyingParty(origin);
  if (!rp) return fail(400, NO_WEBAUTHN);

  const pending = takeChallenge(key(scope, "register", email));
  if (!pending || pending.kind !== "register" || pending.scope !== scope) {
    return fail(400, "That registration expired. Please start again.");
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    logger.error("passkey.register_rejected", { scope, email }, err);
    return fail(400, "That passkey could not be registered.");
  }

  if (!verification.verified || !verification.registrationInfo) {
    return fail(400, "That passkey could not be registered.");
  }

  const { credential } = verification.registrationInfo;
  saveCredential({
    id: credential.id,
    scope,
    owner: email,
    publicKey: b64u(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports,
    label: label.trim().slice(0, 60) || "Passkey",
    createdAt: new Date().toISOString(),
  });

  return { ok: true as const, id: credential.id };
}

/* -------------------------------------------------------- authentication -- */

export async function startAuthentication(scope: PasskeyScope, email: string, origin: string) {
  const rp = relyingParty(origin);
  if (!rp) return fail(400, NO_WEBAUTHN);

  const creds = credentialsFor(scope, email);

  /*
   * An address with no passkey still gets a challenge.
   *
   * Answering "no passkeys here" would turn this endpoint into a way to ask
   * which addresses have an account, which is exactly the disclosure the
   * password form is careful not to make. The ceremony fails later, the same
   * way a wrong password does.
   */
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports as never })),
    userVerification: "required",
  });

  putChallenge(key(scope, "authenticate", email), {
    challenge: options.challenge,
    scope,
    owner: email.trim().toLowerCase(),
    kind: "authenticate",
  });

  return { ok: true as const, options };
}

export async function finishAuthentication(
  scope: PasskeyScope,
  email: string,
  origin: string,
  response: AuthenticationResponseJSON
) {
  const rp = relyingParty(origin);
  if (!rp) return fail(400, NO_WEBAUTHN);

  const pending = takeChallenge(key(scope, "authenticate", email));
  if (!pending || pending.kind !== "authenticate" || pending.scope !== scope) {
    return fail(400, "That sign-in expired. Please try again.");
  }

  const stored = findCredential(scope, response.id);
  /*
   * The credential must belong to the address that asked. Verifying the
   * signature alone would only prove the holder controls SOME registered key —
   * one customer's passkey would satisfy a challenge issued for another.
   */
  if (!stored || stored.owner !== email.trim().toLowerCase()) {
    return fail(401, "That passkey was not recognised.");
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: fromB64u(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as never,
      },
    });
  } catch (err) {
    logger.error("passkey.auth_rejected", { scope, email }, err);
    return fail(401, "That passkey was not recognised.");
  }

  if (!verification.verified) return fail(401, "That passkey was not recognised.");

  const used = recordUse(scope, stored.id, verification.authenticationInfo.newCounter);
  if (!used.ok) {
    // A counter that went backwards means two authenticators are answering for
    // one credential. Refusing is the point of keeping the counter at all.
    return fail(401, "That passkey could not be used. Please sign in with your password.");
  }

  return { ok: true as const, owner: stored.owner, credentialId: stored.id };
}
