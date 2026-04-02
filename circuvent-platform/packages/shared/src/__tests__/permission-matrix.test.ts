// ──────────────────────────────────────────────────────────────
// PermissionMatrix — Test Suite
// Tests for role-based access control, permission checks,
// module access, data scoping, role hierarchy, approval flows.
// ──────────────────────────────────────────────────────────────

import {
  hasPermission,
  getDataScope,
  canApprove,
  getRoleLevel,
  isRoleHigherThan,
  getPermittedActions,
  getAccessibleModules,
} from "../utils/permission-matrix";

import type { Role, Module, Action } from "../utils/permission-matrix";

// Convenience aliases for test readability
const isRoleAbove = isRoleHigherThan;
const getModulePermissions = getPermittedActions;
const getAllowedModules = getAccessibleModules;

// ══════════════════════════════════════════════════════════════
// Permission Checks
// ══════════════════════════════════════════════════════════════

describe("Permission Checks", () => {
  it("should allow CEO to read all modules", () => {
    const modules: Module[] = ["EMPLOYEES", "PAYROLL", "LEAVE", "ATTENDANCE", "PROJECTS", "FINANCE"];
    for (const mod of modules) {
      expect(hasPermission("CEO", mod, "READ")).toBe(true);
    }
  });

  it("should allow ADMIN to have admin access", () => {
    expect(hasPermission("ADMIN", "SETTINGS", "ADMIN")).toBe(true);
    expect(hasPermission("ADMIN", "EMPLOYEES", "CREATE")).toBe(true);
  });

  it("should allow HR_MANAGER to manage employees", () => {
    expect(hasPermission("HR_MANAGER", "EMPLOYEES", "READ")).toBe(true);
    expect(hasPermission("HR_MANAGER", "EMPLOYEES", "CREATE")).toBe(true);
    expect(hasPermission("HR_MANAGER", "EMPLOYEES", "UPDATE")).toBe(true);
  });

  it("should allow EMPLOYEE to read own data", () => {
    expect(hasPermission("EMPLOYEE", "LEAVE", "READ")).toBe(true);
    expect(hasPermission("EMPLOYEE", "LEAVE", "CREATE")).toBe(true);
  });

  it("should deny INTERN admin access", () => {
    expect(hasPermission("INTERN", "SETTINGS", "ADMIN")).toBe(false);
    expect(hasPermission("INTERN", "PAYROLL", "DELETE")).toBe(false);
  });

  it("should deny VIEWER write access", () => {
    expect(hasPermission("VIEWER", "EMPLOYEES", "CREATE")).toBe(false);
    expect(hasPermission("VIEWER", "EMPLOYEES", "DELETE")).toBe(false);
  });

  it("should allow MANAGER to approve leaves", () => {
    expect(hasPermission("MANAGER", "LEAVE", "APPROVE")).toBe(true);
  });

  it("should allow export for managers and above", () => {
    expect(hasPermission("MANAGER", "EMPLOYEES", "EXPORT")).toBe(true);
    expect(hasPermission("HR_MANAGER", "PAYROLL", "EXPORT")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Data Scoping
// ══════════════════════════════════════════════════════════════

describe("Data Scoping", () => {
  it("should give CEO scope to ALL data", () => {
    expect(getDataScope("CEO")).toBe("ALL");
  });

  it("should give ADMIN scope to ALL data", () => {
    expect(getDataScope("ADMIN")).toBe("ALL");
  });

  it("should give MANAGER scope to DEPARTMENT data", () => {
    expect(getDataScope("MANAGER")).toBe("DEPARTMENT");
  });

  it("should give EMPLOYEE scope to OWN data", () => {
    expect(getDataScope("EMPLOYEE")).toBe("OWN");
  });

  it("should give INTERN scope to OWN data", () => {
    expect(getDataScope("INTERN")).toBe("OWN");
  });
});

// ══════════════════════════════════════════════════════════════
// Approval Flow
// ══════════════════════════════════════════════════════════════

describe("Approval Flow", () => {
  it("should allow MANAGER to approve EMPLOYEE requests", () => {
    expect(canApprove("MANAGER", "EMPLOYEE")).toBe(true);
  });

  it("should allow HR_MANAGER to approve MANAGER requests", () => {
    expect(canApprove("HR_MANAGER", "MANAGER")).toBe(true);
  });

  it("should not allow EMPLOYEE to approve MANAGER requests", () => {
    expect(canApprove("EMPLOYEE", "MANAGER")).toBe(false);
  });

  it("should not allow self-approval (same level)", () => {
    expect(canApprove("EMPLOYEE", "EMPLOYEE")).toBe(false);
  });

  it("should allow CEO to approve anyone", () => {
    expect(canApprove("CEO", "HR_MANAGER")).toBe(true);
    expect(canApprove("CEO", "MANAGER")).toBe(true);
    expect(canApprove("CEO", "EMPLOYEE")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// Role Hierarchy
// ══════════════════════════════════════════════════════════════

describe("Role Hierarchy", () => {
  it("should return correct role levels", () => {
    expect(getRoleLevel("CEO")).toBe(100);
    expect(getRoleLevel("ADMIN")).toBe(90);
    expect(getRoleLevel("INTERN")).toBe(20);
    expect(getRoleLevel("VIEWER")).toBe(10);
  });

  it("should correctly compare roles", () => {
    expect(isRoleAbove("CEO", "ADMIN")).toBe(true);
    expect(isRoleAbove("ADMIN", "CEO")).toBe(false);
    expect(isRoleAbove("MANAGER", "EMPLOYEE")).toBe(true);
    expect(isRoleAbove("INTERN", "EMPLOYEE")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Module Permissions
// ══════════════════════════════════════════════════════════════

describe("Module Permissions", () => {
  it("should return permissions for a module and role", () => {
    const perms = getModulePermissions("CEO", "EMPLOYEES");
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).toContain("READ");
  });

  it("should return allowed modules for a role", () => {
    const modules = getAllowedModules("EMPLOYEE");
    expect(modules.length).toBeGreaterThan(0);
    expect(modules).toContain("LEAVE");
    expect(modules).toContain("ATTENDANCE");
  });

  it("should give CEO access to all modules", () => {
    const modules = getAllowedModules("CEO");
    expect(modules.length).toBeGreaterThan(10);
  });

  it("should give VIEWER limited modules", () => {
    const modules = getAllowedModules("VIEWER");
    expect(modules.length).toBeLessThan(getAllowedModules("CEO").length);
  });
});
