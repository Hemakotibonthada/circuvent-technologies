// ──────────────────────────────────────────────────────────────
// Payslip Template — Generates India-compliant payslip PDF
// Includes earnings breakdown, statutory deductions, YTD,
// and employer contribution disclosure.
// ──────────────────────────────────────────────────────────────

import { PDFRenderer, PDFTableColumn } from "../pdf.renderer";

export interface PayslipInput {
  employee: {
    code: string; name: string; designation: string; department: string;
    pan: string; uan: string; bankAccount: string; bankIFSC: string;
    dateOfJoining: string;
  };
  company: {
    name: string; address: string; cin?: string; gstin?: string;
  };
  period: {
    month: number; year: number;
    monthName: string;
    totalDays: number; workedDays: number; lopDays: number;
  };
  earnings: {
    basePay: number; hra: number; da: number; specialAllowance: number;
    bonus: number; otherAllowances: number; grossSalary: number;
  };
  deductions: {
    epfEmployee: number; esiEmployee: number; professionalTax: number;
    tds: number; otherDeductions: number; totalDeductions: number;
  };
  employerContributions: {
    epfEmployer: number; esiEmployer: number; gratuity: number;
  };
  netSalary: number;
  yearToDate: {
    grossEarnings: number; totalDeductions: number; netPayments: number;
    pfAccumulated: number; tdsDeducted: number;
  };
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export async function generatePayslipPDF(input: PayslipInput): Promise<{ buffer: Buffer; checksum: string }> {
  const renderer = new PDFRenderer({
    title: `Payslip — ${input.period.monthName} ${input.period.year}`,
    subtitle: `Employee: ${input.employee.name} (${input.employee.code})`,
    companyName: input.company.name,
    companyAddress: input.company.address,
    pageSize: "A4",
  });

  renderer.renderHeader();

  // Employee details
  renderer.renderKeyValueSection("Employee Details", [
    ["Employee Code", input.employee.code],
    ["Name", input.employee.name],
    ["Designation", input.employee.designation],
    ["Department", input.employee.department],
    ["PAN", input.employee.pan || "N/A"],
    ["UAN", input.employee.uan || "N/A"],
    ["Bank A/C", input.employee.bankAccount ? `****${input.employee.bankAccount.slice(-4)}` : "N/A"],
    ["IFSC", input.employee.bankIFSC || "N/A"],
  ]);

  renderer.moveDown(0.5);

  // Pay period
  renderer.renderKeyValueSection("Pay Period", [
    ["Month", `${input.period.monthName} ${input.period.year}`],
    ["Total Days", String(input.period.totalDays)],
    ["Days Worked", String(input.period.workedDays)],
    ["LOP Days", String(input.period.lopDays)],
  ]);

  renderer.moveDown(0.5);

  // Earnings & Deductions side-by-side as tables
  const earningsColumns: PDFTableColumn[] = [
    { header: "Earnings", key: "component", width: 200, align: "left" },
    { header: "Amount (₹)", key: "amount", width: 100, align: "right", format: (v) => formatINR(v as number) },
  ];

  const earningsRows = [
    { component: "Basic Pay", amount: input.earnings.basePay },
    { component: "House Rent Allowance", amount: input.earnings.hra },
    { component: "Dearness Allowance", amount: input.earnings.da },
    { component: "Special Allowance", amount: input.earnings.specialAllowance },
    ...(input.earnings.bonus > 0 ? [{ component: "Performance Bonus", amount: input.earnings.bonus }] : []),
    ...(input.earnings.otherAllowances > 0 ? [{ component: "Other Allowances", amount: input.earnings.otherAllowances }] : []),
  ];

  renderer.renderTable(earningsColumns, earningsRows);
  renderer.renderSummaryRow("Gross Salary", formatINR(input.earnings.grossSalary), true);

  renderer.moveDown(0.5);

  // Deductions
  const deductionColumns: PDFTableColumn[] = [
    { header: "Deductions", key: "component", width: 200, align: "left" },
    { header: "Amount (₹)", key: "amount", width: 100, align: "right", format: (v) => formatINR(v as number) },
  ];

  const deductionRows = [
    { component: "Provident Fund (Employee)", amount: input.deductions.epfEmployee },
    ...(input.deductions.esiEmployee > 0 ? [{ component: "ESI (Employee)", amount: input.deductions.esiEmployee }] : []),
    { component: "Professional Tax", amount: input.deductions.professionalTax },
    { component: "Income Tax (TDS)", amount: input.deductions.tds },
    ...(input.deductions.otherDeductions > 0 ? [{ component: "Other Deductions", amount: input.deductions.otherDeductions }] : []),
  ];

  renderer.renderTable(deductionColumns, deductionRows);
  renderer.renderSummaryRow("Total Deductions", formatINR(input.deductions.totalDeductions), true);

  renderer.moveDown(1);

  // Net Pay
  renderer.renderSummaryRow("NET PAY (Take Home)", formatINR(input.netSalary), true);

  renderer.moveDown(0.5);

  // Employer contributions
  renderer.renderKeyValueSection("Employer Contributions (not deducted from salary)", [
    ["EPF (Employer)", formatINR(input.employerContributions.epfEmployer)],
    ["ESI (Employer)", formatINR(input.employerContributions.esiEmployer)],
    ["Gratuity", formatINR(input.employerContributions.gratuity)],
  ], 3);

  renderer.moveDown(0.5);

  // Year to Date
  renderer.renderKeyValueSection("Year to Date (FY)", [
    ["Gross Earnings", formatINR(input.yearToDate.grossEarnings)],
    ["Total Deductions", formatINR(input.yearToDate.totalDeductions)],
    ["Net Payments", formatINR(input.yearToDate.netPayments)],
    ["PF Accumulated", formatINR(input.yearToDate.pfAccumulated)],
    ["TDS Deducted", formatINR(input.yearToDate.tdsDeducted)],
  ], 3);

  renderer.renderNote(
    "This is a system-generated payslip and does not require a signature. " +
    "For discrepancies, contact HR within 7 working days of receipt. " +
    `${input.company.cin ? `CIN: ${input.company.cin}` : ""} ` +
    `${input.company.gstin ? `GSTIN: ${input.company.gstin}` : ""}`
  );

  renderer.renderFooter();

  return renderer.toBuffer();
}
