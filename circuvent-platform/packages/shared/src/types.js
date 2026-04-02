"use strict";
// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Shared Types
// ──────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.RND_CATEGORIES = exports.INDIA_TAX = exports.SUPPORTED_CURRENCIES = exports.SERVICE_ROUTES = exports.SERVICE_PORTS = exports.Role = void 0;
// ── Roles & Auth ──
var Role;
(function (Role) {
    Role["ADMIN"] = "ADMIN";
    Role["ENGINEER"] = "ENGINEER";
    Role["CLIENT"] = "CLIENT";
})(Role || (exports.Role = Role = {}));
// ── Service Registry ──
exports.SERVICE_PORTS = {
    GATEWAY: 3000,
    PROJECT_TRACKER: 3001,
    IOT_REGISTRY: 3002,
    HR_PAYROLL: 3003,
    CLIENT_PORTAL: 3004,
};
exports.SERVICE_ROUTES = {
    PROJECT_TRACKER: "/api/projects",
    IOT_REGISTRY: "/api/iot",
    HR_PAYROLL: "/api/hr",
    CLIENT_PORTAL: "/api/clients",
    AUTH: "/api/auth",
    AUDIT: "/api/audit",
};
// ── Currency ──
exports.SUPPORTED_CURRENCIES = [
    "INR",
    "USD",
    "EUR",
    "GBP",
    "AED",
    "SGD",
    "JPY",
    "AUD",
    "CAD",
];
// ── India Tax Constants ──
exports.INDIA_TAX = {
    GST_RATES: [0, 5, 12, 18, 28],
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
};
// ── R&D Categories ──
exports.RND_CATEGORIES = [
    "SOFTWARE_DEVELOPMENT",
    "HARDWARE_PROTOTYPING",
    "IOT_FIRMWARE",
    "AI_ML_RESEARCH",
    "COMPONENT_PROCUREMENT",
    "TESTING_VALIDATION",
    "DESIGN_ENGINEERING",
];
//# sourceMappingURL=types.js.map