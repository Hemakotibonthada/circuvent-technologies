"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Pencil, MapPin } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, Btn, Spinner, Empty, Badge, Field, Modal } from "./lib";

interface Loc { id: string; name: string; type: string; code: string; address: string; active: boolean; notes: string }

export default function LocationsTab() {
  const [list, setList] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Loc> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await invGet<{ locations: Loc[] }>("/locations");
    if (r?.locations) setList(r.locations);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => { if (!confirm("Delete this location?")) return; await invSend("DELETE", `/locations?id=${encodeURIComponent(id)}`); load(); };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Locations & warehouses ({list.length})</h3>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
          <Btn onClick={() => setEdit({ type: "warehouse", active: true })}><Plus className="h-4 w-4" /> Add location</Btn>
        </div>
      </div>
      {loading ? <Spinner /> : list.length === 0 ? <Empty text="No locations yet. Add a warehouse, store or bin." /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l) => (
            <div key={l.id} className="rounded-xl p-4" style={card}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{l.name}</span>
                    <Badge color="#8b5cf6">{l.type}</Badge>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Code {l.code}{l.address ? ` · ${l.address}` : ""}</p>
                  {!l.active && <Badge color="#94a3b8">inactive</Badge>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEdit(l)} style={{ color: "var(--text-secondary)" }}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(l.id)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && <LocModal init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function LocModal({ init, onClose, onSaved }: { init: Partial<Loc>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Loc>>(init);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Loc, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => { if (!f.name?.trim()) return; setBusy(true); await invSend("POST", "/locations", f); setBusy(false); onSaved(); };
  return (
    <Modal title={init.id ? "Edit location" : "Add location"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *"><input value={f.name || ""} onChange={(e) => set("name", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Type">
          <select value={f.type || "warehouse"} onChange={(e) => set("type", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="warehouse">Warehouse</option><option value="store">Store</option><option value="bin">Bin/Shelf</option><option value="transit">Transit</option>
          </select>
        </Field>
        <Field label="Code"><input value={f.code || ""} onChange={(e) => set("code", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Address"><input value={f.address || ""} onChange={(e) => set("address", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={f.active ?? true} onChange={(e) => set("active", e.target.checked)} /> Active
      </label>
      <div className="mt-5 flex justify-end"><Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save location"}</Btn></div>
    </Modal>
  );
}
