"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, Upload, XCircle } from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface ImportJob {
  id: string;
  kind: "products" | "customers";
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committed: boolean;
  createdAt: string;
}
interface RowResult {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

export default function BulkIOPanel() {
  const [kind, setKind] = useState<"products" | "customers">("products");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<RowResult[] | null>(null);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/bulk", { headers: { "x-admin-token": tok() } });
    if (res.ok) {
      const d = await res.json();
      setImports(d.imports || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const runPreview = async () => {
    if (!csvText) return;
    setBusy(true);
    const res = await fetch("/api/admin/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind, fileName, csvText, commit: false }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.success) setPreview(d.results);
  };

  const commit = async () => {
    if (!csvText) return;
    setBusy(true);
    const res = await fetch("/api/admin/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ kind, fileName, csvText, commit: true }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.success) {
      alert(`Committed ${d.committedCount} rows.`);
      setPreview(null);
      setCsvText("");
      setFileName("");
      load();
    }
  };

  const exportCustomers = () => {
    window.open(`/api/admin/bulk?export=customers`, "_blank");
  };

  const validCount = preview?.filter((r) => r.errors.length === 0).length ?? 0;
  const invalidCount = (preview?.length ?? 0) - validCount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <FileUp className="w-5 h-5" /> Bulk Import / Export Center
        </h2>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>CSV import with a validation preview before committing, and quick exports.</p>
      </div>

      <div className="rounded-xl p-4 space-y-3" style={card}>
        <div className="flex flex-wrap items-center gap-3">
          <select value={kind} onChange={(e) => setKind(e.target.value as "products" | "customers")} className="rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}>
            <option value="products">Products (create/update catalog)</option>
            <option value="customers">Customers (bulk-tag existing, by email)</option>
          </select>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            <Upload className="w-4 h-4" /> {fileName || "Choose CSV file"}
          </button>
          <button onClick={runPreview} disabled={!csvText || busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Preview
          </button>
          <button onClick={exportCustomers} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
            <Download className="w-4 h-4" /> Export customers CSV
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {kind === "products" ? "Required columns: slug, name, price, stock, category" : "Required column: email (optional: tags, semicolon-separated — applied to existing customers only)"}
        </p>

        {preview && (
          <div className="mt-3">
            <div className="flex gap-4 mb-2 text-sm">
              <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> {validCount} valid</span>
              <span className="flex items-center gap-1 text-red-400"><XCircle className="w-4 h-4" /> {invalidCount} invalid</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg" style={{ border: "1px solid var(--border-primary)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                    <th className="px-3 py-2 text-left" style={{ color: "var(--text-tertiary)" }}>Row</th>
                    <th className="px-3 py-2 text-left" style={{ color: "var(--text-tertiary)" }}>Data</th>
                    <th className="px-3 py-2 text-left" style={{ color: "var(--text-tertiary)" }}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-secondary)" }}>{r.row}</td>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--text-primary)" }}>{Object.values(r.data).join(" · ")}</td>
                      <td className="px-3 py-1.5 text-red-400">{r.errors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={commit} disabled={busy || validCount === 0} className="mt-3 w-full py-2.5 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}>
              Commit {validCount} valid rows
            </button>
          </div>
        )}
      </div>

      {imports.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Import history</h3>
          <div className="space-y-1.5">
            {imports.map((j) => (
              <div key={j.id} className="text-xs flex justify-between rounded-lg px-3 py-1.5" style={{ background: "var(--bg-glass)" }}>
                <span style={{ color: "var(--text-primary)" }}>{j.fileName} ({j.kind}) — {j.validRows}/{j.totalRows} valid {j.committed ? "· committed" : "· preview only"}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{new Date(j.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
