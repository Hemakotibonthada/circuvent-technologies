"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, Tags, Award } from "lucide-react";
import { invGet, invSend, card, inputStyle, inputCls, Btn, Spinner, Empty } from "./lib";

interface Item { id: string; name: string }

export default function TaxonomyTab() {
  const [cats, setCats] = useState<Item[]>([]);
  const [brands, setBrands] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await invGet<{ categories: Item[]; brands: Item[] }>("/taxonomy");
    if (r) { setCats(r.categories || []); setBrands(r.brands || []); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Column title="Categories" icon={<Tags className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />} items={cats} kind="category" onChange={load} />
      <Column title="Brands" icon={<Award className="h-4 w-4" style={{ color: "var(--accent-violet)" }} />} items={brands} kind="brand" onChange={load} />
    </div>
  );
}

function Column({ title, icon, items, kind, onChange }: { title: string; icon: React.ReactNode; items: Item[]; kind: "category" | "brand"; onChange: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await invSend("POST", "/taxonomy", { kind, name: name.trim() });
    setName(""); setBusy(false); onChange();
  };
  const del = async (id: string) => { await invSend("DELETE", `/taxonomy?kind=${kind}&id=${encodeURIComponent(id)}`); onChange(); };
  return (
    <div className="rounded-2xl p-5" style={card}>
      <div className="mb-3 flex items-center gap-2"><span>{icon}</span><h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{title} ({items.length})</h3><Btn variant="ghost" onClick={onChange}><RefreshCw className="h-4 w-4" /></Btn></div>
      <div className="mb-3 flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={`New ${kind}`} className={`${inputCls} flex-1`} style={inputStyle} />
        <Btn onClick={add} disabled={busy}><Plus className="h-4 w-4" /></Btn>
      </div>
      {items.length === 0 ? <Empty text={`No ${kind}s yet.`} /> : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-glass)" }}>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{it.name}</span>
              <button onClick={() => del(it.id)} style={{ color: "#ef4444" }}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
