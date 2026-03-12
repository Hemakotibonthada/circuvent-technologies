// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Audit Utilities
// Compliance reporting, audit trails, data retention,
// GDPR support, data anonymization, integrity validation.
// ──────────────────────────────────────────────────────────────

import crypto from "crypto";

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface ComplianceCheck {
  name: string;
  description: string;
  check: (entity: Record<string, any>) => boolean;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

interface ComplianceResult {
  checkName: string;
  passed: boolean;
  severity: string;
  description: string;
}

interface ComplianceReport {
  entity: Record<string, any>;
  timestamp: string;
  totalChecks: number;
  passed: number;
  failed: number;
  complianceRate: number;
  results: ComplianceResult[];
  overallStatus: "COMPLIANT" | "NON_COMPLIANT" | "PARTIALLY_COMPLIANT";
}

interface AuditChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
}

interface AuditTrailEntry {
  entityType: string;
  entityId: string;
  action: string;
  changes: AuditChange[];
  timestamp: string;
  formattedEntry: string;
}

interface RetentionResult {
  createdAt: Date;
  policyDays: number;
  retentionExpiry: Date;
  isDueForDeletion: boolean;
  daysUntilDeletion: number;
  daysOverdue: number;
}

interface GDPRDataEntry {
  category: string;
  dataType: string;
  description: string;
  source: string;
  retentionPeriod: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  timestamp: string;
  details: string;
}

// ══════════════════════════════════════════════════════════════
// Compliance Reporting
// ══════════════════════════════════════════════════════════════

export function createComplianceReport(
  entity: Record<string, any>,
  checks: ComplianceCheck[],
): ComplianceReport {
  const results: ComplianceResult[] = checks.map((check) => ({
    checkName: check.name,
    passed: check.check(entity),
    severity: check.severity,
    description: check.description,
  }));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const complianceRate = total > 0 ? (passed / total) * 100 : 100;

  const criticalFailures = results.filter((r) => !r.passed && r.severity === "CRITICAL").length;

  let overallStatus: ComplianceReport["overallStatus"];
  if (failed === 0) {
    overallStatus = "COMPLIANT";
  } else if (criticalFailures > 0 || complianceRate < 50) {
    overallStatus = "NON_COMPLIANT";
  } else {
    overallStatus = "PARTIALLY_COMPLIANT";
  }

  return {
    entity,
    timestamp: new Date().toISOString(),
    totalChecks: total,
    passed,
    failed,
    complianceRate: Math.round(complianceRate * 100) / 100,
    results,
    overallStatus,
  };
}

// ══════════════════════════════════════════════════════════════
// Audit Trail
// ══════════════════════════════════════════════════════════════

export function generateAuditTrail(
  entityType: string,
  entityId: string,
  changes: AuditChange[],
): AuditTrailEntry {
  const timestamp = new Date().toISOString();
  const changeDescriptions = changes.map((c) => {
    if (c.oldValue === null) return `[CREATED] ${c.field} set to "${c.newValue}" by ${c.changedBy}`;
    if (c.newValue === null) return `[DELETED] ${c.field} removed (was "${c.oldValue}") by ${c.changedBy}`;
    return `[UPDATED] ${c.field}: "${c.oldValue}" → "${c.newValue}" by ${c.changedBy}`;
  });

  const action = changes.length === 1 && changes[0].oldValue === null
    ? "CREATE"
    : changes.length === 1 && changes[0].newValue === null
      ? "DELETE"
      : "UPDATE";

  return {
    entityType,
    entityId,
    action,
    changes,
    timestamp,
    formattedEntry: [
      `[${timestamp}] ${action} on ${entityType}#${entityId}`,
      ...changeDescriptions.map((d) => `  ${d}`),
    ].join("\n"),
  };
}

// ══════════════════════════════════════════════════════════════
// Data Retention
// ══════════════════════════════════════════════════════════════

