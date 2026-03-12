// ──────────────────────────────────────────────────────────────
// Circuvent Platform — RBAC Permission Matrix
// Complete role-based access control: permission checks,
// module access, approval flows, role hierarchy, data scoping.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type Role =
  | "CEO"
  | "ADMIN"
  | "HR_MANAGER"
  | "FINANCE_MANAGER"
  | "MANAGER"
  | "TEAM_LEAD"
  | "SENIOR_EMPLOYEE"
  | "EMPLOYEE"
  | "INTERN"
  | "CONTRACTOR"
  | "VIEWER";

export type Module =
  | "EMPLOYEES"
  | "LEAVE"
  | "PAYROLL"
  | "ATTENDANCE"
  | "PERFORMANCE"
  | "RECRUITMENT"
  | "TRAINING"
  | "ICM"
  | "WORKSTATION"
  | "WIKI"
  | "FINANCE"
  | "INVOICES"
  | "EXPENSES"
  | "IOT_DEVICES"
  | "IOT_ALERTS"
  | "CLIENTS"
  | "PROJECTS"
  | "REPORTS"
  | "SETTINGS"
  | "AUDIT"
  | "CALENDAR"
  | "MESSAGING"
  | "RECOGNITION";

export type Action =
  | "READ"
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "EXPORT"
  | "ADMIN";

export type DataScope = "OWN" | "DEPARTMENT" | "ALL";

// ══════════════════════════════════════════════════════════════
// Role Hierarchy
// ══════════════════════════════════════════════════════════════

const ROLE_LEVELS: Record<Role, number> = {
  CEO: 100,
  ADMIN: 90,
  HR_MANAGER: 80,
  FINANCE_MANAGER: 80,
  MANAGER: 70,
  TEAM_LEAD: 60,
  SENIOR_EMPLOYEE: 50,
  EMPLOYEE: 40,
  INTERN: 20,
  CONTRACTOR: 30,
  VIEWER: 10,
};

// ══════════════════════════════════════════════════════════════
// Permission Matrix — Module → Action → Roles[]
// ══════════════════════════════════════════════════════════════

const PERMISSIONS: Record<Module, Partial<Record<Action, Role[]>>> = {
  EMPLOYEES: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR", "VIEWER"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
    ADMIN: ["CEO", "ADMIN"],
  },
  LEAVE: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER"],
    DELETE: ["CEO", "ADMIN", "HR_MANAGER"],
    APPROVE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    REJECT: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  PAYROLL: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "EMPLOYEE"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    APPROVE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER"],
    ADMIN: ["CEO", "ADMIN"],
  },
  ATTENDANCE: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER"],
    APPROVE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  PERFORMANCE: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    APPROVE: ["CEO", "ADMIN", "HR_MANAGER"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  RECRUITMENT: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    APPROVE: ["CEO", "ADMIN", "HR_MANAGER"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  TRAINING: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    APPROVE: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  ICM: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
    DELETE: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  WORKSTATION: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    UPDATE: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    DELETE: ["CEO", "ADMIN", "MANAGER"],
  },
  WIKI: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR", "VIEWER"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    DELETE: ["CEO", "ADMIN", "HR_MANAGER"],
  },
  FINANCE: {
    READ: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    CREATE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    APPROVE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    EXPORT: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    ADMIN: ["CEO", "ADMIN"],
  },
  INVOICES: {
    READ: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER"],
    CREATE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    UPDATE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    APPROVE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    EXPORT: ["CEO", "ADMIN", "FINANCE_MANAGER"],
  },
  EXPENSES: {
    READ: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    CREATE: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    UPDATE: ["CEO", "ADMIN", "FINANCE_MANAGER"],
    APPROVE: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER"],
    REJECT: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER"],
    EXPORT: ["CEO", "ADMIN", "FINANCE_MANAGER"],
  },
  IOT_DEVICES: {
    READ: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    CREATE: ["CEO", "ADMIN", "MANAGER"],
    UPDATE: ["CEO", "ADMIN", "MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN"],
  },
  IOT_ALERTS: {
    READ: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    UPDATE: ["CEO", "ADMIN", "MANAGER"],
  },
  CLIENTS: {
    READ: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD"],
    CREATE: ["CEO", "ADMIN", "MANAGER"],
    UPDATE: ["CEO", "ADMIN", "MANAGER"],
    DELETE: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN", "FINANCE_MANAGER"],
  },
  PROJECTS: {
    READ: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    CREATE: ["CEO", "ADMIN", "MANAGER"],
    UPDATE: ["CEO", "ADMIN", "MANAGER", "TEAM_LEAD"],
    DELETE: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN", "MANAGER"],
  },
  REPORTS: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "MANAGER"],
    EXPORT: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER"],
  },
  SETTINGS: {
    READ: ["CEO", "ADMIN"],
    UPDATE: ["CEO", "ADMIN"],
    ADMIN: ["CEO", "ADMIN"],
  },
  AUDIT: {
    READ: ["CEO", "ADMIN"],
    EXPORT: ["CEO", "ADMIN"],
  },
  CALENDAR: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    UPDATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
    DELETE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER"],
  },
  MESSAGING: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN", "CONTRACTOR"],
  },
  RECOGNITION: {
    READ: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE", "INTERN"],
    CREATE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD", "SENIOR_EMPLOYEE", "EMPLOYEE"],
  },
};

