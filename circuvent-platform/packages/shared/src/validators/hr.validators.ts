// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared HR Validators
// Reusable validation schemas for employee, payroll,
// leave, and compliance data across services.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Indian Document Validators ──

const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export const employeeCodeSchema = z.string()
  .regex(/^CIR-EMP-\d{3,6}$/, "Employee code must be CIR-EMP-XXX format");

export const designationSchema = z.string()
  .min(2, "Designation min 2 chars").max(200);

export const departmentSchema = z.string()
  .min(1, "Department required").max(200);

export const employmentTypeSchema = z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]);

export const payFrequencySchema = z.enum(["MONTHLY", "BI_WEEKLY"]);

export const salarySchema = z.number()
  .positive("Salary must be positive")
  .max(100000000, "Salary exceeds ₹10 crore limit");

// ── Leave Validators ──

export const leaveTypeSchema = z.enum([
  "CASUAL", "SICK", "EARNED", "MATERNITY", "PATERNITY",
  "COMPENSATORY", "BEREAVEMENT", "UNPAID",
]);

export const leaveStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

export const leaveRequestSchema = z.object({
  employeeId: z.string().cuid(),
  leaveType: leaveTypeSchema,
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid date"),
  reason: z.string().max(500).optional(),
  approverId: z.string().cuid(),
  isHalfDay: z.boolean().default(false),
  halfDayType: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional(),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  { message: "End date must be on or after start date", path: ["endDate"] }
).refine(
  (data) => {
    if (data.isHalfDay && !data.halfDayType) return false;
    return true;
  },
  { message: "Half day type required when half day is selected", path: ["halfDayType"] }
).refine(
  (data) => {
    if (data.isHalfDay && data.startDate !== data.endDate) return false;
    return true;
  },
  { message: "Half day must be for a single date", path: ["endDate"] }
);

// ── Tax Regime ──

export const taxRegimeSchema = z.enum(["OLD", "NEW"]);

export const financialYearSchema = z.string()
  .regex(/^\d{4}-\d{4}$/, "Format: YYYY-YYYY")
  .refine((v) => {
    const [s, e] = v.split("-").map(Number);
    return e === s + 1;
  }, "End year must be start year + 1");

// ── Salary Components ──

export const salaryComponentSchema = z.enum([
  "BASIC", "HRA", "DA", "SPECIAL_ALLOWANCE",
  "CONVEYANCE", "MEDICAL", "LTA", "BONUS",
  "PF_EMPLOYEE", "PF_EMPLOYER", "ESI_EMPLOYEE", "ESI_EMPLOYER",
  "PROFESSIONAL_TAX", "TDS", "OTHER_DEDUCTION",
  "OTHER_EARNING",
]);

export const salarySlipQuerySchema = z.object({
  employeeId: z.string().cuid().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2050).optional(),
  isPaid: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ── Expense Categories ──

export const expenseCategorySchema = z.enum([
  "TRAVEL", "EQUIPMENT", "SOFTWARE_LICENSE", "COMPONENTS",
  "CONFERENCE", "TRAINING", "OFFICE_SUPPLIES", "CLOUD_SERVICES",
  "PROTOTYPE", "TESTING", "CONSULTING", "MEALS",
  "ACCOMMODATION", "FUEL", "COURIER", "PRINTING",
  "MAINTENANCE", "INSURANCE", "LEGAL", "OTHER",
]);

export const rndCategorySchema = z.enum([
  "SOFTWARE_DEVELOPMENT", "HARDWARE_PROTOTYPING", "IOT_FIRMWARE",
  "AI_ML_RESEARCH", "COMPONENT_PROCUREMENT", "TESTING_VALIDATION",
  "DESIGN_ENGINEERING",
]);

// ── Approval Workflow ──

export const approvalLevelSchema = z.number().int().min(1).max(5);

export const approvalActionSchemaShared = z.enum([
  "APPROVED", "REJECTED", "ESCALATED", "RETURNED",
]);

// ── Department Search ──

export const employeeSearchSchema = z.object({
  search: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  employmentType: employmentTypeSchema.optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  sortBy: z.enum(["createdAt", "employeeCode", "designation", "department", "dateOfJoining", "baseSalary"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// ── Payroll Batch ──

export const payrollBatchSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2050),
  state: z.string().min(2).max(100).default("Karnataka"),
  regime: taxRegimeSchema.default("NEW"),
  includeInactive: z.boolean().default(false),
});

// ── Compliance ──

export const complianceQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2050).optional(),
  type: z.enum(["EPF", "ESI", "TDS", "PT", "ALL"]).default("ALL"),
});

// ── Leave Balance Query ──

export const leaveBalanceQuerySchema = z.object({
  employeeId: z.string().cuid(),
  financialYear: financialYearSchema.optional(),
  includeHistory: z.enum(["true", "false"]).default("false"),
});
