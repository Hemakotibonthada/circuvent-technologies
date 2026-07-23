// Circuvent - Inventory / Warehouse-Management module (server-only).
// File-backed (.data/inventory-db.json), separate from the shop store so it can
// evolve independently. Product stock changes flow through store.ts so the shop
// always reflects inventory operations. SERVER ONLY (node:fs).

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { listProducts, getStoredProduct, upsertProduct, type StoredProduct } from "./store";

// ------------------------------------------------------------------ types --
export type MovementType =
  | "receive" | "adjust" | "count" | "transfer_in" | "transfer_out"
  | "sale" | "return" | "damage" | "manual_in" | "manual_out";

export interface ProductMeta {
  productId: string;
  sku: string;
  barcode: string;
  hsn: string;
  gstPct: number;
  costPrice: number;
  mrp: number;
  brandId?: string;
  categoryId?: string;
  supplierId?: string;
  locationId?: string;
  reorderPoint: number;
  reorderQty: number;
  leadTimeDays: number;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  tags: string[];
  notes: string;
  batchTracked: boolean;
  serialTracked: boolean;
  active: boolean;
  updatedAt: string;
}

export interface Supplier {
  id: string; name: string; contact: string; email: string; phone: string;
  gstin: string; address: string; city: string; state: string; pincode: string;
  leadTimeDays: number; paymentTerms: string; rating: number; active: boolean;
  notes: string; createdAt: string;
}

export interface Location {
  id: string; name: string; type: "warehouse" | "store" | "bin" | "transit";
  code: string; address: string; active: boolean; notes: string; createdAt: string;
}

export interface Category { id: string; name: string; parentId?: string; createdAt: string; }
export interface Brand { id: string; name: string; createdAt: string; }

export interface StockMovement {
  id: string; at: string; productId: string; type: MovementType; qty: number;
  reason: string; ref: string; locationId?: string; by: string;
  balanceAfter: number; unitCost?: number;
}

export interface POItem { productId: string; qty: number; costPrice: number; receivedQty: number; }
export interface PurchaseOrder {
  id: string; poNo: string; supplierId: string;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  items: POItem[]; createdAt: string; expectedAt?: string; receivedAt?: string;
  notes: string; by: string; total: number;
}

export interface CountLine { productId: string; system: number; counted: number | null; }
export interface StockCount {
  id: string; ref: string; locationId?: string; status: "open" | "closed";
  lines: CountLine[]; createdAt: string; closedAt?: string; by: string; notes: string;
}

export interface TransferItem { productId: string; qty: number; }
export interface Transfer {
  id: string; ref: string; fromLocationId: string; toLocationId: string;
  items: TransferItem[]; status: "draft" | "in_transit" | "received" | "cancelled";
  createdAt: string; receivedAt?: string; by: string; notes: string;
}

export interface Batch {
  id: string; productId: string; batchNo: string; qty: number;
  mfgDate?: string; expiryDate?: string; createdAt: string;
}

export interface InvSettings {
  lowStockThreshold: number; deadStockDays: number; expiryWarnDays: number;
  currency: string; defaultLocationId?: string; autoReorderSuggest: boolean;
  valuationMethod: "cost" | "retail";
}

interface InvDB {
  meta: Record<string, ProductMeta>;
  suppliers: Supplier[];
  locations: Location[];
  categories: Category[];
  brands: Brand[];
  movements: StockMovement[];
  purchaseOrders: PurchaseOrder[];
  counts: StockCount[];
  transfers: Transfer[];
  batches: Batch[];
  settings: InvSettings;
  seq: Record<string, number>;
}

// ------------------------------------------------------------ persistence --
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "inventory-db.json");
let mem: InvDB | null = null;
let canWrite = true;

function defaults(): InvDB {
  return {
    meta: {}, suppliers: [], locations: [], categories: [], brands: [],
    movements: [], purchaseOrders: [], counts: [], transfers: [], batches: [],
    settings: {
      lowStockThreshold: 5, deadStockDays: 90, expiryWarnDays: 30,
      currency: "INR", autoReorderSuggest: true, valuationMethod: "cost",
    },
    seq: { po: 0, count: 0, transfer: 0 },
  };
}

