import React from "react";
import type { EnterpriseScreen } from "../registry";
import AdminConsole from "./AdminConsole";
import UserManagement from "./UserManagement";
import RolesAndAccess from "./RolesAndAccess";
import AuditTrail from "./AuditTrail";
import Reports from "./Reports";
import OrgSettings from "./OrgSettings";

export const ADMIN_SCREENS: EnterpriseScreen[] = [
  {
    key: "admin-console",
    title: "Admin Console",
    subtitle: "Operations landing page",
    icon: "admin",
    group: "Administration",
    admin: true,
    render: (p) => <AdminConsole onBack={p.onBack} />,
  },
  {
    key: "admin-users",
    title: "User Management",
    subtitle: "Users, ownership and is_admin",
    icon: "users",
    group: "Administration",
    admin: true,
    render: (p) => <UserManagement onBack={p.onBack} />,
  },
  {
    key: "admin-roles-access",
    title: "Roles & Access",
    subtitle: "Honest local RBAC model",
    icon: "role",
    group: "Administration",
    admin: true,
    render: (p) => <RolesAndAccess onBack={p.onBack} />,
  },
  {
    key: "admin-audit-trail",
    title: "Audit Trail",
    subtitle: "Server events and local actions",
    icon: "audit",
    group: "Administration",
    admin: true,
    render: (p) => <AuditTrail onBack={p.onBack} />,
  },
  {
    key: "admin-reports",
    title: "Reports",
    subtitle: "Copyable real-data reports",
    icon: "report",
    group: "Administration",
    admin: true,
    render: (p) => <Reports onBack={p.onBack} />,
  },
  {
    key: "admin-org-settings",
    title: "Organisation Settings",
    subtitle: "Connection and local preferences",
    icon: "org",
    group: "Administration",
    admin: true,
    render: (p) => <OrgSettings onBack={p.onBack} />,
  },
];
