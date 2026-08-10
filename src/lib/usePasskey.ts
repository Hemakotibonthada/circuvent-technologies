"use client";

/*
 * The browser half of a passkey.
 *
 * Two round trips each way: ask the server for options, hand them to the
 * platform, send back what it signed. @simplewebauthn/browser handles the
 * base64url encoding either side of navigator.credentials, which is fiddly and
 * silent when wrong.
 */

import { useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

export type PasskeyEndpoint = "/api/admin/passkey" | "/api/account/passkey";

/**
 * Whether this browser can do passkeys at all.
 *
 * Checked rather than assumed so the button is absent where it cannot work,
 * instead of present and failing. Firefox on some platforms, older Safari, and
 * anything served over plain http will all say no.
 */
export function usePasskeySupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.PublicKeyCredential !== "undefined" &&
        window.isSecureContext
    );
  }, []);
  return supported;
}

interface Result {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * A user cancelling is not an error worth showing.
 *
 * Dismissing the system sheet throws NotAllowedError, which is the same thing
 * the browser throws for a genuine refusal. Reporting "authentication failed"
 * for a deliberate cancel trains people to distrust the message, so a cancel
 * returns quietly and leaves the form as it was.
 */
function describe(err: unknown): string | undefined {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError") return undefined;
  if (name === "InvalidStateError") return "That device already has a passkey for this account.";
  if (name === "SecurityError") return "Passkeys need a secure connection to this site.";
  return "That did not work. Please try again, or use your password.";
}

export function usePasskey(endpoint: PasskeyEndpoint) {
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (body: Record<string, unknown>, headers?: Record<string, string>) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(headers ?? {}) },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { res, data };
    },
    [endpoint]
  );

  /** Sign in with a passkey. `extra` is merged into the verify request. */
  const signIn = useCallback(
    async (email: string, extra?: Record<string, unknown>): Promise<Result> => {
      setBusy(true);
      try {
        const { res, data } = await call({ step: "login-options", email });
        if (!res.ok) return { ok: false, error: String(data.error ?? "Could not start sign-in.") };

        let assertion;
        try {
          assertion = await startAuthentication({ optionsJSON: data.options as never });
        } catch (err) {
          return { ok: false, error: describe(err) };
        }

        const done = await call({ step: "login-verify", email, response: assertion, ...(extra ?? {}) });
        if (!done.res.ok) return { ok: false, error: String(done.data.error ?? "That passkey was not recognised.") };
        return { ok: true, data: done.data };
      } finally {
        setBusy(false);
      }
    },
    [call]
  );

  /** Add a passkey to the account that is already signed in. */
  const register = useCallback(
    async (label: string, headers?: Record<string, string>): Promise<Result> => {
      setBusy(true);
      try {
        const { res, data } = await call({ step: "register-options" }, headers);
        if (!res.ok) return { ok: false, error: String(data.error ?? "Could not start.") };

        let attestation;
        try {
          attestation = await startRegistration({ optionsJSON: data.options as never });
        } catch (err) {
          return { ok: false, error: describe(err) };
        }

        const done = await call({ step: "register-verify", label, response: attestation }, headers);
        if (!done.res.ok) return { ok: false, error: String(done.data.error ?? "Could not add that passkey.") };
        return { ok: true, data: done.data };
      } finally {
        setBusy(false);
      }
    },
    [call]
  );

  return { busy, signIn, register };
}
