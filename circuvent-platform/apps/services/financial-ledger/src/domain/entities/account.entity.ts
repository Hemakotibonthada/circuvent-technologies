// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Account Entity
// Represents a node in the Chart of Accounts (CoA).
// Follows Indian Accounting Standards (IndAS) classification.
// ══════════════════════════════════════════════════════════════════════════════

import { MoneyVO } from "../value-objects/money.vo";

/**
 * Account types in double-entry bookkeeping.
 * The fundamental accounting equation: Assets = Liabilities + Equity
 *
 * Normal Balance:
 * - ASSET, EXPENSE → Debit increases
 * - LIABILITY, EQUITY, REVENUE → Credit increases
 */
export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE",
}

/**
 * Account sub-categories for financial reporting.
 */
export enum AccountSubType {
  // Assets
  CASH = "CASH",
  BANK = "BANK",
  ACCOUNTS_RECEIVABLE = "ACCOUNTS_RECEIVABLE",
  INVENTORY = "INVENTORY",
  FIXED_ASSET = "FIXED_ASSET",
  PREPAID = "PREPAID",
  // Liabilities
  ACCOUNTS_PAYABLE = "ACCOUNTS_PAYABLE",
  SALARY_PAYABLE = "SALARY_PAYABLE",
  TAX_PAYABLE = "TAX_PAYABLE",
  LOAN = "LOAN",
  // Equity
  SHARE_CAPITAL = "SHARE_CAPITAL",
  RETAINED_EARNINGS = "RETAINED_EARNINGS",
  // Revenue
  SERVICE_REVENUE = "SERVICE_REVENUE",
  PRODUCT_REVENUE = "PRODUCT_REVENUE",
  GRANT_INCOME = "GRANT_INCOME",
  OTHER_INCOME = "OTHER_INCOME",
  // Expenses
  SALARY_EXPENSE = "SALARY_EXPENSE",
  RENT_EXPENSE = "RENT_EXPENSE",
  UTILITIES = "UTILITIES",
  RND_EXPENSE = "RND_EXPENSE",
  DEPRECIATION = "DEPRECIATION",
  GST_INPUT = "GST_INPUT",
  GST_OUTPUT = "GST_OUTPUT",
  TDS_RECEIVABLE = "TDS_RECEIVABLE",
  TDS_PAYABLE = "TDS_PAYABLE",
}

/**
 * Chart of Accounts entry.
 * Each account has a unique code following the Circuvent numbering scheme:
 *
 * ```
 * 1xxx — Assets
 * 2xxx — Liabilities
 * 3xxx — Equity
 * 4xxx — Revenue
 * 5xxx — Cost of Goods Sold
 * 6xxx — Operating Expenses
 * 7xxx — Other Income/Expenses
 * 8xxx — Tax accounts
 * ```
 */
export class AccountEntity {
  public readonly id: string;
  /** Hierarchical account code (e.g., "1100", "6200.01") */
  public readonly code: string;
  /** Account name */
  public readonly name: string;
  /** Account type determines debit/credit behavior */
  public readonly type: AccountType;
  /** Sub-category for reporting */
  public readonly subType: AccountSubType;
  /** Parent account code for hierarchy (null if top-level) */
  public readonly parentCode: string | null;
  /** Whether this account can receive direct postings (false for group accounts) */
  public readonly isPostable: boolean;
  /** Whether this account is active */
  public active: boolean;
  /** Optional description */
  public description: string | null;
  /** Currency */
  public readonly currency: string;
  /** Current running balance */
  private _balance: MoneyVO;

  constructor(params: {
    id: string;
    code: string;
    name: string;
    type: AccountType;
    subType: AccountSubType;
    parentCode?: string | null;
    isPostable?: boolean;
    active?: boolean;
    description?: string | null;
    currency?: string;
    balance?: number;
  }) {
    this.id = params.id;
    this.code = params.code;
    this.name = params.name;
    this.type = params.type;
    this.subType = params.subType;
    this.parentCode = params.parentCode ?? null;
    this.isPostable = params.isPostable ?? true;
    this.active = params.active ?? true;
    this.description = params.description ?? null;
    this.currency = params.currency ?? "INR";
    this._balance = MoneyVO.of(params.balance ?? 0, this.currency);
  }

  get balance(): MoneyVO { return this._balance; }

  /**
   * Returns the normal balance side for this account type.
   * ASSET & EXPENSE → "DEBIT" (debit increases balance)
   * LIABILITY, EQUITY, REVENUE → "CREDIT" (credit increases balance)
   */
  get normalBalance(): "DEBIT" | "CREDIT" {
    return this.type === AccountType.ASSET || this.type === AccountType.EXPENSE
      ? "DEBIT"
      : "CREDIT";
  }

  /**
   * Applies a debit to this account.
   * For ASSET/EXPENSE: increases balance
   * For LIABILITY/EQUITY/REVENUE: decreases balance
   */
  debit(amount: MoneyVO): void {
    if (!this.isPostable) throw new Error(`Account ${this.code} is a group account — not postable`);
    if (!this.active) throw new Error(`Account ${this.code} is inactive`);

    if (this.normalBalance === "DEBIT") {
      this._balance = this._balance.add(amount);
    } else {
      this._balance = this._balance.subtract(amount);
    }
  }

  /**
   * Applies a credit to this account.
   * For LIABILITY/EQUITY/REVENUE: increases balance
   * For ASSET/EXPENSE: decreases balance
   */
  credit(amount: MoneyVO): void {
    if (!this.isPostable) throw new Error(`Account ${this.code} is a group account — not postable`);
    if (!this.active) throw new Error(`Account ${this.code} is inactive`);

    if (this.normalBalance === "CREDIT") {
      this._balance = this._balance.add(amount);
    } else {
      this._balance = this._balance.subtract(amount);
    }
  }

  /** Checks if this is a balance sheet account (Asset, Liability, Equity) */
  isBalanceSheet(): boolean {
    return [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY].includes(this.type);
  }

  /** Checks if this is an income statement account (Revenue, Expense) */
  isIncomeStatement(): boolean {
    return [AccountType.REVENUE, AccountType.EXPENSE].includes(this.type);
  }
}
