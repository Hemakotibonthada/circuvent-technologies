"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { RefreshCw, Download, Mail, Search, ChevronDown, ChevronRight } from "lucide-react";

function tok() { try { return sessionStorage.getItem("admin-token") || ""; } catch { return ""; } }
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

interface Row {
  id: number; created_at: string; to: string; from_addr: string | null; reply_to: string | null;
  cc: string | null; subject: string | null; type: string; status: string; provider: string | null;
  message_id: string | null; error: string | null; related: string | null; body_html: string | null; meta: unknown;
}

const TYPES = ["all", "otp", "password_reset", "admin_2fa", "order", "order_status", "contact", "support", "return", "report", "alert", "product_restock", "other"];
const LIMIT = 100;

export default function EmailsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ total: 0, sent: 0, failed: 0 });
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ type, status, q, limit: String(LIMIT), offset: String(page * LIMIT) });
      const r = await fetch(`/api/admin/emails?${p}`, { headers: { "x-admin-token": tok() } });
      const d = await r.json();
      if (d.ok) { setRows(d.rows || []); setCounts(d.counts || { total: 0, sent: 0, failed: 0 }); }
      else setRows([]);
    } catch { setRows([]); }
    setLoading(false);
  }, [type, status, q, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [type, status, q]);

  const exportCsv = () => {
    const head = ["time", "type", "status", "provider", "to", "subject", "message_id", "related", "error"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(",")].concat(rows.map((r) => [r.created_at, r.type, r.status, r.provider, r.to, r.subject, r.message_id, r.related, r.error].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `email-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const badge = (s: string) => (s === "sent" ? { bg: "rgba(16,185,129,0.12)", fg: "#10b981" } : { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            <Mail className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Email evidence
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>Every email the platform sends is recorded here (recipient, subject, body, provider, delivery status).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><Download className="h-4 w-4" /> Export CSV</button>
          <button onClick={load} className="rounded-lg border p-2" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Total logged" value={counts.total} color="var(--text-primary)" />
        <Kpi label="Delivered" value={counts.sent} color="#10b981" />
        <Kpi label="Failed" value={counts.failed} color="#ef4444" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--border-primary)" }}>
          <Search className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipient / subject / ref" className="bg-transparent text-sm outline-none" style={{ color: "var(--text-primary)", width: 220 }} />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: "var(--border-primary)", background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
          {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm" style={{ borderColor: "var(--border-primary)", background: "var(--bg-surface)", color: "var(--text-secondary)" }}>
          {["all", "sent", "failed"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
      </div>

      <div className="rounded-2xl overflow-x-auto" style={card}>
        {loading && !rows.length ? <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Loading…</p> :
          !rows.length ? <p className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No emails logged yet.</p> :
            <table className="w-full text-sm">
              <thead><tr style={{ color: "var(--text-tertiary)" }}>
                <th className="px-3 py-2 text-left font-medium w-6"></th>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">To</th>
                <th className="px-3 py-2 text-left font-medium">Subject</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const b = badge(r.status);
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t cursor-pointer" style={{ borderColor: "var(--border-primary)" }} onClick={() => setOpen(isOpen ? null : r.id)}>
                        <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{new Date(r.created_at).toLocaleString("en-IN")}</td>
                        <td className="px-3 py-2"><span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--bg-glass)", color: "var(--text-secondary)" }}>{r.type}</span></td>
                        <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{r.to}</td>
                        <td className="px-3 py-2 max-w-[280px] truncate" style={{ color: "var(--text-secondary)" }}>{r.subject}</td>
                        <td className="px-3 py-2"><span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: b.bg, color: b.fg }}>{r.status}</span></td>
                      </tr>
                      {isOpen && (
                        <tr style={{ borderColor: "var(--border-primary)" }}>
                          <td colSpan={6} className="px-3 pb-4">
                            <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                              <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                                <Meta k="From" v={r.from_addr} />
                                <Meta k="Reply-To" v={r.reply_to} />
                                <Meta k="CC" v={r.cc} />
                                <Meta k="Provider" v={r.provider} />
                                <Meta k="Message ID" v={r.message_id} />
                                <Meta k="Related" v={r.related} />
                                {r.error && <div className="mt-1 rounded p-2" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{r.error}</div>}
                              </div>
                              <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-primary)", background: "#fff" }}>
                                {r.body_html ? <iframe sandbox="" title={`email-${r.id}`} srcDoc={r.body_html} style={{ width: "100%", height: 280, border: 0 }} /> : <p className="p-3 text-xs text-slate-500">No body captured.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>}
      </div>

      <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-tertiary)" }}>
        <span>Showing {rows.length} of {counts.total}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: "var(--border-primary)" }}>Prev</button>
          <button disabled={(page + 1) * LIMIT >= counts.total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40" style={{ borderColor: "var(--border-primary)" }}>Next</button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={card}>
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>{value.toLocaleString("en-IN")}</p>
    </div>
  );
}
function Meta({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return <div><span style={{ color: "var(--text-tertiary)" }}>{k}:</span> <span className="break-all">{v}</span></div>;
}
