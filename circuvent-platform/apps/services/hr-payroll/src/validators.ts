// ──────────────────────────────────────────────────────────────
// HR & Payroll — Validation Schemas
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

export const createEmployeeSchema = z.object({
  userId: z.string().cuid(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]).default("FULL_TIME"),
  designation: z.string().min(1).max(200),
  department: z.string().min(1).max(200),
  dateOfJoining: z.string(),
  baseSalary: z.number().positive("Salary must be positive"),
  currency: z.string().length(3).default("INR"),
  payFrequency: z.enum(["MONTHLY", "BI_WEEKLY"]).default("MONTHLY"),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format").optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),
  uanNumber: z.string().optional().nullable(),
  bankAccountNo: z.string().optional().nullable(),
  bankIFSC: z.string().optional().nullable(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const generateSalarySchema = z.object({
  employeeId: z.string().cuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2050),
  bonus: z.number().nonnegative().default(0),
});

export const bulkSalarySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2050),
});

export const createExpenseSchema = z.object({
  employeeId: z.string().cuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  isRnDExpense: z.boolean().default(false),
  rnDCategory: z.string().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().length(3).default("INR"),
    receiptUrl: z.string().url().optional(),
    bomItemId: z.string().cuid().optional().nullable(),
    isRnDRelated: z.boolean().default(false),
  })).min(1, "At least one expense item is required"),
});

export const leaveRequestSchema = z.object({
  employeeId: z.string().cuid(),
  leaveType: z.enum(["CASUAL", "SICK", "EARNED", "MATERNITY", "PATERNITY", "UNPAID"]),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number().positive(),
  reason: z.string().max(500).optional(),
});

export const taxDeclarationSchema = z.object({
  employeeId: z.string().cuid(),
  financialYear: z.string(),
  regime: z.enum(["OLD", "NEW"]).default("NEW"),
  section80C: z.number().nonnegative().default(0),
  section80D: z.number().nonnegative().default(0),
  section24: z.number().nonnegative().default(0),
  hra_exemption: z.number().nonnegative().default(0),
  otherExemptions: z.number().nonnegative().default(0),
});
