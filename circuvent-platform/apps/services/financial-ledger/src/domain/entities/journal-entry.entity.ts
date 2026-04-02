// ══════════════════════════════════════════════════════════════════════════════
// Financial Ledger — Journal Entry Entity
// Core of double-entry bookkeeping. Every financial transaction creates a
// journal entry with balanced debit and credit lines.
// ══════════════════════════════════════════════════════════════════════════════

import { MoneyVO } from "../value-objects/money.vo";

/**
 * Journal entry status lifecycle.
 */
export enum JournalStatus {
  DRAFT = "DRAFT",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  POSTED = "POSTED",
  REVERSED = "REVERSED",
  VOID = "VOID",
}

/**
 * A single line in a journal entry — either a debit or a credit.
 */
export interface JournalLine {
  /** Account code to post to */
  accountCode: string;
  /** Account name (for display) */
  accountName: string;
  /** Debit amount (zero if this line is a credit) */
  debit: MoneyVO;
  /** Credit amount (zero if this line is a debit) */
  credit: MoneyVO;
  /** Line-level description */
  description?: string;
  /** Department for cost-center reporting */
  department?: string;
  /** Project ID for project accounting */
  projectId?: string;
}

/**
 * Source module that triggered this journal entry.
 */
export enum JournalSource {
  MANUAL = "MANUAL",
  PAYROLL = "PAYROLL",
  INVOICE = "INVOICE",
  EXPENSE = "EXPENSE",
  PAYMENT = "PAYMENT",
  DEPRECIATION = "DEPRECIATION",
  TAX = "TAX",
  GRANT = "GRANT",
  ADJUSTMENT = "ADJUSTMENT",
}

/**
 * Journal Entry aggregate root.
 * Represents a complete double-entry accounting transaction.
 *
 * @invariant Total debits MUST equal total credits (balanced)
 * @invariant A Journal must have at least 2 lines
 * @invariant Posted journals cannot be modified (only reversed)
 * @invariant VOID journals cannot be posted
 *
 * @example
 * ```ts
 * // Record salary payment
 * const journal = new JournalEntryEntity({
 *   id: "j-001",
 *   entryNumber: "JE-2026-0001",
 *   date: new Date("2026-03-31"),
 *   description: "March 2026 Salary — Engineering Dept",
 *   source: JournalSource.PAYROLL,
 *   lines: [
 *     { accountCode: "6100", accountName: "Salary Expense", debit: MoneyVO.of(500000), credit: MoneyVO.zero() },
 *     { accountCode: "2100", accountName: "Salary Payable", debit: MoneyVO.zero(), credit: MoneyVO.of(460000) },
 *     { accountCode: "2210", accountName: "PF Payable", debit: MoneyVO.zero(), credit: MoneyVO.of(24000) },
 *     { accountCode: "2220", accountName: "TDS Payable", debit: MoneyVO.zero(), credit: MoneyVO.of(16000) },
 *   ],
 * });
 *
 * journal.validate(); // throws if unbalanced
 * journal.post("admin-001");
 * ```
 */
export class JournalEntryEntity {
  public readonly id: string;
  /** Auto-generated entry number (JE-YYYY-NNNN) */
  public readonly entryNumber: string;
  /** Transaction date */
  public readonly date: Date;
  /** Human-readable description */
  public description: string;
  /** Source module */
  public readonly source: JournalSource;
  /** Reference to source document (e.g., invoice ID, payroll batch ID) */
  public referenceId: string | null;
  /** Journal status */
  private _status: JournalStatus;
  /** Debit and credit lines */
  private _lines: JournalLine[];
  /** Fiscal period (e.g., "2026-03") */
  public readonly fiscalPeriod: string;
  /** User who created this entry */
  public readonly createdBy: string;
  /** User who posted this entry */
  public postedBy: string | null;
  /** Posted timestamp */
  public postedAt: Date | null;
  /** ID of the reversing entry (if this journal was reversed) */
  public reversalEntryId: string | null;
  /** Domain events */
  private _events: Array<{ type: string; payload: Record<string, unknown> }> = [];

