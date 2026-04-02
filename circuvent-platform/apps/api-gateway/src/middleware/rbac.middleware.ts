// ──────────────────────────────────────────────────────────────
// Circuvent Platform — RBAC Middleware
// Comprehensive role-based and permission-based access control
// for all API endpoints. Supports role checks, permission
// matrices, ownership validation, department-scoping, and
// audit logging of access attempts.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import { verifyAccessToken } from "@circuvent/auth";
import { HTTP_STATUS } from "@circuvent/shared";
import {
  PlatformRole,
  PermissionModule,
  ModulePermission,
  ROLE_PERMISSIONS,
} from "@circuvent/shared/src/rbac/permissions";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type PermissionAction = keyof ModulePermission; // "read" | "create" | "update" | "delete" | "approve" | "export"

export type EntityType =
  | "employee"
  | "leave"
  | "expense"
  | "salary_slip"
  | "project"
  | "task"
  | "device"
  | "client"
  | "lead"
  | "job"
  | "application";

export interface AccessLogEntry {
  userId: string;
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
  timestamp: string;
  ip?: string;
  reason?: string;
}

// ══════════════════════════════════════════════════════════════
// Extend Express Request
// ══════════════════════════════════════════════════════════════

// Express Request user type is declared in @circuvent/auth middleware

// ══════════════════════════════════════════════════════════════
// Permission Matrix
// (maps entity types to permission modules for ownership checks)
// ══════════════════════════════════════════════════════════════

const ENTITY_MODULE_MAP: Record<EntityType, PermissionModule> = {
  employee: "hr_employees",
  leave: "hr_leave",
  expense: "hr_expenses",
  salary_slip: "hr_payroll",
  project: "projects",
  task: "projects",
  device: "iot",
  client: "clients",
  lead: "clients",
  job: "recruitment",
  application: "recruitment",
};

/** Admin-level roles with elevated privileges. */
const ADMIN_ROLES: PlatformRole[] = ["ADMIN", "SUPER_ADMIN"];

/** HR roles with people-management access. */
const HR_ROLES: PlatformRole[] = ["ADMIN", "SUPER_ADMIN", "HR_MANAGER"];

/** Management roles that can approve requests. */
const MANAGER_ROLES: PlatformRole[] = ["ADMIN", "SUPER_ADMIN", "HR_MANAGER", "MANAGER", "PRODUCT_MANAGER", "CEO"];

// ══════════════════════════════════════════════════════════════
// Core Middleware
// ══════════════════════════════════════════════════════════════

/**
 * Authenticate a request by verifying the JWT Bearer token.
 * Attaches decoded user payload to `req.user`.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logAccess(req, "auth", "authenticate", false, "No Bearer token");
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: "Authentication required. Provide a valid Bearer token.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch {
    logAccess(req, "auth", "authenticate", false, "Invalid/expired token");
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: "Invalid or expired token.",
    });
  }
}

/**
 * Middleware factory: require the authenticated user to have one of the specified roles.
 *
 * Usage: `router.get("/admin", authenticate, requireRole("ADMIN", "SUPER_ADMIN"), handler)`
 */
export function requireRole(...roles: PlatformRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Authentication required" });
      return;
    }

    const userRole = req.user.role as PlatformRole;
    if (roles.includes(userRole)) {
      next();
      return;
    }

    logAccess(req, "role_check", `requireRole(${roles.join(",")})`, false, `User role ${userRole} not in allowed list`);
    res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: `Access denied. Required role(s): ${roles.join(", ")}`,
    });
  };
}

/**
 * Middleware factory: require a specific permission on a module.
 *
 * Usage: `router.post("/payroll", authenticate, requirePermission("hr_payroll", "create"), handler)`
 */
export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Authentication required" });
      return;
    }

    const userRole = req.user.role as PlatformRole;
    const permissions = ROLE_PERMISSIONS[userRole];

    if (!permissions) {
      logAccess(req, module, action, false, `Unknown role: ${userRole}`);
      res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, error: "Access denied. Unknown role." });
      return;
    }

    const modulePerm = permissions[module];
    if (modulePerm && modulePerm[action]) {
      next();
      return;
    }

    logAccess(req, module, action, false, `Role ${userRole} lacks ${action} on ${module}`);
    res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      error: `Access denied. You do not have '${action}' permission on '${module}'.`,
    });
  };
}

/**
 * Middleware factory: ensure the user owns the resource (or is admin/manager).
 * Looks up the entity's userId/ownerId and compares with req.user.userId.
 *
 * Usage: `router.get("/leave/:id", authenticate, requireOwnership("leave"), handler)`
 */
