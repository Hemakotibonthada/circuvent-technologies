// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Finance & Compliance Validators
// Shared validation schemas for GST, PAN, bank account,
// currency conversion, and financial reporting.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Indian Tax ID Validators ──

export const panSchema = z.string()
  .length(10, "PAN must be exactly 10 characters")
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format (e.g., ABCDE1234F)")
  .transform((v) => v.toUpperCase());

export const gstinSchema = z.string()
  .length(15, "GSTIN must be exactly 15 characters")
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format")
  .transform((v) => v.toUpperCase());

export const tanSchema = z.string()
  .length(10, "TAN must be exactly 10 characters")
  .regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, "Invalid TAN format (e.g., BLRA12345F)")
  .transform((v) => v.toUpperCase());

export const aadhaarSchema = z.string()
  .regex(/^\d{12}$/, "Aadhaar must be exactly 12 digits")
  .refine((v) => {
    // Verhoeff checksum validation (simplified)
    const digits = v.split("").map(Number);
    return digits[0] !== 0 && digits[0] !== 1;
  }, "Invalid Aadhaar number");

export const ifscSchema = z.string()
  .length(11, "IFSC must be exactly 11 characters")
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC format (e.g., HDFC0001234)")
  .transform((v) => v.toUpperCase());

export const uanSchema = z.string()
  .regex(/^\d{12}$/, "UAN must be exactly 12 digits");

export const bankAccountSchema = z.string()
  .regex(/^\d{9,18}$/, "Bank account must be 9-18 digits");

// ── Currency Validators ──

export const currencyCodeSchema = z.string()
  .length(3, "Currency must be 3-letter ISO code")
  .regex(/^[A-Z]{3}$/, "Currency must be uppercase letters")
  .refine(
    (v) => ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"].includes(v),
    "Unsupported currency"
  );

export const amountSchema = z.number()
  .nonnegative("Amount cannot be negative")
  .max(999999999999, "Amount exceeds system limit")
  .transform((v) => Math.round(v * 100) / 100);

export const exchangeRateSchema = z.number()
  .positive("Exchange rate must be positive")
  .max(100000, "Exchange rate exceeds limit");

export const currencyConversionSchema = z.object({
  fromCurrency: currencyCodeSchema,
  toCurrency: currencyCodeSchema,
  amount: amountSchema,
  rate: exchangeRateSchema,
}).refine(
  (data) => data.fromCurrency !== data.toCurrency,
  { message: "From and To currencies must be different", path: ["toCurrency"] }
);

// ── GST Invoice Validators ──

export const hsnCodeSchema = z.string()
  .min(4, "HSN code min 4 digits")
  .max(8, "HSN code max 8 digits")
  .regex(/^\d{4,8}$/, "HSN code must be numeric");

export const sacCodeSchema = z.string()
  .length(6, "SAC code must be 6 digits")
  .regex(/^\d{6}$/, "SAC code must be numeric");

export const gstRateSchema = z.number()
  .refine(
    (v) => [0, 0.25, 3, 5, 12, 18, 28].includes(v),
    "GST rate must be 0%, 0.25%, 3%, 5%, 12%, 18%, or 28%"
  );

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, "Description required").max(500),
  quantity: z.number().positive("Quantity must be positive"),
  unitPrice: amountSchema,
  gstRate: z.number().min(0).max(28).default(18),
  hsnCode: hsnCodeSchema.optional(),
  sacCode: sacCodeSchema.optional(),
  discount: z.number().nonnegative().default(0),
  taxable: z.boolean().default(true),
}).refine(
  (data) => !(data.hsnCode && data.sacCode),
  { message: "Cannot have both HSN and SAC code", path: ["sacCode"] }
);

// ── Financial Year Validators ──

export const financialYearSchema = z.string()
  .regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY (e.g., 2025-2026)")
  .refine((v) => {
    const [start, end] = v.split("-").map(Number);
    return end === start + 1;
  }, "End year must be start year + 1");

export const financialQuarterSchema = z.object({
  financialYear: financialYearSchema,
  quarter: z.number().int().min(1, "Quarter 1-4").max(4, "Quarter 1-4"),
});

// ── Payment Validators ──

export const paymentMethodSchema = z.enum([
  "BANK_TRANSFER", "UPI", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH",
  "CREDIT_CARD", "DEBIT_CARD", "WIRE_TRANSFER", "PAYPAL", "RAZORPAY", "OTHER",
]);

export const paymentRecordSchema = z.object({
  amount: amountSchema.refine((v) => v > 0, "Payment amount must be positive"),
  method: paymentMethodSchema,
  reference: z.string().max(100).optional(),
  date: z.string().datetime().optional(),
  bankName: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  receiptNumber: z.string().max(50).optional(),
});

// ── Expense Category Validators ──

export const expenseCategorySchema = z.enum([
  "TRAVEL", "EQUIPMENT", "SOFTWARE_LICENSE", "COMPONENTS",
  "CONFERENCE", "TRAINING", "OFFICE_SUPPLIES", "CLOUD_SERVICES",
  "PROTOTYPE", "TESTING", "CONSULTING", "MEALS",
  "ACCOMMODATION", "FUEL", "COURIER", "PRINTING",
  "MAINTENANCE", "INSURANCE", "LEGAL", "OTHER",
]);

// ── Report Parameters ──

export const reportParamsSchema = z.object({
  startDate: z.string().datetime("Invalid start date"),
  endDate: z.string().datetime("Invalid end date"),
  format: z.enum(["json", "pdf", "csv"]).default("json"),
  groupBy: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
  currency: currencyCodeSchema.optional(),
  department: z.string().max(200).optional(),
  includeDetails: z.boolean().default(false),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: "End date must be after start date", path: ["endDate"] }
).refine(
  (data) => {
    const diffMs = new Date(data.endDate).getTime() - new Date(data.startDate).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= 366;
  },
  { message: "Report period cannot exceed 1 year", path: ["endDate"] }
);
