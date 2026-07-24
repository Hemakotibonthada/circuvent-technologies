"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, RefreshCw, Loader2 } from "lucide-react";

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Entry {
  at: string;
  action: string;
  detail: string;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Read-only audit trail of admin/store actions. */
export default function AuditLogPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/audit", { headers: { "x-admin-token": tok() } });
      if (r.ok) setEntries((await r.json()).entries || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = entries.filter(
    (e) => !q || e.action.toLowerCase().includes(q.toLowerCase()) || e.detail.toLowerCase().includes(q.toLowerCase())
  );

  const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

  return (
    <div className="mt-6 rounded-2xl border p-6" style={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          <ScrollText className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Audit log
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className="rounded-lg border px-3 py-1.5 text-xs outline-none"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
          />
          <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No audit entries{q ? " match your filter" : " yet"}.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {shown.map((e, i) => (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border-primary)" }}>
                  <td className="py-2 pr-3 align-top">
                    <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                      {e.action}
                    </span>
                  </td>
                  <td className="py-2 pr-3 align-top" style={{ color: "var(--text-secondary)" }}>
                    {e.detail}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right align-top text-xs" style={{ color: "var(--text-muted)" }}>
                    {fmt(e.at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
