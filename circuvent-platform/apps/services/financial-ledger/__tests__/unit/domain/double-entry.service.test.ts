// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Double-Entry Accounting Service
// Tests journal validation, posting, trial balance, P&L, balance sheet.
// ══════════════════════════════════════════════════════════════════════════════

import { DoubleEntryService } from "../../../src/domain/services/double-entry.service";
import { AccountEntity, AccountType, AccountSubType } from "../../../src/domain/entities/account.entity";
import { JournalEntryEntity, JournalSource } from "../../../src/domain/entities/journal-entry.entity";
import { MoneyVO } from "../../../src/domain/value-objects/money.vo";

function createAccount(code: string, name: string, type: AccountType, subType: AccountSubType, balance: number = 0): AccountEntity {
  return new AccountEntity({ id: `acc-${code}`, code, name, type, subType, balance });
}

function createChartOfAccounts(): Map<string, AccountEntity> {
  const accounts = new Map<string, AccountEntity>();
  // Assets
  accounts.set("1100", createAccount("1100", "Cash", AccountType.ASSET, AccountSubType.CASH, 500000));
  accounts.set("1110", createAccount("1110", "Bank Account", AccountType.ASSET, AccountSubType.BANK, 2000000));
  accounts.set("1200", createAccount("1200", "Accounts Receivable", AccountType.ASSET, AccountSubType.ACCOUNTS_RECEIVABLE, 0));
  // Liabilities
  accounts.set("2100", createAccount("2100", "Salary Payable", AccountType.LIABILITY, AccountSubType.SALARY_PAYABLE, 0));
  accounts.set("2210", createAccount("2210", "PF Payable", AccountType.LIABILITY, AccountSubType.TAX_PAYABLE, 0));
  accounts.set("2230", createAccount("2230", "TDS Payable", AccountType.LIABILITY, AccountSubType.TAX_PAYABLE, 0));
  accounts.set("2300", createAccount("2300", "GST Output", AccountType.LIABILITY, AccountSubType.TAX_PAYABLE, 0));
  // Equity
  accounts.set("3100", createAccount("3100", "Share Capital", AccountType.EQUITY, AccountSubType.SHARE_CAPITAL, 1000000));
  // Revenue
  accounts.set("4100", createAccount("4100", "Service Revenue", AccountType.REVENUE, AccountSubType.SERVICE_REVENUE, 0));
  // Expense
  accounts.set("6100", createAccount("6100", "Salary Expense", AccountType.EXPENSE, AccountSubType.SALARY_EXPENSE, 0));
  accounts.set("6400", createAccount("6400", "General Expense", AccountType.EXPENSE, AccountSubType.RENT_EXPENSE, 0));
  return accounts;
}

