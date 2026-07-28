// Bulk Import/Export Center — CSV import for products/customers with a
// validation preview step before committing, and export job tracking. Reuses
// the existing product store (StoredProduct upsert happens through the
// existing /api/admin/products route — this module focuses on parsing,
// validating and staging rows; it exposes the parsed+validated rows for the
// route to commit via the existing product upsert path, avoiding a second
// product-write implementation).
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export type ImportKind = "products" | "customers";

export interface ImportRowResult {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

export interface ImportJob {
  id: string;
  kind: ImportKind;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committed: boolean;
  createdAt: string;
}

export interface ExportJob {
  id: string;
  kind: ImportKind | "orders";
  rowCount: number;
  createdAt: string;
}

interface BulkDB {
  imports: ImportJob[];
  exports: ExportJob[];
}

const store = createFileStore<BulkDB>("admin-bulk.json", () => ({ imports: [], exports: [] }));

// "customers" imports don't create login accounts (that requires a real
// signup/password flow) — they bulk-apply CRM tags to EXISTING customers
// matched by email, via admin-crm.ts's setTags(). Hence only email is
// required; an optional "tags" column (semicolon-separated) is applied.
const REQUIRED_COLUMNS: Record<ImportKind, string[]> = {
  products: ["slug", "name", "price", "stock", "category"],
  customers: ["email"],
};

/** Minimal, dependency-free CSV parser (handles quoted fields and commas within quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

export function validateRows(kind: ImportKind, rows: Record<string, string>[]): ImportRowResult[] {
  const required = REQUIRED_COLUMNS[kind];
  return rows.map((data, i) => {
    const errors: string[] = [];
    for (const col of required) {
      if (!data[col] || !data[col].trim()) errors.push(`Missing "${col}"`);
    }
    if (kind === "products" && data.price && Number.isNaN(Number(data.price))) errors.push("price is not a number");
    if (kind === "products" && data.stock && Number.isNaN(Number(data.stock))) errors.push("stock is not a number");
    if (kind === "customers" && data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.push("email looks invalid");
    return { row: i + 2, data, errors }; // +2: header row + 1-based
  });
}

export function recordImport(kind: ImportKind, fileName: string, results: ImportRowResult[], committed: boolean): ImportJob {
  return store.mutate((db) => {
    const job: ImportJob = {
      id: shortId("imp"),
      kind,
      fileName,
      totalRows: results.length,
      validRows: results.filter((r) => r.errors.length === 0).length,
      invalidRows: results.filter((r) => r.errors.length > 0).length,
      committed,
      createdAt: new Date().toISOString(),
    };
    db.imports.unshift(job);
    return job;
  });
}

export function listImports(): ImportJob[] {
  return store.read().imports;
}

export function recordExport(kind: ExportJob["kind"], rowCount: number): ExportJob {
  return store.mutate((db) => {
    const job: ExportJob = { id: shortId("exp"), kind, rowCount, createdAt: new Date().toISOString() };
    db.exports.unshift(job);
    return job;
  });
}

export function listExports(): ExportJob[] {
  return store.read().exports;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}
