// Circuvent shop — durable server-side store.
// File-backed JSON persistence (works in local dev and any Node host with a
// writable disk). On a read-only/serverless filesystem it transparently falls
// back to an in-memory store for the life of the warm instance, so API calls
// never crash — they just won't persist across cold starts there. For a fully
// durable production deployment, point DATA_DIR at a mounted volume or swap
// these functions for a database.
//
// SERVER ONLY — never import this from a client component (uses node:fs).

import fs from "fs";
import path from "path";
import { products as CATALOG } from "./shop-data";

// ---------------------------------------------------------------- types ----
export interface StoredOrderItem {
  name: string;
  price: number;
  qty: number;
  lineTotal: number;
}

export interface OrderEvent {
  status: string;
  at: string;
  note?: string;
}

export interface StoredCustomer {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface StoredOrder {
  orderNo: string;
  placedAt: string;
  items: StoredOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: StoredCustomer;
  paymentMethod: string;
  paymentStatus: string;
  paymentId?: string;
  status: string;
  trackingNumber?: string;
  carrier?: string;
  adminNotes?: string;
  history: OrderEvent[];
  updatedAt: string;
}

export interface StoredProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  stock: number;
  available: boolean;
  category: string;
  custom?: boolean; // added by admin, not part of the static catalog
}

export interface WalletTxn {
  at: string;
  type: "credit" | "debit";
  amount: number;
  reason: string;
  ref?: string;
  balanceAfter: number;
}

export interface Wallet {
  email: string;
  balance: number;
  history: WalletTxn[];
}

export interface Account {
  email: string;
  name: string;
  hash: string;
  salt: string;
  createdAt: string;
}

interface DB {
  orders: StoredOrder[];
  products: StoredProduct[];
  wallets: Record<string, Wallet>;
  accounts: Record<string, Account>;
}

// ---------------------------------------------------------- persistence ----
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "shop-db.json");

let mem: DB | null = null;
let canWrite = true;

function seedProducts(): StoredProduct[] {
  return CATALOG.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    stock: p.stock,
    available: true,
    category: p.category,
  }));
}

function emptyDB(): DB {
  return { orders: [], products: seedProducts(), wallets: {}, accounts: {} };
}

/** Ensures every catalog product exists in the store (adds newly-shipped ones). */
function reconcileProducts(db: DB): boolean {
  let changed = false;
  for (const c of CATALOG) {
    if (!db.products.find((p) => p.id === c.id)) {
      db.products.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        price: c.price,
        stock: c.stock,
        available: true,
        category: c.category,
      });
      changed = true;
    }
  }
  return changed;
}

function load(): DB {
  if (mem) return mem;
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Partial<DB>;
      mem = {
        orders: parsed.orders ?? [],
        products: parsed.products && parsed.products.length ? parsed.products : seedProducts(),
        wallets: parsed.wallets ?? {},
        accounts: parsed.accounts ?? {},
      };
      if (reconcileProducts(mem)) save();
      return mem;
    }
  } catch (e) {
    console.error("[store] load error:", e);
  }
  mem = emptyDB();
  save();
  return mem;
}

function save() {
  if (!mem || !canWrite) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(mem, null, 2), "utf8");
  } catch {
    canWrite = false; // read-only FS (serverless) — degrade to in-memory
    console.warn("[store] disk not writable; using in-memory store for this instance");
  }
}

// --------------------------------------------------------------- orders ----
export function recordOrder(
  o: Omit<StoredOrder, "history" | "updatedAt" | "status"> & { status?: string }
): StoredOrder {
  const db = load();
  const now = new Date().toISOString();
  const status = o.status || "placed";
  const order: StoredOrder = {
    ...o,
    status,
    history: [{ status, at: now, note: "Order placed" }],
    updatedAt: now,
  };
  const idx = db.orders.findIndex((x) => x.orderNo === order.orderNo);
  if (idx >= 0) db.orders[idx] = order;
  else db.orders.unshift(order);
  save();
  return order;
}

export function getOrder(orderNo: string, email: string): StoredOrder | null {
  const db = load();
  const no = orderNo.trim().toLowerCase();
  const em = email.trim().toLowerCase();
  return (
    db.orders.find(
      (o) => o.orderNo.toLowerCase() === no && (o.customer.email || "").toLowerCase() === em
    ) || null
  );
}