describe("DoubleEntryService", () => {
  let service: DoubleEntryService;
  let accounts: Map<string, AccountEntity>;

  beforeEach(() => {
    service = new DoubleEntryService();
    accounts = createChartOfAccounts();
  });

  describe("Journal Validation", () => {
    it("should validate a balanced journal", () => {
      const journal = new JournalEntryEntity({
        id: "j-001", entryNumber: "JE-2026-0001",
        date: new Date("2026-03-31"), description: "Test entry",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(100000), credit: MoneyVO.zero() },
          { accountCode: "1110", accountName: "Bank Account", debit: MoneyVO.zero(), credit: MoneyVO.of(100000) },
        ],
      });
      expect(() => journal.validate()).not.toThrow();
      expect(journal.isBalanced).toBe(true);
    });

    it("should reject unbalanced journal", () => {
      const journal = new JournalEntryEntity({
        id: "j-002", entryNumber: "JE-2026-0002",
        date: new Date("2026-03-31"), description: "Unbalanced",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(100000), credit: MoneyVO.zero() },
          { accountCode: "1110", accountName: "Bank Account", debit: MoneyVO.zero(), credit: MoneyVO.of(50000) },
        ],
      });
      expect(() => journal.validate()).toThrow("UNBALANCED");
    });

    it("should reject journal with fewer than 2 lines", () => {
      const journal = new JournalEntryEntity({
        id: "j-003", entryNumber: "JE-2026-0003",
        date: new Date("2026-03-31"), description: "Single line",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(100000), credit: MoneyVO.zero() },
        ],
      });
      expect(() => journal.validate()).toThrow("at least 2 lines");
    });
  });

  describe("Posting to Accounts", () => {
    it("should update account balances correctly after posting", () => {
      const journal = new JournalEntryEntity({
        id: "j-010", entryNumber: "JE-2026-0010",
        date: new Date("2026-03-31"), description: "Salary payment",
        source: JournalSource.PAYROLL, createdBy: "payroll-system",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(75000), credit: MoneyVO.zero() },
          { accountCode: "1110", accountName: "Bank Account", debit: MoneyVO.zero(), credit: MoneyVO.of(75000) },
        ],
      });
      journal.post("admin");

      service.postToAccounts(journal, accounts);

      // Salary Expense (debit normal) should increase by 75000
      expect(accounts.get("6100")!.balance.toMajor()).toBe(75000);
      // Bank Account (debit normal) should decrease by 75000
      expect(accounts.get("1110")!.balance.toMajor()).toBe(2000000 - 75000);
    });

    it("should throw if account code not found", () => {
      const journal = new JournalEntryEntity({
        id: "j-011", entryNumber: "JE-2026-0011",
        date: new Date("2026-03-31"), description: "Bad account",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "9999", accountName: "Nonexistent", debit: MoneyVO.of(100), credit: MoneyVO.zero() },
          { accountCode: "1100", accountName: "Cash", debit: MoneyVO.zero(), credit: MoneyVO.of(100) },
        ],
      });
      journal.post("admin");
      expect(() => service.postToAccounts(journal, accounts)).toThrow("Account 9999 not found");
    });
  });

  describe("Trial Balance", () => {
    it("should produce balanced trial balance", () => {
      const tb = service.generateTrialBalance(Array.from(accounts.values()));
      expect(tb.isBalanced).toBe(true);
    });
  });

  describe("Payroll Journal Template", () => {
    it("should create a balanced payroll journal", () => {
      const journal = service.createPayrollJournal({
        entryId: "j-100", entryNumber: "JE-2026-0100",
        period: "March 2026", date: new Date("2026-03-31"),
        totalGross: 500000, totalNet: 456200,
        totalPF: 24000, totalESI: 0,
        totalTDS: 16000, totalPT: 3800,
        createdBy: "payroll-system",
      });

      expect(journal.isBalanced).toBe(true);
      expect(journal.totalDebits.toMajor()).toBe(500000); // Salary Expense
      expect(journal.totalCredits.toMajor()).toBe(500000); // Net + PF + TDS + PT
      expect(() => journal.validate()).not.toThrow();
    });
  });

  describe("Invoice Journal Template", () => {
    it("should create a balanced invoice journal with GST", () => {
      const journal = service.createInvoiceJournal({
        entryId: "j-200", entryNumber: "JE-2026-0200",
        date: new Date("2026-03-15"),
        invoiceNumber: "INV-2026-0042",
        clientName: "TechCorp",
        baseAmount: 100000, gstAmount: 18000,
        createdBy: "billing-system",
      });

      expect(journal.isBalanced).toBe(true);
      expect(journal.totalDebits.toMajor()).toBe(118000); // AR
      expect(journal.lines.length).toBe(3); // AR, Revenue, GST
    });
  });

  describe("Journal Reversal", () => {
    it("should create a reversing entry with swapped debits/credits", () => {
      const original = new JournalEntryEntity({
        id: "j-300", entryNumber: "JE-2026-0300",
        date: new Date("2026-03-31"), description: "Original entry",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(50000), credit: MoneyVO.zero() },
          { accountCode: "1110", accountName: "Bank Account", debit: MoneyVO.zero(), credit: MoneyVO.of(50000) },
        ],
      });
      original.post("admin");

      const reversal = original.createReversal("j-301", "JE-2026-0301", "admin");

      expect(reversal.isBalanced).toBe(true);
      // Reversal should swap: Bank debited, Salary credited
      const bankLine = reversal.lines.find(l => l.accountCode === "1110");
      expect(bankLine?.debit.toMajor()).toBe(50000);
      expect(bankLine?.credit.isZero()).toBe(true);

      // Original should be marked as REVERSED
      expect(original.status).toBe("REVERSED");
    });

    it("should only allow reversing POSTED journals", () => {
      const draft = new JournalEntryEntity({
        id: "j-302", entryNumber: "JE-2026-0302",
        date: new Date("2026-03-31"), description: "Draft",
        source: JournalSource.MANUAL, createdBy: "admin",
        lines: [
          { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(100), credit: MoneyVO.zero() },
          { accountCode: "1100", accountName: "Cash", debit: MoneyVO.zero(), credit: MoneyVO.of(100) },
        ],
      });
      expect(() => draft.createReversal("j-303", "JE-2026-0303", "admin")).toThrow("Only POSTED");
    });
  });
});
