"use client";

import { useEffect, useState } from "react";
import { PasskeyManager } from "@/components/PasskeyManager";
import { storedShopToken } from "@/lib/console-signin";

/*
 * Passkeys, from inside the console.
 *
 * The console sign-in offers "use a passkey", so there has to be somewhere in
 * the console to create one — otherwise the button exists for a credential
 * nobody can make.
 *
 * The credential itself belongs to the Circuvent account, not to the control
 * plane, because the control plane has no WebAuthn: the passkey is verified
 * here and spent on the federation bridge. Which means enrolling one needs a
 * Circuvent account session, and somebody who only ever had control-plane
 * credentials does not have one. That is said plainly rather than shown as a
 * button that returns 401.
 */
export default function PasskeySection() {
  const [shopToken, setShopToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setShopToken(storedShopToken());
  }, []);

  if (shopToken === undefined) return null;

  if (!shopToken) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
      >
        <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Passkeys
        </h4>
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Passkeys belong to your Circuvent account rather than to this console. Sign in once at{" "}
          <a href="/shop/account" className="underline" style={{ color: "var(--accent-cyan)" }}>
            your account
          </a>{" "}
          — with the same email — and you can add one there and then use it here.
        </p>
      </div>
    );
  }

  return (
    <PasskeyManager
      endpoint="/api/account/passkey"
      authHeaders={() => ({ Authorization: `Bearer ${shopToken}` })}
      tone="themed"
    />
  );
}
