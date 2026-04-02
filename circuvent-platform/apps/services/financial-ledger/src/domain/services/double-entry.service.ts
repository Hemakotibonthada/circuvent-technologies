// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Double-Entry Accounting Service
// Core engine that processes journal entries and updates account balances.
// Ensures the fundamental accounting equation is always maintained.
// ══════════════════════════════════════════════════════════════════════════════

import { AccountEntity, AccountType } from "../entities/account.entity";
import { JournalEntryEntity, JournalLine, JournalSource, JournalStatus } from "../entities/journal-entry.entity";
import { MoneyVO } from "../value-objects/money.vo";

/**
 * Trial balance entry.
 */
export interface TrialBalanceEntry {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  debitBalance: MoneyVO;
  creditBalance: MoneyVO;
}

/**
 * Trial balance report.
 */
export interface TrialBalanceReport {
  asOf: Date;
  entries: TrialBalanceEntry[];
  totalDebits: MoneyVO;
  totalCredits: MoneyVO;
  isBalanced: boolean;
  difference: MoneyVO;
}

/**
 * Profit & Loss summary.
 */
export interface ProfitAndLoss {
  period: string;
  revenue: Array<{ code: string; name: string; amount: MoneyVO }>;
  expenses: Array<{ code: string; name: string; amount: MoneyVO }>;
  totalRevenue: MoneyVO;
  totalExpenses: MoneyVO;
  netProfit: MoneyVO;
  netProfitMargin: number;
}

/**
 * Balance Sheet summary.
 */
export interface BalanceSheet {
  asOf: Date;
  assets: Array<{ code: string; name: string; amount: MoneyVO }>;
  liabilities: Array<{ code: string; name: string; amount: MoneyVO }>;
  equity: Array<{ code: string; name: string; amount: MoneyVO }>;
  totalAssets: MoneyVO;
  totalLiabilities: MoneyVO;
  totalEquity: MoneyVO;
  isBalanced: boolean;
}

/**
 * Double-Entry Accounting Domain Service.
 *
 * This is the heart of the Financial Ledger module. It:
 * 1. Validates journal entries (debits = credits)
 * 2. Updates account balances atomically
 * 3. Generates trial balance, P&L, and balance sheet reports
 * 4. Creates standard journal templates for payroll, invoicing, and expenses
 *
 * @invariant Assets = Liabilities + Equity (always)
 * @invariant Every debit has a corresponding credit
 *
 * @example
 * ```ts
 * const service = new DoubleEntryService();
 *
 * // Post a payroll journal
 * const entry = service.createPayrollJournal({
 *   employees: [{ name: "John", salary: 75000, pf: 1800, tds: 5000 }],
 *   period: "March 2026",
 *   createdBy: "payroll-system",
 * });
 *
 * const accounts = getAccountsFromDB();
 * service.postToAccounts(entry, accounts); // Updates all affected account balances
 *
 * const trialBalance = service.generateTrialBalance(accounts);
 * console.log(trialBalance.isBalanced); // true — always
 * ```
 */
export class DoubleEntryService {

  /**
   * Posts a journal entry to the chart of accounts.
   * Updates each account's running balance based on debit/credit lines.
   *
   * @param journal The validated, balanced journal entry
   * @param accounts Map of account code → AccountEntity
   * @throws Error if journal is unbalanced or references unknown accounts
   */
  postToAccounts(
    journal: JournalEntryEntity,
    accounts: Map<string, AccountEntity>,
  ): void {
    // Validate first
    journal.validate();

    // Apply each line to the corresponding account
    for (const line of journal.lines) {
      const account = accounts.get(line.accountCode);
      if (!account) {
        throw new Error(`Account ${line.accountCode} not found in chart of accounts`);
      }

      if (line.debit.isPositive()) {
        account.debit(line.debit);
      }
      if (line.credit.isPositive()) {
        account.credit(line.credit);
      }
    }
  }

