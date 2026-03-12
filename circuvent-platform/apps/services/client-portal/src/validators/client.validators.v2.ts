// ──────────────────────────────────────────────────────────────
// Client Portal — Comprehensive Zod Validators (Phase 2)
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const createClientSchemaV2 = z.object({
  userId: z.string().cuid(),
  companyName: z.string().min(2, "Company name required").max(300),
  industry: z.string().max(200).optional(),
  website: z.string().url("Invalid website URL").optional().nullable().or(z.literal("")),
  country: z.string().min(2).max(100).default("India"),
  preferredCurrency: z.string().length(3).default("INR"),
  taxId: z.string().optional().nullable().refine(
    (val) => !val || gstRegex.test(val) || val.length <= 20,
    { message: "Invalid GST number format" }
  ),
  billingAddress: z.string().max(1000).optional(),
  contactPhone: z.string().max(20).optional(),
});

export const createLeadSchemaV2 = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(300),
  description: z.string().max(2000).optional(),
  clientId: z.string().cuid().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  source: z.enum(["WEBSITE", "REFERRAL", "LINKEDIN", "CONFERENCE", "COLD_OUTREACH", "PARTNER", "INBOUND_CALL", "OTHER"]).default("OTHER"),
  estimatedValue: z.number().nonnegative("Value cannot be negative").max(10000000000, "Value exceeds ₹1000 crore").optional(),
  currency: z.string().length(3).default("INR"),
  probability: z.number().int().min(0, "Probability 0-100").max(100, "Probability 0-100").optional(),
  expectedCloseDate: z.string().refine((v) => !v || !isNaN(Date.parse(v)), "Invalid date").optional(),
  tags: z.array(z.string().max(50)).max(10, "Maximum 10 tags").default([]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
}).refine(
  (data) => {
    if (data.estimatedValue && data.estimatedValue > 0 && !data.probability) {
      return true; // Warning, not error
    }
    return true;
  }
);

export const createInvoiceSchemaV2 = z.object({
  clientId: z.string().cuid("Invalid client ID"),
  title: z.string().min(3, "Title must be at least 3 characters").max(300),
  description: z.string().max(2000).optional(),
  dueDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid due date").refine(
    (v) => new Date(v) > new Date(),
    "Due date must be in the future"
  ),
  currency: z.string().length(3).default("INR"),
  exchangeRate: z.number().positive("Exchange rate must be positive").default(1),
  taxRate: z.number().min(0, "Tax rate cannot be negative").max(28, "GST rate cannot exceed 28%").default(18),
  discount: z.number().nonnegative("Discount cannot be negative").default(0),
  notes: z.string().max(2000).optional(),
  termsConditions: z.string().max(5000).optional(),
  isInterState: z.boolean().default(false),
  lineItems: z.array(z.object({
    description: z.string().min(1, "Description required").max(500),
    quantity: z.number().positive("Quantity must be positive").max(999999),
    unitPrice: z.number().nonnegative("Unit price cannot be negative").max(100000000, "Price exceeds limit"),
    taxable: z.boolean().default(true),
    hsnCode: z.string().max(10).optional(),
    sacCode: z.string().max(10).optional(),
  })).min(1, "At least one line item required").max(100, "Maximum 100 line items"),
}).refine(
  (data) => {
    const subtotal = data.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    return data.discount <= subtotal;
  },
  { message: "Discount cannot exceed subtotal", path: ["discount"] }
);

export const recordPaymentSchemaV2 = z.object({
  amount: z.number().positive("Payment amount must be positive"),
  paymentMethod: z.enum([
    "BANK_TRANSFER", "UPI", "NEFT", "RTGS", "CHEQUE", "CASH",
    "CREDIT_CARD", "DEBIT_CARD", "WIRE_TRANSFER", "PAYPAL", "OTHER",
  ]).optional(),
  paymentRef: z.string().max(100, "Reference too long").optional(),
  paymentDate: z.string().refine((v) => !v || !isNaN(Date.parse(v)), "Invalid date").optional(),
  notes: z.string().max(500).optional(),
});

export const leadActivitySchema = z.object({
  type: z.enum(["call", "email", "meeting", "note", "demo", "proposal", "followup"]),
  title: z.string().min(1, "Title required").max(300),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().refine((v) => !v || !isNaN(Date.parse(v)), "Invalid date").optional(),
  duration: z.number().int().positive().max(480, "Duration max 8 hours in minutes").optional(),
  outcome: z.string().max(500).optional(),
});

export const updateLeadStatusSchemaV2 = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]),
  reason: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.status === "LOST" && !data.reason) return false;
    return true;
  },
  { message: "Reason required when marking lead as LOST", path: ["reason"] }
);