export function calculateDataRetention(createdAt: Date, policyDays: number): RetentionResult {
  const retentionExpiry = new Date(createdAt.getTime() + policyDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = retentionExpiry.getTime() - now.getTime();
  const daysUntilDeletion = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  const isDueForDeletion = daysUntilDeletion <= 0;
  const daysOverdue = isDueForDeletion ? Math.abs(daysUntilDeletion) : 0;

  return {
    createdAt,
    policyDays,
    retentionExpiry,
    isDueForDeletion,
    daysUntilDeletion: Math.max(0, daysUntilDeletion),
    daysOverdue,
  };
}

// ══════════════════════════════════════════════════════════════
// GDPR Report
// ══════════════════════════════════════════════════════════════

export function generateGDPRReport(
  userId: string,
  userData: Record<string, any>,
): { userId: string; generatedAt: string; categories: GDPRDataEntry[] } {
  const categories: GDPRDataEntry[] = [];

  // Personal identity data
  if (userData.firstName || userData.lastName || userData.email) {
    categories.push({
      category: "Identity",
      dataType: "Personal Information",
      description: `Name: ${userData.firstName ?? "N/A"} ${userData.lastName ?? "N/A"}, Email: ${userData.email ?? "N/A"}`,
      source: "User Registration",
      retentionPeriod: "Duration of employment + 7 years",
    });
  }

  // Contact data
  if (userData.phone || userData.address) {
    categories.push({
      category: "Contact",
      dataType: "Contact Information",
      description: `Phone: ${userData.phone ?? "N/A"}, Address: ${userData.address ?? "N/A"}`,
      source: "HR Records",
      retentionPeriod: "Duration of employment + 3 years",
    });
  }

  // Financial data
  if (userData.bankAccountNo || userData.panNumber) {
    categories.push({
      category: "Financial",
      dataType: "Banking & Tax Information",
      description: "Bank account details, PAN number, tax declarations",
      source: "Payroll System",
      retentionPeriod: "Duration of employment + 8 years (tax compliance)",
    });
  }

  // Employment data
  if (userData.employeeCode || userData.designation) {
    categories.push({
      category: "Employment",
      dataType: "Employment Records",
      description: `Code: ${userData.employeeCode ?? "N/A"}, Designation: ${userData.designation ?? "N/A"}`,
      source: "HR System",
      retentionPeriod: "Duration of employment + 7 years",
    });
  }

  // Government ID data
  if (userData.aadhaarNumber || userData.uanNumber) {
    categories.push({
      category: "Government IDs",
      dataType: "National ID Numbers",
      description: "Aadhaar number, UAN (PF), PAN",
      source: "Statutory Compliance",
      retentionPeriod: "Duration of employment + 8 years",
    });
  }

  // Authentication data
  categories.push({
    category: "Authentication",
    dataType: "Login & Session Data",
    description: "Password hash, refresh tokens, login history",
    source: "Authentication System",
    retentionPeriod: "Active while employed, 90 days post-deactivation",
  });

  // Activity data
  categories.push({
    category: "Activity",
    dataType: "Audit Logs",
    description: "Action history, API calls, document access logs",
    source: "Audit System",
    retentionPeriod: "3 years",
  });

  return { userId, generatedAt: new Date().toISOString(), categories };
}

// ══════════════════════════════════════════════════════════════
// Data Anonymization
// ══════════════════════════════════════════════════════════════

export function anonymizeUserData(
  userId: string,
  userData: Record<string, any>,
): Record<string, any> {
  const anonymized: Record<string, any> = { ...userData };
  const anonId = crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);

  // Anonymize PII fields
  const piiFields: Record<string, string> = {
    firstName: `ANON_FIRST_${anonId}`,
    lastName: `ANON_LAST_${anonId}`,
    email: `anon_${anonId}@redacted.local`,
    phone: "REDACTED",
    address: "REDACTED",
    panNumber: "XXXXXXXXXX",
    aadhaarNumber: "XXXXXXXXXXXX",
    bankAccountNo: "XXXXXXXXXX",
    bankIFSC: "XXXXXXXXXXX",
    uanNumber: "XXXXXXXXXXXX",
    avatarUrl: "" as string,
  };

  for (const [field, replacement] of Object.entries(piiFields)) {
    if (field in anonymized) {
      anonymized[field] = replacement;
    }
  }

  anonymized._anonymized = true;
  anonymized._anonymizedAt = new Date().toISOString();

  return anonymized;
}

// ══════════════════════════════════════════════════════════════
// Data Integrity Validation
// ══════════════════════════════════════════════════════════════