// ══════════════════════════════════════════════════════════════
// Approval Matrix — Entity type → Roles that can approve
// ══════════════════════════════════════════════════════════════

const APPROVAL_MATRIX: Record<string, Role[]> = {
  LEAVE: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER", "TEAM_LEAD"],
  EXPENSE: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER"],
  PAYROLL: ["CEO", "ADMIN", "FINANCE_MANAGER"],
  PURCHASE_REQUEST: ["CEO", "ADMIN", "FINANCE_MANAGER", "MANAGER"],
  RECRUITMENT: ["CEO", "ADMIN", "HR_MANAGER"],
  TRAVEL: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER"],
  SALARY_ADVANCE: ["CEO", "ADMIN", "HR_MANAGER", "FINANCE_MANAGER"],
  RESIGNATION: ["CEO", "ADMIN", "HR_MANAGER", "MANAGER"],
  PERFORMANCE_REVIEW: ["CEO", "ADMIN", "HR_MANAGER"],
};

// ══════════════════════════════════════════════════════════════
// Data Scope — How much data a role can see
// ══════════════════════════════════════════════════════════════

const DATA_SCOPE: Record<Role, DataScope> = {
  CEO: "ALL",
  ADMIN: "ALL",
  HR_MANAGER: "ALL",
  FINANCE_MANAGER: "ALL",
  MANAGER: "DEPARTMENT",
  TEAM_LEAD: "DEPARTMENT",
  SENIOR_EMPLOYEE: "OWN",
  EMPLOYEE: "OWN",
  INTERN: "OWN",
  CONTRACTOR: "OWN",
  VIEWER: "OWN",
};

// ══════════════════════════════════════════════════════════════
// Permission Check Functions
// ══════════════════════════════════════════════════════════════

export function hasPermission(role: Role, module: Module, action: Action): boolean {
  const modulePerms = PERMISSIONS[module];
  if (!modulePerms) return false;

  const allowedRoles = modulePerms[action];
  if (!allowedRoles) return false;

  return allowedRoles.includes(role);
}

export function getAccessibleModules(role: Role): Module[] {
  const modules: Module[] = [];
  for (const [module, perms] of Object.entries(PERMISSIONS)) {
    const readRoles = perms.READ;
    if (readRoles && readRoles.includes(role)) {
      modules.push(module as Module);
    }
  }
  return modules;
}

export function getPermittedActions(role: Role, module: Module): Action[] {
  const modulePerms = PERMISSIONS[module];
  if (!modulePerms) return [];

  const actions: Action[] = [];
  for (const [action, roles] of Object.entries(modulePerms)) {
    if (roles && roles.includes(role)) {
      actions.push(action as Action);
    }
  }
  return actions;
}

export function canApprove(role: Role, entityType: string): boolean {
  const approvers = APPROVAL_MATRIX[entityType.toUpperCase()];
  if (!approvers) return false;
  return approvers.includes(role);
}

export function canCreate(role: Role, module: Module): boolean {
  return hasPermission(role, module, "CREATE");
}

export function canDelete(role: Role, module: Module): boolean {
  return hasPermission(role, module, "DELETE");
}

export function canExport(role: Role, module: Module): boolean {
  return hasPermission(role, module, "EXPORT");
}

// ══════════════════════════════════════════════════════════════
// Role Hierarchy
// ══════════════════════════════════════════════════════════════

export function getRoleHierarchy(): Array<{ role: Role; level: number }> {
  return Object.entries(ROLE_LEVELS)
    .map(([role, level]) => ({ role: role as Role, level }))
    .sort((a, b) => b.level - a.level);
}

export function isRoleHigherThan(role1: Role, role2: Role): boolean {
  return (ROLE_LEVELS[role1] || 0) > (ROLE_LEVELS[role2] || 0);
}

export function getRoleLevel(role: Role): number {
  return ROLE_LEVELS[role] || 0;
}

// ══════════════════════════════════════════════════════════════
// Data Scope
// ══════════════════════════════════════════════════════════════

export function getDataScope(role: Role): DataScope {
  return DATA_SCOPE[role] || "OWN";
}

export function canAccessAllData(role: Role): boolean {
  return DATA_SCOPE[role] === "ALL";
}

export function canAccessDepartmentData(role: Role): boolean {
  const scope = DATA_SCOPE[role];
  return scope === "ALL" || scope === "DEPARTMENT";
}
