export declare enum Role {
    ADMIN = "ADMIN",
    ENGINEER = "ENGINEER",
    CLIENT = "CLIENT"
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
export declare const SERVICE_PORTS: {
    readonly GATEWAY: 3000;
    readonly PROJECT_TRACKER: 3001;
    readonly IOT_REGISTRY: 3002;
    readonly HR_PAYROLL: 3003;
    readonly CLIENT_PORTAL: 3004;
};
export declare const SERVICE_ROUTES: {
    readonly PROJECT_TRACKER: "/api/projects";
    readonly IOT_REGISTRY: "/api/iot";
    readonly HR_PAYROLL: "/api/hr";
    readonly CLIENT_PORTAL: "/api/clients";
    readonly AUTH: "/api/auth";
    readonly AUDIT: "/api/audit";
};
export declare const SUPPORTED_CURRENCIES: readonly ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"];
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export declare const INDIA_TAX: {
    readonly GST_RATES: readonly [0, 5, 12, 18, 28];
    readonly DEFAULT_GST_RATE: 18;
    readonly PF_EMPLOYER_RATE: 0.12;
    readonly PF_EMPLOYEE_RATE: 0.12;
    readonly PF_WAGE_CEILING: 15000;
    readonly ESI_EMPLOYER_RATE: 0.0325;
    readonly ESI_EMPLOYEE_RATE: 0.0075;
    readonly ESI_WAGE_CEILING: 21000;
    readonly PROFESSIONAL_TAX_MAX: 2500;
    readonly NEW_REGIME_SLABS: readonly [{
        readonly min: 0;
        readonly max: 300000;
        readonly rate: 0;
    }, {
        readonly min: 300001;
        readonly max: 700000;
        readonly rate: 0.05;
    }, {
        readonly min: 700001;
        readonly max: 1000000;
        readonly rate: 0.1;
    }, {
        readonly min: 1000001;
        readonly max: 1200000;
        readonly rate: 0.15;
    }, {
        readonly min: 1200001;
        readonly max: 1500000;
        readonly rate: 0.2;
    }, {
        readonly min: 1500001;
        readonly max: number;
        readonly rate: 0.3;
    }];
    readonly OLD_REGIME_SLABS: readonly [{
        readonly min: 0;
        readonly max: 250000;
        readonly rate: 0;
    }, {
        readonly min: 250001;
        readonly max: 500000;
        readonly rate: 0.05;
    }, {
        readonly min: 500001;
        readonly max: 1000000;
        readonly rate: 0.2;
    }, {
        readonly min: 1000001;
        readonly max: number;
        readonly rate: 0.3;
    }];
};
export declare const RND_CATEGORIES: readonly ["SOFTWARE_DEVELOPMENT", "HARDWARE_PROTOTYPING", "IOT_FIRMWARE", "AI_ML_RESEARCH", "COMPONENT_PROCUREMENT", "TESTING_VALIDATION", "DESIGN_ENGINEERING"];
export type RnDCategory = (typeof RND_CATEGORIES)[number];
//# sourceMappingURL=types.d.ts.map