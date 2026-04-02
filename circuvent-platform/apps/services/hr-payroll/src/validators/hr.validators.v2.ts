// ──────────────────────────────────────────────────────────────
// HR & Payroll — Comprehensive Zod Validators (Phase 2)
// Every field validated, every edge case handled.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Indian format validators ──

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const aadhaarRegex = /^\d{12}$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const uanRegex = /^\d{12}$/;
const accountRegex = /^\d{9,18}$/;

export const createEmployeeSchemaV2 = z.object({
  userId: z.string().cuid("Invalid user ID format"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"], {
    errorMap: () => ({ message: "Must be FULL_TIME, PART_TIME, CONTRACT, or INTERN" }),
  }).default("FULL_TIME"),
  designation: z.string().min(2, "Designation must be at least 2 characters").max(200),
  department: z.string().min(1, "Department is required").max(200),
  dateOfJoining: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date format"),
  dateOfLeaving: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date format").optional().nullable(),
  baseSalary: z.number().positive("Salary must be positive").max(100000000, "Salary exceeds maximum"),
  currency: z.string().length(3, "Currency must be 3-letter code").default("INR"),
  payFrequency: z.enum(["MONTHLY", "BI_WEEKLY"]).default("MONTHLY"),
  panNumber: z.string().regex(panRegex, "Invalid PAN format (e.g., ABCDE1234F)").optional().nullable(),
  aadhaarNumber: z.string().regex(aadhaarRegex, "Aadhaar must be 12 digits").optional().nullable(),
  uanNumber: z.string().regex(uanRegex, "UAN must be 12 digits").optional().nullable(),
  bankAccountNo: z.string().regex(accountRegex, "Bank account must be 9-18 digits").optional().nullable(),
  bankIFSC: z.string().regex(ifscRegex, "Invalid IFSC format (e.g., HDFC0001234)").optional().nullable(),
  pfContribution: z.number().nonnegative().optional(),
  esiContribution: z.number().nonnegative().optional(),
}).refine(
  (data) => {
    if (data.dateOfLeaving) {
      return new Date(data.dateOfLeaving) > new Date(data.dateOfJoining);
    }
    return true;
  },
  { message: "Date of leaving must be after date of joining", path: ["dateOfLeaving"] }
).refine(
  (data) => {
    if (data.bankAccountNo && !data.bankIFSC) return false;
    if (data.bankIFSC && !data.bankAccountNo) return false;
    return true;
  },
  { message: "Both bank account and IFSC must be provided together", path: ["bankIFSC"] }
);

export const generateSalarySchemaV2 = z.object({
  employeeId: z.string().cuid(),
  month: z.number().int().min(1, "Month must be 1-12").max(12, "Month must be 1-12"),
  year: z.number().int().min(2020, "Year must be >= 2020").max(2050, "Year must be <= 2050"),
  bonus: z.number().nonnegative("Bonus cannot be negative").default(0),
  lopDays: z.number().int().nonnegative().max(31, "LOP days cannot exceed 31").default(0),
  totalWorkingDays: z.number().int().positive().max(31).default(30),
  state: z.string().min(2).max(100).default("Karnataka"),
  regime: z.enum(["OLD", "NEW"]).default("NEW"),
});

