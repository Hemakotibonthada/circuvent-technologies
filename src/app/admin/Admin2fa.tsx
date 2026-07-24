"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

/** Header control to enable/disable email 2-step verification for the signed-in admin. */
export default function Admin2fa() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/2fa", { headers: { "x-admin-token": tok() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEnabled(!!d.enabled))
      .catch(() => {});
  }, []);

  const toggle = async () => {
    if (enabled === null || busy) return;
    const next = !enabled;
    if (next && !confirm("Enable 2-step verification? You'll be emailed a code on each sign-in.")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/2fa", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ enabled: next }),
      });
      const d = await r.json();
      if (r.ok && d.ok) setEnabled(d.enabled);
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  if (enabled === null) return null;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={enabled ? "2-step verification is ON — click to disable" : "Enable 2-step verification"}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
      style={{
        borderColor: enabled ? "#10b981" : "var(--border-primary)",
        color: enabled ? "#10b981" : "var(--text-tertiary)",
        background: enabled ? "rgba(16,185,129,0.1)" : "transparent",
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : enabled ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
      2FA {enabled ? "On" : "Off"}
    </button>
  );
}