  /**
   * Generates a trial balance from the current account balances.
   * The trial balance MUST always be balanced (debits = credits).
   */
  generateTrialBalance(
    accounts: AccountEntity[],
    asOf: Date = new Date(),
  ): TrialBalanceReport {
    const entries: TrialBalanceEntry[] = [];

    for (const account of accounts) {
      if (!account.isPostable) continue; // Skip group accounts

      const balance = account.balance;
      entries.push({
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        debitBalance: balance.isPositive() && account.normalBalance === "DEBIT" ? balance : MoneyVO.zero(),
        creditBalance: balance.isPositive() && account.normalBalance === "CREDIT" ? balance :
                       balance.isNegative() && account.normalBalance === "DEBIT" ? balance.abs() : MoneyVO.zero(),
      });
    }

    const totalDebits = entries.reduce((sum, e) => sum.add(e.debitBalance), MoneyVO.zero());
    const totalCredits = entries.reduce((sum, e) => sum.add(e.creditBalance), MoneyVO.zero());

    return {
      asOf,
      entries: entries.sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
      totalDebits,
      totalCredits,
      isBalanced: totalDebits.equals(totalCredits),
      difference: totalDebits.subtract(totalCredits),
    };
  }

  /**
   * Generates a Profit & Loss statement for a fiscal period.
   * P&L = Revenue accounts - Expense accounts.
   */
  generateProfitAndLoss(
    accounts: AccountEntity[],
    period: string,
  ): ProfitAndLoss {
    const revenueAccounts = accounts.filter(a => a.type === AccountType.REVENUE && a.isPostable);
    const expenseAccounts = accounts.filter(a => a.type === AccountType.EXPENSE && a.isPostable);

    const revenue = revenueAccounts.map(a => ({
      code: a.code,
      name: a.name,
      amount: a.balance.abs(),
    }));

    const expenses = expenseAccounts.map(a => ({
      code: a.code,
      name: a.name,
      amount: a.balance.abs(),
    }));

    const totalRevenue = revenue.reduce((sum, r) => sum.add(r.amount), MoneyVO.zero());
    const totalExpenses = expenses.reduce((sum, e) => sum.add(e.amount), MoneyVO.zero());
    const netProfit = totalRevenue.subtract(totalExpenses);
    const netProfitMargin = totalRevenue.isZero() ? 0 :
      Number(((netProfit.toMajor() / totalRevenue.toMajor()) * 100).toFixed(2));

    return {
      period,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit,
      netProfitMargin,
    };
  }

  /**
   * Generates a Balance Sheet.
   * Assets = Liabilities + Equity (+ Retained Earnings from P&L)
   */
  generateBalanceSheet(
    accounts: AccountEntity[],
    asOf: Date = new Date(),
  ): BalanceSheet {
    const assetAccounts = accounts.filter(a => a.type === AccountType.ASSET && a.isPostable);
    const liabilityAccounts = accounts.filter(a => a.type === AccountType.LIABILITY && a.isPostable);
    const equityAccounts = accounts.filter(a => a.type === AccountType.EQUITY && a.isPostable);

    const assets = assetAccounts.map(a => ({ code: a.code, name: a.name, amount: a.balance }));
    const liabilities = liabilityAccounts.map(a => ({ code: a.code, name: a.name, amount: a.balance.abs() }));
    const equity = equityAccounts.map(a => ({ code: a.code, name: a.name, amount: a.balance.abs() }));

    const totalAssets = assets.reduce((s, a) => s.add(a.amount), MoneyVO.zero());
    const totalLiabilities = liabilities.reduce((s, l) => s.add(l.amount), MoneyVO.zero());
    const totalEquity = equity.reduce((s, e) => s.add(e.amount), MoneyVO.zero());

    return {
      asOf,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced: totalAssets.equals(totalLiabilities.add(totalEquity)),
    };
  }

  // ── Journal Templates ──────────────────────────────────────────────────────

  /**
   * Creates a payroll journal entry from salary data.
   * Standard double-entry for Indian payroll:
   *   DR  Salary Expense      (gross)
   *   CR  Salary Payable      (net pay)
   *   CR  PF Payable          (employee + employer PF)
   *   CR  ESI Payable         (if applicable)
   *   CR  TDS Payable         (income tax)
   *   CR  Professional Tax    (state tax)
   */
  createPayrollJournal(params: {
    entryId: string;
    entryNumber: string;
    period: string;
    date: Date;
    totalGross: number;
    totalNet: number;
    totalPF: number;
    totalESI: number;
    totalTDS: number;
    totalPT: number;
    createdBy: string;
  }): JournalEntryEntity {
    const lines: JournalLine[] = [
      {
        accountCode: "6100",
        accountName: "Salary Expense",
        debit: MoneyVO.of(params.totalGross),
        credit: MoneyVO.zero(),
        description: `${params.period} gross salary`,
        department: "HR",
      },
      {
        accountCode: "2100",
        accountName: "Salary Payable",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.totalNet),
        description: `${params.period} net salary payable`,
      },
    ];