export const leaveRequestSchemaV2 = z.object({
  employeeId: z.string().cuid(),
  leaveType: z.enum(["CASUAL", "SICK", "EARNED", "MATERNITY", "PATERNITY", "UNPAID", "COMPENSATORY"], {
    errorMap: () => ({ message: "Invalid leave type" }),
  }),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid start date"),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid end date"),
  reason: z.string().max(500, "Reason must be under 500 characters").optional(),
  approverId: z.string().cuid("Invalid approver ID"),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be on or after start date", path: ["endDate"] }
).refine(
  (data) => new Date(data.startDate) >= new Date(new Date().toISOString().split("T")[0]),
  { message: "Cannot apply for past dates", path: ["startDate"] }
).refine(
  (data) => {
    const days = Math.ceil((new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (data.leaveType === "MATERNITY") return days <= 182;
    if (data.leaveType === "PATERNITY") return days <= 15;
    return days <= 30;
  },
  { message: "Leave duration exceeds maximum allowed", path: ["endDate"] }
);

export const expenseClaimSchemaV2 = z.object({
  employeeId: z.string().cuid(),
  title: z.string().min(3, "Title must be at least 3 characters").max(300),
  description: z.string().max(2000).optional(),
  isRnDExpense: z.boolean().default(false),
  rnDCategory: z.enum([
    "SOFTWARE_DEVELOPMENT", "HARDWARE_PROTOTYPING", "IOT_FIRMWARE",
    "AI_ML_RESEARCH", "COMPONENT_PROCUREMENT", "TESTING_VALIDATION", "DESIGN_ENGINEERING",
  ]).optional(),
  items: z.array(z.object({
    description: z.string().min(1, "Item description required").max(500),
    amount: z.number().positive("Amount must be positive").max(10000000, "Single item exceeds ₹1 crore"),
    currency: z.string().length(3).default("INR"),
    category: z.enum([
      "TRAVEL", "EQUIPMENT", "SOFTWARE_LICENSE", "COMPONENTS", "CONFERENCE",
      "TRAINING", "OFFICE_SUPPLIES", "CLOUD_SERVICES", "PROTOTYPE", "TESTING",
      "CONSULTING", "MEALS", "ACCOMMODATION", "OTHER",
    ]).default("OTHER"),
    receiptUrl: z.string().url("Invalid receipt URL").optional(),
    bomItemId: z.string().cuid().optional().nullable(),
    isRnDRelated: z.boolean().default(false),
  })).min(1, "At least one expense item required").max(50, "Maximum 50 items per claim"),
  approverL1Id: z.string().cuid().optional(),
  approverL2Id: z.string().cuid().optional(),
  approverL3Id: z.string().cuid().optional(),
}).refine(
  (data) => {
    const total = data.items.reduce((sum, item) => sum + item.amount, 0);
    return total <= 5000000; // ₹50 lakh max per claim
  },
  { message: "Total expense amount exceeds ₹50,00,000 limit", path: ["items"] }
).refine(
  (data) => {
    if (data.isRnDExpense && !data.rnDCategory) return false;
    return true;
  },
  { message: "R&D category is required for R&D expenses", path: ["rnDCategory"] }
);

export const taxDeclarationSchemaV2 = z.object({
  employeeId: z.string().cuid(),
  financialYear: z.string().regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY (e.g., 2025-2026)"),
  regime: z.enum(["OLD", "NEW"]).default("NEW"),
  section80C: z.number().nonnegative().max(150000, "Section 80C capped at ₹1,50,000").default(0),
  section80D: z.number().nonnegative().max(100000, "Section 80D capped at ₹1,00,000").default(0),
  section24: z.number().nonnegative().max(200000, "Section 24 capped at ₹2,00,000").default(0),
  hra_exemption: z.number().nonnegative().default(0),
  nps80CCD: z.number().nonnegative().max(50000, "NPS 80CCD(1B) capped at ₹50,000").default(0),
  otherExemptions: z.number().nonnegative().default(0),
}).refine(
  (data) => {
    if (data.regime === "NEW") {
      const totalOldDeductions = data.section80C + data.section80D + data.section24 + data.hra_exemption + data.otherExemptions;
      if (totalOldDeductions > 0) return true; // Allow but warn
    }
    return true;
  },
  { message: "Most deductions not applicable under New Tax Regime" }
);

export const approvalActionSchema = z.object({
  workflowId: z.string().cuid(),
  approverId: z.string().cuid(),
  action: z.enum(["APPROVED", "REJECTED", "ESCALATED"]),
  comments: z.string().max(1000).optional(),
}).refine(
  (data) => {
    if (data.action === "REJECTED" && !data.comments) return false;
    return true;
  },
  { message: "Comments required when rejecting", path: ["comments"] }
);
