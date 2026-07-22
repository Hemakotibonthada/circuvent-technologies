"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save, Plus, Trash2, PackageCheck, PackageX } from "lucide-react";
import { formatINR } from "@/lib/shop-data";

interface P {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock: number;
  available: boolean;
  category: string;
  custom?: boolean;
}

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

export default function InventoryPanel() {
  const [products, setProducts] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/products", { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setProducts(d.products || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {products.length} products · {products.filter((p) => p.available && p.stock > 0).length} in stock
        </p>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <AddProduct onAdded={load} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductRow({ product, onChanged }: { product: P; onChanged: () => void }) {
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.stock));
  const [available, setAvailable] = useState(product.available);
  const [busy, setBusy] = useState(false);
  const dirty = Number(price) !== product.price || Number(stock) !== product.stock || available !== product.available;

  const save = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ id: product.id, price: Number(price), stock: Number(stock), available }),
      });
      onChanged();
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const del = async () => {
    if (!confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/products?id=${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        headers: { "x-admin-token": tok() },
      });
      onChanged();
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  const inp = "w-24 rounded-lg border px-2 py-1.5 text-sm outline-none";
  const inpStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl p-3"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
    >
      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {product.name}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {product.category}
          {product.custom ? " · custom" : ""}
        </p>
      </div>

      <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        ₹
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inp} style={inpStyle} />
      </label>
      <label className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Stock
        <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="w-20 rounded-lg border px-2 py-1.5 text-sm outline-none" style={inpStyle} />
      </label>

      <button
        onClick={() => setAvailable((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
        style={
          available
            ? { background: "rgba(16,185,129,0.12)", color: "#10b981" }
            : { background: "rgba(148,163,184,0.15)", color: "var(--text-muted)" }
        }
      >
        {available ? <PackageCheck className="h-4 w-4" /> : <PackageX className="h-4 w-4" />}
        {available ? "Listed" : "Hidden"}
      </button>

      <button
        onClick={save}
        disabled={busy || !dirty}
        className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
      </button>
      {product.custom && (
        <button onClick={del} disabled={busy} className="rounded-lg border p-1.5" style={{ borderColor: "var(--border-primary)", color: "#ef4444" }}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AddProduct({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const add = async () => {
    if (!name.trim()) {
      setMsg("Name is required.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ name, category, price: Number(price) || 0, stock: Number(stock) || 0 }),
      });
      const d = await res.json();
      if (d.success) {
        setName("");
        setCategory("");
        setPrice("");
        setStock("");
        setOpen(false);
        onAdded();
      } else {
        setMsg(d.message || "Could not add.");
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const inp = "rounded-lg border px-3 py-2 text-sm outline-none";
  const inpStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-sm font-medium"
        style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan)" }}
      >
        <Plus className="h-4 w-4" /> Add a product
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className={inp} style={inpStyle} />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className={inp} style={inpStyle} />
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price (₹)" className={inp} style={inpStyle} />
        <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Stock" className={inp} style={inpStyle} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={add}
          disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add product
        </button>
        <button onClick={() => setOpen(false)} className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Cancel
        </button>
        {msg && <span className="text-xs text-rose-500">{msg}</span>}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        Added products appear in the shop with a default icon. For rich media/specs, add them to the catalog in code.
      </p>
    </div>
  );
}
