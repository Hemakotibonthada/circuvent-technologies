// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Role-Based Access Control (RBAC) Configuration
// Defines permissions for each role across all platform modules.
// Used by both backend middleware and frontend sidebar.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * All platform roles.
 */
export type PlatformRole =
  | "ADMIN"
  | "SUPER_ADMIN"
  | "HR_MANAGER"
  | "MANAGER"
  | "PRODUCT_MANAGER"
  | "ENGINEER"
  | "DEVELOPER"
  | "TESTER"
  | "INTERN"
  | "MARKETING"
  | "CEO"
  | "CLIENT"
  | "CANDIDATE";

/**
 * Permission modules across the platform.
 */
export type PermissionModule =
  | "dashboard"
  | "portal"
  | "projects"
  | "iot"
  | "hr_admin"
  | "hr_employees"
  | "hr_payroll"
  | "hr_leave"
  | "hr_expenses"
  | "hr_compliance"
  | "hr_onboarding"
  | "hr_analytics"
  | "hr_attendance"
  | "hr_performance"
  | "hr_goals"
  | "hr_directory"
  | "hr_helpdesk"
  | "hr_training"
  | "hr_announcements"
  | "hr_holidays"
  | "clients"
  | "finance"
  | "ai"
  | "recruitment"
  | "audit"
  | "settings"
  | "asset_management"
  | "grievance"
  | "shift_management"
  | "salary_advance"
  | "resignation";

/**
 * Permission definition for a module.
 */
export interface ModulePermission {
  /** Can view/read data */
  read: boolean;
  /** Can create new records */
  create: boolean;
  /** Can update existing records */
  update: boolean;
  /** Can delete records */
  delete: boolean;
  /** Can approve/reject requests */
  approve: boolean;
  /** Can export data */
  export: boolean;
}

/** Default permission set (no access) */
const NO_ACCESS: ModulePermission = { read: false, create: false, update: false, delete: false, approve: false, export: false };
/** Read only */
const READ_ONLY: ModulePermission = { read: true, create: false, update: false, delete: false, approve: false, export: false };
/** Full CRUD */
const FULL_CRUD: ModulePermission = { read: true, create: true, update: true, delete: true, approve: false, export: true };
/** Full access including approval */
const FULL_ACCESS: ModulePermission = { read: true, create: true, update: true, delete: true, approve: true, export: true };
/** Self-service (read + create own) */
const SELF_SERVICE: ModulePermission = { read: true, create: true, update: true, delete: false, approve: false, export: false };

/**
 * Role-to-permissions mapping.
 * Defines exactly what each role can access across every module.
 */
