"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, CalendarClock, AlertTriangle } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, Btn, Spinner, Empty, Badge, Field, Modal, fmtDate, type ProductRow } from "./lib";

interface Batch { id: string; productId: string; batchNo: string; qty: number; mfgDate?: string; expiryDate?: string }

export default function BatchesTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, r] = await Promise.all([invGet<{ batches: Batch[] }>("/batches"), invGet<{ rows: ProductRow[] }>("/meta")]);
    if (b?.batches) setBatches(b.batches);
    if (r?.rows) setRows(r.rows);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const name = (id: string) => rows.find((r) => r.productId === id)?.name || id;
  const soon = (d?: string) => d && new Date(d).getTime() < Date.now() + 30 * 86400000;
  const expired = (d?: string) => d && new Date(d).getTime() < Date.now();
  const del = async (id: string) => { if (!confirm("Delete this batch?")) return; await invSend("DELETE", `/batches?id=${encodeURIComponent(id)}`); load(); };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Batches & expiry ({batches.length})</h3>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
          <Btn onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add batch</Btn>
        </div>
      </div>
      {loading ? <Spinner /> : batches.length === 0 ? <Empty text="No batches tracked. Add a batch/lot with an expiry date." /> : (
        <div className="overflow-x-auto rounded-xl" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                <th className="p-3">Product</th><th className="p-3">Batch</th><th className="p-3">Qty</th><th className="p-3">Mfg</th><th className="p-3">Expiry</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <td className="p-3" style={{ color: "var(--text-primary)" }}>{name(b.productId)}</td>
                  <td className="p-3 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{b.batchNo}</td>
                  <td className="p-3" style={{ color: "var(--text-secondary)" }}>{b.qty}</td>
                  <td className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>{fmtDate(b.mfgDate)}</td>
                  <td className="p-3 text-xs">
                    <span style={{ color: expired(b.expiryDate) ? "#ef4444" : soon(b.expiryDate) ? "#f59e0b" : "var(--text-muted)" }}>{fmtDate(b.expiryDate)}</span>
                    {expired(b.expiryDate) ? <Badge color="#ef4444"> expired</Badge> : soon(b.expiryDate) ? <Badge color="#f59e0b"> soon</Badge> : null}
                  </td>
                  <td className="p-3 text-right"><button onClick={() => del(b.id)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {add && <AddBatch rows={rows} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); }} />}
    </div>
  );
}

function AddBatch({ rows, onClose, onSaved }: { rows: ProductRow[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<{ productId: string; batchNo: string; qty: string; mfgDate: string; expiryDate: string }>({ productId: rows[0]?.productId || "", batchNo: "", qty: "0", mfgDate: "", expiryDate: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.productId || !f.batchNo.trim()) return;
    setBusy(true);
    await invSend("POST", "/batches", { productId: f.productId, batchNo: f.batchNo, qty: Number(f.qty), mfgDate: f.mfgDate || undefined, expiryDate: f.expiryDate || undefined });
    setBusy(false); onSaved();
  };
  return (
    <Modal title="Add batch / lot" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product"><select value={f.productId} onChange={(e) => set("productId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>{rows.map((r) => <option key={r.productId} value={r.productId}>{r.name}</option>)}</select></Field>
        <Field label="Batch / lot no."><input value={f.batchNo} onChange={(e) => set("batchNo", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Quantity"><input type="number" value={f.qty} onChange={(e) => set("qty", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Mfg date"><input type="date" value={f.mfgDate} onChange={(e) => set("mfgDate", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Expiry date"><input type="date" value={f.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Add batch"}</Btn></div>
    </Modal>
  );
}
