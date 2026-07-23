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
  id?: string;
  slug?: string;
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
  discount?: number;
  couponCode?: string;
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

export interface NotifyPrefs {
  orderUpdates: boolean;
  promotions: boolean;
  whatsapp: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
}

export interface Account {
  email: string;
  name: string;
  hash: string;
  salt: string;
  createdAt: string;
  blocked?: boolean;
  phone?: string;
  gender?: string;
  dob?: string;
  gstin?: string;
  businessName?: string;
  poRef?: string;
  notifyPrefs?: NotifyPrefs;
  tokenVersion?: number;
  deletedAt?: string;
}

export interface Address {
  id: string;
  email: string;
  label: string; // Home, Work, Other, ...
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  instructions?: string;
  isCommercial?: boolean;
  isDefaultShipping?: boolean;
  isDefaultBilling?: boolean;
  createdAt: string;
}

export interface NotifyRequest {
  id: string;
  productId: string;
  email: string;
  at: string;
  notified?: boolean;
}

export interface LoginEvent {
  at: string;
  ip: string;
  userAgent?: string;
  blocked?: boolean;
}

export interface PendingRegistration {
  email: string;
  name: string;
  hash: string;
  salt: string;
  otp: string;
  expires: number;
  attempts: number;
}

export interface Review {
  id: string;
  productId: string;
  email: string;
  name: string;
  rating: number;
  comment: string;
  at: string;
}

export interface StoreCoupon {
  code: string;
  type: "percent" | "flat" | "shipping";
  value: number;
  minSubtotal?: number;
  label: string;
  active: boolean;
}

export interface TicketReply {
  at: string;
  from: "customer" | "admin";
  message: string;
}

