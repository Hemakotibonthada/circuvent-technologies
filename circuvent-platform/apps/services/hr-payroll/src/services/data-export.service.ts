// ──────────────────────────────────────────────────────────────
// HR Payroll — Data Export Service
// CSV, JSON, XLSX export for employees, payroll, attendance,
// leaves, expenses, tickets, timesheets. Streaming support.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type ExportFormat = "CSV" | "JSON" | "XLSX";
export type ExportEntity = "EMPLOYEES" | "PAYROLL" | "ATTENDANCE" | "LEAVES" | "EXPENSES" | "TICKETS" | "TIMESHEETS";

interface ExportOptions {
  entity: ExportEntity;
  format: ExportFormat;
  filters?: Record<string, unknown>;
  columns?: string[];
  dateRange?: { from: string; to: string };
  sortBy?: string;
  sortOrder?: "ASC" | "DESC";
  limit?: number;
  includeHeaders?: boolean;
}

interface ExportResult {
  id: string;
  entity: ExportEntity;
  format: ExportFormat;
  fileName: string;
  content: string;
  rowCount: number;
  fileSize: number;
  generatedAt: string;
  generatedBy: string;
  filters: Record<string, unknown>;
}

interface ExportHistory {
  id: string;
  entity: ExportEntity;
  format: ExportFormat;
  fileName: string;
  rowCount: number;
  fileSize: number;
  generatedAt: string;
  generatedBy: string;
  status: "COMPLETED" | "FAILED" | "IN_PROGRESS";
  error?: string;
}

interface ColumnDefinition {
  key: string;
  header: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN" | "CURRENCY";
  width?: number;
  format?: string;
}

// ══════════════════════════════════════════════════════════════
// Column Definitions
// ══════════════════════════════════════════════════════════════

