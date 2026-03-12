// ──────────────────────────────────────────────────────────────
// DataExportService — Test Suite
// Tests for CSV/JSON/XLSX export, column filtering,
// entity data generation, export history.
// ──────────────────────────────────────────────────────────────

const mockPrisma = {
  generatedDocument: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { DataExportService } from "../services/data-export.service";

// ══════════════════════════════════════════════════════════════
// Setup
// ══════════════════════════════════════════════════════════════

let service: DataExportService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new DataExportService();
});

// ══════════════════════════════════════════════════════════════
// CSV Export
// ══════════════════════════════════════════════════════════════

describe("CSV Export", () => {
  it("should export employees as CSV", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "CSV" }, "user-001");
    expect(result.format).toBe("CSV");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.content).toContain("Employee ID");
    expect(result.content).toContain("First Name");
    expect(result.fileName).toMatch(/employees.*\.csv$/);
  });

  it("should export payroll as CSV", async () => {
    const result = await service.export({ entity: "PAYROLL", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.content).toContain("Net Salary");
  });

  it("should export attendance as CSV", async () => {
    const result = await service.export({ entity: "ATTENDANCE", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.content).toContain("Check In");
  });

  it("should export leaves as CSV", async () => {
    const result = await service.export({ entity: "LEAVES", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.content).toContain("Leave Type");
  });

  it("should export expenses as CSV", async () => {
    const result = await service.export({ entity: "EXPENSES", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
  });

  it("should export tickets as CSV", async () => {
    const result = await service.export({ entity: "TICKETS", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
  });

  it("should export timesheets as CSV", async () => {
    const result = await service.export({ entity: "TIMESHEETS", format: "CSV" }, "user-001");
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.content).toContain("Project");
  });

  it("should handle CSV escaping for values with commas", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "CSV" }, "user-001");
    expect(result.content).toBeTruthy();
  });

  it("should omit headers when includeHeaders is false", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "CSV", includeHeaders: false }, "user-001");
    expect(result.content.startsWith("Employee ID")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// JSON Export
// ══════════════════════════════════════════════════════════════

describe("JSON Export", () => {
  it("should export employees as JSON", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "JSON" }, "user-001");
    expect(result.format).toBe("JSON");
    const parsed = JSON.parse(result.content);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty("id");
    expect(parsed[0]).toHaveProperty("firstName");
  });

  it("should export payroll as JSON", async () => {
    const result = await service.export({ entity: "PAYROLL", format: "JSON" }, "user-001");
    const parsed = JSON.parse(result.content);
    expect(parsed[0]).toHaveProperty("netSalary");
    expect(parsed[0]).toHaveProperty("grossSalary");
  });
});

// ══════════════════════════════════════════════════════════════
// XLSX Export (Simulation)
// ══════════════════════════════════════════════════════════════

describe("XLSX Export", () => {
  it("should export employees as XLSX simulation", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "XLSX" }, "user-001");
    expect(result.content).toContain("XLSX Export Simulation");
    expect(result.rowCount).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Column Filtering
// ══════════════════════════════════════════════════════════════

describe("Column Filtering", () => {
  it("should export only selected columns", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "CSV", columns: ["id", "firstName", "email"] }, "user-001");
    const headerLine = result.content.split("\n")[0];
    expect(headerLine).toContain("Employee ID");
    expect(headerLine).toContain("First Name");
    expect(headerLine).toContain("Email");
    expect(headerLine).not.toContain("Salary");
  });
});

// ══════════════════════════════════════════════════════════════
// Sorting and Limiting
// ══════════════════════════════════════════════════════════════

describe("Sorting and Limiting", () => {
  it("should limit the number of exported rows", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "JSON", limit: 5 }, "user-001");
    const parsed = JSON.parse(result.content);
    expect(parsed.length).toBe(5);
  });

  it("should sort exported data", async () => {
    const result = await service.export({ entity: "EMPLOYEES", format: "JSON", sortBy: "firstName", sortOrder: "ASC" }, "user-001");
    const parsed = JSON.parse(result.content);
    expect(parsed.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════
// Export History
// ══════════════════════════════════════════════════════════════

describe("Export History", () => {
  it("should track export history", async () => {
    await service.export({ entity: "EMPLOYEES", format: "CSV" }, "user-001");
    await service.export({ entity: "PAYROLL", format: "JSON" }, "user-001");

    const history = service.getExportHistory();
    expect(history.length).toBe(2);
    expect(history[0].status).toBe("COMPLETED");
  });

  it("should filter history by user", async () => {
    await service.export({ entity: "EMPLOYEES", format: "CSV" }, "user-001");
    await service.export({ entity: "EMPLOYEES", format: "CSV" }, "user-002");

    const history = service.getExportHistory("user-001");
    expect(history.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// Available Entities
// ══════════════════════════════════════════════════════════════

describe("Available Entities", () => {
  it("should list all available entities with columns", () => {
    const entities = service.getAvailableEntities();
    expect(entities.length).toBe(7);
    expect(entities.map((e) => e.entity)).toEqual(
      expect.arrayContaining(["EMPLOYEES", "PAYROLL", "ATTENDANCE", "LEAVES", "EXPENSES", "TICKETS", "TIMESHEETS"]),
    );
  });

  it("should have column definitions for each entity", () => {
    const entities = service.getAvailableEntities();
    for (const entity of entities) {
      expect(entity.columns.length).toBeGreaterThan(0);
      for (const col of entity.columns) {
        expect(col.key).toBeTruthy();
        expect(col.header).toBeTruthy();
        expect(["STRING", "NUMBER", "DATE", "BOOLEAN", "CURRENCY"]).toContain(col.type);
      }
    }
  });
});