  constructor(params: {
    id: string;
    entryNumber: string;
    date: Date;
    description: string;
    source: JournalSource;
    referenceId?: string | null;
    status?: JournalStatus;
    lines: JournalLine[];
    createdBy: string;
    postedBy?: string | null;
    postedAt?: Date | null;
    reversalEntryId?: string | null;
  }) {
    this.id = params.id;
    this.entryNumber = params.entryNumber;
    this.date = params.date;
    this.description = params.description;
    this.source = params.source;
    this.referenceId = params.referenceId ?? null;
    this._status = params.status ?? JournalStatus.DRAFT;
    this._lines = [...params.lines];
    this.fiscalPeriod = `${params.date.getFullYear()}-${String(params.date.getMonth() + 1).padStart(2, "0")}`;
    this.createdBy = params.createdBy;
    this.postedBy = params.postedBy ?? null;
    this.postedAt = params.postedAt ?? null;
    this.reversalEntryId = params.reversalEntryId ?? null;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get status(): JournalStatus { return this._status; }
  get lines(): ReadonlyArray<JournalLine> { return this._lines; }
  get events() { return this._events; }

  /** Total of all debit lines */
  get totalDebits(): MoneyVO {
    return this._lines.reduce((sum, line) => sum.add(line.debit), MoneyVO.zero());
  }

  /** Total of all credit lines */
  get totalCredits(): MoneyVO {
    return this._lines.reduce((sum, line) => sum.add(line.credit), MoneyVO.zero());
  }

  /** Whether debits equal credits */
  get isBalanced(): boolean {
    return this.totalDebits.equals(this.totalCredits);
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /**
   * Validates the journal entry against all business rules.
   * @throws Error if any invariant is violated
   */
  validate(): void {
    // Rule 1: Minimum 2 lines
    if (this._lines.length < 2) {
      throw new Error(`Journal ${this.entryNumber} must have at least 2 lines (has ${this._lines.length})`);
    }

    // Rule 2: Each line must be either a debit OR a credit, not both
    for (const line of this._lines) {
      if (line.debit.isPositive() && line.credit.isPositive()) {
        throw new Error(`Line for account ${line.accountCode} has both debit and credit — use separate lines`);
      }
      if (line.debit.isZero() && line.credit.isZero()) {
        throw new Error(`Line for account ${line.accountCode} has zero debit and zero credit`);
      }
    }

    // Rule 3: Balanced — debits must equal credits
    if (!this.isBalanced) {
      throw new Error(
        `Journal ${this.entryNumber} is UNBALANCED: ` +
        `debits=${this.totalDebits.format()}, credits=${this.totalCredits.format()}, ` +
        `difference=${this.totalDebits.subtract(this.totalCredits).format()}`
      );
    }
  }

  /**
   * Posts the journal entry to the general ledger.
   * Once posted, it becomes immutable — can only be reversed.
   */
  post(userId: string): void {
    if (this._status === JournalStatus.VOID) {
      throw new Error(`Cannot post voided journal ${this.entryNumber}`);
    }
    if (this._status === JournalStatus.POSTED) {
      throw new Error(`Journal ${this.entryNumber} is already posted`);
    }

    this.validate();

    this._status = JournalStatus.POSTED;
    this.postedBy = userId;
    this.postedAt = new Date();

    this._events.push({
      type: "JournalPosted",
      payload: {
        entryNumber: this.entryNumber,
        totalDebits: this.totalDebits.toMajor(),
        totalCredits: this.totalCredits.toMajor(),
        lineCount: this._lines.length,
        source: this.source,
        postedBy: userId,
      },
    });
  }

  /**
   * Creates a reversing journal entry (equal and opposite of this one).
   * Used for corrections — never modify a posted journal.
   *
   * @param reversalId ID for the new reversal entry
   * @param reversalNumber Entry number for the reversal
   * @param reversedBy User performing the reversal
   * @returns A new JournalEntryEntity that reverses this one
   */
  createReversal(reversalId: string, reversalNumber: string, reversedBy: string): JournalEntryEntity {
    if (this._status !== JournalStatus.POSTED) {
      throw new Error(`Can only reverse POSTED journals (current: ${this._status})`);
    }

    // Swap debits and credits
    const reversedLines: JournalLine[] = this._lines.map(line => ({
      ...line,
      debit: line.credit,
      credit: line.debit,
      description: `Reversal: ${line.description || line.accountName}`,
    }));

    this._status = JournalStatus.REVERSED;
    this.reversalEntryId = reversalId;

    this._events.push({
      type: "JournalReversed",
      payload: {
        originalEntryNumber: this.entryNumber,
        reversalEntryNumber: reversalNumber,
        reversedBy,
      },
    });

    return new JournalEntryEntity({
      id: reversalId,
      entryNumber: reversalNumber,
      date: new Date(),
      description: `Reversal of ${this.entryNumber}: ${this.description}`,
      source: JournalSource.ADJUSTMENT,
      referenceId: this.id,
      lines: reversedLines,
      createdBy: reversedBy,
    });
  }

  /**
   * Adds a line to a DRAFT journal.
   * @throws Error if journal is already posted
   */
  addLine(line: JournalLine): void {
    if (this._status !== JournalStatus.DRAFT) {
      throw new Error(`Cannot modify ${this._status} journal`);
    }
    this._lines.push(line);
  }

  /** Clears accumulated domain events */
  clearEvents(): void { this._events = []; }
}