function load(): InvDB {
  if (mem) return mem;
  try {
    if (fs.existsSync(DB_FILE)) {
      const p = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Partial<InvDB>;
      const d = defaults();
      mem = {
        meta: p.meta ?? d.meta,
        suppliers: p.suppliers ?? d.suppliers,
        locations: p.locations ?? d.locations,
        categories: p.categories ?? d.categories,
        brands: p.brands ?? d.brands,
        movements: p.movements ?? d.movements,
        purchaseOrders: p.purchaseOrders ?? d.purchaseOrders,
        counts: p.counts ?? d.counts,
        transfers: p.transfers ?? d.transfers,
        batches: p.batches ?? d.batches,
        settings: { ...d.settings, ...(p.settings ?? {}) },
        seq: { ...d.seq, ...(p.seq ?? {}) },
      };
      return mem;
    }
  } catch (e) {
    console.error("[inventory] load error:", e);
  }
  mem = defaults();
  save();
  return mem;
}

function save() {
  if (!mem || !canWrite) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(mem, null, 2), "utf8");
  } catch {
    canWrite = false;
  }
}

const uid = (p = "") => p + crypto.randomBytes(6).toString("hex");
const now = () => new Date().toISOString();
function nextSeq(name: string, prefix: string): string {
  const db = load();
  db.seq[name] = (db.seq[name] || 0) + 1;
  save();
  return `${prefix}-${String(db.seq[name]).padStart(5, "0")}`;
}

// --------------------------------------------------------------- settings --
export function getSettings(): InvSettings { return load().settings; }
export function updateSettings(patch: Partial<InvSettings>): InvSettings {
  const db = load();
  db.settings = { ...db.settings, ...patch };
  save();
  return db.settings;
}

// ---------------------------------------------------------- product meta ---
function skuFromProduct(p: StoredProduct): string {
  const base = (p.slug || p.id).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12);
  return "CV-" + base;
}

export function getMeta(productId: string): ProductMeta {
  const db = load();
  if (!db.meta[productId]) {
    const p = getStoredProduct(productId);
    db.meta[productId] = {
      productId,
      sku: p ? skuFromProduct(p) : "CV-" + productId.toUpperCase().slice(0, 10),
      barcode: "",
      hsn: "85287100",
      gstPct: 18,
      costPrice: p ? Math.round((p.price || 0) * 0.6) : 0,
      mrp: p ? p.price : 0,
      brandId: undefined,
      categoryId: undefined,
      supplierId: undefined,
      locationId: db.settings.defaultLocationId,
      reorderPoint: db.settings.lowStockThreshold,
      reorderQty: 10,
      leadTimeDays: 7,
      weightG: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
      tags: [], notes: "", batchTracked: false, serialTracked: false,
      active: true, updatedAt: now(),
    };
    save();
  }
  return db.meta[productId];
}

export function updateMeta(productId: string, patch: Partial<ProductMeta>): ProductMeta {
  const db = load();
  const m = getMeta(productId);
  db.meta[productId] = { ...m, ...patch, productId, updatedAt: now() };
  save();
  return db.meta[productId];
}

/** Product joined with its inventory metadata + live stock. */
export interface ProductRow extends ProductMeta {
  name: string; slug: string; price: number; stock: number;
  available: boolean; category: string; custom?: boolean;
  stockValueCost: number; stockValueRetail: number; low: boolean;
}

export function listProductRows(): ProductRow[] {
  const products = listProducts();
  const th = load().settings.lowStockThreshold;
  return products.map((p) => {
    const m = getMeta(p.id);
    return {
      ...m,
      name: p.name, slug: p.slug, price: p.price, stock: p.stock,
      available: p.available, category: p.category, custom: p.custom,
      stockValueCost: m.costPrice * p.stock,
      stockValueRetail: p.price * p.stock,
      low: p.available && p.stock <= (m.reorderPoint || th),
    };
  });
}

// --------------------------------------------------------------- movements -
export function recordMovement(
  productId: string, type: MovementType, qty: number,
  opts: { reason?: string; ref?: string; locationId?: string; by?: string; unitCost?: number } = {}
): StockMovement | null {
  const p = getStoredProduct(productId);
  if (!p) return null;
  const newStock = Math.max(0, p.stock + qty);
  upsertProduct({ id: productId, stock: newStock });
  const db = load();
  const mv: StockMovement = {
    id: uid("mv_"), at: now(), productId, type, qty,
    reason: opts.reason || type, ref: opts.ref || "",
    locationId: opts.locationId, by: opts.by || "system",
    balanceAfter: newStock, unitCost: opts.unitCost,
  };
  db.movements.unshift(mv);
  if (db.movements.length > 5000) db.movements = db.movements.slice(0, 5000);
  save();
  return mv;
}

