"use client";

/**
 * Password and session control.
 *
 * These two belong together rather than in separate places, because on their
 * own each is close to useless:
 *
 *   - Ending sessions while someone else knows the password just means they
 *     sign back in.
 *   - Changing the password while their session stays alive means they never
 *     had to.
 *
 * The control plane does both in one step for exactly that reason, and the
 * copy here says so, so nobody assumes "sign out everywhere" alone is enough
 * after a compromise.
 */

import { useCallback, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { controlPlane, setToken, setRefreshToken } from "@/lib/control-plane";
import {
  Button, Callout, Field, SectionTitle, Surface, TextInput,
} from "../_kit/primitives";

const MIN_LENGTH = 8;

/**
 * The control plane reports failures as `{ error }` in the body, but the typed
 * result describes the success shape, so the field has to be read defensively.
 * Same approach as `apiError` in the automation panel.
 */
function apiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

export default function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [revoking, setRevoking] = useState(false);
  const [revokeMsg, setRevokeMsg] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const ready = current.length > 0 && next.length >= MIN_LENGTH && next === confirm && !busy;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await controlPlane.changePassword(current, next);
    setBusy(false);

    if (!res.ok) {
      setError(apiError(res.data, "Could not change your password."));
      return;
    }
    // The server ended every session and chain including this one, and handed
    // back replacements. Storing both is what keeps this tab signed in — saving
    // only the access token would strand it when that token expires.
    if (res.data?.token) setToken(res.data.token);
    if (res.data?.refreshToken) setRefreshToken(res.data.refreshToken);
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone("Password changed. Every other device has been signed out.");
  }, [current, next]);

  const revoke = useCallback(async () => {
    setRevoking(true);
    setRevokeMsg(null);
    const res = await controlPlane.signOutEverywhere();
    setRevoking(false);
    if (!res.ok) {
      setRevokeMsg(apiError(res.data, "Could not end your other sessions."));
      return;
    }
    if (res.data?.token) setToken(res.data.token);
    if (res.data?.refreshToken) setRefreshToken(res.data.refreshToken);
    setRevokeMsg("Every other device has been signed out. This one is still signed in.");
  }, []);

  return (
    <>
      <SectionTitle>Password</SectionTitle>
      <Surface>
        <div className="max-w-md space-y-3">
          <Field label="Current password">
            <TextInput value={current} onChange={setCurrent} type="password" placeholder="Your current password" disabled={busy} />
          </Field>
          <Field
            label="New password"
            hint={`At least ${MIN_LENGTH} characters.`}
            error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : null}
          >
            <TextInput value={next} onChange={setNext} type="password" placeholder="New password" disabled={busy} />
          </Field>
          <Field label="Confirm new password" error={mismatch ? "These do not match." : null}>
            <TextInput value={confirm} onChange={setConfirm} type="password" placeholder="Repeat the new password" disabled={busy} />
          </Field>

          {error && <Callout tone="critical">{error}</Callout>}
          {done && <Callout tone="ok" title="Done">{done}</Callout>}

          <Button variant="primary" icon={KeyRound} onClick={submit} disabled={!ready} busy={busy}>
            Change password
          </Button>

          <p className="text-[12px] leading-relaxed" style={{ color: "var(--cv-muted)" }}>
            Changing your password signs out every other device. That is deliberate:
            ending sessions alone would not help if someone else knows the password,
            and changing the password alone would leave their session working.
          </p>
        </div>
      </Surface>

      <SectionTitle>Other devices</SectionTitle>
      <Surface>
        <div className="max-w-md space-y-3">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--cv-muted)" }}>
            Signs out every phone, tablet and browser except this one. Use it if you
            have lost a device. If you think someone knows your password, change the
            password instead — that does this as well.
          </p>
          {revokeMsg && (
            <Callout tone={revokeMsg.startsWith("Every") ? "ok" : "critical"}>{revokeMsg}</Callout>
          )}
          <Button icon={revokeMsg?.startsWith("Every") ? ShieldCheck : LogOut} onClick={revoke} busy={revoking}>
            Sign out all other devices
          </Button>
        </div>
      </Surface>
    </>
  );
}