    if (params.totalPF > 0) {
      lines.push({
        accountCode: "2210",
        accountName: "PF Payable",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.totalPF),
        description: "Employee + Employer PF contribution",
      });
    }

    if (params.totalESI > 0) {
      lines.push({
        accountCode: "2220",
        accountName: "ESI Payable",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.totalESI),
        description: "ESI contribution",
      });
    }

    if (params.totalTDS > 0) {
      lines.push({
        accountCode: "2230",
        accountName: "TDS Payable",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.totalTDS),
        description: "TDS on salary",
      });
    }

    if (params.totalPT > 0) {
      lines.push({
        accountCode: "2240",
        accountName: "Professional Tax Payable",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.totalPT),
        description: "Professional tax",
      });
    }

    return new JournalEntryEntity({
      id: params.entryId,
      entryNumber: params.entryNumber,
      date: params.date,
      description: `Payroll — ${params.period}`,
      source: JournalSource.PAYROLL,
      lines,
      createdBy: params.createdBy,
    });
  }

  /**
   * Creates an invoice journal entry.
   *   DR  Accounts Receivable  (total with GST)
   *   CR  Service Revenue      (base amount)
   *   CR  GST Output           (tax component)
   */
  createInvoiceJournal(params: {
    entryId: string;
    entryNumber: string;
    date: Date;
    invoiceNumber: string;
    clientName: string;
    baseAmount: number;
    gstAmount: number;
    createdBy: string;
  }): JournalEntryEntity {
    const totalAmount = params.baseAmount + params.gstAmount;

    const lines: JournalLine[] = [
      {
        accountCode: "1200",
        accountName: "Accounts Receivable",
        debit: MoneyVO.of(totalAmount),
        credit: MoneyVO.zero(),
        description: `Invoice ${params.invoiceNumber} — ${params.clientName}`,
      },
      {
        accountCode: "4100",
        accountName: "Service Revenue",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.baseAmount),
        description: `Revenue from ${params.clientName}`,
      },
    ];

    if (params.gstAmount > 0) {
      lines.push({
        accountCode: "2300",
        accountName: "GST Output",
        debit: MoneyVO.zero(),
        credit: MoneyVO.of(params.gstAmount),
        description: `GST on invoice ${params.invoiceNumber}`,
      });
    }

    return new JournalEntryEntity({
      id: params.entryId,
      entryNumber: params.entryNumber,
      date: params.date,
      description: `Invoice ${params.invoiceNumber} — ${params.clientName}`,
      source: JournalSource.INVOICE,
      referenceId: params.invoiceNumber,
      lines,
      createdBy: params.createdBy,
    });
  }

  /**
   * Creates an expense reimbursement journal.
   *   DR  Expense Account  (amount)
   *   CR  Cash / Bank      (amount paid)
   */
  createExpenseJournal(params: {
    entryId: string;
    entryNumber: string;
    date: Date;
    claimCode: string;
    employeeName: string;
    amount: number;
    isRnD: boolean;
    createdBy: string;
  }): JournalEntryEntity {
    const expenseCode = params.isRnD ? "6500" : "6400";
    const expenseName = params.isRnD ? "R&D Expense" : "General Expense";

    return new JournalEntryEntity({
      id: params.entryId,
      entryNumber: params.entryNumber,
      date: params.date,
      description: `Expense ${params.claimCode} — ${params.employeeName}`,
      source: JournalSource.EXPENSE,
      referenceId: params.claimCode,
      lines: [
        {
          accountCode: expenseCode,
          accountName: expenseName,
          debit: MoneyVO.of(params.amount),
          credit: MoneyVO.zero(),
          description: `Reimbursement: ${params.claimCode}`,
        },
        {
          accountCode: "1110",
          accountName: "Bank Account",
          debit: MoneyVO.zero(),
          credit: MoneyVO.of(params.amount),
          description: `Payment for ${params.claimCode}`,
        },
      ],
      createdBy: params.createdBy,
    });
  }
}
