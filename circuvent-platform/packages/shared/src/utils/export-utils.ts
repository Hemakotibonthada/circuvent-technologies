// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Export & Report Utilities
// CSV generation/parsing, JSON export, HTML report templates
// for payslips, attendance, expenses, leave, and email tables.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface ColumnDefinition {
  key: string;
  header: string;
  formatter?: (value: unknown) => string;
  width?: number;
}

export interface EmployeePayslipData {
  employeeName: string;
  employeeId: string;
  designation: string;
  department: string;
  panNumber?: string;
  bankAccount?: string;
  uanNumber?: string;
  month: string;
  year: number;
  payDate?: string;
  basePay: number;
  hra: number;
  da: number;
  specialAllowance: number;
  bonus: number;
  grossSalary: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  workingDays: number;
  lopDays: number;
  companyName?: string;
}

export interface AttendanceRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  wfhDays: number;
  overtimeHours: number;
}

export interface ExpenseRecord {
  id: string;
  employeeName: string;
  department: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
  description: string;
  receiptAttached: boolean;
}

export interface LeaveReportRecord {
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string;
  approver?: string;
}

// ══════════════════════════════════════════════════════════════
// CSV Export / Parse
// ══════════════════════════════════════════════════════════════

/**
 * Escape a CSV field value (handle commas, quotes, newlines).
 */
function escapeCSVField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a CSV string from an array of objects.
 * @param data Array of objects to export.
 * @param filename Suggested filename (included in header comment).
 * @param columns Column definitions with keys and headers.
 * @returns CSV string with headers and data rows.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns: ColumnDefinition[]
): string {
  if (!data || data.length === 0) {
    return columns.map((c) => escapeCSVField(c.header)).join(",") + "\n";
  }

  const headerRow = columns.map((c) => escapeCSVField(c.header)).join(",");
  const dataRows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        const formatted = col.formatter ? col.formatter(value) : value;
        return escapeCSVField(formatted);
      })
      .join(",")
  );

  return [headerRow, ...dataRows].join("\n") + "\n";
}

/**
 * Parse a CSV string into an array of objects.
 * First row is treated as headers.
 */
export function parseCSV(csvString: string): Record<string, string>[] {
  if (!csvString || !csvString.trim()) return [];

  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header.trim()] = (values[idx] || "").trim();
    });
    results.push(obj);
  }

  return results;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

// ══════════════════════════════════════════════════════════════
// JSON Export
// ══════════════════════════════════════════════════════════════

/**
 * Export data as a formatted JSON string.
 * Pretty-printed with 2-space indentation.
 */
export function exportToJSON<T>(data: T): string {
  return JSON.stringify(data, null, 2);
}

// ══════════════════════════════════════════════════════════════
// HTML Reports
// ══════════════════════════════════════════════════════════════

const INR = (amount: number): string =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Generate an HTML salary slip (payslip) for an employee.
 */
