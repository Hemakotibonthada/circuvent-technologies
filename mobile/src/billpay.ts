// Electricity bill-payment support, ported (as a fresh RN implementation) from
// the old SmartHome app. Consumer accounts + payment history persist locally.
// Our control-plane has no billing API, so the "current bill" is estimated
// deterministically per consumer + month (realistic units/charges), and paying
// records a local receipt — the same UX the old app offered, minus the gateway.
import AsyncStorage from "@react-native-async-storage/async-storage";

// Indian DISCOMs (public, factual list) selectable when adding an account.
export const PROVIDERS = [
  "BESCOM (Karnataka)",
  "TSSPDCL (Telangana)",
  "TSNPDCL (Telangana)",
  "APSPDCL (Andhra Pradesh)",
  "APEPDCL (Andhra Pradesh)",
  "MSEDCL (Maharashtra)",
  "Adani Electricity (Mumbai)",
  "Tata Power (Mumbai/Delhi)",
  "BSES Rajdhani (Delhi)",
  "BSES Yamuna (Delhi)",
  "TPDDL (Delhi)",
  "TANGEDCO / TNEB (Tamil Nadu)",
  "KSEB (Kerala)",
  "CESC (Kolkata)",
  "PSPCL (Punjab)",
  "UPPCL (Uttar Pradesh)",
  "JVVNL (Rajasthan)",
  "MPPKVVCL (Madhya Pradesh)",
  "PGVCL (Gujarat)",
  "Other",
];

export interface ConsumerAccount {
  id: string;
  provider: string;
  consumerNumber: string;
  consumerName: string;
  address?: string;
  mobile?: string;
  email?: string;
  sanctionedLoadKw?: number;
  meterNumber?: string;
}

export interface Bill {
  billNumber: string;
  period: string;         // e.g. "Jul 2026"
  dueDate: string;        // ISO
  unitsConsumed: number;
  energyCharge: number;
  fixedCharge: number;
  taxAmount: number;
  subsidyAmount: number;
  totalAmount: number;
  amountDue: number;
  paid: boolean;
}

export interface Payment {
  id: string;
  accountId: string;
  consumerNumber: string;
  provider: string;
  billNumber: string;
  amount: number;
  method: string;         // UPI | Card | NetBanking | Wallet
  txnId: string;
  at: string;             // ISO
  status: "success";
}

const ACC_KEY = "cv-consumer-accounts";
const PAY_KEY = "cv-bill-payments";

export async function getAccounts(): Promise<ConsumerAccount[]> {
  try { const r = await AsyncStorage.getItem(ACC_KEY); return r ? (JSON.parse(r) as ConsumerAccount[]) : []; } catch { return []; }
}
export async function addAccount(a: Omit<ConsumerAccount, "id">): Promise<ConsumerAccount[]> {
  const list = await getAccounts();
  const out = [...list, { ...a, id: `ca-${Date.now().toString(36)}` }];
  try { await AsyncStorage.setItem(ACC_KEY, JSON.stringify(out.slice(0, 40))); } catch { /* ignore */ }
  return out;
}
export async function removeAccount(id: string): Promise<ConsumerAccount[]> {
  const out = (await getAccounts()).filter((a) => a.id !== id);
  try { await AsyncStorage.setItem(ACC_KEY, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

export async function getPayments(): Promise<Payment[]> {
  try { const r = await AsyncStorage.getItem(PAY_KEY); return r ? (JSON.parse(r) as Payment[]) : []; } catch { return []; }
}
export async function recordPayment(p: Omit<Payment, "id" | "txnId" | "at" | "status">): Promise<Payment> {
  const list = await getPayments();
  const pay: Payment = { ...p, id: `pay-${Date.now().toString(36)}`, txnId: genTxn(), at: new Date().toISOString(), status: "success" };
  try { await AsyncStorage.setItem(PAY_KEY, JSON.stringify([pay, ...list].slice(0, 200))); } catch { /* ignore */ }
  return pay;
}
export async function isBillPaid(accountId: string, billNumber: string): Promise<boolean> {
  return (await getPayments()).some((p) => p.accountId === accountId && p.billNumber === billNumber);
}

// Deterministic hash so the same consumer sees a stable bill within a month.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}
function genTxn(): string {
  const s = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let out = "CVX";
  for (let i = 0; i < 9; i++) out += s[Math.floor(Math.random() * s.length)];
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Estimate the current month's bill for an account (stable per consumer+month). */
export function estimateBill(acc: ConsumerAccount, at = new Date()): Bill {
  const period = `${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
  const seed = hash(acc.consumerNumber + period);
  // 90–420 kWh with a seasonal bump in summer months (Mar–Jun).
  const summer = at.getMonth() >= 2 && at.getMonth() <= 5 ? 1.35 : 1;
  const units = Math.round((90 + (seed % 330)) * summer);
  // Telescopic-ish slab tariff (approx, ₹/kWh).
  const slab = (u: number) => {
    let cost = 0, rem = u;
    const bands: [number, number][] = [[100, 3.5], [100, 5.0], [100, 6.5], [Infinity, 8.0]];
    for (const [size, rate] of bands) { const take = Math.min(rem, size); cost += take * rate; rem -= take; if (rem <= 0) break; }
    return cost;
  };
  const energyCharge = Math.round(slab(units));
  const fixedCharge = Math.round((acc.sanctionedLoadKw || 3) * 45);
  const taxAmount = Math.round((energyCharge + fixedCharge) * 0.09);
  const subsidyAmount = units <= 100 ? Math.round(energyCharge * 0.2) : 0;
  const totalAmount = energyCharge + fixedCharge + taxAmount - subsidyAmount;
  const due = new Date(at.getFullYear(), at.getMonth(), Math.min(28, 14 + (seed % 10)));
  return {
    billNumber: `${acc.provider.slice(0, 3).toUpperCase()}${(seed % 900000) + 100000}`,
    period,
    dueDate: due.toISOString(),
    unitsConsumed: units,
    energyCharge, fixedCharge, taxAmount, subsidyAmount,
    totalAmount, amountDue: totalAmount, paid: false,
  };
}

export const PAY_METHODS = ["UPI", "Card", "Net Banking", "Wallet"];
