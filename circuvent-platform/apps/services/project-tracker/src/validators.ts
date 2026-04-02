// ──────────────────────────────────────────────────────────────
// Project Tracker — Zod Validation Schemas
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  description: z.string().max(2000).optional(),
  type: z.enum(["SOFTWARE", "HARDWARE", "HYBRID"]),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  budget: z.number().positive().optional(),
  budgetCurrency: z.string().length(3).default("INR"),
  isRnD: z.boolean().default(false),
  rnDCategory: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]).optional(),
});

export const createSprintSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(1).max(200),
  goal: z.string().max(1000).optional(),
  startDate: z.string(),
  endDate: z.string(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  description: z.string().max(5000).optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  storyPoints: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string()).default([]),
  isRnDRelated: z.boolean().default(false),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]).optional(),
});

export const createRevisionSchema = z.object({
  projectId: z.string().cuid(),
  revisionCode: z.string().min(1).max(20),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  schematicUrl: z.string().url().optional(),
  pcbLayoutUrl: z.string().url().optional(),
  isRnDRelated: z.boolean().default(false),
});

export const createBOMItemSchema = z.object({
  partNumber: z.string().min(1).max(100),
  partName: z.string().min(1).max(300),
  description: z.string().max(1000).optional(),
  manufacturer: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  currency: z.string().length(3).default("INR"),
  leadTimeDays: z.number().int().nonnegative().optional(),
  category: z.string().max(100).optional(),
  isRnDComponent: z.boolean().default(false),
});

export const addMemberSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(["lead", "member", "reviewer"]).default("member"),
});