export const ROLE_PERMISSIONS: Record<PlatformRole, Partial<Record<PermissionModule, ModulePermission>>> = {
  SUPER_ADMIN: {
    dashboard: FULL_ACCESS, portal: FULL_ACCESS, projects: FULL_ACCESS,
    iot: FULL_ACCESS, hr_admin: FULL_ACCESS, hr_employees: FULL_ACCESS,
    hr_payroll: FULL_ACCESS, hr_leave: FULL_ACCESS, hr_expenses: FULL_ACCESS,
    hr_compliance: FULL_ACCESS, hr_onboarding: FULL_ACCESS, hr_analytics: FULL_ACCESS,
    hr_attendance: FULL_ACCESS, hr_performance: FULL_ACCESS, hr_goals: FULL_ACCESS,
    hr_directory: FULL_ACCESS, hr_helpdesk: FULL_ACCESS, hr_training: FULL_ACCESS,
    hr_announcements: FULL_ACCESS, hr_holidays: FULL_ACCESS,
    clients: FULL_ACCESS, finance: FULL_ACCESS, ai: FULL_ACCESS,
    recruitment: FULL_ACCESS, audit: FULL_ACCESS, settings: FULL_ACCESS,
    asset_management: FULL_ACCESS, grievance: FULL_ACCESS,
    shift_management: FULL_ACCESS, salary_advance: FULL_ACCESS, resignation: FULL_ACCESS,
  },

  ADMIN: {
    dashboard: FULL_ACCESS, portal: FULL_ACCESS, projects: FULL_ACCESS,
    iot: FULL_ACCESS, hr_admin: FULL_ACCESS, hr_employees: FULL_ACCESS,
    hr_payroll: FULL_ACCESS, hr_leave: FULL_ACCESS, hr_expenses: FULL_ACCESS,
    hr_compliance: FULL_ACCESS, hr_onboarding: FULL_ACCESS, hr_analytics: FULL_ACCESS,
    hr_attendance: FULL_CRUD, hr_performance: FULL_ACCESS, hr_goals: FULL_CRUD,
    hr_directory: FULL_CRUD, hr_helpdesk: FULL_ACCESS, hr_training: FULL_ACCESS,
    hr_announcements: FULL_CRUD, hr_holidays: FULL_CRUD,
    clients: FULL_ACCESS, finance: FULL_ACCESS, ai: FULL_ACCESS,
    recruitment: FULL_ACCESS, audit: FULL_ACCESS, settings: FULL_ACCESS,
    asset_management: FULL_ACCESS, grievance: FULL_ACCESS,
    shift_management: FULL_ACCESS, salary_advance: FULL_ACCESS, resignation: FULL_ACCESS,
  },

  CEO: {
    dashboard: FULL_ACCESS, portal: SELF_SERVICE, projects: READ_ONLY,
    iot: READ_ONLY, hr_admin: READ_ONLY, hr_employees: READ_ONLY,
    hr_payroll: READ_ONLY, hr_leave: READ_ONLY, hr_expenses: READ_ONLY,
    hr_compliance: READ_ONLY, hr_analytics: FULL_ACCESS, hr_attendance: READ_ONLY,
    hr_performance: READ_ONLY, hr_directory: READ_ONLY,
    clients: FULL_ACCESS, finance: FULL_ACCESS, ai: READ_ONLY,
    recruitment: READ_ONLY, audit: FULL_ACCESS, settings: READ_ONLY,
    asset_management: READ_ONLY, grievance: READ_ONLY,
  },

  HR_MANAGER: {
    dashboard: FULL_CRUD, portal: SELF_SERVICE, projects: READ_ONLY,
    hr_admin: FULL_CRUD, hr_employees: FULL_ACCESS, hr_payroll: FULL_ACCESS,
    hr_leave: FULL_ACCESS, hr_expenses: FULL_ACCESS, hr_compliance: FULL_ACCESS,
    hr_onboarding: FULL_ACCESS, hr_analytics: FULL_ACCESS,
    hr_attendance: FULL_ACCESS, hr_performance: FULL_ACCESS, hr_goals: FULL_CRUD,
    hr_directory: FULL_CRUD, hr_helpdesk: FULL_ACCESS, hr_training: FULL_ACCESS,
    hr_announcements: FULL_CRUD, hr_holidays: FULL_CRUD,
    recruitment: FULL_ACCESS, salary_advance: FULL_ACCESS,
    resignation: FULL_ACCESS, grievance: FULL_ACCESS,
    shift_management: FULL_ACCESS, asset_management: FULL_ACCESS,
  },

  MANAGER: {
    dashboard: READ_ONLY, portal: SELF_SERVICE, projects: FULL_CRUD,
    hr_leave: { read: true, create: true, update: false, delete: false, approve: true, export: false },
    hr_expenses: { read: true, create: true, update: false, delete: false, approve: true, export: false },
    hr_attendance: READ_ONLY, hr_performance: FULL_CRUD, hr_goals: FULL_CRUD,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    salary_advance: { read: true, create: false, update: false, delete: false, approve: true, export: false },
    resignation: READ_ONLY,
  },

  PRODUCT_MANAGER: {
    dashboard: READ_ONLY, portal: SELF_SERVICE, projects: FULL_CRUD,
    iot: READ_ONLY, hr_leave: SELF_SERVICE, hr_expenses: SELF_SERVICE,
    hr_attendance: READ_ONLY, hr_goals: SELF_SERVICE, hr_directory: READ_ONLY,
    hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    clients: FULL_CRUD, recruitment: READ_ONLY,
  },

  ENGINEER: {
    dashboard: READ_ONLY, portal: SELF_SERVICE, projects: FULL_CRUD,
    iot: FULL_CRUD, hr_leave: SELF_SERVICE, hr_expenses: SELF_SERVICE,
    hr_attendance: SELF_SERVICE, hr_goals: SELF_SERVICE,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    ai: READ_ONLY, salary_advance: SELF_SERVICE, resignation: SELF_SERVICE,
    asset_management: READ_ONLY, grievance: SELF_SERVICE,
  },

  DEVELOPER: {
    dashboard: READ_ONLY, portal: SELF_SERVICE, projects: FULL_CRUD,
    hr_leave: SELF_SERVICE, hr_expenses: SELF_SERVICE,
    hr_attendance: SELF_SERVICE, hr_goals: SELF_SERVICE,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    salary_advance: SELF_SERVICE, resignation: SELF_SERVICE,
    asset_management: READ_ONLY, grievance: SELF_SERVICE,
  },

  TESTER: {
    dashboard: READ_ONLY, portal: SELF_SERVICE, projects: FULL_CRUD,
    hr_leave: SELF_SERVICE, hr_expenses: SELF_SERVICE,
    hr_attendance: SELF_SERVICE, hr_goals: SELF_SERVICE,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    salary_advance: SELF_SERVICE, resignation: SELF_SERVICE,
    grievance: SELF_SERVICE,
  },

  INTERN: {
    dashboard: READ_ONLY, portal: SELF_SERVICE,
    hr_attendance: SELF_SERVICE, hr_goals: SELF_SERVICE,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE,
    hr_training: READ_ONLY, hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    grievance: SELF_SERVICE,
  },

  MARKETING: {
    dashboard: READ_ONLY, portal: SELF_SERVICE,
    hr_leave: SELF_SERVICE, hr_expenses: SELF_SERVICE,
    hr_attendance: SELF_SERVICE, hr_goals: SELF_SERVICE,
    hr_directory: READ_ONLY, hr_helpdesk: SELF_SERVICE, hr_training: READ_ONLY,
    hr_announcements: READ_ONLY, hr_holidays: READ_ONLY,
    clients: READ_ONLY, salary_advance: SELF_SERVICE,
    resignation: SELF_SERVICE, grievance: SELF_SERVICE,
  },

  CLIENT: {
    dashboard: READ_ONLY, clients: READ_ONLY,
  },

  CANDIDATE: {
    recruitment: { read: true, create: true, update: false, delete: false, approve: false, export: false },
  },
};

