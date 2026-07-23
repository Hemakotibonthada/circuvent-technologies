"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Send, PackageCheck, X, ArrowRight } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, inputSm, Btn, Spinner, Empty, Badge, Field, Modal, fmtDate, statusColor, type ProductRow } from "./lib";

interface TItem { productId: string; qty: number }
interface Transfer { id: string; ref: string; fromLocationId: string; toLocationId: string; items: TItem[]; status: string; createdAt: string; notes: string }
interface Loc { id: string; name: string }

export default function TransfersTab() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, l, r] = await Promise.all([
      invGet<{ transfers: Transfer[] }>("/transfers"),
      invGet<{ locations: Loc[] }>("/locations"),
      invGet<{ rows: ProductRow[] }>("/meta"),
    ]);
    if (t?.transfers) setTransfers(t.transfers);
    if (l?.locations) setLocs(l.locations);
    if (r?.rows) setRows(r.rows);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const locName = (id: string) => locs.find((l) => l.id === id)?.name || "—";
  const prodName = (id: string) => rows.find((r) => r.productId === id)?.name || id;
  const act = async (id: string, action: "receive" | "cancel") => { await invSend("PATCH", "/transfers", { id, action }); load(); };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Stock transfers ({transfers.length})</h3>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
          <Btn onClick={() => setCreate(true)} disabled={locs.length < 2}><Plus className="h-4 w-4" /> New transfer</Btn>
        </div>
      </div>
      {locs.length < 2 && <p className="mb-3 text-sm" style={{ color: "#f59e0b" }}>Add at least two locations first (Locations tab).</p>}

      {loading ? <Spinner /> : transfers.length === 0 ? <Empty text="No transfers yet." /> : (
        <div className="space-y-2">
          {transfers.map((t) => (
            <div key={t.id} className="rounded-xl p-4" style={card}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t.ref}</span>
                <Badge color={statusColor(t.status)}>{t.status}</Badge>
                <span className="flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>{locName(t.fromLocationId)} <ArrowRight className="h-3 w-3" /> {locName(t.toLocationId)}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t.items.length} items · {fmtDate(t.createdAt)}</span>
                {t.status === "in_transit" && (
                  <div className="ml-auto flex gap-1.5">
                    <Btn variant="ghost" onClick={() => act(t.id, "receive")}><PackageCheck className="h-4 w-4" /> Receive</Btn>
                    <button onClick={() => act(t.id, "cancel")} title="Cancel" style={{ color: "#f59e0b" }}><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {t.items.map((it, i) => <div key={i} className="flex justify-between"><span>{prodName(it.productId)}</span><span>{it.qty}</span></div>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {create && <CreateTransfer locs={locs} rows={rows} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); load(); }} />}
    </div>
  );
}

function CreateTransfer({ locs, rows, onClose, onSaved }: { locs: Loc[]; rows: ProductRow[]; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useState(locs[0]?.id || "");
  const [to, setTo] = useState(locs[1]?.id || "");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; qty: string }[]>([{ productId: rows[0]?.productId || "", qty: "1" }]);
  const [busy, setBusy] = useState(false);
  const setItem = (i: number, k: string, v: string) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const save = async () => {
    if (!from || !to || from === to) return;
    setBusy(true);
    await invSend("POST", "/transfers", { fromLocationId: from, toLocationId: to, notes, items: items.map((it) => ({ productId: it.productId, qty: Number(it.qty) || 0 })).filter((it) => it.qty > 0) });
    setBusy(false); onSaved();
  };
  return (
    <Modal title="New stock transfer" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="To"><select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      {from === to && <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>From and To must differ.</p>}
      <h4 className="mb-2 mt-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Items</h4>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={it.productId} onChange={(e) => setItem(i, "productId", e.target.value)} className={`${inputSm} flex-1`} style={inputStyle}>{rows.map((r) => <option key={r.productId} value={r.productId}>{r.name} (stock {r.stock})</option>)}</select>
            <input type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} className={`${inputSm} w-20`} style={inputStyle} />
            <button onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button onClick={() => setItems((p) => [...p, { productId: rows[0]?.productId || "", qty: "1" }])} className="mt-2 flex items-center gap-1 text-sm" style={{ color: "var(--accent-cyan)" }}><Plus className="h-4 w-4" /> Add item</button>
      <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={busy || from === to}><Send className="h-4 w-4" /> {busy ? "Creating…" : "Create transfer"}</Btn></div>
    </Modal>
  );
}