/** Set an absolute stock quantity (records the delta as an adjustment). */
export function setStock(productId: string, target: number, reason: string, by = "admin"): StockMovement | null {
  const p = getStoredProduct(productId);
  if (!p) return null;
  const delta = Math.max(0, Math.round(target)) - p.stock;
  if (delta === 0) return null;
  return recordMovement(productId, "adjust", delta, { reason, by });
}

export function listMovements(filter: { productId?: string; type?: string; limit?: number } = {}): StockMovement[] {
  const db = load();
  let out = db.movements;
  if (filter.productId) out = out.filter((m) => m.productId === filter.productId);
  if (filter.type) out = out.filter((m) => m.type === filter.type);
  return out.slice(0, filter.limit || 500);
}

// --------------------------------------------------------------- suppliers -
export function listSuppliers(): Supplier[] { return load().suppliers.slice().sort((a, b) => a.name.localeCompare(b.name)); }
export function getSupplier(id: string): Supplier | null { return load().suppliers.find((s) => s.id === id) || null; }
export function upsertSupplier(input: Partial<Supplier> & { name: string }): Supplier {
  const db = load();
  if (input.id) {
    const s = db.suppliers.find((x) => x.id === input.id);
    if (s) { Object.assign(s, input); save(); return s; }
  }
  const s: Supplier = {
    id: uid("sup_"), name: input.name, contact: input.contact || "", email: input.email || "",
    phone: input.phone || "", gstin: input.gstin || "", address: input.address || "",
    city: input.city || "", state: input.state || "", pincode: input.pincode || "",
    leadTimeDays: input.leadTimeDays ?? 7, paymentTerms: input.paymentTerms || "Net 30",
    rating: input.rating ?? 0, active: input.active ?? true, notes: input.notes || "", createdAt: now(),
  };
  db.suppliers.push(s); save(); return s;
}
export function deleteSupplier(id: string): boolean {
  const db = load(); const n = db.suppliers.length;
  db.suppliers = db.suppliers.filter((s) => s.id !== id);
  const changed = db.suppliers.length !== n; if (changed) save(); return changed;
}

// --------------------------------------------------------------- locations -
export function listLocations(): Location[] { return load().locations.slice(); }
export function upsertLocation(input: Partial<Location> & { name: string }): Location {
  const db = load();
  if (input.id) {
    const l = db.locations.find((x) => x.id === input.id);
    if (l) { Object.assign(l, input); save(); return l; }
  }
  const l: Location = {
    id: uid("loc_"), name: input.name, type: input.type || "warehouse",
    code: input.code || input.name.slice(0, 3).toUpperCase(), address: input.address || "",
    active: input.active ?? true, notes: input.notes || "", createdAt: now(),
  };
  db.locations.push(l); save(); return l;
}
export function deleteLocation(id: string): boolean {
  const db = load(); const n = db.locations.length;
  db.locations = db.locations.filter((l) => l.id !== id);
  const changed = db.locations.length !== n; if (changed) save(); return changed;
}

// ------------------------------------------------------ categories/brands --
export function listCategories(): Category[] { return load().categories.slice(); }
export function upsertCategory(input: Partial<Category> & { name: string }): Category {
  const db = load();
  if (input.id) { const c = db.categories.find((x) => x.id === input.id); if (c) { Object.assign(c, input); save(); return c; } }
  const c: Category = { id: uid("cat_"), name: input.name, parentId: input.parentId, createdAt: now() };
  db.categories.push(c); save(); return c;
}
export function deleteCategory(id: string): boolean {
  const db = load(); const n = db.categories.length;
  db.categories = db.categories.filter((c) => c.id !== id);
  const changed = db.categories.length !== n; if (changed) save(); return changed;
}
export function listBrands(): Brand[] { return load().brands.slice(); }
export function upsertBrand(input: Partial<Brand> & { name: string }): Brand {
  const db = load();
  if (input.id) { const b = db.brands.find((x) => x.id === input.id); if (b) { Object.assign(b, input); save(); return b; } }
  const b: Brand = { id: uid("brd_"), name: input.name, createdAt: now() };
  db.brands.push(b); save(); return b;
}
export function deleteBrand(id: string): boolean {
  const db = load(); const n = db.brands.length;
  db.brands = db.brands.filter((b) => b.id !== id);
  const changed = db.brands.length !== n; if (changed) save(); return changed;
}