export function generateSalarySlipHTML(employee: EmployeePayslipData): string {
  const company = employee.companyName || "Circuvent Technologies Pvt Ltd";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Payslip - ${employee.month} ${employee.year}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
  .payslip { max-width: 800px; margin: 0 auto; border: 2px solid #1a365d; padding: 30px; }
  .header { text-align: center; border-bottom: 2px solid #1a365d; padding-bottom: 15px; margin-bottom: 20px; }
  .header h1 { margin: 0; color: #1a365d; font-size: 20px; }
  .header p { margin: 5px 0; font-size: 12px; color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; font-size: 13px; }
  .info-grid .label { font-weight: bold; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { background: #1a365d; color: #fff; padding: 8px 12px; text-align: left; }
  td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
  .amount { text-align: right; font-family: monospace; }
  .total-row { font-weight: bold; background: #f7fafc; border-top: 2px solid #1a365d; }
  .net-pay { text-align: center; font-size: 18px; font-weight: bold; color: #1a365d; margin-top: 20px; padding: 15px; background: #ebf8ff; border-radius: 8px; }
  .footer { text-align: center; font-size: 11px; color: #999; margin-top: 20px; }
</style>
</head>
<body>
<div class="payslip">
  <div class="header">
    <h1>${company}</h1>
    <p>Payslip for ${employee.month} ${employee.year}</p>
    <p>Pay Date: ${employee.payDate || "End of Month"}</p>
  </div>
  <div class="info-grid">
    <div><span class="label">Employee Name:</span> ${employee.employeeName}</div>
    <div><span class="label">Employee ID:</span> ${employee.employeeId}</div>
    <div><span class="label">Designation:</span> ${employee.designation}</div>
    <div><span class="label">Department:</span> ${employee.department}</div>
    <div><span class="label">PAN:</span> ${employee.panNumber || "N/A"}</div>
    <div><span class="label">UAN:</span> ${employee.uanNumber || "N/A"}</div>
    <div><span class="label">Working Days:</span> ${employee.workingDays}</div>
    <div><span class="label">LOP Days:</span> ${employee.lopDays}</div>
  </div>
  <table>
    <thead><tr><th>Earnings</th><th class="amount">Amount</th><th>Deductions</th><th class="amount">Amount</th></tr></thead>
    <tbody>
      <tr><td>Basic Pay</td><td class="amount">${INR(employee.basePay)}</td><td>PF Deduction</td><td class="amount">${INR(employee.pfDeduction)}</td></tr>
      <tr><td>HRA</td><td class="amount">${INR(employee.hra)}</td><td>ESI Deduction</td><td class="amount">${INR(employee.esiDeduction)}</td></tr>
      <tr><td>DA</td><td class="amount">${INR(employee.da)}</td><td>Professional Tax</td><td class="amount">${INR(employee.professionalTax)}</td></tr>
      <tr><td>Special Allowance</td><td class="amount">${INR(employee.specialAllowance)}</td><td>TDS</td><td class="amount">${INR(employee.tds)}</td></tr>
      <tr><td>Bonus</td><td class="amount">${INR(employee.bonus)}</td><td>Other Deductions</td><td class="amount">${INR(employee.otherDeductions)}</td></tr>
      <tr class="total-row"><td>Gross Salary</td><td class="amount">${INR(employee.grossSalary)}</td><td>Total Deductions</td><td class="amount">${INR(employee.totalDeductions)}</td></tr>
    </tbody>
  </table>
  <div class="net-pay">Net Pay: ${INR(employee.netSalary)}</div>
  <div class="footer">This is a system-generated payslip. For queries, contact HR.</div>
</div>
</body>
</html>`;
}

/**
 * Generate an HTML attendance report.
 */
export function generateAttendanceReport(data: AttendanceRecord[]): string {
  const totalPresent = data.reduce((s, r) => s + r.presentDays, 0);
  const totalAbsent = data.reduce((s, r) => s + r.absentDays, 0);
  const avgAttendance = data.length > 0
    ? ((totalPresent / data.reduce((s, r) => s + r.totalDays, 0)) * 100).toFixed(1)
    : "0";

  const rows = data
    .map(
      (r) =>
        `<tr><td>${r.employeeId}</td><td>${r.employeeName}</td><td>${r.department}</td>` +
        `<td class="amount">${r.totalDays}</td><td class="amount">${r.presentDays}</td>` +
        `<td class="amount">${r.absentDays}</td><td class="amount">${r.halfDays}</td>` +
        `<td class="amount">${r.lateDays}</td><td class="amount">${r.wfhDays}</td>` +
        `<td class="amount">${r.overtimeHours}h</td></tr>`
    )
    .join("\n");

  return `<div class="report">
<h2>Attendance Report</h2>
<p>Total Employees: ${data.length} | Avg Attendance: ${avgAttendance}% | Total Absent Days: ${totalAbsent}</p>
<table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Total</th><th>Present</th><th>Absent</th><th>Half</th><th>Late</th><th>WFH</th><th>OT</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

/**
 * Generate an HTML expense report.
 */
export function generateExpenseReport(expenses: ExpenseRecord[]): string {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const rows = expenses
    .map(
      (e) =>
        `<tr><td>${e.date}</td><td>${e.employeeName}</td><td>${e.department}</td>` +
        `<td>${e.category}</td><td class="amount">${INR(e.amount)}</td>` +
        `<td>${e.status}</td><td>${e.receiptAttached ? "✓" : "✗"}</td></tr>`
    )
    .join("\n");

  const categoryRows = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => `<tr><td>${cat}</td><td class="amount">${INR(amt)}</td></tr>`)
    .join("\n");

  return `<div class="report">
<h2>Expense Report</h2>
<p>Total Claims: ${expenses.length} | Total Amount: ${INR(total)}</p>
<h3>By Category</h3>
<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${categoryRows}</tbody></table>
<h3>Details</h3>
<table><thead><tr><th>Date</th><th>Employee</th><th>Dept</th><th>Category</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

/**
 * Format data as an HTML table suitable for email embedding.
 */
export function formatTableForEmail<T extends Record<string, unknown>>(
  data: T[],
  columns: ColumnDefinition[]
): string {
  if (!data || data.length === 0) {
    return `<p style="color:#999;">No data available.</p>`;
  }

  const headerCells = columns
    .map((c) => `<th style="background:#1a365d;color:#fff;padding:8px 12px;text-align:left;font-size:13px;">${c.header}</th>`)
    .join("");

  const dataRows = data
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? "#fff" : "#f7fafc";
      const cells = columns
        .map((col) => {
          const value = row[col.key];
          const formatted = col.formatter ? col.formatter(value) : (value ?? "");
          return `<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;background:${bg};font-size:13px;">${formatted}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");

  return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">
<thead><tr>${headerCells}</tr></thead>
<tbody>${dataRows}</tbody></table>`;
}

/**
 * Generate an HTML leave report.
 */
export function generateLeaveReport(leaveRecords: LeaveReportRecord[]): string {
  const totalDays = leaveRecords.reduce((s, r) => s + r.days, 0);
  const byType = leaveRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.leaveType] = (acc[r.leaveType] || 0) + r.days;
    return acc;
  }, {});
  const byStatus = leaveRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  const rows = leaveRecords
    .map(
      (r) =>
        `<tr><td>${r.employeeId}</td><td>${r.employeeName}</td><td>${r.department}</td>` +
        `<td>${r.leaveType}</td><td>${r.startDate}</td><td>${r.endDate}</td>` +
        `<td class="amount">${r.days}</td><td>${r.status}</td>` +
        `<td>${r.approver || "—"}</td></tr>`
    )
    .join("\n");

  const summaryRows = Object.entries(byType)
    .map(([type, days]) => `<tr><td>${type}</td><td class="amount">${days}</td></tr>`)
    .join("\n");

  const statusSummary = Object.entries(byStatus)
    .map(([s, c]) => `${s}: ${c}`)
    .join(" | ");

  return `<div class="report">
<h2>Leave Report</h2>
<p>Total Leave Days: ${totalDays} | Records: ${leaveRecords.length} | ${statusSummary}</p>
<h3>By Leave Type</h3>
<table><thead><tr><th>Leave Type</th><th>Days</th></tr></thead><tbody>${summaryRows}</tbody></table>
<h3>Details</h3>
<table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Approver</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}
