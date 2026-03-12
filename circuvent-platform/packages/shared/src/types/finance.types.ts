// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Common/Finance Domain Types
// Multi-currency, GST, financial year utilities.
// ──────────────────────────────────────────────────────────────

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  convertedAmount: number;
  originalAmount: number;
  source: "API" | "MANUAL" | "CACHED";
  fetchedAt: string;
}

export interface GSTBreakdown {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalGST: number;
  grandTotal: number;
  isInterState: boolean;
  gstRate: number;
}

export function computeGST(
  subtotal: number,
  gstRate: number,
  isInterState: boolean,
  cessRate = 0
): GSTBreakdown {
  const totalGSTAmount = subtotal * (gstRate / 100);
  const cessAmount = subtotal * (cessRate / 100);

  if (isInterState) {
    return {
      subtotal,
      cgst: 0,
      sgst: 0,
      igst: totalGSTAmount,
      cess: cessAmount,
      totalGST: totalGSTAmount + cessAmount,
      grandTotal: subtotal + totalGSTAmount + cessAmount,
      isInterState: true,
      gstRate,
    };
  }

  const halfGST = totalGSTAmount / 2;
  return {
    subtotal,
    cgst: Math.round(halfGST * 100) / 100,
    sgst: Math.round(halfGST * 100) / 100,
    igst: 0,
    cess: cessAmount,
    totalGST: totalGSTAmount + cessAmount,
    grandTotal: subtotal + totalGSTAmount + cessAmount,
    isInterState: false,
    gstRate,
  };
}

export interface FinancialYearInfo {
  code: string;        // "2025-2026"
  startDate: Date;
  endDate: Date;
  isCurrentFY: boolean;
  quarter: number;     // 1-4
  monthInFY: number;   // 1-12 (April=1)
}

export function getFinancialYearInfo(date: Date = new Date()): FinancialYearInfo {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const fyStartYear = month < 3 ? year - 1 : year;
  const fyEndYear = fyStartYear + 1;

  const startDate = new Date(fyStartYear, 3, 1); // April 1
  const endDate = new Date(fyEndYear, 2, 31);     // March 31

  const monthInFY = month >= 3 ? month - 2 : month + 10;
  const quarter = Math.ceil(monthInFY / 3);

  const now = new Date();
  const currentFYStart = now.getMonth() < 3
    ? new Date(now.getFullYear() - 1, 3, 1)
    : new Date(now.getFullYear(), 3, 1);
  const currentFYEnd = new Date(currentFYStart.getFullYear() + 1, 2, 31);

  return {
    code: `${fyStartYear}-${fyEndYear}`,
    startDate,
    endDate,
    isCurrentFY: date >= currentFYStart && date <= currentFYEnd,
    quarter,
    monthInFY,
  };
}

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry",
  "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu",
  "Lakshadweep", "Andaman and Nicobar Islands",
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];