// ---------------------------------------------------------- purchase orders
export function listPurchaseOrders(): PurchaseOrder[] { return load().purchaseOrders.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function getPurchaseOrder(id: string): PurchaseOrder | null { return load().purchaseOrders.find((p) => p.id === id) || null; }
export function createPurchaseOrder(input: { supplierId: string; items: { productId: string; qty: number; costPrice: number }[]; expectedAt?: string; notes?: string; by?: string }): PurchaseOrder {
  const db = load();
  const items: POItem[] = (input.items || []).map((i) => ({ productId: i.productId, qty: Math.max(0, i.qty), costPrice: Math.max(0, i.costPrice), receivedQty: 0 }));
  const po: PurchaseOrder = {
    id: uid("po_"), poNo: nextSeq("po", "PO"), supplierId: input.supplierId, status: "draft",
    items, createdAt: now(), expectedAt: input.expectedAt, notes: input.notes || "",
    by: input.by || "admin", total: items.reduce((s, i) => s + i.qty * i.costPrice, 0),
  };
  db.purchaseOrders.unshift(po); save(); return po;
}
export function updatePurchaseOrder(id: string, patch: Partial<Pick<PurchaseOrder, "status" | "notes" | "expectedAt" | "items">>): PurchaseOrder | null {
  const db = load(); const po = db.purchaseOrders.find((p) => p.id === id); if (!po) return null;
  Object.assign(po, patch);
  if (patch.items) po.total = po.items.reduce((s, i) => s + i.qty * i.costPrice, 0);
  save(); return po;
}
/** Receive a PO (fully or partially). Increments stock via movements and updates cost. */
export function receivePurchaseOrder(id: string, received: { productId: string; qty: number }[], by = "admin"): PurchaseOrder | null {
  const db = load(); const po = db.purchaseOrders.find((p) => p.id === id); if (!po) return null;
  for (const r of received) {
    const item = po.items.find((i) => i.productId === r.productId);
    if (!item || r.qty <= 0) continue;
    const take = Math.min(r.qty, item.qty - item.receivedQty);
    if (take <= 0) continue;
    item.receivedQty += take;
    recordMovement(r.productId, "receive", take, { reason: `PO ${po.poNo}`, ref: po.poNo, by, unitCost: item.costPrice });
    if (item.costPrice > 0) updateMeta(r.productId, { costPrice: item.costPrice, supplierId: po.supplierId });
  }
  const allDone = po.items.every((i) => i.receivedQty >= i.qty);
  const anyDone = po.items.some((i) => i.receivedQty > 0);
  po.status = allDone ? "received" : anyDone ? "partial" : po.status;
  if (allDone) po.receivedAt = now();
  save(); return po;
}
export function deletePurchaseOrder(id: string): boolean {
  const db = load(); const n = db.purchaseOrders.length;
  db.purchaseOrders = db.purchaseOrders.filter((p) => p.id !== id);
  const changed = db.purchaseOrders.length !== n; if (changed) save(); return changed;
}

// ------------------------------------------------------------- stock counts
export function listCounts(): StockCount[] { return load().counts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function getCount(id: string): StockCount | null { return load().counts.find((c) => c.id === id) || null; }
export function createCount(input: { locationId?: string; productIds?: string[]; by?: string; notes?: string }): StockCount {
  const db = load();
  const ids = input.productIds && input.productIds.length ? input.productIds : listProducts().map((p) => p.id);
  const lines: CountLine[] = ids.map((pid) => ({ productId: pid, system: getStoredProduct(pid)?.stock ?? 0, counted: null }));
  const c: StockCount = {
    id: uid("cnt_"), ref: nextSeq("count", "SC"), locationId: input.locationId, status: "open",
    lines, createdAt: now(), by: input.by || "admin", notes: input.notes || "",
  };
  db.counts.unshift(c); save(); return c;
}
export function setCountLine(countId: string, productId: string, counted: number): StockCount | null {
  const db = load(); const c = db.counts.find((x) => x.id === countId); if (!c || c.status === "closed") return null;
  const line = c.lines.find((l) => l.productId === productId);
  if (line) line.counted = Math.max(0, Math.round(counted));
  save(); return c;
}
/** Close a count: post variance adjustments for every counted line. */
export function closeCount(countId: string, by = "admin"): StockCount | null {
  const db = load(); const c = db.counts.find((x) => x.id === countId); if (!c || c.status === "closed") return null;
  for (const l of c.lines) {
    if (l.counted === null) continue;
    l.system = getStoredProduct(l.productId)?.stock ?? 0;
    const variance = l.counted - l.system;
    if (variance !== 0) recordMovement(l.productId, "count", variance, { reason: `Count ${c.ref}`, ref: c.ref, by });
  }
  c.status = "closed"; c.closedAt = now(); save(); return c;
}

// ---------------------------------------------------------------- transfers
export function listTransfers(): Transfer[] { return load().transfers.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function createTransfer(input: { fromLocationId: string; toLocationId: string; items: TransferItem[]; by?: string; notes?: string }): Transfer {
  const db = load();
  const t: Transfer = {
    id: uid("trf_"), ref: nextSeq("transfer", "TR"), fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId, items: input.items.filter((i) => i.qty > 0),
    status: "in_transit", createdAt: now(), by: input.by || "admin", notes: input.notes || "",
  };
  // record the out-movement immediately (stock leaves the source)
  for (const i of t.items) recordMovement(i.productId, "transfer_out", -Math.abs(i.qty), { reason: `Transfer ${t.ref} out`, ref: t.ref, locationId: input.fromLocationId, by: t.by });
  db.transfers.unshift(t); save(); return t;
}
export function receiveTransfer(id: string, by = "admin"): Transfer | null {
  const db = load(); const t = db.transfers.find((x) => x.id === id); if (!t || t.status !== "in_transit") return null;
  for (const i of t.items) recordMovement(i.productId, "transfer_in", Math.abs(i.qty), { reason: `Transfer ${t.ref} in`, ref: t.ref, locationId: t.toLocationId, by });
  t.status = "received"; t.receivedAt = now(); save(); return t;
}
export function cancelTransfer(id: string, by = "admin"): Transfer | null {
  const db = load(); const t = db.transfers.find((x) => x.id === id); if (!t || t.status !== "in_transit") return null;
  // return the stock to source
  for (const i of t.items) recordMovement(i.productId, "transfer_in", Math.abs(i.qty), { reason: `Transfer ${t.ref} cancelled`, ref: t.ref, locationId: t.fromLocationId, by });
  t.status = "cancelled"; save(); return t;
}

// ------------------------------------------------------------------ batches
export function listBatches(productId?: string): Batch[] {
  const db = load(); return db.batches.filter((b) => (productId ? b.productId === productId : true));
}
export function addBatch(input: { productId: string; batchNo: string; qty: number; mfgDate?: string; expiryDate?: string }): Batch {
  const db = load();
  const b: Batch = { id: uid("bat_"), productId: input.productId, batchNo: input.batchNo, qty: Math.max(0, input.qty), mfgDate: input.mfgDate, expiryDate: input.expiryDate, createdAt: now() };
  db.batches.push(b); save(); return b;
}
export function deleteBatch(id: string): boolean {
  const db = load(); const n = db.batches.length;
  db.batches = db.batches.filter((b) => b.id !== id);
  const changed = db.batches.length !== n; if (changed) save(); return changed;
}
export function expiringBatches(days?: number): Batch[] {
  const db = load(); const warn = days ?? db.settings.expiryWarnDays;
  const cutoff = Date.now() + warn * 86400000;
  return db.batches.filter((b) => b.expiryDate && new Date(b.expiryDate).getTime() <= cutoff).sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : 1));
}

// ------------------------------------------------------------------ reports
export function valuation() {
  const rows = listProductRows();
  const cost = rows.reduce((s, r) => s + r.stockValueCost, 0);
  const retail = rows.reduce((s, r) => s + r.stockValueRetail, 0);
  const units = rows.reduce((s, r) => s + r.stock, 0);
  return { cost, retail, units, potentialProfit: retail - cost, skuCount: rows.length,
    byCategory: groupValue(rows, (r) => r.category) };
}
function groupValue(rows: ProductRow[], key: (r: ProductRow) => string) {
  const map: Record<string, { units: number; cost: number; retail: number }> = {};
  for (const r of rows) {
    const k = key(r) || "Uncategorised";
    map[k] = map[k] || { units: 0, cost: 0, retail: 0 };
    map[k].units += r.stock; map[k].cost += r.stockValueCost; map[k].retail += r.stockValueRetail;
  }
  return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.retail - a.retail);
}
export function lowStock(): ProductRow[] { return listProductRows().filter((r) => r.low).sort((a, b) => a.stock - b.stock); }
export function reorderSuggestions() {
  return lowStock().map((r) => ({ productId: r.productId, name: r.name, sku: r.sku, stock: r.stock,
    reorderPoint: r.reorderPoint, suggestedQty: Math.max(r.reorderQty, r.reorderPoint - r.stock),
    supplierId: r.supplierId, estCost: Math.max(r.reorderQty, r.reorderPoint - r.stock) * r.costPrice }));
}
export function deadStock(days?: number): ProductRow[] {
  const db = load(); const d = days ?? db.settings.deadStockDays;
  const cutoff = Date.now() - d * 86400000;
  const recent = new Set(db.movements.filter((m) => (m.type === "sale" || m.type === "transfer_out") && new Date(m.at).getTime() > cutoff).map((m) => m.productId));
  return listProductRows().filter((r) => r.stock > 0 && !recent.has(r.productId));
}
export function movementSummary(days = 30) {
  const cutoff = Date.now() - days * 86400000;
  const db = load();
  const inQty: Record<string, number> = {}, outQty: Record<string, number> = {};
  for (const m of db.movements) {
    if (new Date(m.at).getTime() < cutoff) continue;
    (m.qty >= 0 ? inQty : outQty)[m.type] = ((m.qty >= 0 ? inQty : outQty)[m.type] || 0) + Math.abs(m.qty);
  }
  return { days, in: inQty, out: outQty, totalMovements: db.movements.filter((m) => new Date(m.at).getTime() >= cutoff).length };
}
/** ABC classification by retail stock value (A=top 80%, B=next 15%, C=rest). */
export function abcAnalysis() {
  const rows = listProductRows().slice().sort((a, b) => b.stockValueRetail - a.stockValueRetail);
  const total = rows.reduce((s, r) => s + r.stockValueRetail, 0) || 1;
  let cum = 0;
  return rows.map((r) => {
    cum += r.stockValueRetail;
    const pct = (cum / total) * 100;
    const cls = pct <= 80 ? "A" : pct <= 95 ? "B" : "C";
    return { productId: r.productId, name: r.name, sku: r.sku, value: r.stockValueRetail, cumulativePct: Math.round(pct), class: cls };
  });
}
export function dashboard() {
  const rows = listProductRows();
  const val = valuation();
  return {
    skuCount: rows.length,
    unitsInStock: val.units,
    stockValueCost: val.cost,
    stockValueRetail: val.retail,
    lowStockCount: rows.filter((r) => r.low).length,
    outOfStockCount: rows.filter((r) => r.stock === 0).length,
    hiddenCount: rows.filter((r) => !r.available).length,
    supplierCount: load().suppliers.length,
    openPOs: load().purchaseOrders.filter((p) => p.status === "draft" || p.status === "sent" || p.status === "partial").length,
    openCounts: load().counts.filter((c) => c.status === "open").length,
    inTransit: load().transfers.filter((t) => t.status === "in_transit").length,
    expiringSoon: expiringBatches().length,
    movements30d: movementSummary(30).totalMovements,
  };
}

// ------------------------------------------------------------------ export
export function exportCsv(): string {
  const rows = listProductRows();
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["SKU", "Name", "Category", "Barcode", "HSN", "GST%", "Cost", "Price", "MRP", "Stock", "ReorderPoint", "ReorderQty", "StockValueCost", "StockValueRetail", "Available"];
  const lines = rows.map((r) => [r.sku, r.name, r.category, r.barcode, r.hsn, r.gstPct, r.costPrice, r.price, r.mrp, r.stock, r.reorderPoint, r.reorderQty, r.stockValueCost, r.stockValueRetail, r.available ? "yes" : "no"].map(esc).join(","));
  return [head.map(esc).join(","), ...lines].join("\r\n");
}
