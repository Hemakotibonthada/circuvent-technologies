"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, PackageCheck, Send, X } from "lucide-react";
import { invGet, invSend, money, card, inputStyle, inputCls, inputSm, Btn, Spinner, Empty, Badge, Field, Modal, fmtDate, statusColor, type ProductRow } from "./lib";

interface POItem { productId: string; qty: number; costPrice: number; receivedQty: number }
interface PO { id: string; poNo: string; supplierId: string; status: string; items: POItem[]; createdAt: string; expectedAt?: string; notes: string; total: number }
interface Supplier { id: string; name: string }

export default function PurchaseOrdersTab() {
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [create, setCreate] = useState(false);
  const [receive, setReceive] = useState<PO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, r] = await Promise.all([
      invGet<{ purchaseOrders: PO[] }>("/purchase-orders"),
      invGet<{ suppliers: Supplier[] }>("/suppliers"),
      invGet<{ rows: ProductRow[] }>("/meta"),
    ]);
    if (p?.purchaseOrders) setPos(p.purchaseOrders);
    if (s?.suppliers) setSuppliers(s.suppliers);
    if (r?.rows) setRows(r.rows);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const supName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";
  const prodName = (id: string) => rows.find((r) => r.productId === id)?.name || id;
  const del = async (id: string) => { if (!confirm("Delete this PO?")) return; await invSend("DELETE", `/purchase-orders?id=${encodeURIComponent(id)}`); load(); };
  const setStatus = async (id: string, status: string) => { await invSend("PATCH", "/purchase-orders", { id, status }); load(); };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Purchase orders ({pos.length})</h3>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
          <Btn onClick={() => setCreate(true)} disabled={suppliers.length === 0}><Plus className="h-4 w-4" /> New PO</Btn>
        </div>
      </div>
      {suppliers.length === 0 && <p className="mb-3 text-sm" style={{ color: "#f59e0b" }}>Add a supplier first (Suppliers tab).</p>}

      {loading ? <Spinner /> : pos.length === 0 ? <Empty text="No purchase orders yet." /> : (
        <div className="space-y-2">
          {pos.map((po) => (
            <div key={po.id} className="rounded-xl p-4" style={card}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{po.poNo}</span>
                <Badge color={statusColor(po.status)}>{po.status}</Badge>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{supName(po.supplierId)}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{po.items.length} items · {money(po.total)} · {fmtDate(po.createdAt)}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {po.status === "draft" && <Btn variant="ghost" onClick={() => setStatus(po.id, "sent")}><Send className="h-4 w-4" /> Mark sent</Btn>}
                  {po.status !== "received" && po.status !== "cancelled" && <Btn variant="ghost" onClick={() => setReceive(po)}><PackageCheck className="h-4 w-4" /> Receive</Btn>}
                  {po.status !== "received" && <button onClick={() => setStatus(po.id, "cancelled")} title="Cancel" style={{ color: "#f59e0b" }}><X className="h-4 w-4" /></button>}
                  <button onClick={() => del(po.id)} title="Delete" style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {po.items.map((it, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{prodName(it.productId)}</span>
                    <span>{it.receivedQty}/{it.qty} @ {money(it.costPrice)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {create && <CreatePO suppliers={suppliers} rows={rows} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); load(); }} />}
      {receive && <ReceivePO po={receive} prodName={prodName} onClose={() => setReceive(null)} onDone={() => { setReceive(null); load(); }} />}
    </div>
  );
}

function CreatePO({ suppliers, rows, onClose, onSaved }: { suppliers: Supplier[]; rows: ProductRow[]; onClose: () => void; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [expectedAt, setExpectedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; qty: string; costPrice: string }[]>([{ productId: rows[0]?.productId || "", qty: "1", costPrice: String(rows[0]?.costPrice || 0) }]);
  const [busy, setBusy] = useState(false);

  const setItem = (i: number, k: string, v: string) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems((p) => [...p, { productId: rows[0]?.productId || "", qty: "1", costPrice: "0" }]);
  const rmItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const total = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.costPrice) || 0), 0);

  const save = async () => {
    if (!supplierId || items.length === 0) return;
    setBusy(true);
    await invSend("POST", "/purchase-orders", {
      supplierId, expectedAt: expectedAt || undefined, notes,
      items: items.map((it) => ({ productId: it.productId, qty: Number(it.qty) || 0, costPrice: Number(it.costPrice) || 0 })).filter((it) => it.qty > 0),
    });
    setBusy(false); onSaved();
  };

  return (
    <Modal title="New purchase order" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Expected date"><input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      <h4 className="mb-2 mt-4 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Line items</h4>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={it.productId} onChange={(e) => setItem(i, "productId", e.target.value)} className={`${inputSm} flex-1`} style={inputStyle}>{rows.map((r) => <option key={r.productId} value={r.productId}>{r.name}</option>)}</select>
            <input type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="Qty" className={`${inputSm} w-20`} style={inputStyle} />
            <input type="number" value={it.costPrice} onChange={(e) => setItem(i, "costPrice", e.target.value)} placeholder="Cost" className={`${inputSm} w-24`} style={inputStyle} />
            <button onClick={() => rmItem(i)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button onClick={addItem} className="mt-2 flex items-center gap-1 text-sm" style={{ color: "var(--accent-cyan)" }}><Plus className="h-4 w-4" /> Add item</button>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total: <b style={{ color: "var(--text-primary)" }}>{money(total)}</b></span>
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Create PO"}</Btn>
      </div>
    </Modal>
  );
}

function ReceivePO({ po, prodName, onClose, onDone }: { po: PO; prodName: (id: string) => string; onClose: () => void; onDone: () => void }) {
  const [recv, setRecv] = useState<Record<string, string>>(Object.fromEntries(po.items.map((it) => [it.productId, String(it.qty - it.receivedQty)])));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await invSend("PATCH", "/purchase-orders", { id: po.id, action: "receive", received: po.items.map((it) => ({ productId: it.productId, qty: Number(recv[it.productId]) || 0 })) });
    setBusy(false); onDone();
  };
  return (
    <Modal title={`Receive ${po.poNo}`} onClose={onClose} wide>
      <p className="mb-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Enter quantities received now. Stock updates and cost price is recorded.</p>
      <div className="space-y-2">
        {po.items.map((it) => (
          <div key={it.productId} className="flex items-center gap-3">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>{prodName(it.productId)}</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{it.receivedQty}/{it.qty} received</span>
            <input type="number" value={recv[it.productId] ?? "0"} onChange={(e) => setRecv((p) => ({ ...p, [it.productId]: e.target.value }))} className={`${inputSm} w-24`} style={inputStyle} />
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end"><Btn onClick={submit} disabled={busy}><PackageCheck className="h-4 w-4" /> {busy ? "Receiving…" : "Receive stock"}</Btn></div>
    </Modal>
  );
}
