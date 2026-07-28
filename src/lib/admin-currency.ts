// Multi-Currency Pricing — exchange rates and a preferred display currency
// per market, so international customers can see an approximate converted
// price. Base currency stays INR (the shop's real transactional currency);
// this module only computes DISPLAY conversions — it never changes how an
// order is actually charged, avoiding any change to the checkout/payment
// routes.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface CurrencyRate {
  id: string;
  code: string; // ISO 4217, e.g. "USD"
  symbol: string;
  rateFromInr: number; // 1 INR = rateFromInr <code>
  updatedAt: string;
}

interface CurrencyDB {
  rates: CurrencyRate[];
  defaultCode: string;
}

function seedRates(): CurrencyRate[] {
  const now = new Date().toISOString();
  return [
    { id: shortId("cur"), code: "USD", symbol: "$", rateFromInr: 0.012, updatedAt: now },
    { id: shortId("cur"), code: "EUR", symbol: "€", rateFromInr: 0.011, updatedAt: now },
    { id: shortId("cur"), code: "GBP", symbol: "£", rateFromInr: 0.0095, updatedAt: now },
    { id: shortId("cur"), code: "AED", symbol: "د.إ", rateFromInr: 0.044, updatedAt: now },
  ];
}

const store = createFileStore<CurrencyDB>("admin-currency.json", () => ({ rates: seedRates(), defaultCode: "INR" }));

export function listRates(): CurrencyRate[] {
  return store.read().rates;
}

export function upsertRate(input: Partial<CurrencyRate> & { code: string; symbol: string; rateFromInr: number }): CurrencyRate {
  return store.mutate((db) => {
    const existing = db.rates.find((r) => r.code === input.code.toUpperCase());
    const now = new Date().toISOString();
    if (existing) {
      existing.symbol = input.symbol;
      existing.rateFromInr = input.rateFromInr;
      existing.updatedAt = now;
      return existing;
    }
    const created: CurrencyRate = { id: shortId("cur"), code: input.code.toUpperCase(), symbol: input.symbol, rateFromInr: input.rateFromInr, updatedAt: now };
    db.rates.push(created);
    return created;
  });
}

export function deleteRate(id: string): boolean {
  return store.mutate((db) => {
    const before = db.rates.length;
    db.rates = db.rates.filter((r) => r.id !== id);
    return db.rates.length < before;
  });
}

export function convertFromInr(amountInr: number, code: string): number | null {
  if (code === "INR") return amountInr;
  const rate = store.read().rates.find((r) => r.code === code);
  if (!rate) return null;
  return Math.round(amountInr * rate.rateFromInr * 100) / 100;
}