export function validateDataIntegrity(
  records: Array<{ id: string; data: string; checksum?: string }>,
): {
  total: number;
  valid: number;
  invalid: number;
  results: Array<{ id: string; valid: boolean; expected?: string; actual?: string }>;
} {
  const results = records.map((record) => {
    const actualChecksum = crypto
      .createHash("sha256")
      .update(record.data)
      .digest("hex");

    if (!record.checksum) {
      return { id: record.id, valid: true, actual: actualChecksum };
    }

    const valid = record.checksum === actualChecksum;
    return {
      id: record.id,
      valid,
      expected: record.checksum,
      actual: actualChecksum,
    };
  });

  return {
    total: records.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    results,
  };
}

// ══════════════════════════════════════════════════════════════
// Audit Log Export
// ══════════════════════════════════════════════════════════════

export function exportAuditLogCSV(
  logs: AuditLogEntry[],
  filters?: { userId?: string; entityType?: string; startDate?: string; endDate?: string },
): string {
  let filtered = [...logs];

  if (filters?.userId) {
    filtered = filtered.filter((l) => l.userId === filters.userId);
  }
  if (filters?.entityType) {
    filtered = filtered.filter((l) => l.entityType === filters.entityType);
  }
  if (filters?.startDate) {
    const start = new Date(filters.startDate);
    filtered = filtered.filter((l) => new Date(l.timestamp) >= start);
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate);
    filtered = filtered.filter((l) => new Date(l.timestamp) <= end);
  }

  const escapeCSV = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const headers = ["ID", "Action", "Entity Type", "Entity ID", "User ID", "Timestamp", "Details"];
  const rows = filtered.map((log) => [
    escapeCSV(log.id),
    escapeCSV(log.action),
    escapeCSV(log.entityType),
    escapeCSV(log.entityId),
    escapeCSV(log.userId),
    escapeCSV(log.timestamp),
    escapeCSV(log.details),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

// ══════════════════════════════════════════════════════════════
// Data Retention Schedule
// ══════════════════════════════════════════════════════════════

export function getRetentionSchedule(): Array<{
  dataCategory: string;
  retentionDays: number;
  legalBasis: string;
  autoDelete: boolean;
}> {
  return [
    { dataCategory: "Employee Personal Data", retentionDays: 2555, legalBasis: "Employment Contract + Legal Requirement (7 years)", autoDelete: false },
    { dataCategory: "Payroll Records", retentionDays: 2920, legalBasis: "Income Tax Act (8 years)", autoDelete: false },
    { dataCategory: "Tax Declarations", retentionDays: 2920, legalBasis: "Income Tax Act (8 years)", autoDelete: false },
    { dataCategory: "Attendance Logs", retentionDays: 1095, legalBasis: "Labour Laws (3 years)", autoDelete: true },
    { dataCategory: "Leave Records", retentionDays: 1095, legalBasis: "Labour Laws (3 years)", autoDelete: true },
    { dataCategory: "Audit Logs", retentionDays: 1095, legalBasis: "Internal Policy (3 years)", autoDelete: true },
    { dataCategory: "Session Tokens", retentionDays: 90, legalBasis: "Security Policy (90 days)", autoDelete: true },
    { dataCategory: "Login History", retentionDays: 365, legalBasis: "Security Policy (1 year)", autoDelete: true },
    { dataCategory: "Expense Claims", retentionDays: 2190, legalBasis: "Companies Act (6 years)", autoDelete: false },
    { dataCategory: "Performance Reviews", retentionDays: 1825, legalBasis: "HR Policy (5 years)", autoDelete: false },
    { dataCategory: "Training Records", retentionDays: 1825, legalBasis: "Skills Development (5 years)", autoDelete: false },
    { dataCategory: "Candidate Data (Rejected)", retentionDays: 180, legalBasis: "GDPR/DPDP (6 months)", autoDelete: true },
    { dataCategory: "Client Communication", retentionDays: 2555, legalBasis: "Contract Retention (7 years)", autoDelete: false },
    { dataCategory: "IoT Telemetry", retentionDays: 365, legalBasis: "Operational Policy (1 year)", autoDelete: true },
    { dataCategory: "Document Templates", retentionDays: -1, legalBasis: "Permanent (operational)", autoDelete: false },
  ];
}

// ══════════════════════════════════════════════════════════════
// Generate Checksum
// ══════════════════════════════════════════════════════════════

export function generateChecksum(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
