// ──────────────────────────────────────────────────────────────
// RBAC Guard — Fine-Grained Permission Checking
// Goes beyond role checks to support resource-level and
// action-level permissions for enterprise scenarios.
// ──────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { Role } from "@circuvent/shared";

type Permission =
  | "projects:read" | "projects:write" | "projects:delete" | "projects:manage_members"
  | "sprints:read" | "sprints:write" | "sprints:delete"
  | "hardware:read" | "hardware:write" | "hardware:approve"
  | "iot:read" | "iot:write" | "iot:command" | "iot:decommission"
  | "telemetry:read" | "telemetry:write" | "telemetry:export"
  | "hr:read" | "hr:write" | "hr:payroll" | "hr:approve_expense" | "hr:approve_leave"
  | "clients:read" | "clients:write"
  | "leads:read" | "leads:write" | "leads:assign"
  | "invoices:read" | "invoices:write" | "invoices:payment"
  | "ai:read" | "ai:manage_resources" | "ai:submit_job" | "ai:manage_bots"
  | "audit:read" | "audit:export"
  | "admin:users" | "admin:system" | "admin:statutory";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: [
    "projects:read", "projects:write", "projects:delete", "projects:manage_members",
    "sprints:read", "sprints:write", "sprints:delete",
    "hardware:read", "hardware:write", "hardware:approve",
    "iot:read", "iot:write", "iot:command", "iot:decommission",
    "telemetry:read", "telemetry:write", "telemetry:export",
    "hr:read", "hr:write", "hr:payroll", "hr:approve_expense", "hr:approve_leave",
    "clients:read", "clients:write",
    "leads:read", "leads:write", "leads:assign",
    "invoices:read", "invoices:write", "invoices:payment",
    "ai:read", "ai:manage_resources", "ai:submit_job", "ai:manage_bots",
    "audit:read", "audit:export",
    "admin:users", "admin:system", "admin:statutory",
  ],
  ENGINEER: [
    "projects:read", "projects:write",
    "sprints:read", "sprints:write",
    "hardware:read", "hardware:write",
    "iot:read", "iot:write", "iot:command",
    "telemetry:read", "telemetry:write",
    "hr:read",
    "ai:read", "ai:submit_job",
    "audit:read",
  ],
  CLIENT: [
    "projects:read",
    "clients:read",
    "leads:read",
    "invoices:read",
  ],
};

export function hasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 1001, message: "Authentication required" } });
      return;
    }

    const userRole = user.role as string;
    const hasAll = permissions.every((p) => hasPermission(userRole, p));

    if (!hasAll) {
      res.status(403).json({
        success: false,
        error: {
          code: 1006,
          message: `Missing permissions: ${permissions.filter((p) => !hasPermission(userRole, p)).join(", ")}`,
        },
      });
      return;
    }

    next();
  };
}

export function requireAny(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 1001, message: "Authentication required" } });
      return;
    }

    const userRole = user.role as string;
    const hasAny = permissions.some((p) => hasPermission(userRole, p));

    if (!hasAny) {
      res.status(403).json({
        success: false,
        error: { code: 1006, message: "Insufficient permissions" },
      });
      return;
    }

    next();
  };
}
