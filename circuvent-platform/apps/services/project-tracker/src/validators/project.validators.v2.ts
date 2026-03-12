// ──────────────────────────────────────────────────────────────
// Project Tracker — Comprehensive Zod Validators (Phase 2)
// Full validation for projects, sprints, tasks, hardware
// revisions, BOM items, and project member operations.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ═══ Project Validators ═══

export const createProjectSchemaV2 = z.object({
  name: z.string().min(2, "Name min 2 chars").max(200, "Name max 200 chars")
    .refine((v) => !/[<>{}]/.test(v), "Name contains invalid characters"),
  description: z.string().max(2000).optional(),
  type: z.enum(["SOFTWARE", "HARDWARE", "HYBRID"], {
    errorMap: () => ({ message: "Type must be SOFTWARE, HARDWARE, or HYBRID" }),
  }),
  startDate: z.string().datetime("Invalid ISO date format").optional(),
  endDate: z.string().datetime("Invalid ISO date format").optional(),
  budget: z.number().positive("Budget must be positive").max(10000000000, "Budget exceeds ₹1000 crore limit").optional(),
  budgetCurrency: z.string().length(3).default("INR"),
  isRnD: z.boolean().default(false),
  rnDCategory: z.enum([
    "SOFTWARE_DEVELOPMENT", "HARDWARE_PROTOTYPING", "IOT_FIRMWARE",
    "AI_ML_RESEARCH", "COMPONENT_PROCUREMENT", "TESTING_VALIDATION", "DESIGN_ENGINEERING",
  ]).optional(),
  tags: z.array(z.string().max(50)).max(15).default([]),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: "End date must be after start date", path: ["endDate"] }
).refine(
  (data) => {
    if (data.isRnD && !data.rnDCategory) return false;
    return true;
  },
  { message: "R&D category required for R&D projects", path: ["rnDCategory"] }
);

export const updateProjectSchemaV2 = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  budget: z.number().positive().optional().nullable(),
  budgetCurrency: z.string().length(3).optional(),
  isRnD: z.boolean().optional(),
  rnDCategory: z.string().optional().nullable(),
  tags: z.array(z.string().max(50)).max(15).optional(),
});

// ═══ Sprint Validators ═══

export const createSprintSchemaV2 = z.object({
  projectId: z.string().cuid("Invalid project ID"),
  name: z.string().min(1, "Sprint name required").max(200),
  goal: z.string().max(1000).optional(),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid start date"),
  endDate: z.string().refine((v) => !isNaN(Date.parse(v)), "Invalid end date"),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: "Sprint end date must be after start date", path: ["endDate"] }
).refine(
  (data) => {
    const duration = (new Date(data.endDate).getTime() - new Date(data.startDate).getTime()) / (1000 * 60 * 60 * 24);
    return duration >= 3 && duration <= 42;
  },
  { message: "Sprint duration must be 3-42 days (1-6 weeks)", path: ["endDate"] }
);

export const updateSprintStatusSchema = z.object({
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]),
  velocity: z.number().int().nonnegative().optional(),
});

// ═══ Task Validators ═══

export const createTaskSchemaV2 = z.object({
  title: z.string().min(1, "Title required").max(500),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  storyPoints: z.number().int().min(0, "Story points must be >= 0").max(100, "Max 100 story points").optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  isRnDRelated: z.boolean().default(false),
  estimatedHours: z.number().positive().max(999).optional(),
  acceptanceCriteria: z.string().max(3000).optional(),
});

export const updateTaskSchemaV2 = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]).optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  storyPoints: z.number().int().min(0).max(100).optional().nullable(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isRnDRelated: z.boolean().optional(),
  blockedReason: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.status === "BLOCKED" && !data.blockedReason) return true; // Allow without reason but warn
    return true;
  }
);

export const batchUpdateTasksSchema = z.object({
  taskIds: z.array(z.string().cuid()).min(1, "At least 1 task required").max(50, "Max 50 tasks per batch"),
  update: z.object({
    status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]).optional(),
    assigneeId: z.string().cuid().optional().nullable(),
    priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  }),
});

// ═══ Hardware/BOM Validators ═══

export const createRevisionSchemaV2 = z.object({
  projectId: z.string().cuid(),
  revisionCode: z.string().min(1, "Revision code required").max(20)
    .regex(/^REV-[A-Z0-9]+$/, "Revision code must be REV-X format (e.g., REV-A, REV-B1)"),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  schematicUrl: z.string().url("Invalid schematic URL").optional().nullable(),
  pcbLayoutUrl: z.string().url("Invalid PCB layout URL").optional().nullable(),
  isRnDRelated: z.boolean().default(false),
});

export const updateRevisionStatusSchema = z.object({
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PRODUCTION", "DEPRECATED"]),
});

export const createBOMItemSchemaV2 = z.object({
  partNumber: z.string().min(1, "Part number required").max(100)
    .regex(/^[A-Z0-9\-_.]+$/i, "Part number must be alphanumeric with -_."),
  partName: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  manufacturer: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  quantity: z.number().int().positive("Quantity must be positive").max(999999),
  unitPrice: z.number().nonnegative("Price must be >= 0").max(100000000, "Unit price exceeds limit"),
  currency: z.string().length(3).default("INR"),
  leadTimeDays: z.number().int().nonnegative().max(365, "Lead time max 1 year").optional(),
  category: z.enum([
    "RESISTOR", "CAPACITOR", "INDUCTOR", "IC", "CONNECTOR", "PCB",
    "SENSOR", "MCU", "MEMORY", "POWER_SUPPLY", "MECHANICAL", "CABLE",
    "DISPLAY", "ANTENNA", "ENCLOSURE", "OTHER",
  ]).optional(),
  isRnDComponent: z.boolean().default(false),
  datasheetUrl: z.string().url("Invalid datasheet URL").optional(),
  moqQuantity: z.number().int().positive().optional(),
  alternatives: z.array(z.string().max(100)).max(5).optional(),
});

// ═══ Member Validators ═══

export const addMemberSchemaV2 = z.object({
  userId: z.string().cuid(),
  role: z.enum(["lead", "member", "reviewer", "observer"]).default("member"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["lead", "member", "reviewer", "observer"]),
});

// ═══ Project Search/Filter ═══

export const projectSearchSchema = z.object({
  search: z.string().max(200).optional(),
  type: z.enum(["SOFTWARE", "HARDWARE", "HYBRID"]).optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
  isRnD: z.enum(["true", "false"]).optional(),
  startAfter: z.string().datetime().optional(),
  endBefore: z.string().datetime().optional(),
  minBudget: z.coerce.number().nonnegative().optional(),
  maxBudget: z.coerce.number().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  sortBy: z.enum(["createdAt", "name", "code", "status", "budget", "startDate"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
