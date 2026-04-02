// ──────────────────────────────────────────────────────────────
// HR Payroll — API Documentation Routes
// Auto-generated endpoint catalog organized by service, with
// search, method stats, and parameter documentation.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";

const router = Router();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  parameters: Array<{
    name: string;
    in: "path" | "query" | "body";
    type: string;
    required: boolean;
    description: string;
  }>;
  responseExample: Record<string, any>;
  tags: string[];
  requiresAuth: boolean;
}

interface ServiceDocs {
  name: string;
  description: string;
  baseUrl: string;
  version: string;
  endpoints: APIEndpoint[];
}

// ══════════════════════════════════════════════════════════════
// Endpoint Catalog
// ══════════════════════════════════════════════════════════════

const GATEWAY_ENDPOINTS: APIEndpoint[] = [
  {
    method: "POST", path: "/api/auth/login",
    description: "Authenticate user and receive JWT token pair",
    parameters: [
      { name: "email", in: "body", type: "string", required: true, description: "User email address" },
      { name: "password", in: "body", type: "string", required: true, description: "Account password" },
    ],
    responseExample: { success: true, data: { accessToken: "eyJ...", refreshToken: "eyJ...", user: { id: "uuid", email: "user@circuvent.com", role: "EMPLOYEE" } } },
    tags: ["auth"], requiresAuth: false,
  },
  {
    method: "POST", path: "/api/auth/refresh",
    description: "Refresh access token using a valid refresh token",
    parameters: [
      { name: "refreshToken", in: "body", type: "string", required: true, description: "Valid refresh token" },
    ],
    responseExample: { success: true, data: { accessToken: "eyJ..." } },
    tags: ["auth"], requiresAuth: false,
  },
  {
    method: "POST", path: "/api/auth/logout",
    description: "Invalidate current session and tokens",
    parameters: [],
    responseExample: { success: true, message: "Logged out" },
    tags: ["auth"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/auth/me",
    description: "Get current authenticated user profile",
    parameters: [],
    responseExample: { success: true, data: { id: "uuid", email: "user@circuvent.com", firstName: "John", lastName: "Doe", role: "EMPLOYEE" } },
    tags: ["auth"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/health",
    description: "Gateway health check with service status",
    parameters: [],
    responseExample: { status: "ok", uptime: 12345, services: { hr: "healthy", finance: "healthy", iot: "healthy" } },
    tags: ["system"], requiresAuth: false,
  },
];

const HR_ENDPOINTS: APIEndpoint[] = [
  {
    method: "GET", path: "/api/hr/employees",
    description: "List all employees with pagination, search, and filters",
    parameters: [
      { name: "page", in: "query", type: "number", required: false, description: "Page number (default: 1)" },
      { name: "limit", in: "query", type: "number", required: false, description: "Items per page (default: 20)" },
      { name: "search", in: "query", type: "string", required: false, description: "Search by name or email" },
      { name: "department", in: "query", type: "string", required: false, description: "Filter by department" },
      { name: "status", in: "query", type: "string", required: false, description: "Filter by employment status" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", employeeCode: "EMP-001", firstName: "John", department: "Engineering" }], meta: { total: 150, page: 1 } },
    tags: ["employees"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/hr/employees",
    description: "Create a new employee record",
    parameters: [
      { name: "firstName", in: "body", type: "string", required: true, description: "First name" },
      { name: "lastName", in: "body", type: "string", required: true, description: "Last name" },
      { name: "email", in: "body", type: "string", required: true, description: "Email address" },
      { name: "department", in: "body", type: "string", required: true, description: "Department name" },
      { name: "designation", in: "body", type: "string", required: true, description: "Job title" },
    ],
    responseExample: { success: true, data: { id: "uuid", employeeCode: "EMP-151" }, message: "Employee created" },
    tags: ["employees"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/employees/:id",
    description: "Get employee details by ID",
    parameters: [
      { name: "id", in: "path", type: "string", required: true, description: "Employee UUID" },
    ],
    responseExample: { success: true, data: { id: "uuid", firstName: "John", lastName: "Doe", department: "Engineering", salary: { basic: 50000 } } },
    tags: ["employees"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/leave/requests",
    description: "List leave requests with filters",
    parameters: [
      { name: "status", in: "query", type: "string", required: false, description: "PENDING, APPROVED, REJECTED" },
      { name: "employeeId", in: "query", type: "string", required: false, description: "Filter by employee" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", type: "CASUAL", status: "PENDING", startDate: "2026-03-15" }] },
    tags: ["leave"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/hr/leave/apply",
    description: "Submit a new leave application",
    parameters: [
      { name: "type", in: "body", type: "string", required: true, description: "Leave type: CASUAL, SICK, EARNED, etc." },
      { name: "startDate", in: "body", type: "string", required: true, description: "Start date (ISO format)" },
      { name: "endDate", in: "body", type: "string", required: true, description: "End date (ISO format)" },
      { name: "reason", in: "body", type: "string", required: true, description: "Reason for leave" },
    ],
    responseExample: { success: true, data: { id: "uuid", status: "PENDING" }, message: "Leave request submitted" },
    tags: ["leave"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/payroll/payslips",
    description: "Get payslips for current user or all (admin)",
    parameters: [
      { name: "month", in: "query", type: "number", required: false, description: "Month (1-12)" },
      { name: "year", in: "query", type: "number", required: false, description: "Year" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", month: 3, year: 2026, grossSalary: 85000, netSalary: 68500 }] },
    tags: ["payroll"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/hr/payroll/run",
    description: "Run payroll processing for a given month",
    parameters: [
      { name: "month", in: "body", type: "number", required: true, description: "Target month" },
      { name: "year", in: "body", type: "number", required: true, description: "Target year" },
    ],
    responseExample: { success: true, data: { processedCount: 150, totalPayout: 12750000 }, message: "Payroll processed" },
    tags: ["payroll"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/icm/tickets",
    description: "List ICM tickets with filters and SLA info",
    parameters: [
      { name: "status", in: "query", type: "string", required: false, description: "OPEN, IN_PROGRESS, RESOLVED, CLOSED" },
      { name: "priority", in: "query", type: "string", required: false, description: "CRITICAL, HIGH, MEDIUM, LOW" },
      { name: "category", in: "query", type: "string", required: false, description: "Ticket category" },
    ],
    responseExample: { success: true, data: [{ ticketCode: "TKT-2026-0001", subject: "VPN Access", priority: "HIGH", slaRemainingMs: 25200000 }] },
    tags: ["icm"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/hr/icm/tickets",
    description: "Create a new support ticket",
    parameters: [
      { name: "subject", in: "body", type: "string", required: true, description: "Ticket subject" },
      { name: "description", in: "body", type: "string", required: true, description: "Detailed description" },
      { name: "category", in: "body", type: "string", required: true, description: "IT_HARDWARE, IT_SOFTWARE, etc." },
      { name: "priority", in: "body", type: "string", required: true, description: "CRITICAL, HIGH, MEDIUM, LOW" },
    ],
    responseExample: { success: true, data: { id: "uuid", ticketCode: "TKT-2026-0042" }, message: "Ticket created" },
    tags: ["icm"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/workstation/boards",
    description: "List Kanban boards",
    parameters: [],
    responseExample: { success: true, data: [{ id: "uuid", name: "Sprint Board", columns: [] }] },
    tags: ["workstation"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/hr/workstation/tasks",
    description: "Create a task on a board",
    parameters: [
      { name: "title", in: "body", type: "string", required: true, description: "Task title" },
      { name: "type", in: "body", type: "string", required: true, description: "BUG, STORY, TASK, EPIC" },
      { name: "priority", in: "body", type: "string", required: true, description: "Task priority" },
      { name: "boardId", in: "body", type: "string", required: true, description: "Target board" },
    ],
    responseExample: { success: true, data: { id: "uuid", taskCode: "TSK-001" }, message: "Task created" },
    tags: ["workstation"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/wiki/pages",
    description: "List wiki pages with search and category filter",
    parameters: [
      { name: "search", in: "query", type: "string", required: false, description: "Search term" },
      { name: "category", in: "query", type: "string", required: false, description: "Category filter" },
    ],
    responseExample: { success: true, data: [{ id: "WIKI-00001", title: "Onboarding Guide", category: "HR" }] },
    tags: ["wiki"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/hr/performance/reviews",
    description: "List performance reviews with filters",
    parameters: [
      { name: "cycle", in: "query", type: "string", required: false, description: "Review cycle" },
      { name: "status", in: "query", type: "string", required: false, description: "Review status" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", employeeName: "John Doe", rating: 4.2, cycle: "H1-2026" }] },
    tags: ["performance"], requiresAuth: true,
  },
];

const IOT_ENDPOINTS: APIEndpoint[] = [
  {
    method: "GET", path: "/api/iot/devices",
    description: "List all registered IoT devices",
    parameters: [
      { name: "type", in: "query", type: "string", required: false, description: "Device type filter" },
      { name: "status", in: "query", type: "string", required: false, description: "ONLINE, OFFLINE, MAINTENANCE" },
      { name: "location", in: "query", type: "string", required: false, description: "Location filter" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", deviceCode: "DEV-001", type: "SENSOR", status: "ONLINE" }] },
    tags: ["devices"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/iot/devices",
    description: "Register a new IoT device",
    parameters: [
      { name: "name", in: "body", type: "string", required: true, description: "Device name" },
      { name: "type", in: "body", type: "string", required: true, description: "SENSOR, ACTUATOR, GATEWAY, CAMERA" },
      { name: "location", in: "body", type: "string", required: true, description: "Physical location" },
    ],
    responseExample: { success: true, data: { id: "uuid", deviceCode: "DEV-042" }, message: "Device registered" },
    tags: ["devices"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/iot/devices/:id/telemetry",
    description: "Get latest telemetry data for a device",
    parameters: [
      { name: "id", in: "path", type: "string", required: true, description: "Device UUID" },
      { name: "from", in: "query", type: "string", required: false, description: "Start datetime (ISO)" },
      { name: "to", in: "query", type: "string", required: false, description: "End datetime (ISO)" },
    ],
    responseExample: { success: true, data: [{ timestamp: "2026-03-11T10:00:00Z", temperature: 24.5, humidity: 60 }] },
    tags: ["telemetry"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/iot/alerts",
    description: "Get active IoT alerts and alarms",
    parameters: [
      { name: "severity", in: "query", type: "string", required: false, description: "CRITICAL, WARNING, INFO" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", deviceId: "uuid", severity: "WARNING", message: "High temperature" }] },
    tags: ["alerts"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/iot/dashboard",
    description: "IoT overview dashboard with device counts and active alerts",
    parameters: [],
    responseExample: { success: true, data: { totalDevices: 250, online: 230, alerts: 5, avgUptime: 99.2 } },
    tags: ["dashboard"], requiresAuth: true,
  },
];

const FINANCE_ENDPOINTS: APIEndpoint[] = [
  {
    method: "GET", path: "/api/finance/transactions",
    description: "List financial transactions with filters",
    parameters: [
      { name: "type", in: "query", type: "string", required: false, description: "INCOME, EXPENSE, TRANSFER" },
      { name: "from", in: "query", type: "string", required: false, description: "Start date" },
      { name: "to", in: "query", type: "string", required: false, description: "End date" },
      { name: "account", in: "query", type: "string", required: false, description: "Account filter" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", type: "EXPENSE", amount: 25000, description: "Office supplies" }] },
    tags: ["transactions"], requiresAuth: true,
  },
  {
    method: "POST", path: "/api/finance/transactions",
    description: "Create a new financial transaction",
    parameters: [
      { name: "type", in: "body", type: "string", required: true, description: "Transaction type" },
      { name: "amount", in: "body", type: "number", required: true, description: "Amount in INR" },
      { name: "description", in: "body", type: "string", required: true, description: "Transaction description" },
      { name: "accountId", in: "body", type: "string", required: true, description: "Account UUID" },
    ],
    responseExample: { success: true, data: { id: "uuid", txnCode: "TXN-2026-0001" }, message: "Transaction recorded" },
    tags: ["transactions"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/finance/invoices",
    description: "List invoices with status filter",
    parameters: [
      { name: "status", in: "query", type: "string", required: false, description: "DRAFT, SENT, PAID, OVERDUE" },
      { name: "clientId", in: "query", type: "string", required: false, description: "Filter by client" },
    ],
    responseExample: { success: true, data: [{ id: "uuid", invoiceNumber: "INV-2026-001", total: 150000, status: "SENT" }] },
    tags: ["invoices"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/finance/reports/pnl",
    description: "Profit & Loss statement for a given period",
    parameters: [
      { name: "from", in: "query", type: "string", required: true, description: "Period start date" },
      { name: "to", in: "query", type: "string", required: true, description: "Period end date" },
    ],
    responseExample: { success: true, data: { revenue: 5000000, expenses: 3200000, netProfit: 1800000 } },
    tags: ["reports"], requiresAuth: true,
  },
  {
    method: "GET", path: "/api/finance/dashboard",
    description: "Financial overview dashboard",
    parameters: [],
    responseExample: { success: true, data: { totalRevenue: 15000000, totalExpenses: 9500000, cashBalance: 8200000, pendingInvoices: 12 } },
    tags: ["dashboard"], requiresAuth: true,
  },
];

// ══════════════════════════════════════════════════════════════
// Service Catalog
// ══════════════════════════════════════════════════════════════

const SERVICE_CATALOG: Record<string, ServiceDocs> = {
  gateway: {
    name: "API Gateway",
    description: "Authentication, routing, and health monitoring",
    baseUrl: "/api",
    version: "1.0.0",
    endpoints: GATEWAY_ENDPOINTS,
  },
  hr: {
    name: "HR & Payroll",
    description: "Employee management, leave, payroll, ICM, workstation, wiki, performance",
    baseUrl: "/api/hr",
    version: "1.0.0",
    endpoints: HR_ENDPOINTS,
  },
  iot: {
    name: "IoT Registry",
    description: "Device management, telemetry, alerts, and monitoring",
    baseUrl: "/api/iot",
    version: "1.0.0",
    endpoints: IOT_ENDPOINTS,
  },
  finance: {
    name: "Financial Ledger",
    description: "Transactions, invoices, reports, and financial dashboard",
    baseUrl: "/api/finance",
    version: "1.0.0",
    endpoints: FINANCE_ENDPOINTS,
  },
};

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function successResponse<T>(data: T, message?: string, meta?: any) {
  return { success: true, data, message, meta };
}

function errorResponse(error: string) {
  return { success: false, error };
}

function getAllEndpoints(): Array<APIEndpoint & { service: string }> {
  const all: Array<APIEndpoint & { service: string }> = [];
  for (const [key, service] of Object.entries(SERVICE_CATALOG)) {
    for (const ep of service.endpoints) {
      all.push({ ...ep, service: key });
    }
  }
  return all;
}

// ══════════════════════════════════════════════════════════════
// GET /api-docs — List all endpoints by service
// ══════════════════════════════════════════════════════════════

router.get("/", async (_req: Request, res: Response) => {
  try {
    const services = Object.entries(SERVICE_CATALOG).map(([key, svc]) => ({
      key,
      name: svc.name,
      description: svc.description,
      baseUrl: svc.baseUrl,
      version: svc.version,
      endpointCount: svc.endpoints.length,
      endpoints: svc.endpoints,
    }));

    res.json(successResponse(services, undefined, {
      totalServices: services.length,
      totalEndpoints: services.reduce((sum, s) => sum + s.endpointCount, 0),
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch API docs"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/gateway — Gateway endpoints
// ══════════════════════════════════════════════════════════════

router.get("/gateway", async (_req: Request, res: Response) => {
  try {
    const service = SERVICE_CATALOG.gateway;
    res.json(successResponse(service));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch gateway docs"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/hr — HR endpoints
// ══════════════════════════════════════════════════════════════

router.get("/hr", async (_req: Request, res: Response) => {
  try {
    const service = SERVICE_CATALOG.hr;
    res.json(successResponse(service));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch HR docs"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/iot — IoT endpoints
// ══════════════════════════════════════════════════════════════

router.get("/iot", async (_req: Request, res: Response) => {
  try {
    const service = SERVICE_CATALOG.iot;
    res.json(successResponse(service));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch IoT docs"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/finance — Finance endpoints
// ══════════════════════════════════════════════════════════════

router.get("/finance", async (_req: Request, res: Response) => {
  try {
    const service = SERVICE_CATALOG.finance;
    res.json(successResponse(service));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch finance docs"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/search — Search across all endpoints
// ══════════════════════════════════════════════════════════════

router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json(errorResponse("Query parameter 'q' is required"));
    }

    const query = String(q).toLowerCase();
    const allEndpoints = getAllEndpoints();

    const matches = allEndpoints.filter((ep) => {
      return (
        ep.path.toLowerCase().includes(query) ||
        ep.description.toLowerCase().includes(query) ||
        ep.method.toLowerCase().includes(query) ||
        ep.tags.some((t) => t.includes(query))
      );
    });

    res.json(successResponse(matches, undefined, { total: matches.length }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Search failed"));
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api-docs/stats — Endpoint statistics
// ══════════════════════════════════════════════════════════════

router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const allEndpoints = getAllEndpoints();

    const byMethod: Record<string, number> = {};
    const byService: Record<string, number> = {};
    const byTag: Record<string, number> = {};

    for (const ep of allEndpoints) {
      byMethod[ep.method] = (byMethod[ep.method] || 0) + 1;
      byService[ep.service] = (byService[ep.service] || 0) + 1;
      for (const tag of ep.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    const authRequired = allEndpoints.filter((ep) => ep.requiresAuth).length;
    const publicEndpoints = allEndpoints.length - authRequired;

    res.json(successResponse({
      totalEndpoints: allEndpoints.length,
      totalServices: Object.keys(SERVICE_CATALOG).length,
      byMethod,
      byService,
      byTag,
      authRequired,
      publicEndpoints,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch stats"));
  }
});

// ══════════════════════════════════════════════════════════════
// Export
// ══════════════════════════════════════════════════════════════

export const apiDocsRouter = router;
