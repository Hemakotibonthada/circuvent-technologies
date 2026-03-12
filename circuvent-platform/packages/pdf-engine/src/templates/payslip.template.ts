// ──────────────────────────────────────────────────────────────
// Payslip Template — Generates India-compliant payslip PDF
// Includes earnings breakdown (Basic, HRA, DA, Special,
// Conveyance, LTA, Bonus), statutory deductions, employer
// contributions (EPF, ESI, Medical, Gratuity), YTD
// contributions, banking info, and net-pay-in-words.
// Ported from HT repo payroll automation engine.
// ──────────────────────────────────────────────────────────────

import { PDFRenderer, PDFTableColumn } from "../pdf.renderer";

export interface PayslipInput {
  employee: {
    code: string; name: string; designation: string; department: string;
    pan: string; uan: string; bankAccount: string; bankIFSC: string;
    dateOfJoining: string;
    bankName?: string; accountHolderName?: string;
    location?: string; managerName?: string;
    pfNumber?: string;
  };
  company: {
    name: string; address: string; cin?: string; gstin?: string;
    contact?: string;
  };
  period: {
    month: number; year: number;
    monthName: string;
    totalDays: number; workedDays: number; lopDays: number;
    billableHours?: number; leaveDays?: number;
  };
  earnings: {
    basePay: number; hra: number; da: number; specialAllowance: number;
    conveyanceAllowance?: number; lta?: number;
    bonus: number; otherAllowances: number; grossSalary: number;
  };
  deductions: {
    epfEmployee: number; esiEmployee: number; professionalTax: number;
    tds: number; otherDeductions: number; totalDeductions: number;
  };
  employerContributions: {
    epfEmployer: number; esiEmployer: number; gratuity: number;
    medicalInsurance?: number;
  };
  netSalary: number;
  yearToDate: {
    grossEarnings: number; totalDeductions: number; netPayments: number;
    pfAccumulated: number; tdsDeducted: number;
  };
  /** Optional password hint shown on the payslip footer */
  passwordHint?: string;
}

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Amount to Words (Indian numbering) ──────────────────────
const ONES_WORDS = [
  "Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
  "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen",
];
const TENS_WORDS = ["Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const UNIT_WORDS = ["Crore","Lakh","Thousand","Hundred"] as const;
const UNIT_VALUES = [10_000_000, 100_000, 1_000, 100] as const;

function toTwoDigitWords(value: number): string {
  if (value < 20) return ONES_WORDS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? TENS_WORDS[tens - 2] : `${TENS_WORDS[tens - 2]}-${ONES_WORDS[ones]}`;
}

function convertRupeesToWords(amount: number): string {
  if (amount === 0) return "Zero";
  let remainder = amount;
  const parts: string[] = [];
  UNIT_VALUES.forEach((unitValue, index) => {
    if (remainder >= unitValue) {
      const unitAmount = Math.floor(remainder / unitValue);
      remainder %= unitValue;
      let unitWords: string;
      if (unitAmount >= 100) {
        const hundreds = Math.floor(unitAmount / 100);
        const rem = unitAmount % 100;
        unitWords = `${ONES_WORDS[hundreds]} Hundred`;
        if (rem > 0) unitWords += ` ${toTwoDigitWords(rem)}`;
      } else {
        unitWords = toTwoDigitWords(unitAmount);
      }
      parts.push(`${unitWords} ${UNIT_WORDS[index]}`);
    }
  });
  if (remainder > 0) {
    if (remainder >= 100) {
      const hundreds = Math.floor(remainder / 100);
      remainder %= 100;
      let hw = `${ONES_WORDS[hundreds]} Hundred`;
      if (remainder > 0) hw += ` ${toTwoDigitWords(remainder)}`;
      parts.push(hw);
    } else {
      parts.push(toTwoDigitWords(remainder));
    }
  }
  return parts.join(" ");
}

function convertAmountToIndianWords(amount: number): string {
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  if (rupees > 0) parts.push(`${convertRupeesToWords(rupees)} Rupees`);
  if (paise > 0) parts.push(`${toTwoDigitWords(paise)} Paise`);
  return `${parts.join(" and ")} Only`;
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

  // Employee details (enhanced with banking, location, UAN/PAN, PF#)
  renderer.renderKeyValueSection("Employee Details", [
    ["Employee Code", input.employee.code],
    ["Name", input.employee.name],
    ["Designation", input.employee.designation],
    ["Department", input.employee.department],
    ["Work Location", input.employee.location || "N/A"],
    ["Account Holder", input.employee.accountHolderName || input.employee.name],
    ["Bank Name", input.employee.bankName || "N/A"],
    ["Bank A/C", input.employee.bankAccount ? `****${input.employee.bankAccount.slice(-4)}` : "N/A"],
    ["IFSC", input.employee.bankIFSC || "N/A"],
    ["UAN", input.employee.uan || "N/A"],
    ["PF Number", input.employee.pfNumber || "N/A"],
    ["PAN", input.employee.pan || "N/A"],
  ]);

  renderer.moveDown(0.5);

  // Pay period with attendance & leave
  const periodPairs: [string, string][] = [
    ["Month", `${input.period.monthName} ${input.period.year}`],
    ["Total Days", String(input.period.totalDays)],
    ["Days Worked", String(input.period.workedDays)],
    ["LOP Days", String(input.period.lopDays)],
  ];
  if (input.period.billableHours != null) {
    periodPairs.push(["Billable Hours", `${input.period.billableHours.toFixed(1)} hrs`]);
  }
  if (input.period.leaveDays != null) {
    periodPairs.push(["Leave Days", String(input.period.leaveDays)]);
  }
  renderer.renderKeyValueSection("Pay Period & Attendance", periodPairs);

  renderer.moveDown(0.5);

  // ── Earnings table (with Conveyance, LTA from HT) ────────
  const earningsColumns: PDFTableColumn[] = [
    { header: "Earnings", key: "component", width: 200, align: "left" },
    { header: "Amount (₹)", key: "amount", width: 100, align: "right", format: (v) => formatINR(v as number) },
  ];

  const earningsRows: { component: string; amount: number }[] = [
    { component: "Basic Pay", amount: input.earnings.basePay },
    { component: "House Rent Allowance", amount: input.earnings.hra },
    ...(input.earnings.da > 0 ? [{ component: "Dearness Allowance", amount: input.earnings.da }] : []),
    { component: "Special Allowance", amount: input.earnings.specialAllowance },
    ...(input.earnings.conveyanceAllowance ? [{ component: "Conveyance Allowance", amount: input.earnings.conveyanceAllowance }] : []),
    ...(input.earnings.lta ? [{ component: "Leave Travel Allowance", amount: input.earnings.lta }] : []),
    ...(input.earnings.bonus > 0 ? [{ component: "Performance Bonus", amount: input.earnings.bonus }] : []),
    ...(input.earnings.otherAllowances > 0 ? [{ component: "Other Allowances", amount: input.earnings.otherAllowances }] : []),
  ];

  renderer.renderTable(earningsColumns, earningsRows);
  renderer.renderSummaryRow("Gross Salary", formatINR(input.earnings.grossSalary), true);

  renderer.moveDown(0.5);

  // ── Deductions table ──────────────────────────────────────
  const deductionColumns: PDFTableColumn[] = [
    { header: "Deductions", key: "component", width: 200, align: "left" },
    { header: "Amount (₹)", key: "amount", width: 100, align: "right", format: (v) => formatINR(v as number) },
  ];

  const deductionRows = [
    { component: "Employee Provident Fund (12% of Basic)", amount: input.deductions.epfEmployee },
    ...(input.deductions.esiEmployee > 0 ? [{ component: "ESI (Employee)", amount: input.deductions.esiEmployee }] : []),
    { component: "Professional Tax", amount: input.deductions.professionalTax },
    { component: "Income Tax (TDS)", amount: input.deductions.tds },
    ...(input.deductions.otherDeductions > 0 ? [{ component: "Other Deductions", amount: input.deductions.otherDeductions }] : []),
  ];

  renderer.renderTable(deductionColumns, deductionRows);
  renderer.renderSummaryRow("Total Deductions", formatINR(input.deductions.totalDeductions), true);

  renderer.moveDown(1);

  // ── NET PAY with amount in words ──────────────────────────
  renderer.renderSummaryRow("NET PAY (Take Home)", formatINR(input.netSalary), true);
  renderer.renderSummaryRow("Amount in Words", convertAmountToIndianWords(input.netSalary), false);

  renderer.moveDown(0.5);

  // ── Employer contributions (with medical insurance from HT) ──
  const employerPairs: [string, string][] = [
    ["EPF (Employer)", formatINR(input.employerContributions.epfEmployer)],
    ["ESI (Employer)", formatINR(input.employerContributions.esiEmployer)],
    ["Gratuity Provision", formatINR(input.employerContributions.gratuity)],
  ];
  if (input.employerContributions.medicalInsurance) {
    employerPairs.push(["Medical Insurance (Company Share)", formatINR(input.employerContributions.medicalInsurance)]);
  }
  const totalEmployerContributions =
    input.employerContributions.epfEmployer +
    input.employerContributions.esiEmployer +
    input.employerContributions.gratuity +
    (input.employerContributions.medicalInsurance || 0);
  employerPairs.push(["Total Employer Contributions", formatINR(totalEmployerContributions)]);

  renderer.renderKeyValueSection("Employer Contributions (not deducted from salary)", employerPairs, 3);

  renderer.moveDown(0.5);

  // ── CTC summary ───────────────────────────────────────────
  const totalCTC = input.earnings.grossSalary + totalEmployerContributions;
  renderer.renderKeyValueSection("Cost to Company", [
    ["Gross Earnings", formatINR(input.earnings.grossSalary)],
    ["Total Deductions", formatINR(input.deductions.totalDeductions)],
    ["Employer Contributions", formatINR(totalEmployerContributions)],
    ["CTC (Monthly)", formatINR(totalCTC)],
  ], 4);

  renderer.moveDown(0.5);

  // ── Year to Date (financial year) ─────────────────────────
  renderer.renderKeyValueSection("Year to Date (FY)", [
    ["Gross Earnings", formatINR(input.yearToDate.grossEarnings)],
    ["Total Deductions", formatINR(input.yearToDate.totalDeductions)],
    ["Net Payments", formatINR(input.yearToDate.netPayments)],
    ["PF Accumulated", formatINR(input.yearToDate.pfAccumulated)],
    ["TDS Deducted", formatINR(input.yearToDate.tdsDeducted)],
  ], 3);

  // ── Footer note ───────────────────────────────────────────
  const noteLines = [
    "This is a system-generated payslip and does not require a signature.",
    "For discrepancies, contact HR within 5 working days of receipt.",
  ];
  if (input.passwordHint) noteLines.push(`Password format: ${input.passwordHint}`);
  if (input.company.cin) noteLines.push(`CIN: ${input.company.cin}`);
  if (input.company.gstin) noteLines.push(`GSTIN: ${input.company.gstin}`);

  renderer.renderNote(noteLines.join(" "));

  renderer.renderFooter();

  return renderer.toBuffer();
}
