"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { PasskeyManager } from "@/components/PasskeyManager";

/*
 * Header control for staff passkeys.
 *
 * Sits next to the 2FA control because it answers the same question — how do I
 * prove I am me — and because that is where somebody looks for it. It reports
 * how many are registered on the button itself: a passkey nobody knows they
 * have is a way in nobody is watching.
 */

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

const headers = () => ({ "x-admin-token": tok() });

export default function AdminPasskeys() {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/admin/passkey", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCount(Array.isArray(d.passkeys) ? d.passkeys.length : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (count === null) return null;
  const on = count > 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Passkeys for this account"
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{
          borderColor: on ? "#06b6d4" : "var(--border-primary)",
          color: on ? "#06b6d4" : "var(--text-tertiary)",
          background: on ? "rgba(6,182,212,0.1)" : "transparent",
        }}
      >
        <KeyRound className="h-3.5 w-3.5" />
        {on ? `${count} passkey${count === 1 ? "" : "s"}` : "No passkey"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => {
            setOpen(false);
            refresh();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Passkeys
              </h3>
              <button
                onClick={() => {
                  setOpen(false);
                  refresh();
                }}
                aria-label="Close"
                className="rounded-lg p-1.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <PasskeyManager endpoint="/api/admin/passkey" authHeaders={headers} tone="themed" />
          </div>
        </div>
      )}
    </>
  );
}
