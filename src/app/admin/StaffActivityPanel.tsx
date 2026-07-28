"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, ShieldEllipsis } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface StaffLoginEvent { id: string; email: string; at: string; userAgent?: string }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

export default function StaffActivityPanel() {
  const [events, setEvents] = useState<StaffLoginEvent[]>([]);
  const [stats, setStats] = useState<{ totalLogins: number; uniqueStaff: number; last24h: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/staff-activity", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setEvents(d.events || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><ShieldEllipsis className="w-5 h-5" /> Staff Login Activity</h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Every successful staff/admin sign-in, for visibility into control-center access.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.totalLogins}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Total logins</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.uniqueStaff}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Unique staff</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-cyan-400">{stats.last24h}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last 24h</div></div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Email", "When", "User agent"].map((h) => <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <td className="px-4 py-2.5 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}><LogIn className="w-3.5 h-3.5" /> {e.email}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-tertiary)" }}>{new Date(e.at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-xs truncate max-w-xs" style={{ color: "var(--text-tertiary)" }}>{e.userAgent || "—"}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No logins recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