export function requireOwnership(entityType: EntityType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Authentication required" });
      return;
    }

    // Admins and HR bypass ownership check
    if (isAdmin(req) || isHR(req)) {
      next();
      return;
    }

    const entityId = req.params.id;
    if (!entityId) {
      next(); // No specific entity — let downstream handler deal with it
      return;
    }

    try {
      let ownerId: string | null = null;

      switch (entityType) {
        case "leave": {
          const leave = await prisma.leaveRecord.findUnique({
            where: { id: entityId },
            select: { employee: { select: { userId: true } } },
          });
          ownerId = leave?.employee?.userId || null;
          break;
        }
        case "expense": {
          const expense = await prisma.expenseClaim.findUnique({
            where: { id: entityId },
            select: { employee: { select: { userId: true } } },
          });
          ownerId = expense?.employee?.userId || null;
          break;
        }
        case "salary_slip": {
          const slip = await prisma.salarySlip.findUnique({
            where: { id: entityId },
            select: { employee: { select: { userId: true } } },
          });
          ownerId = slip?.employee?.userId || null;
          break;
        }
        case "project": {
          const projectMember = await prisma.projectMember.findFirst({
            where: { projectId: entityId },
            select: { userId: true },
          });
          ownerId = projectMember?.userId || null;
          break;
        }
        case "task": {
          const task = await prisma.sprintTask.findUnique({
            where: { id: entityId },
            select: { assigneeId: true },
          });
          ownerId = task?.assigneeId || null;
          break;
        }
        case "employee": {
          const emp = await prisma.employee.findUnique({
            where: { id: entityId },
            select: { userId: true },
          });
          ownerId = emp?.userId || null;
          break;
        }
        default:
          next();
          return;
      }

      if (!ownerId) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: `${entityType} not found` });
        return;
      }

      if (ownerId === req.user.userId) {
        next();
        return;
      }

      logAccess(req, entityType, "ownership_check", false, `User ${req.user.userId} is not owner (${ownerId})`);
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: "Access denied. You can only access your own resources.",
      });
    } catch (error) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Ownership verification failed" });
    }
  };
}

/**
 * Middleware factory: restrict access to users in a specific department.
 *
 * Usage: `router.get("/eng/metrics", authenticate, requireDepartment("Engineering"), handler)`
 */
export function requireDepartment(department: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: "Authentication required" });
      return;
    }

    // Admin bypasses department check
    if (isAdmin(req)) {
      next();
      return;
    }

    try {
      const employee = await prisma.employee.findFirst({
        where: { userId: req.user.userId },
        select: { department: true },
      });

      if (employee?.department?.toLowerCase() === department.toLowerCase()) {
        next();
        return;
      }

      logAccess(req, "department", department, false, `User department '${employee?.department}' ≠ required '${department}'`);
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: `Access restricted to ${department} department.`,
      });
    } catch {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: "Department check failed" });
    }
  };
}

// ══════════════════════════════════════════════════════════════
// Role Check Helpers
// ══════════════════════════════════════════════════════════════

/**
 * Check if the authenticated user is an admin or super_admin.
 */
export function isAdmin(req: Request): boolean {
  return ADMIN_ROLES.includes(req.user?.role as PlatformRole);
}

/**
 * Check if the authenticated user is an HR_MANAGER.
 */
export function isHR(req: Request): boolean {
  return HR_ROLES.includes(req.user?.role as PlatformRole);
}

/**
 * Check if the authenticated user is a manager-level role.
 */
export function isManager(req: Request): boolean {
  return MANAGER_ROLES.includes(req.user?.role as PlatformRole);
}

/**
 * Check if the user can approve a specific entity type.
 * Managers can approve leave/expenses for their reports.
 * HR/Admin can approve anything.
 */
export function canApprove(req: Request, entityType: EntityType): boolean {
  if (!req.user) return false;
  const role = req.user.role as PlatformRole;

  // Admin and HR can approve anything
  if (ADMIN_ROLES.includes(role) || role === "HR_MANAGER") return true;

  // Managers can approve leave and expenses
  if (MANAGER_ROLES.includes(role)) {
    return ["leave", "expense", "application"].includes(entityType);
  }

  // Module-specific permission check
  const module = ENTITY_MODULE_MAP[entityType];
  if (!module) return false;

  const perms = ROLE_PERMISSIONS[role];
  return perms?.[module]?.approve === true;
}

// ══════════════════════════════════════════════════════════════
// Audit Logging
// ══════════════════════════════════════════════════════════════

/**
 * Log an access attempt for audit purposes.
 * Records who accessed what, whether it was allowed, and why.
 */
export function logAccess(
  req: Request,
  resource: string,
  action: string,
  allowed: boolean,
  reason?: string
): void {
  const entry: AccessLogEntry = {
    userId: req.user?.userId || "anonymous",
    role: req.user?.role || "unknown",
    resource,
    action,
    allowed,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress,
    reason,
  };

  // In production, this would write to a dedicated audit table or log stream.
  // For now, structured console logging for observability.
  if (!allowed) {
    console.warn(`[RBAC] ACCESS DENIED: ${entry.userId} (${entry.role}) → ${entry.resource}/${entry.action} — ${entry.reason || "no reason"}`);
  }
}
