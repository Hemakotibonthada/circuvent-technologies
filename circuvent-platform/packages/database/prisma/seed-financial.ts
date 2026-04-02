// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Seed Data
// Standard Indian Chart of Accounts for an IoT/AI startup.
// ══════════════════════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function seedFinancial() {
  console.log("🌱 Seeding Financial Ledger...");

  const accounts = [
    // ── Assets (1xxx) ──
    { code: "1100", name: "Cash on Hand", type: "ASSET" as const, subType: "CASH", balance: 250000 },
    { code: "1110", name: "HDFC Bank Current Account", type: "ASSET" as const, subType: "BANK", balance: 4500000 },
    { code: "1120", name: "ICICI Bank Savings", type: "ASSET" as const, subType: "BANK", balance: 1200000 },
    { code: "1200", name: "Accounts Receivable", type: "ASSET" as const, subType: "ACCOUNTS_RECEIVABLE", balance: 850000 },
    { code: "1300", name: "Inventory — Components", type: "ASSET" as const, subType: "INVENTORY", balance: 320000 },
    { code: "1400", name: "Prepaid Expenses", type: "ASSET" as const, subType: "PREPAID", balance: 180000 },
    { code: "1500", name: "Fixed Assets — Equipment", type: "ASSET" as const, subType: "FIXED_ASSET", balance: 1500000 },
    { code: "1510", name: "Fixed Assets — Computers", type: "ASSET" as const, subType: "FIXED_ASSET", balance: 850000 },
    { code: "1600", name: "GST Input Credit", type: "ASSET" as const, subType: "GST_INPUT", balance: 145000 },
    { code: "1700", name: "TDS Receivable", type: "ASSET" as const, subType: "TDS_RECEIVABLE", balance: 95000 },

    // ── Liabilities (2xxx) ──
    { code: "2100", name: "Salary Payable", type: "LIABILITY" as const, subType: "SALARY_PAYABLE", balance: 420000 },
    { code: "2200", name: "Accounts Payable", type: "LIABILITY" as const, subType: "ACCOUNTS_PAYABLE", balance: 280000 },
    { code: "2210", name: "PF Payable", type: "LIABILITY" as const, subType: "TAX_PAYABLE", balance: 72000 },
    { code: "2220", name: "ESI Payable", type: "LIABILITY" as const, subType: "TAX_PAYABLE", balance: 8500 },
    { code: "2230", name: "TDS Payable", type: "LIABILITY" as const, subType: "TAX_PAYABLE", balance: 125000 },
    { code: "2240", name: "Professional Tax Payable", type: "LIABILITY" as const, subType: "TAX_PAYABLE", balance: 12000 },
    { code: "2300", name: "GST Output", type: "LIABILITY" as const, subType: "GST_OUTPUT", balance: 210000 },
    { code: "2400", name: "Equipment Loan", type: "LIABILITY" as const, subType: "LOAN", balance: 500000 },

    // ── Equity (3xxx) ──
    { code: "3100", name: "Share Capital", type: "EQUITY" as const, subType: "SHARE_CAPITAL", balance: 5000000 },
    { code: "3200", name: "Retained Earnings", type: "EQUITY" as const, subType: "RETAINED_EARNINGS", balance: 1500000 },

    // ── Revenue (4xxx) ──
    { code: "4100", name: "Service Revenue — Consulting", type: "REVENUE" as const, subType: "SERVICE_REVENUE", balance: 3200000 },
    { code: "4200", name: "Product Revenue — IoT Devices", type: "REVENUE" as const, subType: "PRODUCT_REVENUE", balance: 1800000 },
    { code: "4300", name: "R&D Grant Income", type: "REVENUE" as const, subType: "GRANT_INCOME", balance: 500000 },
    { code: "4900", name: "Other Income — Interest", type: "REVENUE" as const, subType: "OTHER_INCOME", balance: 45000 },

    // ── Expenses (5xxx-6xxx) ──
    { code: "6100", name: "Salary & Wages", type: "EXPENSE" as const, subType: "SALARY_EXPENSE", balance: 2400000 },
    { code: "6200", name: "Rent Expense", type: "EXPENSE" as const, subType: "RENT_EXPENSE", balance: 360000 },
    { code: "6300", name: "Utilities", type: "EXPENSE" as const, subType: "UTILITIES", balance: 85000 },
    { code: "6400", name: "General & Admin Expenses", type: "EXPENSE" as const, subType: "RENT_EXPENSE", balance: 120000 },
    { code: "6500", name: "R&D Expenses", type: "EXPENSE" as const, subType: "RND_EXPENSE", balance: 650000 },
    { code: "6600", name: "Marketing & Sales", type: "EXPENSE" as const, subType: "RENT_EXPENSE", balance: 175000 },
    { code: "6700", name: "Depreciation", type: "EXPENSE" as const, subType: "DEPRECIATION", balance: 250000 },
    { code: "6800", name: "Travel & Conveyance", type: "EXPENSE" as const, subType: "RENT_EXPENSE", balance: 95000 },
    { code: "6900", name: "Software & Cloud Services", type: "EXPENSE" as const, subType: "UTILITIES", balance: 210000 },
  ];

  for (const acc of accounts) {
    await prisma.ledgerAccount.upsert({
      where: { code: acc.code },
      update: {},
      create: acc,
    });
  }
  console.log(`  ✓ ${accounts.length} ledger accounts created`);

  // ── Sample Journal Entries ──
  const sampleAccountMap = new Map<string, string>();
  const dbAccounts = await prisma.ledgerAccount.findMany();
  for (const a of dbAccounts) sampleAccountMap.set(a.code, a.id);

  const je1 = await prisma.journalEntry.create({
    data: {
      entryNumber: "JE-2026-0001",
      date: new Date("2026-02-28"),
      description: "February 2026 Salary — Engineering Team",
      source: "PAYROLL",
      status: "POSTED",
      fiscalPeriod: "2026-02",
      createdBy: "payroll-system",
      postedBy: "admin",
      postedAt: new Date("2026-02-28"),
      lines: {
        create: [
          { accountCode: "6100", accountId: sampleAccountMap.get("6100")!, debit: 500000, credit: 0, description: "Gross salary", department: "Engineering" },
          { accountCode: "2100", accountId: sampleAccountMap.get("2100")!, debit: 0, credit: 420000, description: "Net salary payable" },
          { accountCode: "2210", accountId: sampleAccountMap.get("2210")!, debit: 0, credit: 48000, description: "PF contribution" },
          { accountCode: "2230", accountId: sampleAccountMap.get("2230")!, debit: 0, credit: 25000, description: "TDS on salary" },
          { accountCode: "2240", accountId: sampleAccountMap.get("2240")!, debit: 0, credit: 7000, description: "Professional tax" },
        ],
      },
    },
  });

  const je2 = await prisma.journalEntry.create({
    data: {
      entryNumber: "JE-2026-0002",
      date: new Date("2026-03-05"),
      description: "Invoice INV-2026-042 — TechCorp IoT Platform",
      source: "INVOICE",
      status: "POSTED",
      fiscalPeriod: "2026-03",
      createdBy: "billing-system",
      postedBy: "admin",
      postedAt: new Date("2026-03-05"),
      lines: {
        create: [
          { accountCode: "1200", accountId: sampleAccountMap.get("1200")!, debit: 354000, credit: 0, description: "TechCorp receivable" },
          { accountCode: "4100", accountId: sampleAccountMap.get("4100")!, debit: 0, credit: 300000, description: "Service revenue" },
          { accountCode: "2300", accountId: sampleAccountMap.get("2300")!, debit: 0, credit: 54000, description: "GST 18%" },
        ],
      },
    },
  });

  console.log("  ✓ 2 sample journal entries created");

  // ── Budgets ──
  const budgets = [
    { accountCode: "6100", fiscalYear: "2025-26", department: "Engineering", amount: 30000000, spent: 24000000 },
    { accountCode: "6200", fiscalYear: "2025-26", amount: 4800000, spent: 3600000 },
    { accountCode: "6500", fiscalYear: "2025-26", department: "R&D", amount: 10000000, spent: 6500000 },
    { accountCode: "6600", fiscalYear: "2025-26", department: "Marketing", amount: 3000000, spent: 1750000 },
    { accountCode: "6900", fiscalYear: "2025-26", department: "IT", amount: 3000000, spent: 2100000 },
  ];

  for (const b of budgets) {
    await prisma.budget.create({ data: b });
  }
  console.log("  ✓ 5 department budgets created");

  // ── Fiscal Periods ──
  for (let m = 4; m <= 12; m++) {
    await prisma.fiscalPeriod.create({
      data: { period: `2025-${String(m).padStart(2, "0")}`, year: 2025, month: m, isClosed: true, closedBy: "admin", closedAt: new Date() },
    });
  }
  for (let m = 1; m <= 3; m++) {
    await prisma.fiscalPeriod.create({
      data: { period: `2026-${String(m).padStart(2, "0")}`, year: 2026, month: m, isClosed: false },
    });
  }
  console.log("  ✓ 12 fiscal periods created (FY 2025-26)");

  console.log("✅ Financial Ledger seed complete!");
}

seedFinancial()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