export function listOrders(filter?: { status?: string; q?: string }): StoredOrder[] {
  let list = load().orders;
  if (filter?.status && filter.status !== "all") {
    list = list.filter((o) => o.status === filter.status);
  }
  if (filter?.q) {
    const q = filter.q.trim().toLowerCase();
    list = list.filter(
      (o) =>
        o.orderNo.toLowerCase().includes(q) ||
        (o.customer.name || "").toLowerCase().includes(q) ||
        (o.customer.email || "").toLowerCase().includes(q) ||
        (o.customer.phone || "").toLowerCase().includes(q)
    );
  }
  return list;
}

export function listOrdersByEmail(email: string): StoredOrder[] {
  const em = email.trim().toLowerCase();
  return load().orders.filter((o) => (o.customer.email || "").toLowerCase() === em);
}

export function updateOrder(
  orderNo: string,
  patch: Partial<Pick<StoredOrder, "status" | "trackingNumber" | "carrier" | "adminNotes">>,
  note?: string
): StoredOrder | null {
  const db = load();
  const o = db.orders.find((x) => x.orderNo === orderNo);
  if (!o) return null;
  const now = new Date().toISOString();
  if (patch.status && patch.status !== o.status) {
    o.status = patch.status;
    o.history.push({ status: patch.status, at: now, note });
  } else if (note) {
    o.history.push({ status: o.status, at: now, note });
  }
  if (patch.trackingNumber !== undefined) o.trackingNumber = patch.trackingNumber;
  if (patch.carrier !== undefined) o.carrier = patch.carrier;
  if (patch.adminNotes !== undefined) o.adminNotes = patch.adminNotes;
  o.updatedAt = now;
  save();
  return o;
}

// ------------------------------------------------------------- products ----
export function listProducts(): StoredProduct[] {
  return load().products;
}

export function getStoredProduct(id: string): StoredProduct | null {
  return load().products.find((p) => p.id === id) || null;
}

export function upsertProduct(p: Partial<StoredProduct> & { id: string }): StoredProduct {
  const db = load();
  const existing = db.products.find((x) => x.id === p.id);
  if (existing) {
    Object.assign(existing, p);
    save();
    return existing;
  }
  const created: StoredProduct = {
    id: p.id,
    slug: p.slug || p.id,
    name: p.name || p.id,
    price: p.price ?? 0,
    stock: p.stock ?? 0,
    available: p.available ?? true,
    category: p.category || "General",
    custom: true,
  };
  db.products.push(created);
  save();
  return created;
}

export function deleteProduct(id: string): boolean {
  const db = load();
  const p = db.products.find((x) => x.id === id);
  if (!p || !p.custom) return false; // only admin-added products are removable
  db.products = db.products.filter((x) => x.id !== id);
  save();
  return true;
}

/** Adjust stock for a set of cart items. sign = -1 on purchase, +1 on restock. */
export function adjustStock(
  items: { id?: string; slug?: string; qty?: number }[],
  sign: -1 | 1 = -1
): void {
  const db = load();
  for (const it of items) {
    const p = db.products.find((x) => x.id === it.id || x.slug === it.slug);
    if (p) p.stock = Math.max(0, p.stock + sign * (Number(it.qty) || 1));
  }
  save();
}

// --------------------------------------------------------------- wallet ----
export function getWallet(email: string): Wallet {
  const db = load();
  const key = email.trim().toLowerCase();
  if (!db.wallets[key]) db.wallets[key] = { email: key, balance: 0, history: [] };
  return db.wallets[key];
}

export function creditWallet(email: string, amount: number, reason: string, ref?: string): Wallet {
  const w = getWallet(email);
  const amt = Math.max(0, Math.round(amount));
  w.balance += amt;
  w.history.unshift({
    at: new Date().toISOString(),
    type: "credit",
    amount: amt,
    reason,
    ref,
    balanceAfter: w.balance,
  });
  save();
  return w;
}

export function debitWallet(
  email: string,
  amount: number,
  reason: string,
  ref?: string
): { ok: boolean; wallet: Wallet } {
  const w = getWallet(email);
  const amt = Math.max(0, Math.round(amount));
  if (w.balance < amt) return { ok: false, wallet: w };
  w.balance -= amt;
  w.history.unshift({
    at: new Date().toISOString(),
    type: "debit",
    amount: amt,
    reason,
    ref,
    balanceAfter: w.balance,
  });
  save();
  return { ok: true, wallet: w };
}

// ------------------------------------------------------------- accounts ----
export function getAccount(email: string): Account | null {
  return load().accounts[email.trim().toLowerCase()] || null;
}

export function createAccount(a: Account): void {
  const db = load();
  db.accounts[a.email.trim().toLowerCase()] = a;
  save();
}