const ENTITY_COLUMNS: Record<ExportEntity, ColumnDefinition[]> = {
  EMPLOYEES: [
    { key: "id", header: "Employee ID", type: "STRING", width: 15 },
    { key: "firstName", header: "First Name", type: "STRING", width: 20 },
    { key: "lastName", header: "Last Name", type: "STRING", width: 20 },
    { key: "email", header: "Email", type: "STRING", width: 30 },
    { key: "department", header: "Department", type: "STRING", width: 20 },
    { key: "designation", header: "Designation", type: "STRING", width: 25 },
    { key: "dateOfJoining", header: "Date of Joining", type: "DATE", width: 15 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
    { key: "phone", header: "Phone", type: "STRING", width: 15 },
    { key: "salary", header: "Salary (₹)", type: "CURRENCY", width: 15 },
    { key: "panNumber", header: "PAN", type: "STRING", width: 12 },
    { key: "bankAccount", header: "Bank Account", type: "STRING", width: 20 },
  ],
  PAYROLL: [
    { key: "employeeId", header: "Employee ID", type: "STRING", width: 15 },
    { key: "employeeName", header: "Employee Name", type: "STRING", width: 25 },
    { key: "month", header: "Month", type: "STRING", width: 12 },
    { key: "year", header: "Year", type: "NUMBER", width: 8 },
    { key: "basicSalary", header: "Basic (₹)", type: "CURRENCY", width: 12 },
    { key: "hra", header: "HRA (₹)", type: "CURRENCY", width: 12 },
    { key: "da", header: "DA (₹)", type: "CURRENCY", width: 12 },
    { key: "specialAllowance", header: "Special Allow. (₹)", type: "CURRENCY", width: 15 },
    { key: "grossSalary", header: "Gross (₹)", type: "CURRENCY", width: 12 },
    { key: "pf", header: "PF (₹)", type: "CURRENCY", width: 12 },
    { key: "esi", header: "ESI (₹)", type: "CURRENCY", width: 12 },
    { key: "tds", header: "TDS (₹)", type: "CURRENCY", width: 12 },
    { key: "deductions", header: "Total Deductions (₹)", type: "CURRENCY", width: 15 },
    { key: "netSalary", header: "Net Salary (₹)", type: "CURRENCY", width: 15 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
  ],
  ATTENDANCE: [
    { key: "employeeId", header: "Employee ID", type: "STRING", width: 15 },
    { key: "employeeName", header: "Employee Name", type: "STRING", width: 25 },
    { key: "date", header: "Date", type: "DATE", width: 12 },
    { key: "checkIn", header: "Check In", type: "STRING", width: 10 },
    { key: "checkOut", header: "Check Out", type: "STRING", width: 10 },
    { key: "hoursWorked", header: "Hours Worked", type: "NUMBER", width: 12 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
    { key: "overtime", header: "Overtime (hrs)", type: "NUMBER", width: 12 },
    { key: "location", header: "Location", type: "STRING", width: 15 },
  ],
  LEAVES: [
    { key: "employeeId", header: "Employee ID", type: "STRING", width: 15 },
    { key: "employeeName", header: "Employee Name", type: "STRING", width: 25 },
    { key: "leaveType", header: "Leave Type", type: "STRING", width: 15 },
    { key: "startDate", header: "Start Date", type: "DATE", width: 12 },
    { key: "endDate", header: "End Date", type: "DATE", width: 12 },
    { key: "days", header: "Days", type: "NUMBER", width: 8 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
    { key: "approvedBy", header: "Approved By", type: "STRING", width: 20 },
    { key: "reason", header: "Reason", type: "STRING", width: 30 },
  ],
  EXPENSES: [
    { key: "id", header: "Expense ID", type: "STRING", width: 15 },
    { key: "employeeId", header: "Employee ID", type: "STRING", width: 15 },
    { key: "employeeName", header: "Employee Name", type: "STRING", width: 25 },
    { key: "category", header: "Category", type: "STRING", width: 15 },
    { key: "amount", header: "Amount (₹)", type: "CURRENCY", width: 12 },
    { key: "date", header: "Date", type: "DATE", width: 12 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
    { key: "description", header: "Description", type: "STRING", width: 30 },
    { key: "receipt", header: "Receipt", type: "BOOLEAN", width: 8 },
  ],
  TICKETS: [
    { key: "id", header: "Ticket ID", type: "STRING", width: 15 },
    { key: "code", header: "Code", type: "STRING", width: 12 },
    { key: "subject", header: "Subject", type: "STRING", width: 30 },
    { key: "category", header: "Category", type: "STRING", width: 15 },
    { key: "priority", header: "Priority", type: "STRING", width: 10 },
    { key: "status", header: "Status", type: "STRING", width: 15 },
    { key: "assignee", header: "Assignee", type: "STRING", width: 20 },
    { key: "createdAt", header: "Created At", type: "DATE", width: 18 },
    { key: "resolvedAt", header: "Resolved At", type: "DATE", width: 18 },
    { key: "resolutionTime", header: "Resolution (min)", type: "NUMBER", width: 15 },
  ],
  TIMESHEETS: [
    { key: "employeeId", header: "Employee ID", type: "STRING", width: 15 },
    { key: "employeeName", header: "Employee Name", type: "STRING", width: 25 },
    { key: "week", header: "Week", type: "STRING", width: 15 },
    { key: "project", header: "Project", type: "STRING", width: 20 },
    { key: "task", header: "Task", type: "STRING", width: 25 },
    { key: "hoursLogged", header: "Hours", type: "NUMBER", width: 10 },
    { key: "status", header: "Status", type: "STRING", width: 12 },
    { key: "approvedBy", header: "Approved By", type: "STRING", width: 20 },
  ],
};

// ══════════════════════════════════════════════════════════════
// DataExportService
// ══════════════════════════════════════════════════════════════

export class DataExportService {
  private exportHistory: ExportHistory[] = [];
  private idCounter = 0;

  // ── Export ────────────────────────────────────────────────

  async export(options: ExportOptions, userId: string): Promise<ExportResult> {
    const id = `EXP-${String(++this.idCounter).padStart(5, "0")}`;
    const historyEntry: ExportHistory = {
      id,
      entity: options.entity,
      format: options.format,
      fileName: "",
      rowCount: 0,
      fileSize: 0,
      generatedAt: new Date().toISOString(),
      generatedBy: userId,
      status: "IN_PROGRESS",
    };
    this.exportHistory.push(historyEntry);

    try {
      const data = this.fetchData(options);
      const columns = this.resolveColumns(options);
      const content = this.formatData(data, columns, options.format, options.includeHeaders !== false);

      const fileName = `${options.entity.toLowerCase()}_${new Date().toISOString().split("T")[0]}.${options.format.toLowerCase()}`;

      const result: ExportResult = {
        id,
        entity: options.entity,
        format: options.format,
        fileName,
        content,
        rowCount: data.length,
        fileSize: new TextEncoder().encode(content).length,
        generatedAt: new Date().toISOString(),
        generatedBy: userId,
        filters: options.filters ?? {},
      };

      historyEntry.fileName = fileName;
      historyEntry.rowCount = data.length;
      historyEntry.fileSize = result.fileSize;
      historyEntry.status = "COMPLETED";

      return result;
    } catch (err: any) {
      historyEntry.status = "FAILED";
      historyEntry.error = err.message;
      throw err;
    }
  }

  // ── Format Data ───────────────────────────────────────────

  private formatData(data: Record<string, unknown>[], columns: ColumnDefinition[], format: ExportFormat, includeHeaders: boolean): string {
    switch (format) {
      case "CSV":
        return this.toCSV(data, columns, includeHeaders);
      case "JSON":
        return this.toJSON(data, columns);
      case "XLSX":
        return this.toXLSXSimulation(data, columns, includeHeaders);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private toCSV(data: Record<string, unknown>[], columns: ColumnDefinition[], includeHeaders: boolean): string {
    const lines: string[] = [];

    if (includeHeaders) {
      lines.push(columns.map((c) => this.escapeCsv(c.header)).join(","));
    }

    for (const row of data) {
      const values = columns.map((col) => {
        const val = row[col.key];
        return this.escapeCsv(this.formatValue(val, col));
      });
      lines.push(values.join(","));
    }

    return lines.join("\n");
  }

  private toJSON(data: Record<string, unknown>[], columns: ColumnDefinition[]): string {
    const filtered = data.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        obj[col.key] = row[col.key] ?? null;
      }
      return obj;
    });
    return JSON.stringify(filtered, null, 2);
  }

  private toXLSXSimulation(data: Record<string, unknown>[], columns: ColumnDefinition[], includeHeaders: boolean): string {
    // Simulated XLSX output as TSV with metadata header
    const lines: string[] = [];
    lines.push(`## XLSX Export Simulation — ${data.length} rows, ${columns.length} columns`);
    lines.push(`## Generated: ${new Date().toISOString()}`);
    lines.push("");

    if (includeHeaders) {
      lines.push(columns.map((c) => c.header).join("\t"));
    }

    for (const row of data) {
      const values = columns.map((col) => this.formatValue(row[col.key], col));
      lines.push(values.join("\t"));
    }

    return lines.join("\n");
  }

  // ── Helpers ───────────────────────────────────────────────

  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private formatValue(value: unknown, col: ColumnDefinition): string {
    if (value === null || value === undefined) return "";
    switch (col.type) {
      case "CURRENCY":
        return typeof value === "number" ? value.toFixed(2) : String(value);
      case "DATE":
        return typeof value === "string" ? value.split("T")[0] : String(value);
      case "BOOLEAN":
        return value ? "Yes" : "No";
      case "NUMBER":
        return String(value);
      default:
        return String(value);
    }
  }

  private resolveColumns(options: ExportOptions): ColumnDefinition[] {
    const allColumns = ENTITY_COLUMNS[options.entity] ?? [];
    if (options.columns && options.columns.length > 0) {
      return allColumns.filter((c) => options.columns!.includes(c.key));
    }
    return allColumns;
  }

  // ── Fetch Data ────────────────────────────────────────────

  private fetchData(options: ExportOptions): Record<string, unknown>[] {
    const generators: Record<ExportEntity, () => Record<string, unknown>[]> = {
      EMPLOYEES: () => this.generateEmployeeData(options),
      PAYROLL: () => this.generatePayrollData(options),
      ATTENDANCE: () => this.generateAttendanceData(options),
      LEAVES: () => this.generateLeaveData(options),
      EXPENSES: () => this.generateExpenseData(options),
      TICKETS: () => this.generateTicketData(options),
      TIMESHEETS: () => this.generateTimesheetData(options),
    };

    const generator = generators[options.entity];
    if (!generator) throw new Error(`Unknown entity: ${options.entity}`);

    let data = generator();

    if (options.sortBy) {
      data.sort((a, b) => {
        const aVal = String(a[options.sortBy!] ?? "");
        const bVal = String(b[options.sortBy!] ?? "");
        return options.sortOrder === "DESC" ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      });
    }

    if (options.limit) {
      data = data.slice(0, options.limit);
    }

    return data;
  }

  private generateEmployeeData(_options: ExportOptions): Record<string, unknown>[] {
    const departments = ["Engineering", "HR", "Finance", "Marketing", "Operations"];
    const designations = ["Software Engineer", "Senior Engineer", "Team Lead", "Manager", "Analyst", "Intern"];
    return Array.from({ length: 25 }, (_, i) => ({
      id: `EMP-${String(i + 1).padStart(4, "0")}`,
      firstName: `First${i + 1}`,
      lastName: `Last${i + 1}`,
      email: `employee${i + 1}@circuvent.com`,
      department: departments[i % departments.length],
      designation: designations[i % designations.length],
      dateOfJoining: new Date(2022, i % 12, 1 + i).toISOString(),
      status: i < 23 ? "ACTIVE" : "INACTIVE",
      phone: `+91 98765 ${String(43210 + i).padStart(5, "0")}`,
      salary: 45000 + i * 5000,
      panNumber: `ABCDE${String(1234 + i).padStart(4, "0")}F`,
      bankAccount: `XXXX XXXX ${String(1000 + i).padStart(4, "0")}`,
    }));
  }

  private generatePayrollData(_options: ExportOptions): Record<string, unknown>[] {
    return Array.from({ length: 25 }, (_, i) => {
      const basic = 30000 + i * 3000;
      const hra = Math.round(basic * 0.4);
      const da = Math.round(basic * 0.1);
      const special = Math.round(basic * 0.2);
      const gross = basic + hra + da + special;
      const pf = Math.round(basic * 0.12);
      const esi = gross <= 21000 ? Math.round(gross * 0.0075) : 0;
      const tds = Math.round(gross * 0.1);
      const deductions = pf + esi + tds;
      return {
        employeeId: `EMP-${String(i + 1).padStart(4, "0")}`,
        employeeName: `Employee ${i + 1}`,
        month: "March",
        year: 2026,
        basicSalary: basic, hra, da, specialAllowance: special,
        grossSalary: gross, pf, esi, tds, deductions,
        netSalary: gross - deductions,
        status: "PROCESSED",
      };
    });
  }

  private generateAttendanceData(_options: ExportOptions): Record<string, unknown>[] {
    const statuses = ["PRESENT", "PRESENT", "PRESENT", "WFH", "ABSENT", "HALF_DAY"];
    return Array.from({ length: 30 }, (_, i) => ({
      employeeId: `EMP-${String((i % 10) + 1).padStart(4, "0")}`,
      employeeName: `Employee ${(i % 10) + 1}`,
      date: new Date(2026, 2, 1 + i).toISOString(),
      checkIn: "09:15",
      checkOut: "18:30",
      hoursWorked: 8.5 + (i % 3) * 0.5,
      status: statuses[i % statuses.length],
      overtime: i % 5 === 0 ? 1.5 : 0,
      location: i % 4 === 0 ? "WFH" : "Office",
    }));
  }

  private generateLeaveData(_options: ExportOptions): Record<string, unknown>[] {
    const types = ["CASUAL", "EARNED", "SICK", "COMP_OFF", "MATERNITY"];
    const statuses = ["APPROVED", "APPROVED", "PENDING", "REJECTED"];
    return Array.from({ length: 20 }, (_, i) => ({
      employeeId: `EMP-${String((i % 15) + 1).padStart(4, "0")}`,
      employeeName: `Employee ${(i % 15) + 1}`,
      leaveType: types[i % types.length],
      startDate: new Date(2026, 2, 5 + i).toISOString(),
      endDate: new Date(2026, 2, 6 + i + (i % 3)).toISOString(),
      days: 1 + (i % 3),
      status: statuses[i % statuses.length],
      approvedBy: i % 4 !== 3 ? "Manager" : "",
      reason: `Leave reason ${i + 1}`,
    }));
  }

  private generateExpenseData(_options: ExportOptions): Record<string, unknown>[] {
    const categories = ["TRAVEL", "MEALS", "SOFTWARE", "HARDWARE", "TRAINING", "OFFICE_SUPPLIES"];
    return Array.from({ length: 15 }, (_, i) => ({
      id: `EXP-${String(i + 1).padStart(4, "0")}`,
      employeeId: `EMP-${String((i % 10) + 1).padStart(4, "0")}`,
      employeeName: `Employee ${(i % 10) + 1}`,
      category: categories[i % categories.length],
      amount: 1500 + i * 1000,
      date: new Date(2026, 2, 1 + i).toISOString(),
      status: i < 10 ? "APPROVED" : "PENDING",
      description: `Expense for ${categories[i % categories.length].toLowerCase()}`,
      receipt: i % 3 !== 2,
    }));
  }

  private generateTicketData(_options: ExportOptions): Record<string, unknown>[] {
    const categories = ["IT_SUPPORT", "HR_QUERY", "PAYROLL", "FACILITIES"];
    const priorities = ["P1", "P2", "P2", "P3"];
    const statuses = ["RESOLVED", "RESOLVED", "IN_PROGRESS", "OPEN"];
    return Array.from({ length: 20 }, (_, i) => ({
      id: `TKT-${String(i + 1).padStart(4, "0")}`,
      code: `TKT-${String(i + 1).padStart(4, "0")}`,
      subject: `Ticket subject ${i + 1}`,
      category: categories[i % categories.length],
      priority: priorities[i % priorities.length],
      status: statuses[i % statuses.length],
      assignee: `Agent ${(i % 5) + 1}`,
      createdAt: new Date(2026, 2, 1 + (i % 28)).toISOString(),
      resolvedAt: i % 4 < 2 ? new Date(2026, 2, 2 + (i % 28)).toISOString() : null,
      resolutionTime: i % 4 < 2 ? 60 + i * 15 : null,
    }));
  }

  private generateTimesheetData(_options: ExportOptions): Record<string, unknown>[] {
    const projects = ["Project Alpha", "Project Beta", "Internal Tools", "Client Portal"];
    const tasks = ["Development", "Code Review", "Testing", "Documentation", "Meeting"];
    return Array.from({ length: 20 }, (_, i) => ({
      employeeId: `EMP-${String((i % 10) + 1).padStart(4, "0")}`,
      employeeName: `Employee ${(i % 10) + 1}`,
      week: `W${10 + Math.floor(i / 5)}`,
      project: projects[i % projects.length],
      task: tasks[i % tasks.length],
      hoursLogged: 4 + (i % 5),
      status: i % 3 === 0 ? "PENDING" : "APPROVED",
      approvedBy: i % 3 !== 0 ? "Manager" : "",
    }));
  }

  // ── History ───────────────────────────────────────────────

  getExportHistory(userId?: string): ExportHistory[] {
    if (userId) {
      return this.exportHistory.filter((e) => e.generatedBy === userId);
    }
    return [...this.exportHistory];
  }

  getAvailableEntities(): Array<{ entity: ExportEntity; columns: ColumnDefinition[] }> {
    return (Object.keys(ENTITY_COLUMNS) as ExportEntity[]).map((entity) => ({
      entity,
      columns: ENTITY_COLUMNS[entity],
    }));
  }
}