export interface SupportTicket {
  id: string;
  email: string;
  name: string;
  subject: string;
  orderNo?: string;
  status: "open" | "closed";
  messages: TicketReply[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnRequest {
  id: string;
  orderNo: string;
  email: string;
  reason: string;
  status: "requested" | "approved" | "rejected" | "refunded";
  refundAmount?: number;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}

export interface LoyaltyTxn {
  at: string;
  type: "earn" | "redeem";
  points: number;
  reason: string;
  ref?: string;
  balanceAfter: number;
}

export interface LoyaltyAccount {
  email: string;
  points: number;
  history: LoyaltyTxn[];
}

/** Staff role for the admin control center. superadmin has every capability. */
export type AdminRole = "superadmin" | "manager" | "inventory" | "orders" | "support";

export interface AdminUser {
  email: string;
  name: string;
  hash: string;
  salt: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  lastLoginAt?: string;
}

interface DB {
  orders: StoredOrder[];
  products: StoredProduct[];
  wallets: Record<string, Wallet>;
  accounts: Record<string, Account>;
  pending: Record<string, PendingRegistration>;
  devices: Record<string, Device>;
  reviews: Review[];
  addresses: Address[];
  notifyRequests: NotifyRequest[];
  logins: Record<string, LoginEvent[]>;
  coupons: StoreCoupon[];
  tickets: SupportTicket[];
  returns: ReturnRequest[];
  audit: AuditEntry[];
  loyalty: Record<string, LoyaltyAccount>;
  adminUsers: Record<string, AdminUser>;
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

function seedCoupons(): StoreCoupon[] {
  return [
    { code: "WELCOME10", type: "percent", value: 10, label: "10% off (welcome)", active: true },
    { code: "CIRCU200", type: "flat", value: 200, minSubtotal: 1500, label: "₹200 off orders over ₹1,500", active: true },
    { code: "FREESHIP", type: "shipping", value: 0, label: "Free shipping", active: true },
  ];
}

function emptyDB(): DB {
  return {
    orders: [],
    products: seedProducts(),
    wallets: {},
    accounts: {},
    pending: {},
    devices: {},
    reviews: [],
    addresses: [],
    notifyRequests: [],
    logins: {},
    coupons: seedCoupons(),
    tickets: [],
    returns: [],
    audit: [],
    loyalty: {},
    adminUsers: {},
  };
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
        pending: parsed.pending ?? {},
        devices: parsed.devices ?? {},
        reviews: parsed.reviews ?? [],
        addresses: parsed.addresses ?? [],
        notifyRequests: parsed.notifyRequests ?? [],
        logins: parsed.logins ?? {},
        coupons: parsed.coupons && parsed.coupons.length ? parsed.coupons : seedCoupons(),
        tickets: parsed.tickets ?? [],
        returns: parsed.returns ?? [],
        audit: parsed.audit ?? [],
        loyalty: parsed.loyalty ?? {},
        adminUsers: parsed.adminUsers ?? {},
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

// ---------------------------------------------------------- admin users ----
function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** All staff accounts (includes hash/salt — callers must strip before returning). */
export function listAdminUsers(): AdminUser[] {
  const db = load();
  return Object.values(db.adminUsers).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function countAdminUsers(): number {
  return Object.keys(load().adminUsers).length;
}

export function countSuperadmins(): number {
  return Object.values(load().adminUsers).filter((u) => u.role === "superadmin" && u.active).length;
}

export function getAdminUser(email: string): AdminUser | null {
  const db = load();
  return db.adminUsers[normEmail(email)] ?? null;
}

/** Creates or replaces a staff account. */
export function upsertAdminUser(u: AdminUser): AdminUser {
  const db = load();
  const email = normEmail(u.email);
  db.adminUsers[email] = { ...u, email };
  save();
  return db.adminUsers[email];
}

/** Patches an existing staff account's mutable fields. */
export function patchAdminUser(
  email: string,
  patch: Partial<Pick<AdminUser, "name" | "role" | "active" | "hash" | "salt" | "lastLoginAt">>
): AdminUser | null {
  const db = load();
  const key = normEmail(email);
  const existing = db.adminUsers[key];
  if (!existing) return null;
  db.adminUsers[key] = { ...existing, ...patch };
  save();
  return db.adminUsers[key];
}

export function deleteAdminUser(email: string): boolean {
  const db = load();
  const key = normEmail(email);
  if (!db.adminUsers[key]) return false;
  delete db.adminUsers[key];
  save();
  return true;
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

// --------------------------------------------------------------- reviews ---
export function addReview(r: { productId: string; email: string; name: string; rating: number; comment: string }): Review {
  const db = load();
  const email = r.email.trim().toLowerCase();
  const rating = Math.max(1, Math.min(5, Math.round(r.rating)));
  const comment = String(r.comment || "").slice(0, 1000);
  const existing = db.reviews.find((x) => x.productId === r.productId && x.email === email);
  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    existing.name = r.name;
    existing.at = new Date().toISOString();
    save();
    return existing;
  }
  const review: Review = {
    id: Math.random().toString(36).slice(2, 10),
    productId: r.productId,
    email,
    name: r.name,
    rating,
    comment,
    at: new Date().toISOString(),
  };
  db.reviews.unshift(review);
  save();
  return review;
}

export function listReviews(productId: string): Review[] {
  return load().reviews.filter((r) => r.productId === productId);
}

export function reviewSummary(productId: string): { count: number; average: number } {
  const rs = listReviews(productId);
  if (!rs.length) return { count: 0, average: 0 };
  return { count: rs.length, average: Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 };
}

export function reviewSummaries(): Record<string, { count: number; average: number }> {
  const acc: Record<string, { count: number; sum: number }> = {};
  for (const r of load().reviews) {
    if (!acc[r.productId]) acc[r.productId] = { count: 0, sum: 0 };
    acc[r.productId].count += 1;
    acc[r.productId].sum += r.rating;
  }
  const out: Record<string, { count: number; average: number }> = {};
  for (const k in acc) out[k] = { count: acc[k].count, average: Math.round((acc[k].sum / acc[k].count) * 10) / 10 };
  return out;
}

// ----------------------------------------------- pending registrations ----
export function setPendingRegistration(p: PendingRegistration): void {
  const db = load();
  db.pending[p.email.trim().toLowerCase()] = p;
  save();
}

export function getPendingRegistration(email: string): PendingRegistration | null {
  return load().pending[email.trim().toLowerCase()] || null;
}

export function clearPendingRegistration(email: string): void {
  const db = load();
  delete db.pending[email.trim().toLowerCase()];
  save();
}

// --------------------------------------------------------------- devices ---
const ONLINE_WINDOW_MS = 90_000;

export interface DeviceCommand {
  id: string;
  action: string;
  params?: Record<string, unknown>;
  at: string;
}

export interface Device {
  id: string;
  key: string; // device secret — proof of possession for claiming + auth
  type: string; // product id: smart-plug, aquaguard, guardian, ...
  name: string;
  ownerEmail?: string;
  lastSeen?: string;
  state: Record<string, unknown>;
  commands: DeviceCommand[];
  createdAt: string;
}

export interface DeviceView {
  id: string;
  type: string;
  name: string;
  online: boolean;
  lastSeen?: string;
  state: Record<string, unknown>;
}

function toView(d: Device): DeviceView {
  const online = !!d.lastSeen && Date.now() - new Date(d.lastSeen).getTime() < ONLINE_WINDOW_MS;
  return { id: d.id, type: d.type, name: d.name, online, lastSeen: d.lastSeen, state: d.state };
}

/**
 * Device heartbeat/telemetry + command fetch in one call. Auto-provisions an
 * unclaimed device on first contact. Returns null if the key doesn't match.
 */
export function deviceSync(
  id: string,
  key: string,
  type: string | undefined,
  telemetry: Record<string, unknown> | undefined
): { commands: DeviceCommand[]; claimed: boolean } | null {
  const db = load();
  let d = db.devices[id];
  if (!d) {
    d = {
      id,
      key,
      type: type || "generic",
      name: type ? `Circuvent ${type}` : id,
      state: {},
      commands: [],
      createdAt: new Date().toISOString(),
    };
    db.devices[id] = d;
  }
  if (d.key !== key) return null;
  if (type && d.type === "generic") d.type = type;
  if (telemetry && typeof telemetry === "object") d.state = { ...d.state, ...telemetry };
  d.lastSeen = new Date().toISOString();
  const commands = d.commands;
  d.commands = [];
  save();
  return { commands, claimed: !!d.ownerEmail };
}

export function claimDevice(
  id: string,
  key: string,
  ownerEmail: string,
  name?: string
): { ok: boolean; message?: string; device?: DeviceView } {
  const db = load();
  const d = db.devices[id];
  if (!d || d.key !== key) return { ok: false, message: "Device ID or key is incorrect." };
  if (d.ownerEmail && d.ownerEmail !== ownerEmail.toLowerCase()) {
    return { ok: false, message: "This device is already linked to another account." };
  }
  d.ownerEmail = ownerEmail.trim().toLowerCase();
  if (name) d.name = name;
  save();
  return { ok: true, device: toView(d) };
}

export function listDevicesByOwner(email: string): DeviceView[] {
  const e = email.trim().toLowerCase();
  return Object.values(load().devices)
    .filter((d) => d.ownerEmail === e)
    .map(toView);
}

export function enqueueCommand(
  id: string,
  ownerEmail: string,
  action: string,
  params?: Record<string, unknown>
): { ok: boolean; message?: string } {
  const db = load();
  const d = db.devices[id];
  if (!d || d.ownerEmail !== ownerEmail.trim().toLowerCase()) {
    return { ok: false, message: "Device not found." };
  }
  d.commands.push({ id: Math.random().toString(36).slice(2, 10), action, params, at: new Date().toISOString() });
  // Optimistically reflect obvious state so the UI feels instant.
  if (action === "set" && params && typeof params === "object") d.state = { ...d.state, ...params };
  save();
  return { ok: true };
}

export function renameDevice(id: string, ownerEmail: string, name: string): boolean {
  const db = load();
  const d = db.devices[id];
  if (!d || d.ownerEmail !== ownerEmail.trim().toLowerCase()) return false;
  d.name = name;
  save();
  return true;
}

export function unclaimDevice(id: string, ownerEmail: string): boolean {
  const db = load();
  const d = db.devices[id];
  if (!d || d.ownerEmail !== ownerEmail.trim().toLowerCase()) return false;
  delete d.ownerEmail;
  save();
  return true;
}

// --------------------------------------------------------------- coupons ---
export function listCoupons(): StoreCoupon[] {
  return load().coupons;
}
export function getActiveCoupon(code: string): StoreCoupon | null {
  const c = load().coupons.find((x) => x.code === String(code || "").trim().toUpperCase());
  return c && c.active ? c : null;
}
export function upsertCoupon(c: StoreCoupon): StoreCoupon {
  const db = load();
  const code = c.code.trim().toUpperCase();
  const ex = db.coupons.find((x) => x.code === code);
  if (ex) {
    Object.assign(ex, c, { code });
    save();
    return ex;
  }
  const created: StoreCoupon = { ...c, code };
  db.coupons.push(created);
  save();
  return created;
}
export function deleteCoupon(code: string): boolean {
  const db = load();
  const before = db.coupons.length;
  db.coupons = db.coupons.filter((x) => x.code !== String(code || "").trim().toUpperCase());
  save();
  return db.coupons.length < before;
}

// -------------------------------------------------------- support tickets --
export function createTicket(t: {
  email: string;
  name: string;
  subject: string;
  orderNo?: string;
  message: string;
}): SupportTicket {
  const db = load();
  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: Math.random().toString(36).slice(2, 10),
    email: t.email.trim().toLowerCase(),
    name: t.name,
    subject: String(t.subject || "Support request").slice(0, 160),
    orderNo: t.orderNo,
    status: "open",
    messages: [{ at: now, from: "customer", message: String(t.message || "").slice(0, 2000) }],
    createdAt: now,
    updatedAt: now,
  };
  db.tickets.unshift(ticket);
  save();
  return ticket;
}
export function listTickets(): SupportTicket[] {
  return load().tickets;
}
export function listTicketsByEmail(email: string): SupportTicket[] {
  const e = email.trim().toLowerCase();
  return load().tickets.filter((t) => t.email === e);
}
export function addTicketMessage(id: string, from: "customer" | "admin", message: string): SupportTicket | null {
  const db = load();
  const t = db.tickets.find((x) => x.id === id);
  if (!t) return null;
  t.messages.push({ at: new Date().toISOString(), from, message: String(message || "").slice(0, 2000) });
  t.status = "open";
  t.updatedAt = new Date().toISOString();
  save();
  return t;
}
export function setTicketStatus(id: string, status: "open" | "closed"): SupportTicket | null {
  const db = load();
  const t = db.tickets.find((x) => x.id === id);
  if (!t) return null;
  t.status = status;
  t.updatedAt = new Date().toISOString();
  save();
  return t;
}

// ---------------------------------------------------------- returns / RMA --
export function createReturn(r: { orderNo: string; email: string; reason: string }): {
  ok: boolean;
  message?: string;
  request?: ReturnRequest;
} {
  const db = load();
  const email = r.email.trim().toLowerCase();
  const order = db.orders.find((o) => o.orderNo === r.orderNo && (o.customer.email || "").toLowerCase() === email);
  if (!order) return { ok: false, message: "Order not found for your account." };
  const existing = db.returns.find((x) => x.orderNo === r.orderNo && x.status !== "rejected");
  if (existing) return { ok: false, message: "A return for this order is already in progress." };
  const now = new Date().toISOString();
  const req: ReturnRequest = {
    id: Math.random().toString(36).slice(2, 10),
    orderNo: r.orderNo,
    email,
    reason: String(r.reason || "").slice(0, 500),
    status: "requested",
    createdAt: now,
    updatedAt: now,
  };
  db.returns.unshift(req);
  save();
  return { ok: true, request: req };
}
export function listReturns(): ReturnRequest[] {
  return load().returns;
}
export function listReturnsByEmail(email: string): ReturnRequest[] {
  const e = email.trim().toLowerCase();
  return load().returns.filter((r) => r.email === e);
}
export function getReturn(id: string): ReturnRequest | null {
  return load().returns.find((r) => r.id === id) || null;
}
export function updateReturn(
  id: string,
  patch: Partial<Pick<ReturnRequest, "status" | "refundAmount" | "adminNote">>
): ReturnRequest | null {
  const db = load();
  const r = db.returns.find((x) => x.id === id);
  if (!r) return null;
  if (patch.status) r.status = patch.status;
  if (patch.refundAmount !== undefined) r.refundAmount = patch.refundAmount;
  if (patch.adminNote !== undefined) r.adminNote = patch.adminNote;
  r.updatedAt = new Date().toISOString();
  save();
  return r;
}

// ------------------------------------------------------------- customers ---
export interface CustomerView {
  email: string;
  name: string;
  blocked: boolean;
  createdAt: string;
  orders: number;
  spend: number;
  wallet: number;
}
export function listCustomers(): CustomerView[] {
  const db = load();
  return Object.values(db.accounts).map((a) => {
    const orders = db.orders.filter((o) => (o.customer.email || "").toLowerCase() === a.email);
    const spend = orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + o.total, 0);
    return {
      email: a.email,
      name: a.name,
      blocked: !!a.blocked,
      createdAt: a.createdAt,
      orders: orders.length,
      spend,
      wallet: db.wallets[a.email]?.balance || 0,
    };
  });
}
export function setAccountBlocked(email: string, blocked: boolean): boolean {
  const db = load();
  const a = db.accounts[email.trim().toLowerCase()];
  if (!a) return false;
  a.blocked = blocked;
  save();
  return true;
}

// ----------------------------------------------------------------- audit ---
export function logAudit(action: string, detail: string): void {
  const db = load();
  db.audit.unshift({ at: new Date().toISOString(), action, detail });
  if (db.audit.length > 500) db.audit = db.audit.slice(0, 500);
  save();
}
export function listAudit(limit = 100): AuditEntry[] {
  return load().audit.slice(0, limit);
}

// -------------------------------------------------------------- analytics --
export function analytics() {
  const db = load();
  const orders = db.orders;
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const gmv = orders.reduce((s, o) => s + o.total, 0);
  const statusCounts: Record<string, number> = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  const prodQty: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const o of orders) {
    for (const it of o.items) {
      if (!prodQty[it.name]) prodQty[it.name] = { name: it.name, qty: 0, revenue: 0 };
      prodQty[it.name].qty += it.qty;
      prodQty[it.name].revenue += it.lineTotal;
    }
  }
  const topProducts = Object.values(prodQty).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const lowStock = db.products.filter((p) => p.available && p.stock <= 5).map((p) => ({ name: p.name, stock: p.stock }));
  const walletLiability = Object.values(db.wallets).reduce((s, w) => s + w.balance, 0);
  return {
    gmv,
    revenue,
    orders: orders.length,
    paidOrders: paid.length,
    aov: paid.length ? Math.round(revenue / paid.length) : 0,
    customers: Object.keys(db.accounts).length,
    devices: Object.keys(db.devices).length,
    walletLiability,
    statusCounts,
    topProducts,
    lowStock,
    openTickets: db.tickets.filter((t) => t.status === "open").length,
    pendingReturns: db.returns.filter((r) => r.status === "requested").length,
    reviews: db.reviews.length,
  };
}

/**
 * Self-service cancellation by the customer — only allowed before the order is
 * packed/shipped. Refunds a paid order to the wallet.
 */
export function cancelOrderByCustomer(
  orderNo: string,
  email: string
): { ok: boolean; message?: string; refunded?: number } {
  const db = load();
  const em = email.trim().toLowerCase();
  const o = db.orders.find((x) => x.orderNo === orderNo && (x.customer.email || "").toLowerCase() === em);
  if (!o) return { ok: false, message: "Order not found for your account." };
  if (!["placed", "confirmed"].includes(o.status)) {
    return { ok: false, message: "This order has already been processed — please request a return instead." };
  }
  o.status = "cancelled";
  o.history.push({ status: "cancelled", at: new Date().toISOString(), note: "Cancelled by customer" });
  let refunded = 0;
  if (o.paymentStatus === "paid" && o.customer.email) {
    creditWallet(o.customer.email, o.total, `Refund — cancelled order ${o.orderNo}`, o.orderNo);
    o.paymentStatus = "refunded";
    refunded = o.total;
  }
  o.updatedAt = new Date().toISOString();
  save();
  return { ok: true, refunded };
}

// ---------------------------------------------------- profile / settings --
export interface PublicAccount {
  email: string;
  name: string;
  phone?: string;
  gender?: string;
  dob?: string;
  gstin?: string;
  businessName?: string;
  notifyPrefs?: NotifyPrefs;
}
export function publicAccount(email: string): PublicAccount | null {
  const a = getAccount(email);
  if (!a) return null;
  return {
    email: a.email,
    name: a.name,
    phone: a.phone,
    gender: a.gender,
    dob: a.dob,
    gstin: a.gstin,
    businessName: a.businessName,
    notifyPrefs: a.notifyPrefs,
  };
}
export function updateAccountProfile(
  email: string,
  patch: Partial<Pick<Account, "name" | "phone" | "gender" | "dob" | "gstin" | "businessName" | "notifyPrefs">>
): PublicAccount | null {
  const db = load();
  const a = db.accounts[email.trim().toLowerCase()];
  if (!a) return null;
  if (patch.name !== undefined && String(patch.name).trim().length >= 2) a.name = String(patch.name).trim();
  if (patch.phone !== undefined) a.phone = String(patch.phone).slice(0, 20);
  if (patch.gender !== undefined) a.gender = String(patch.gender).slice(0, 20);
  if (patch.dob !== undefined) a.dob = String(patch.dob).slice(0, 20);
  if (patch.gstin !== undefined) a.gstin = String(patch.gstin).slice(0, 20).toUpperCase();
  if (patch.businessName !== undefined) a.businessName = String(patch.businessName).slice(0, 120);
  if (patch.notifyPrefs !== undefined) a.notifyPrefs = { ...a.notifyPrefs, ...patch.notifyPrefs } as NotifyPrefs;
  save();
  return publicAccount(email);
}

// ------------------------------------------------------------- addresses ---
export function listAddresses(email: string): Address[] {
  const e = email.trim().toLowerCase();
  return load().addresses.filter((a) => a.email === e);
}
export function addAddress(email: string, data: Partial<Address>): Address {
  const db = load();
  const e = email.trim().toLowerCase();
  const mine = db.addresses.filter((a) => a.email === e);
  const addr: Address = {
    id: Math.random().toString(36).slice(2, 10),
    email: e,
    label: String(data.label || "Home").slice(0, 30),
    name: String(data.name || "").slice(0, 80),
    phone: String(data.phone || "").slice(0, 20),
    line1: String(data.line1 || "").slice(0, 160),
    line2: data.line2 ? String(data.line2).slice(0, 160) : undefined,
    city: String(data.city || "").slice(0, 60),
    state: String(data.state || "").slice(0, 60),
    pincode: String(data.pincode || "").slice(0, 12),
    instructions: data.instructions ? String(data.instructions).slice(0, 200) : undefined,
    isCommercial: !!data.isCommercial,
    isDefaultShipping: mine.length === 0 ? true : !!data.isDefaultShipping,
    isDefaultBilling: mine.length === 0 ? true : !!data.isDefaultBilling,
    createdAt: new Date().toISOString(),
  };
  if (addr.isDefaultShipping) mine.forEach((a) => (a.isDefaultShipping = false));
  if (addr.isDefaultBilling) mine.forEach((a) => (a.isDefaultBilling = false));
  db.addresses.push(addr);
  save();
  return addr;
}
export function updateAddress(email: string, id: string, patch: Partial<Address>): Address | null {
  const db = load();
  const e = email.trim().toLowerCase();
  const a = db.addresses.find((x) => x.id === id && x.email === e);
  if (!a) return null;
  const fields: (keyof Address)[] = ["label", "name", "phone", "line1", "line2", "city", "state", "pincode", "instructions", "isCommercial"];
  for (const f of fields) if (patch[f] !== undefined) (a as unknown as Record<string, unknown>)[f] = patch[f];
  if (patch.isDefaultShipping) {
    db.addresses.filter((x) => x.email === e).forEach((x) => (x.isDefaultShipping = false));
    a.isDefaultShipping = true;
  }
  if (patch.isDefaultBilling) {
    db.addresses.filter((x) => x.email === e).forEach((x) => (x.isDefaultBilling = false));
    a.isDefaultBilling = true;
  }
  save();
  return a;
}
export function deleteAddress(email: string, id: string): boolean {
  const db = load();
  const e = email.trim().toLowerCase();
  const before = db.addresses.length;
  db.addresses = db.addresses.filter((x) => !(x.id === id && x.email === e));
  save();
  return db.addresses.length < before;
}

// -------------------------------------------------------------- loyalty ----
const POINTS_EARN_RATE = 0.02; // 2% of paid order value, as points (1 point = ₹1)
export function getLoyalty(email: string): LoyaltyAccount {
  const db = load();
  const key = email.trim().toLowerCase();
  if (!db.loyalty[key]) db.loyalty[key] = { email: key, points: 0, history: [] };
  return db.loyalty[key];
}
export function earnPoints(email: string, orderTotal: number, ref?: string): number {
  if (!email) return 0;
  const pts = Math.floor((Number(orderTotal) || 0) * POINTS_EARN_RATE);
  if (pts <= 0) return 0;
  const l = getLoyalty(email);
  l.points += pts;
  l.history.unshift({ at: new Date().toISOString(), type: "earn", points: pts, reason: "Order reward", ref, balanceAfter: l.points });
  save();
  return pts;
}
export function redeemPointsToWallet(email: string, points: number): { ok: boolean; message?: string; points?: number; wallet?: number } {
  const l = getLoyalty(email);
  const p = Math.floor(Number(points) || 0);
  if (p < 100) return { ok: false, message: "Redeem at least 100 points." };
  if (l.points < p) return { ok: false, message: "Not enough points." };
  l.points -= p;
  l.history.unshift({ at: new Date().toISOString(), type: "redeem", points: p, reason: "Redeemed to wallet", balanceAfter: l.points });
  const w = creditWallet(email, p, `Loyalty redemption (${p} pts)`);
  save();
  return { ok: true, points: l.points, wallet: w.balance };
}
