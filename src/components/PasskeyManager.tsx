"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { usePasskey, usePasskeySupport, type PasskeyEndpoint } from "@/lib/usePasskey";

/*
 * Adding and removing passkeys.
 *
 * The sign-in buttons were shipped first and were, until this existed, unusable
 * by anybody: there was no way to register a passkey, so the button could only
 * ever fail. Worth stating plainly, because a sign-in path with no enrolment
 * path looks finished from every angle except the one that matters.
 *
 * Shared by staff and customers. The two differ only in which endpoint they
 * talk to and how they authenticate to it, and a second copy of this would be
 * a second place for the delete confirmation to be forgotten.
 */

interface StoredKey {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const when = (iso: string | null) => {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleDateString();
};

/** A sensible name for the device being registered, so the list is readable. */
function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export function PasskeyManager({
  endpoint,
  authHeaders,
  tone = "dark",
}: {
  endpoint: PasskeyEndpoint;
  /** How this page proves who it is. Staff and customers use different tokens. */
  authHeaders: () => Record<string, string>;
  tone?: "dark" | "themed";
}) {
  const supported = usePasskeySupport();
  const passkey = usePasskey(endpoint);
  const [keys, setKeys] = useState<StoredKey[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { headers: authHeaders() });
      if (!res.ok) {
        setKeys([]);
        return;
      }
      const data = (await res.json()) as { passkeys?: StoredKey[] };
      setKeys(data.passkeys ?? []);
    } catch {
      setKeys([]);
    }
  }, [endpoint, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setErr("");
    setMsg("");
    const r = await passkey.register(guessDeviceName(), authHeaders());
    if (!r.ok) {
      if (r.error) setErr(r.error);
      return;
    }
    setMsg("Passkey added. You can use it to sign in from now on.");
    await load();
  };

  const remove = async (id: string, label: string) => {
    /*
     * Confirmed, because this is the one action here that cannot be undone and
     * whose consequence is invisible until someone next tries to sign in — on a
     * device that may no longer be to hand.
     */
    if (!window.confirm(`Remove "${label}"? You will not be able to sign in with it again.`)) return;
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        setErr("Could not remove that passkey.");
        return;
      }
      setMsg("Passkey removed.");
      await load();
    } catch {
      setErr("Could not remove that passkey.");
    }
  };

  const dark = tone === "dark";
  const cardStyle = dark
    ? { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }
    : { background: "var(--bg-glass)", border: "1px solid var(--border-primary)" };
  const textMain = dark ? "#e2e8f0" : "var(--text-primary)";
  const textDim = dark ? "#94a3b8" : "var(--text-secondary)";

  if (supported === false) {
    return (
      <div className="rounded-xl p-4" style={cardStyle}>
        <p className="text-sm" style={{ color: textDim }}>
          {/* Named rather than vague: "not supported" invites a support ticket
              this sentence can answer on its own. */}
          This browser cannot use passkeys. Try a recent Chrome, Safari or Edge over https.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 space-y-3" style={cardStyle}>
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 mt-0.5" style={{ color: "#06b6d4" }} />
        <div className="flex-1">
          <h4 className="text-sm font-semibold" style={{ color: textMain }}>
            Passkeys
          </h4>
          <p className="text-xs mt-0.5" style={{ color: textDim }}>
            Sign in with your fingerprint, face or screen lock instead of a password. Nothing that can be phished or
            reused leaves your device.
          </p>
        </div>
      </div>

      {keys === null ? (
        <p className="text-xs" style={{ color: textDim }}>
          Loading…
        </p>
      ) : keys.length === 0 ? (
        <p className="text-xs" style={{ color: textDim }}>
          No passkeys yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ background: dark ? "rgba(255,255,255,0.03)" : "var(--bg-elevated)" }}
            >
              <KeyRound className="w-4 h-4 shrink-0" style={{ color: textDim }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate" style={{ color: textMain }}>
                  {k.label}
                </p>
                <p className="text-[11px]" style={{ color: textDim }}>
                  Added {when(k.createdAt)} · Last used {when(k.lastUsedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(k.id, k.label)}
                aria-label={`Remove ${k.label}`}
                className="p-2 rounded-lg transition hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {err && <p className="text-xs text-red-400">{err}</p>}
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      <button
        type="button"
        onClick={add}
        disabled={passkey.busy || supported === null}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
      >
        {passkey.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        Add a passkey
      </button>
    </div>
  );
}
