// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Types
// ──────────────────────────────────────────────────────────────

// ── Roles & Auth ──
export enum Role {
  ADMIN = "ADMIN",
  ENGINEER = "ENGINEER",
  CLIENT = "CLIENT",
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

// ── API Response ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

// ── Service Registry ──
export const SERVICE_PORTS = {
  GATEWAY: 3000,
  PROJECT_TRACKER: 3001,
  IOT_REGISTRY: 3002,
  HR_PAYROLL: 3003,
  CLIENT_PORTAL: 3004,
  AI_ORCHESTRATOR: 3006,
  FINANCIAL_LEDGER: 3007,
  ATS_ENGINE: 3008,
} as const;

export const SERVICE_ROUTES = {
  PROJECT_TRACKER: "/api/projects",
  IOT_REGISTRY: "/api/iot",
  HR_PAYROLL: "/api/hr",
  CLIENT_PORTAL: "/api/clients",
  AI_ORCHESTRATOR: "/api/ai",
  FINANCIAL_LEDGER: "/api/finance",
  ATS_ENGINE: "/api/recruitment",
  AUTH: "/api/auth",
  AUDIT: "/api/audit",
} as const;

// ── Currency ──
export const SUPPORTED_CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "JPY",
  "AUD",
  "CAD",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// ── India Tax Constants ──
export const INDIA_TAX = {
  GST_RATES: [0, 5, 12, 18, 28] as const,
  DEFAULT_GST_RATE: 18,
  PF_EMPLOYER_RATE: 0.12,
  PF_EMPLOYEE_RATE: 0.12,
  PF_WAGE_CEILING: 15000,
  ESI_EMPLOYER_RATE: 0.0325,
  ESI_EMPLOYEE_RATE: 0.0075,
  ESI_WAGE_CEILING: 21000,
  PROFESSIONAL_TAX_MAX: 2500,
  // New Tax Regime Slabs (FY 2025-26)
  NEW_REGIME_SLABS: [
    { min: 0, max: 300000, rate: 0 },
    { min: 300001, max: 700000, rate: 0.05 },
    { min: 700001, max: 1000000, rate: 0.1 },
    { min: 1000001, max: 1200000, rate: 0.15 },
    { min: 1200001, max: 1500000, rate: 0.2 },
    { min: 1500001, max: Infinity, rate: 0.3 },
  ],
  // Old Tax Regime Slabs
  OLD_REGIME_SLABS: [
    { min: 0, max: 250000, rate: 0 },
    { min: 250001, max: 500000, rate: 0.05 },
    { min: 500001, max: 1000000, rate: 0.2 },
    { min: 1000001, max: Infinity, rate: 0.3 },
  ],
} as const;

// ── R&D Categories ──
export const RND_CATEGORIES = [
  "SOFTWARE_DEVELOPMENT",
  "HARDWARE_PROTOTYPING",
  "IOT_FIRMWARE",
  "AI_ML_RESEARCH",
  "COMPONENT_PROCUREMENT",
  "TESTING_VALIDATION",
  "DESIGN_ENGINEERING",
] as const;

export type RnDCategory = (typeof RND_CATEGORIES)[number];
