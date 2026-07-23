"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, inputSm, Btn, Spinner, Empty, Badge, Field, Modal, fmtDate, statusColor, type ProductRow } from "./lib";

interface CountLine { productId: string; system: number; counted: number | null }
interface SC { id: string; ref: string; status: string; lines: CountLine[]; createdAt: string; notes: string }

export default function CountsTab() {
  const [counts, setCounts] = useState<SC[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SC | null>(null);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r] = await Promise.all([invGet<{ counts: SC[] }>("/counts"), invGet<{ rows: ProductRow[] }>("/meta")]);
    if (c?.counts) setCounts(c.counts);
    if (r?.rows) setRows(r.rows);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const name = (id: string) => rows.find((r) => r.productId === id)?.name || id;
  const createCount = async () => {
    setCreating(true);
    const r = await invSend<{ count: SC }>("POST", "/counts", { notes: note });
    setCreating(false); setNote("");
    if (r.ok && r.data?.count) { setOpen(r.data.count); load(); }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Stock counts ({counts.length})</h3>
        <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-xl p-3" style={card}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="New cycle count note (optional)…" className={`${inputCls} flex-1`} style={inputStyle} />
        <Btn onClick={createCount} disabled={creating}><Plus className="h-4 w-4" /> Start count</Btn>
      </div>

      {loading ? <Spinner /> : counts.length === 0 ? <Empty text="No stock counts yet. Start a cycle count to reconcile physical stock." /> : (
        <div className="space-y-2">
          {counts.map((c) => {
            const filled = c.lines.filter((l) => l.counted !== null).length;
            return (
              <button key={c.id} onClick={() => setOpen(c)} className="flex w-full items-center gap-3 rounded-xl p-4 text-left" style={card}>
                <ClipboardCheck className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
                <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{c.ref}</span>
                <Badge color={statusColor(c.status)}>{c.status}</Badge>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{filled}/{c.lines.length} counted · {fmtDate(c.createdAt)}</span>
                {c.notes && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{c.notes}</span>}
              </button>
            );
          })}
        </div>
      )}

      {open && <CountSheet count={open} name={name} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function CountSheet({ count, name, onClose, onChanged }: { count: SC; name: (id: string) => string; onClose: () => void; onChanged: () => void }) {
  const [c, setC] = useState<SC>(count);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const setLine = async (productId: string, counted: string) => {
    const v = Number(counted);
    setC((p) => ({ ...p, lines: p.lines.map((l) => (l.productId === productId ? { ...l, counted: counted === "" ? null : v } : l)) }));
    if (counted !== "") await invSend("PATCH", "/counts", { id: c.id, action: "line", productId, counted: v });
  };
  const close = async () => {
    if (!confirm("Close this count and post variance adjustments to stock?")) return;
    setBusy(true);
    await invSend("PATCH", "/counts", { id: c.id, action: "close" });
    setBusy(false); onChanged(); onClose();
  };

  const lines = c.lines.filter((l) => { const ql = q.trim().toLowerCase(); return !ql || name(l.productId).toLowerCase().includes(ql); });
  const closed = c.status === "closed";

  return (
    <Modal title={`Count ${c.ref}`} onClose={onClose} wide>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product…" className={`${inputCls} mb-3 w-full`} style={inputStyle} />
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}><th className="p-2">Product</th><th className="p-2">System</th><th className="p-2">Counted</th><th className="p-2">Variance</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const variance = l.counted === null ? null : l.counted - l.system;
              return (
                <tr key={l.productId} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <td className="p-2" style={{ color: "var(--text-primary)" }}>{name(l.productId)}</td>
                  <td className="p-2" style={{ color: "var(--text-secondary)" }}>{l.system}</td>
                  <td className="p-2">
                    <input type="number" disabled={closed} defaultValue={l.counted ?? ""} onBlur={(e) => setLine(l.productId, e.target.value)} className={`${inputSm} w-24`} style={inputStyle} />
                  </td>
                  <td className="p-2" style={{ color: variance === null ? "var(--text-muted)" : variance === 0 ? "#10b981" : variance > 0 ? "#06b6d4" : "#ef4444" }}>
                    {variance === null ? "—" : (variance > 0 ? "+" : "") + variance}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!closed && (
        <div className="mt-4 flex justify-end">
          <Btn onClick={close} disabled={busy}><CheckCircle2 className="h-4 w-4" /> {busy ? "Posting…" : "Close & reconcile"}</Btn>
        </div>
      )}
    </Modal>
  );
}
