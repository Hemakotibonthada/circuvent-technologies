"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Search, Pencil, History, Barcode, SlidersHorizontal, Download, CheckSquare, Square, Plus,
} from "lucide-react";
import { invGet, invSend, money, card, inputStyle, inputCls, inputSm, Btn, Spinner, Empty, Badge, Field, Modal, fmtDateTime, tok, type ProductRow } from "./lib";
import { WARRANTY_MONTHS } from "@/lib/warranty";

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
  const [showAdd, setShowAdd] = useState(false);
  const [bulk, setBulk] = useState(false);

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

  // Apply a set of fields to every selected product (price %, category, flags…).
  const applyBulk = async (build: (row: ProductRow) => Record<string, unknown> | null) => {
    const targets = rows.filter((r) => sel.has(r.productId));
    for (const r of targets) {
      const patch = build(r);
      if (!patch) continue;
      await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ id: r.productId, ...patch }) });
    }
    setSel(new Set());
    setBulk(false);
    load();
  };

  const bulkDelete = async () => {
    const targets = rows.filter((r) => sel.has(r.productId));
    if (!confirm(`Delete ${targets.length} product(s)? Only admin-added products can be removed; catalog items are skipped.`)) return;
    for (const r of targets) {
      await fetch(`/api/admin/products?id=${encodeURIComponent(r.productId)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
    }
    setSel(new Set());
    setBulk(false);
    load();
  };

  const exportSelected = () => {
    const targets = rows.filter((r) => sel.has(r.productId));
    const head = ["name", "sku", "barcode", "category", "price", "costPrice", "stock", "available"];
    const csv = [head.join(",")]
      .concat(targets.map((r) => [r.name, r.sku, r.barcode || "", r.category, r.price, r.costPrice, r.stock, r.available ? "true" : "false"].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `products-selected-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
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
          <Btn onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add product</Btn>
          <a href="/api/admin/inventory/export" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <Download className="h-4 w-4" /> Export CSV
          </a>
        </div>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl p-3" style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>{sel.size} selected</span>
          <Btn variant="ghost" onClick={() => setBulk(true)}><SlidersHorizontal className="h-4 w-4" /> Bulk edit</Btn>
          <Btn variant="ghost" onClick={() => bulkAvailability(true)}>List</Btn>
          <Btn variant="ghost" onClick={() => bulkAvailability(false)}>Hide</Btn>
          <Btn variant="ghost" onClick={printLabels}><Barcode className="h-4 w-4" /> Print labels</Btn>
          <Btn variant="ghost" onClick={exportSelected}><Download className="h-4 w-4" /> Export selected</Btn>
          <Btn variant="ghost" onClick={bulkDelete}><span style={{ color: "#ef4444" }}>Delete</span></Btn>
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
      {showAdd && <AddProductModal categories={cats} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {bulk && <BulkEditModal count={sel.size} cats={cats} onClose={() => setBulk(false)} onApply={applyBulk} />}
    </div>
  );
}

// -------------------------------------------------------- bulk edit ----
type BulkOp =
  | { kind: "priceSet"; value: number }
  | { kind: "pricePct"; value: number }
  | { kind: "compareClear" }
  | { kind: "stockSet"; value: number }
  | { kind: "stockDelta"; value: number }
  | { kind: "category"; value: string }
  | { kind: "featured"; value: boolean };

function BulkEditModal({ count, cats, onClose, onApply }: { count: number; cats: Cat[]; onClose: () => void; onApply: (build: (row: ProductRow) => Record<string, unknown> | null) => void }) {
  const [op, setOp] = useState<BulkOp["kind"]>("pricePct");
  const [num, setNum] = useState("");
  const [category, setCategory] = useState(cats[0]?.name || "");
  const [featured, setFeatured] = useState(true);

  const apply = () => {
    const n = Number(num);
    switch (op) {
      case "priceSet": return onApply(() => ({ price: Math.max(0, Math.round(n || 0)) }));
      case "pricePct": return onApply((r) => ({ price: Math.max(0, Math.round(r.price * (1 + (n || 0) / 100))) }));
      case "compareClear": return onApply(() => ({ compareAt: 0 }));
      case "stockSet": return onApply(() => ({ stock: Math.max(0, Math.round(n || 0)) }));
      case "stockDelta": return onApply((r) => ({ stock: Math.max(0, r.stock + Math.round(n || 0)) }));
      case "category": return onApply(() => ({ category }));
      case "featured": return onApply(() => ({ featured }));
    }
  };

  const needsNum = op === "priceSet" || op === "pricePct" || op === "stockSet" || op === "stockDelta";

  return (
    <Modal title={`Bulk edit · ${count} product(s)`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Operation">
          <select value={op} onChange={(e) => setOp(e.target.value as BulkOp["kind"])} className={inputCls} style={inputStyle}>
            <option value="pricePct">Adjust price by %</option>
            <option value="priceSet">Set price (₹)</option>
            <option value="compareClear">Clear compare-at (end sale)</option>
            <option value="stockSet">Set stock to</option>
            <option value="stockDelta">Adjust stock by ±</option>
            <option value="category">Set category</option>
            <option value="featured">Set featured flag</option>
          </select>
        </Field>
        {needsNum && (
          <Field label={op === "pricePct" ? "Percent (e.g. -10 for 10% off)" : op === "stockDelta" ? "Delta (e.g. 25 or -5)" : "Value"}>
            <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ""))} inputMode="numeric" placeholder="0" className={inputCls} style={inputStyle} />
          </Field>
        )}
        {op === "category" && (
          <Field label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} style={inputStyle}>
              {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {op === "featured" && (
          <Field label="Featured">
            <select value={featured ? "yes" : "no"} onChange={(e) => setFeatured(e.target.value === "yes")} className={inputCls} style={inputStyle}>
              <option value="yes">Featured</option>
              <option value="no">Not featured</option>
            </select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn onClick={apply}>Apply to {count}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- add ----
function AddProductModal({ categories, onClose, onSaved }: { categories: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: "", tagline: "", category: "", price: "", compareAt: "", stock: "0",
    description: "", specs: "", badge: "", featured: false,
    warrantyMonths: "", releaseAt: "",
  });
  const [image, setImage] = useState<string>("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const downscale = (file: File, max = 1000, quality = 0.72): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("no ctx"));
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const pickMain = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { try { setImage(await downscale(file)); } catch { /* ignore */ } }
    e.target.value = "";
  };
  const pickGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((x) => x.type.startsWith("image/"));
    const room = Math.max(0, 5 - gallery.length);
    const next: string[] = [];
    for (const file of files.slice(0, room)) { try { next.push(await downscale(file)); } catch { /* ignore */ } }
    setGallery((g) => [...g, ...next].slice(0, 5));
    e.target.value = "";
  };

  const save = async () => {
    setErr("");
    if (f.name.trim().length < 2) { setErr("Please enter a product name."); return; }
    if (!Number(f.price)) { setErr("Please enter a selling price."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({
          name: f.name.trim(),
          tagline: f.tagline.trim(),
          category: f.category.trim() || "General",
          price: Number(f.price),
          compareAt: Number(f.compareAt) || undefined,
          stock: Number(f.stock) || 0,
          description: f.description.trim(),
          specs: f.specs.split("\n").map((s) => s.trim()).filter(Boolean),
          badge: f.badge.trim() || undefined,
          featured: f.featured,
          // Blank means "use the published default", which is different from
          // zero — zero would be a product sold with no cover at all.
          warrantyMonths: Number(f.warrantyMonths) > 0 ? Math.round(Number(f.warrantyMonths)) : undefined,
          releaseAt: f.releaseAt ? new Date(f.releaseAt).toISOString() : undefined,
          image: image || undefined,
          images: gallery.length ? gallery : undefined,
          available: true,
        }),
      });
      const d = await r.json();
      if (d.success) onSaved();
      else setErr(d.message || "Could not add the product.");
    } catch { setErr("Network error. Please try again."); }
    setBusy(false);
  };

  const discount = Number(f.compareAt) > Number(f.price) && Number(f.price) > 0
    ? Math.round((1 - Number(f.price) / Number(f.compareAt)) * 100) : 0;

  return (
    <Modal title="Add product" onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product name *"><input className={inputCls + " w-full"} style={inputStyle} value={f.name} onChange={set("name")} placeholder="Circuvent Smart Bulb" /></Field>
        <Field label="Category">
          <input className={inputCls + " w-full"} style={inputStyle} value={f.category} onChange={set("category")} list="cat-list" placeholder="Home Automation" />
          <datalist id="cat-list">{categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <Field label="Tagline"><input className={inputCls + " w-full"} style={inputStyle} value={f.tagline} onChange={set("tagline")} placeholder="One-line pitch shown on cards" /></Field>
        <Field label="Badge (offer/label)"><input className={inputCls + " w-full"} style={inputStyle} value={f.badge} onChange={set("badge")} placeholder="New · Best seller · Limited" /></Field>
        <Field label="Selling price (₹) *"><input type="number" min={0} className={inputCls + " w-full"} style={inputStyle} value={f.price} onChange={set("price")} /></Field>
        <Field label="Compare-at / MRP (₹)"><input type="number" min={0} className={inputCls + " w-full"} style={inputStyle} value={f.compareAt} onChange={set("compareAt")} placeholder="Shows a strikethrough + % off" /></Field>
        <Field label="Warranty (months)">
          <input
            type="number"
            min={0}
            max={120}
            className={inputCls + " w-full"}
            style={inputStyle}
            value={f.warrantyMonths}
            onChange={set("warrantyMonths")}
            placeholder={`Leave blank for the standard ${WARRANTY_MONTHS} months`}
          />
        </Field>
        <Field label="Available from">
          <input
            type="date"
            className={inputCls + " w-full"}
            style={inputStyle}
            value={f.releaseAt}
            onChange={set("releaseAt")}
            placeholder="Leave blank to sell immediately"
          />
        </Field>
        <Field label="Opening stock"><input type="number" min={0} className={inputCls + " w-full"} style={inputStyle} value={f.stock} onChange={set("stock")} /></Field>
        <Field label="Featured">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={f.featured} onChange={(e) => setF((s) => ({ ...s, featured: e.target.checked }))} /> Show in featured
          </label>
        </Field>
      </div>
      {discount > 0 && <p className="mt-2 text-xs" style={{ color: "#10b981" }}>Customers will see {discount}% off.</p>}

      <div className="mt-3">
        <Field label="Description">
          <textarea className={inputCls + " min-h-[70px] w-full"} style={inputStyle} value={f.description} onChange={set("description")} placeholder="What is it, who is it for, key benefits…" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Specifications (one per line)">
          <textarea className={inputCls + " min-h-[70px] w-full"} style={inputStyle} value={f.specs} onChange={set("specs")} placeholder={"Wi-Fi 2.4GHz\n16A rated\nWorks with Alexa"} />
        </Field>
      </div>

      {/* Images */}
      <div className="mt-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Images</p>
        <div className="flex flex-wrap items-center gap-2">
          {image ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-lg border" style={{ borderColor: "var(--accent-cyan)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="main" className="h-full w-full object-cover" />
              <button onClick={() => setImage("")} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white">×</button>
            </div>
          ) : (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[10px]" style={{ borderColor: "var(--border-primary)", color: "var(--text-muted)" }}>
              Main<br />image
              <input type="file" accept="image/*" className="hidden" onChange={pickMain} />
            </label>
          )}
          {gallery.map((src, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-primary)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`g${i}`} className="h-full w-full object-cover" />
              <button onClick={() => setGallery((g) => g.filter((_, j) => j !== i))} className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white">×</button>
            </div>
          ))}
          {gallery.length < 5 && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[10px]" style={{ borderColor: "var(--border-primary)", color: "var(--text-muted)" }}>
              + Gallery
              <input type="file" accept="image/*" multiple className="hidden" onChange={pickGallery} />
            </label>
          )}
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-rose-500">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy}>{busy ? "Adding…" : "Add product"}</Btn>
      </div>
    </Modal>
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
  // Product fields are staff-writable and land in an HTML sink. The popup is
  // opened on about:blank, which inherits this origin, so an unescaped name
  // would run script with access to the opener's admin session.
  const esc = (s: unknown) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
    );
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
      <div style="font-weight:bold;font-size:12px">${esc(r.name)}</div>
      <div style="font-size:10px;color:#555">${esc(r.category)} · ${"₹" + Math.round(r.price)}</div>
      <div style="margin:6px 0;white-space:nowrap;overflow:hidden">${bars((r.barcode || r.sku) + "XXXX")}</div>
      <div style="font-family:monospace;font-size:11px">${esc(r.barcode || r.sku)}</div>
    </div>`).join("");
  const w = window.open("", "_blank", "width=800,height=600,noopener");
  if (!w) return;
  w.document.write(`<title>Labels</title><body onload="window.print()">${labels}</body>`);
  w.document.close();
}
