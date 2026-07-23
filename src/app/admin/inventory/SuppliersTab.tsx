"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Pencil, Truck } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, Btn, Spinner, Empty, Badge, Field, Modal } from "./lib";

interface Supplier {
  id: string; name: string; contact: string; email: string; phone: string; gstin: string;
  city: string; state: string; leadTimeDays: number; paymentTerms: string; rating: number; active: boolean; notes: string;
}

export default function SuppliersTab() {
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Supplier> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await invGet<{ suppliers: Supplier[] }>("/suppliers");
    if (r?.suppliers) setList(r.suppliers);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!confirm("Delete this supplier?")) return;
    await invSend("DELETE", `/suppliers?id=${encodeURIComponent(id)}`);
    load();
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Suppliers ({list.length})</h3>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
          <Btn onClick={() => setEdit({ leadTimeDays: 7, paymentTerms: "Net 30", active: true })}><Plus className="h-4 w-4" /> Add supplier</Btn>
        </div>
      </div>

      {loading ? <Spinner /> : list.length === 0 ? <Empty text="No suppliers yet. Add your first vendor." /> : (
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((s) => (
            <div key={s.id} className="rounded-xl p-4" style={card}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{s.name}</span>
                    {!s.active && <Badge color="#94a3b8">inactive</Badge>}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {[s.contact, s.phone, s.email].filter(Boolean).join(" · ")}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {[s.city, s.state].filter(Boolean).join(", ")}{s.gstin ? ` · GSTIN ${s.gstin}` : ""}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Lead {s.leadTimeDays}d · {s.paymentTerms}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEdit(s)} style={{ color: "var(--text-secondary)" }}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(s.id)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && <SupplierModal init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function SupplierModal({ init, onClose, onSaved }: { init: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Supplier>>(init);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Supplier, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name?.trim()) return;
    setBusy(true);
    await invSend("POST", "/suppliers", f);
    setBusy(false); onSaved();
  };
  return (
    <Modal title={init.id ? "Edit supplier" : "Add supplier"} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *"><input value={f.name || ""} onChange={(e) => set("name", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Contact person"><input value={f.contact || ""} onChange={(e) => set("contact", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Phone"><input value={f.phone || ""} onChange={(e) => set("phone", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Email"><input value={f.email || ""} onChange={(e) => set("email", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="GSTIN"><input value={f.gstin || ""} onChange={(e) => set("gstin", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Payment terms"><input value={f.paymentTerms || ""} onChange={(e) => set("paymentTerms", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="City"><input value={f.city || ""} onChange={(e) => set("city", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="State"><input value={f.state || ""} onChange={(e) => set("state", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Lead time (days)"><input type="number" value={String(f.leadTimeDays ?? 7)} onChange={(e) => set("leadTimeDays", Number(e.target.value))} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Rating (0-5)"><input type="number" value={String(f.rating ?? 0)} onChange={(e) => set("rating", Number(e.target.value))} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active
      </label>
      <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save supplier"}</Btn></div>
    </Modal>
  );
}
