"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Plus, ShieldQuestion, X } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface PrivacyRequest { id: string; email: string; type: "export" | "delete"; status: "pending" | "processing" | "completed" | "rejected"; requestedAt: string; erasureRef?: string }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

export default function PrivacyPanel() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [stats, setStats] = useState<{ pending: number; completed: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ email: string; type: "export" | "delete" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/privacy", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setRequests(d.requests || []);
      setStats(d.stats || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form?.email) return;
    await fetch("/api/admin/privacy", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify(form) });
    setForm(null);
    load();
  };

  const setStatus = async (id: string, status: PrivacyRequest["status"]) => {
    const req = requests.find((r) => r.id === id);
    let erasureRef: string | undefined;

    /*
     * Completing a deletion asserts the customer's data is gone. Nothing in
     * this product erases it, so the assertion has to be backed by whatever
     * was actually done by hand — otherwise the queue records a completion
     * date against data that is still there, and an auditor reads that as
     * proof of erasure.
     */
    if (status === "completed" && req?.type === "delete" && !req.erasureRef) {
      const raw = window.prompt(
        `Deletion is not automated. Record how ${req.email}'s data was erased — a ticket or runbook reference — to close this request:`,
        ""
      );
      if (raw === null) return;
      erasureRef = raw.trim();
      if (!erasureRef) {
        alert("A reference is required to close a deletion request. Nothing has been changed.");
        return;
      }
    }

    const res = await fetch("/api/admin/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id, status, erasureRef }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.message || "Could not update that request.");
    }
    load();
  };

  /*
   * A fetch, not window.open. The export route is behind `guard(request,
   * "privacy")`, which reads the x-admin-token header — and window.open cannot
   * send headers, so this always returned 403 and opened a tab showing
   * {"error":"Forbidden"}. It also put the customer's email in a URL, where it
   * lands in browser history and server logs.
   */
  const downloadExport = async (email: string) => {
    const res = await fetch(`/api/admin/privacy?exportEmail=${encodeURIComponent(email)}`, {
      headers: { "x-admin-token": tok() },
    });
    if (!res.ok) {
      alert("Could not build that export.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `privacy-export-${email.replace(/[^a-z0-9]+/gi, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}><ShieldQuestion className="w-5 h-5" /> Data Privacy Requests</h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Track "export my data" / "delete my account" requests through to completion.</p>
        </div>
        <button onClick={() => setForm({ email: "", type: "export" })} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}><Plus className="w-4 h-4" /> Log request</button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold" style={{ color: "var(--text-primary)" }}>{stats.total}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Total</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-amber-400">{stats.pending}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Pending</div></div>
          <div className="rounded-xl p-3" style={card}><div className="text-2xl font-extrabold text-emerald-400">{stats.completed}</div><div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Completed</div></div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} /></div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap" style={card}>
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{r.email} — {r.type} · {new Date(r.requestedAt).toLocaleDateString()}</span>
              <div className="flex items-center gap-2">
                {r.type === "export" && <button onClick={() => downloadExport(r.email)} className="p-1.5 rounded-lg hover:bg-white/10" title="Download export"><Download className="w-4 h-4" /></button>}
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value as PrivacyRequest["status"])} className="text-xs rounded-lg px-2 py-1" style={inputStyle}>
                  <option value="pending">pending</option>
                  <option value="processing">processing</option>
                  <option value="completed">completed</option>
                  <option value="rejected">rejected</option>
                </select>
                {r.status === "completed" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              </div>
            </div>
          ))}
          {requests.length === 0 && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No requests yet.</p>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Log privacy request</h3><button onClick={() => setForm(null)}><X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} /></button></div>
            <div className="space-y-3">
              <input className={field} style={inputStyle} placeholder="Customer email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <select className={field} style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "export" | "delete" })}>
                <option value="export">Export my data</option>
                <option value="delete">Delete my account</option>
              </select>
              <button onClick={save} className="w-full py-2.5 rounded-xl font-semibold text-white" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>Save request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
