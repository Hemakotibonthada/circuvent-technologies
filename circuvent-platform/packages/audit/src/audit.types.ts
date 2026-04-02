// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Audit Types
// Typed audit events for ISO compliance tracking.
// ──────────────────────────────────────────────────────────────

export type AuditAction =
  | "CREATE" | "READ" | "UPDATE" | "DELETE"
  | "LOGIN" | "LOGOUT" | "LOGIN_FAILED" | "PASSWORD_CHANGED"
  | "APPROVE" | "REJECT" | "ESCALATE"
  | "PAYMENT" | "EXPORT" | "IMPORT"
  | "DEVICE_REGISTER" | "DEVICE_COMMAND" | "FIRMWARE_UPDATE"
  | "JOB_SUBMIT" | "JOB_CANCEL" | "RESOURCE_ALLOCATE" | "RESOURCE_RELEASE"
  | "BOT_DEPLOY" | "BOT_STOP"
  | "CONFIG_CHANGE" | "ROLE_CHANGE" | "SESSION_INVALIDATE";

export type AuditEntity =
  | "User" | "Employee" | "SalarySlip" | "PayslipDocument"
  | "ExpenseClaim" | "LeaveRecord" | "TaxDeclaration"
  | "Project" | "Sprint" | "SprintTask" | "HardwareRevision" | "BOMItem"
  | "IoTDevice" | "FirmwareUpdate" | "TelemetryLog" | "DeviceHeartbeat" | "DeviceAlert" | "DeviceCommand"
  | "ClientProfile" | "Lead" | "Invoice"
  | "ComputeResource" | "ResourceAllocation" | "TrainingJob" | "TradingBot"
  | "ApprovalWorkflow" | "StatutoryConfig"
  | "CurrencyRate" | "RnDTaxRecord" | "RefreshToken" | "UserSession";

export interface AuditEntry {
  userId?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

export interface AuditQueryParams {
  userId?: string;
  entity?: AuditEntity;
  action?: AuditAction;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
}

export interface AuditLogResponse {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
}
