"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Search, Pencil, History, Barcode, SlidersHorizontal, Download, CheckSquare, Square, Plus,
} from "lucide-react";
import { invGet, invSend, money, card, inputStyle, inputCls, inputSm, Btn, Spinner, Empty, Badge, Field, Modal, fmtDateTime, tok, type ProductRow } from "./lib";

interface Supplier { id: string; name: string }
interface Cat { id: string; name: string }
interface Brand { id: string; name: string }
interface Loc { id: string; name: string }
interface Movement { id: string; at: string; type: string; qty: number; reason: string; balanceAfter: number }

export default function ProductsTab() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out" | "hidden">("all");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState<"name" | "stock" | "valueRetail" | "valueCost">("name");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<ProductRow | null>(null);
  const [hist, setHist] = useState<ProductRow | null>(null);
  const [adjust, setAdjust] = useState<ProductRow | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, tax, sup, loc] = await Promise.all([
      invGet<{ rows: ProductRow[] }>("/meta"),
      invGet<{ categories: Cat[]; brands: Brand[] }>("/taxonomy"),
      invGet<{ suppliers: Supplier[] }>("/suppliers"),
      invGet<{ locations: Loc[] }>("/locations"),
    ]);
    if (r?.rows) setRows(r.rows);
    if (tax) { setCats(tax.categories || []); setBrands(tax.brands || []); }
    if (sup?.suppliers) setSuppliers(sup.suppliers);
    if (loc?.locations) setLocs(loc.locations);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(rows.map((r) => r.category)))], [rows]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      const qOk = !ql || r.name.toLowerCase().includes(ql) || (r.sku || "").toLowerCase().includes(ql) || (r.barcode || "").toLowerCase().includes(ql) || r.category.toLowerCase().includes(ql);
      const fOk = filter === "all" || (filter === "low" && r.low) || (filter === "out" && r.stock === 0) || (filter === "hidden" && !r.available);
      const cOk = cat === "All" || r.category === cat;
      return qOk && fOk && cOk;
    });
    out = [...out];
    if (sort === "stock") out.sort((a, b) => a.stock - b.stock);
    else if (sort === "valueRetail") out.sort((a, b) => b.stockValueRetail - a.stockValueRetail);
    else if (sort === "valueCost") out.sort((a, b) => b.stockValueCost - a.stockValueCost);
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [rows, q, filter, cat, sort]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((r) => sel.has(r.productId));
  const toggleAll = () => setSel(allShownSelected ? new Set() : new Set(shown.map((r) => r.productId)));

  const bulkAvailability = async (available: boolean) => {
    for (const id of sel) {
      await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ id, available }) });
    }
    setSel(new Set());
    load();
  };

  const printLabels = () => {
    const items = shown.filter((r) => sel.has(r.productId));
    const target = items.length ? items : shown.slice(0, 1);
    barcodeLabels(target);
  };

  return (
    <div>
      {/* toolbar */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, barcode, category…" className={`${inputCls} w-full pl-9`} style={inputStyle} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls} style={inputStyle}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={inputCls} style={inputStyle}>
          <option value="name">Sort: Name</option>
          <option value="stock">Sort: Stock (low→high)</option>
          <option value="valueRetail">Sort: Value (retail)</option>
          <option value="valueCost">Sort: Value (cost)</option>
        </select>
        <Btn variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Btn>
      </div>

      {/* filter chips + counts */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "low", "out", "hidden"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className="rounded-full border px-3 py-1 text-xs font-medium"
            style={filter === f ? { borderColor: "var(--accent-cyan)", background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" } : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}>
            {f === "all" ? "All" : f === "low" ? "Low stock" : f === "out" ? "Out of stock" : "Hidden"}
          </button>
        ))}
        <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>{shown.length} of {rows.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <a href="/api/admin/inventory/export" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>{sel.size} selected</span>
          <Btn variant="ghost" onClick={() => bulkAvailability(true)}>List</Btn>
          <Btn variant="ghost" onClick={() => bulkAvailability(false)}>Hide</Btn>
          <Btn variant="ghost" onClick={printLabels}><Barcode className="h-4 w-4" /> Print labels</Btn>
          <Btn variant="ghost" onClick={() => setSel(new Set())}>Clear</Btn>
        </div>
      )}

      {loading ? <Spinner /> : shown.length === 0 ? <Empty text="No products match." /> : (
        <div className="overflow-x-auto rounded-xl" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-tertiary)" }} className="text-left text-xs uppercase tracking-wider">
                <th className="p-3"><button onClick={toggleAll}>{allShownSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}</button></th>
                <th className="p-3">Product</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Price</th>
                <th className="p-3">Stock</th>
                <th className="p-3">Value</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.productId} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                  <td className="p-3"><button onClick={() => toggle(r.productId)}>{sel.has(r.productId) ? <CheckSquare className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> : <Square className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}</button></td>
                  <td className="p-3">
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{r.category}{r.batchTracked ? " · batch" : ""}{!r.available ? " · hidden" : ""}</div>
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>{r.sku}</td>
                  <td className="p-3" style={{ color: "var(--text-secondary)" }}>{money(r.costPrice)}</td>
                  <td className="p-3" style={{ color: "var(--text-secondary)" }}>{money(r.price)}</td>
                  <td className="p-3">
                    <span style={{ color: r.stock === 0 ? "#ef4444" : r.low ? "#f59e0b" : "var(--text-primary)" }}>{r.stock}</span>
                    {r.low && r.stock > 0 && <Badge color="#f59e0b"> low</Badge>}
                    {r.stock === 0 && <Badge color="#ef4444"> out</Badge>}
                  </td>
                  <td className="p-3" style={{ color: "var(--text-secondary)" }}>{money(r.stockValueRetail)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Adjust stock" onClick={() => setAdjust(r)} className="rounded p-1.5" style={{ color: "var(--accent-cyan)" }}><SlidersHorizontal className="h-4 w-4" /></button>
                      <button title="History" onClick={() => setHist(r)} className="rounded p-1.5" style={{ color: "var(--text-muted)" }}><History className="h-4 w-4" /></button>
                      <button title="Edit details" onClick={() => setEdit(r)} className="rounded p-1.5" style={{ color: "var(--text-secondary)" }}><Pencil className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && <EditDrawer row={edit} suppliers={suppliers} cats={cats} brands={brands} locs={locs} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {adjust && <AdjustModal row={adjust} onClose={() => setAdjust(null)} onDone={() => { setAdjust(null); load(); }} />}
      {hist && <HistoryModal row={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- edit ----
function EditDrawer({ row, suppliers, cats, brands, locs, onClose, onSaved }: {
  row: ProductRow; suppliers: Supplier[]; cats: Cat[]; brands: Brand[]; locs: Loc[]; onClose: () => void; onSaved: () => void;
}) {
  const [m, setM] = useState<ProductRow>({ ...row });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ProductRow, v: any) => setM((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    await invSend("PATCH", "/meta", {
      productId: m.productId, sku: m.sku, barcode: m.barcode, hsn: m.hsn, gstPct: Number(m.gstPct),
      costPrice: Number(m.costPrice), mrp: Number(m.mrp), brandId: m.brandId || undefined, categoryId: m.categoryId || undefined,
      supplierId: m.supplierId || undefined, locationId: m.locationId || undefined,
      reorderPoint: Number(m.reorderPoint), reorderQty: Number(m.reorderQty), leadTimeDays: Number(m.leadTimeDays),
      weightG: Number(m.weightG), lengthCm: Number(m.lengthCm), widthCm: Number(m.widthCm), heightCm: Number(m.heightCm),
      tags: Array.isArray(m.tags) ? m.tags : String(m.tags || "").split(",").map((s) => s.trim()).filter(Boolean),
      notes: m.notes, batchTracked: !!m.batchTracked, serialTracked: !!m.serialTracked, active: !!m.active,
    });
    // sync price to the shop catalog too
    await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ id: m.productId, price: Number(m.price) }) });
    setBusy(false);
    onSaved();
  };

  const num = (k: keyof ProductRow, label: string) => (
    <Field label={label}><input type="number" value={String((m as any)[k] ?? 0)} onChange={(e) => set(k, e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
  );

  return (
    <Modal title={row.name} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="SKU"><input value={m.sku} onChange={(e) => set("sku", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="Barcode / EAN"><input value={m.barcode} onChange={(e) => set("barcode", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        <Field label="HSN"><input value={m.hsn} onChange={(e) => set("hsn", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
        {num("costPrice", "Cost price ₹")}
        {num("price", "Sell price ₹")}
        {num("mrp", "MRP ₹")}
        {num("gstPct", "GST %")}
        {num("reorderPoint", "Reorder point")}
        {num("reorderQty", "Reorder qty")}
        {num("leadTimeDays", "Lead time (days)")}
        {num("weightG", "Weight (g)")}
        <Field label="Dimensions L×W×H cm">
          <div className="flex gap-1">
            <input type="number" value={String(m.lengthCm)} onChange={(e) => set("lengthCm", e.target.value)} className={`${inputSm} w-full`} style={inputStyle} />
            <input type="number" value={String(m.widthCm)} onChange={(e) => set("widthCm", e.target.value)} className={`${inputSm} w-full`} style={inputStyle} />
            <input type="number" value={String(m.heightCm)} onChange={(e) => set("heightCm", e.target.value)} className={`${inputSm} w-full`} style={inputStyle} />
          </div>
        </Field>
        <Field label="Category">
          <select value={m.categoryId || ""} onChange={(e) => set("categoryId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="">— none —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Brand">
          <select value={m.brandId || ""} onChange={(e) => set("brandId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="">— none —</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier">
          <select value={m.supplierId || ""} onChange={(e) => set("supplierId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="">— none —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Location">
          <select value={m.locationId || ""} onChange={(e) => set("locationId", e.target.value)} className={`${inputCls} w-full`} style={inputStyle}>
            <option value="">— none —</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Tags (comma-sep)"><input value={Array.isArray(m.tags) ? m.tags.join(", ") : String(m.tags || "")} onChange={(e) => set("tags", e.target.value)} className={`${inputCls} w-full`} style={inputStyle} /></Field>
      </div>
      <Field label="Notes"><textarea value={m.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={`${inputCls} mt-3 w-full`} style={inputStyle} /></Field>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={m.batchTracked} onChange={(e) => set("batchTracked", e.target.checked)} /> Batch tracked</label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={m.serialTracked} onChange={(e) => set("serialTracked", e.target.checked)} /> Serial tracked</label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}><input type="checkbox" checked={m.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variant="ghost" onClick={() => barcodeLabels([m])}><Barcode className="h-4 w-4" /> Label</Btn>
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save details"}</Btn>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- adjust ----
function AdjustModal({ row, onClose, onDone }: { row: ProductRow; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"delta" | "set">("delta");
  const [qty, setQty] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await invSend("POST", "/movements", { productId: row.productId, mode, qty: Number(qty), reason: reason || "Manual adjustment" });
    setBusy(false); onDone();
  };
  return (
    <Modal title={`Adjust stock — ${row.name}`} onClose={onClose}>
      <p className="mb-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Current stock: <b style={{ color: "var(--text-primary)" }}>{row.stock}</b></p>
      <div className="mb-3 flex gap-2">
        <button onClick={() => setMode("delta")} className="flex-1 rounded-lg border px-3 py-2 text-sm" style={mode === "delta" ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" } : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}>Add / remove (±)</button>
        <button onClick={() => setMode("set")} className="flex-1 rounded-lg border px-3 py-2 text-sm" style={mode === "set" ? { borderColor: "var(--accent-cyan)", color: "var(--accent-cyan)" } : { borderColor: "var(--border-primary)", color: "var(--text-tertiary)" }}>Set to</button>
      </div>
      <Field label={mode === "delta" ? "Change (e.g. 10 or -3)" : "New quantity"}>
        <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={`${inputCls} w-full`} style={inputStyle} />
      </Field>
      <div className="mt-3"><Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Restock / damage / correction…" className={`${inputCls} w-full`} style={inputStyle} /></Field></div>
      <div className="mt-5 flex justify-end"><Btn onClick={submit} disabled={busy}>{busy ? "Saving…" : "Apply"}</Btn></div>
    </Modal>
  );
}

// -------------------------------------------------------------- history ---
function HistoryModal({ row, onClose }: { row: ProductRow; onClose: () => void }) {
  const [mv, setMv] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const r = await invGet<{ movements: Movement[] }>(`/movements?productId=${encodeURIComponent(row.productId)}&limit=100`);
      setMv(r?.movements || []); setLoading(false);
    })();
  }, [row.productId]);
  return (
    <Modal title={`Movement history — ${row.name}`} onClose={onClose} wide>
      {loading ? <Spinner /> : mv.length === 0 ? <Empty text="No movements yet." /> : (
        <div className="max-h-96 overflow-y-auto">
          {mv.map((m) => (
            <div key={m.id} className="flex items-center justify-between border-b py-2 text-sm" style={{ borderColor: "var(--border-primary)" }}>
              <div>
                <span style={{ color: m.qty >= 0 ? "#10b981" : "#ef4444" }}>{m.qty >= 0 ? "+" : ""}{m.qty}</span>
                <span className="ml-2" style={{ color: "var(--text-secondary)" }}>{m.reason}</span>
                <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>({m.type})</span>
              </div>
              <div className="text-right">
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{fmtDateTime(m.at)}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>bal {m.balanceAfter}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---- printable barcode labels (Code128-ish visual + text) ----
function barcodeLabels(rows: ProductRow[]) {
  const bars = (s: string) => {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const w = (s.charCodeAt(i) % 4) + 1;
      out += `<span style="display:inline-block;width:${w}px;height:38px;background:${i % 2 ? "#000" : "#fff"};"></span>`;
    }
    return out;
  };
  const labels = rows.map((r) => `
    <div style="width:5cm;border:1px solid #ddd;padding:8px;margin:6px;display:inline-block;font-family:Arial">
      <div style="font-weight:bold;font-size:12px">${r.name}</div>
      <div style="font-size:10px;color:#555">${r.category} · ${"₹" + Math.round(r.price)}</div>
      <div style="margin:6px 0;white-space:nowrap;overflow:hidden">${bars((r.barcode || r.sku) + "XXXX")}</div>
      <div style="font-family:monospace;font-size:11px">${r.barcode || r.sku}</div>
    </div>`).join("");
  const w = window.open("", "_blank", "width=800,height=600");
  if (!w) return;
  w.document.write(`<title>Labels</title><body onload="window.print()">${labels}</body>`);
  w.document.close();
}
