// ──────────────────────────────────────────────────────────────
// Client Portal — Validation Schemas
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

export const createClientSchema = z.object({
  userId: z.string().cuid(),
  companyName: z.string().min(1).max(300),
  industry: z.string().max(200).optional(),
  website: z.string().url().optional().nullable(),
  country: z.string().max(100).default("India"),
  preferredCurrency: z.string().length(3).default("INR"),
  taxId: z.string().max(50).optional(),
  billingAddress: z.string().max(1000).optional(),
});

export const createLeadSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().max(2000).optional(),
  clientId: z.string().cuid().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  source: z.enum(["WEBSITE", "REFERRAL", "LINKEDIN", "CONFERENCE", "COLD_OUTREACH", "OTHER"]).default("OTHER"),
  estimatedValue: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("INR"),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const updateLeadStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"]),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().cuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  dueDate: z.string(),
  currency: z.string().length(3).default("INR"),
  exchangeRate: z.number().positive().default(1),
  taxRate: z.number().min(0).max(100).default(18),
  discount: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional(),
  termsConditions: z.string().max(5000).optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    taxable: z.boolean().default(true),
  })).min(1, "At least one line item required"),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive("Payment amount must be positive"),
  paymentMethod: z.string().optional(),
  paymentRef: z.string().optional(),
});

export const createActivitySchema = z.object({
  type: z.enum(["call", "email", "meeting", "note"]),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  scheduledAt: z.string().datetime().optional(),
});