/**
 * Checks if a role has access to a specific module.
 *
 * @param role The user's role
 * @param module The module to check
 * @param action The specific action (defaults to "read")
 * @returns boolean
 */
export function hasAccess(
  role: string,
  module: PermissionModule,
  action: keyof ModulePermission = "read",
): boolean {
  const rolePerms = ROLE_PERMISSIONS[role as PlatformRole];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms[action] === true;
}

/**
 * Returns all modules a role has access to.
 */
export function getAccessibleModules(role: string): PermissionModule[] {
  const rolePerms = ROLE_PERMISSIONS[role as PlatformRole];
  if (!rolePerms) return [];
  return Object.entries(rolePerms)
    .filter(([, perm]) => perm && perm.read)
    .map(([module]) => module as PermissionModule);
}

/**
 * Returns the sidebar navigation sections filtered by role.
 * Items the user cannot access are removed entirely.
 */
export function getNavigationForRole(role: string): Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: string; module: PermissionModule }>;
}> {
  const allSections = [
    { label: "Overview", items: [
      { href: "/dashboard", label: "Command Center", icon: "🏠", module: "dashboard" as PermissionModule },
    ]},
    { label: "My Portal", items: [
      { href: "/portal", label: "Dashboard", icon: "🪪", module: "portal" as PermissionModule },
      { href: "/portal/attendance", label: "Attendance", icon: "⏰", module: "hr_attendance" as PermissionModule },
      { href: "/portal/leaves", label: "My Leaves", icon: "🏖️", module: "hr_leave" as PermissionModule },
      { href: "/portal/payslips", label: "Payslips", icon: "💰", module: "hr_payroll" as PermissionModule },
      { href: "/portal/goals", label: "Goals", icon: "🎯", module: "hr_goals" as PermissionModule },
      { href: "/portal/expenses", label: "Expenses", icon: "🧾", module: "hr_expenses" as PermissionModule },
      { href: "/portal/helpdesk", label: "Helpdesk", icon: "🎫", module: "hr_helpdesk" as PermissionModule },
      { href: "/portal/training", label: "Training", icon: "📚", module: "hr_training" as PermissionModule },
      { href: "/portal/directory", label: "Directory", icon: "👥", module: "hr_directory" as PermissionModule },
      { href: "/portal/profile", label: "My Profile", icon: "👤", module: "portal" as PermissionModule },
    ]},
    { label: "Engineering", items: [
      { href: "/projects", label: "Projects", icon: "📊", module: "projects" as PermissionModule },
      { href: "/projects/analytics", label: "Analytics", icon: "📈", module: "projects" as PermissionModule },
    ]},
    { label: "IoT", items: [
      { href: "/iot", label: "Devices", icon: "📡", module: "iot" as PermissionModule },
      { href: "/iot/command-center", label: "Command Center", icon: "🏛️", module: "iot" as PermissionModule },
      { href: "/iot/health", label: "Health", icon: "💓", module: "iot" as PermissionModule },
      { href: "/iot/fleet", label: "Fleet", icon: "🚀", module: "iot" as PermissionModule },
    ]},
    { label: "HR Admin", items: [
      { href: "/hr", label: "Employees", icon: "👥", module: "hr_employees" as PermissionModule },
      { href: "/hr/analytics", label: "Analytics", icon: "📊", module: "hr_analytics" as PermissionModule },
      { href: "/hr/payroll", label: "Payroll", icon: "💰", module: "hr_payroll" as PermissionModule },
      { href: "/hr/leave", label: "Leave Mgmt", icon: "🏖️", module: "hr_leave" as PermissionModule },
      { href: "/hr/expenses", label: "Expenses", icon: "🧾", module: "hr_expenses" as PermissionModule },
      { href: "/hr/compliance", label: "Compliance", icon: "📋", module: "hr_compliance" as PermissionModule },
      { href: "/hr/onboarding", label: "Onboarding", icon: "🎯", module: "hr_onboarding" as PermissionModule },
    ]},
    { label: "Clients", items: [
      { href: "/clients", label: "Portal", icon: "💼", module: "clients" as PermissionModule },
      { href: "/clients/analytics", label: "Analytics", icon: "📉", module: "clients" as PermissionModule },
    ]},
    { label: "Finance", items: [
      { href: "/finance", label: "Dashboard", icon: "💰", module: "finance" as PermissionModule },
      { href: "/finance/accounts", label: "Accounts", icon: "📊", module: "finance" as PermissionModule },
      { href: "/finance/journals", label: "Journals", icon: "📒", module: "finance" as PermissionModule },
      { href: "/finance/reports", label: "Reports", icon: "📋", module: "finance" as PermissionModule },
      { href: "/finance/gst", label: "GST", icon: "🏛️", module: "finance" as PermissionModule },
    ]},
    { label: "AI", items: [
      { href: "/ai", label: "Orchestrator", icon: "🤖", module: "ai" as PermissionModule },
      { href: "/ai/models", label: "Models", icon: "🧠", module: "ai" as PermissionModule },
      { href: "/ai/scheduler", label: "Scheduler", icon: "⚡", module: "ai" as PermissionModule },
    ]},
    { label: "Recruitment", items: [
      { href: "/recruitment", label: "Dashboard", icon: "🎯", module: "recruitment" as PermissionModule },
      { href: "/recruitment/jobs", label: "Jobs", icon: "📋", module: "recruitment" as PermissionModule },
      { href: "/recruitment/candidates", label: "Candidates", icon: "👤", module: "recruitment" as PermissionModule },
      { href: "/recruitment/pools", label: "Talent Pools", icon: "🏊", module: "recruitment" as PermissionModule },
      { href: "/recruitment/interviews", label: "Interviews", icon: "🎙️", module: "recruitment" as PermissionModule },
    ]},
    { label: "System", items: [
      { href: "/audit", label: "Audit", icon: "🔍", module: "audit" as PermissionModule },
      { href: "/settings", label: "Settings", icon: "⚙️", module: "settings" as PermissionModule },
    ]},
  ];

  // Filter sections: remove items user can't access, remove empty sections
  return allSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => hasAccess(role, item.module)),
    }))
    .filter(section => section.items.length > 0);
}
