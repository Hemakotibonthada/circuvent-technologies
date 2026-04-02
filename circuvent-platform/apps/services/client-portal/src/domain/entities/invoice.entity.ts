// ══════════════════════════════════════════════════════════════════════════════
// Client Portal — Invoice Entity (Domain Core)
// Manages invoicing lifecycle, GST computation, payment tracking,
// and aging analysis.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Invoice status lifecycle.
 */
export enum InvoiceStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  VIEWED = "VIEWED",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  WRITTEN_OFF = "WRITTEN_OFF",
}

/**
 * Payment record.
 */
export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  method: "BANK_TRANSFER" | "UPI" | "CHEQUE" | "CARD" | "CASH" | "OTHER";
  reference: string;
  receivedAt: Date;
  notes?: string;
}

/**
 * Invoice line item.
 */
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  hsnSacCode?: string;
  gstRate: number; // percentage
  discount?: number; // percentage
}

/**
 * GST breakdown for an invoice.
 */
export interface InvoiceGST {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalGST: number;
  grandTotal: number;
  isInterState: boolean;
}

/**
 * Invoice aggregate root.
 *
 * Business Rules:
 * 1. Invoice numbers are auto-generated (INV-YYYY-NNNN)
 * 2. Once SENT, line items cannot be modified (must cancel and re-issue)
 * 3. GST is auto-calculated based on CGST+SGST (intra) or IGST (inter-state)
 * 4. An invoice is OVERDUE if unpaid past its due date
 * 5. Partial payments update the balance due
 * 6. Written-off invoices require approval
 *
 * @invariant grandTotal = sum of (lineItem.amount * (1 + gstRate/100))
 * @invariant totalPaid <= grandTotal
 * @invariant CANCELLED/WRITTEN_OFF are terminal states
 */
export class InvoiceEntity {
  public readonly id: string;
  public readonly invoiceNumber: string;
  public clientId: string;
  public clientName: string;
  public clientGSTIN: string | null;
  public readonly isInterState: boolean;
  private _status: InvoiceStatus;
  private _lineItems: InvoiceLineItem[];
  private _payments: PaymentRecord[];
  public issueDate: Date;
  public dueDate: Date;
  public currency: string;
  public notes: string | null;
  public terms: string | null;
  public projectId: string | null;
  private _events: Array<{ type: string; payload: Record<string, unknown> }> = [];

  constructor(params: {
    id: string;
    invoiceNumber: string;
    clientId: string;
    clientName: string;
    clientGSTIN?: string | null;
    isInterState?: boolean;
    status?: InvoiceStatus;
    lineItems?: InvoiceLineItem[];
    payments?: PaymentRecord[];
    issueDate?: Date;
    dueDate?: Date;
    currency?: string;
    notes?: string | null;
    terms?: string | null;
    projectId?: string | null;
  }) {
    this.id = params.id;
    this.invoiceNumber = params.invoiceNumber;
    this.clientId = params.clientId;
    this.clientName = params.clientName;
    this.clientGSTIN = params.clientGSTIN || null;
    this.isInterState = params.isInterState ?? false;
    this._status = params.status || InvoiceStatus.DRAFT;
    this._lineItems = params.lineItems || [];
    this._payments = params.payments || [];
    this.issueDate = params.issueDate || new Date();
    this.dueDate = params.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.currency = params.currency || "INR";
    this.notes = params.notes || null;
    this.terms = params.terms || "Payment due within 30 days of invoice date.";
    this.projectId = params.projectId || null;
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get status(): InvoiceStatus { return this._status; }
  get lineItems(): ReadonlyArray<InvoiceLineItem> { return this._lineItems; }
  get payments(): ReadonlyArray<PaymentRecord> { return this._payments; }
  get events() { return this._events; }

  /**
   * Computes full GST breakdown from line items.
   */
  get gstBreakdown(): InvoiceGST {
    let subtotal = 0;
    let discountTotal = 0;
    let totalGST = 0;

    for (const item of this._lineItems) {
      subtotal += item.amount;
      const discount = item.discount ? item.amount * (item.discount / 100) : 0;
      discountTotal += discount;
      const taxable = item.amount - discount;
      totalGST += taxable * (item.gstRate / 100);
    }

    const taxableAmount = subtotal - discountTotal;
    let cgst = 0, sgst = 0, igst = 0;

    if (this.isInterState) {
      igst = totalGST;
    } else {
      cgst = totalGST / 2;
      sgst = totalGST / 2;
    }

    return {
      subtotal: this.round(subtotal),
      discountTotal: this.round(discountTotal),
      taxableAmount: this.round(taxableAmount),
      cgst: this.round(cgst),
      sgst: this.round(sgst),
      igst: this.round(igst),
      totalGST: this.round(totalGST),
      grandTotal: this.round(taxableAmount + totalGST),
      isInterState: this.isInterState,
    };
  }

  /** Total invoice amount including GST */
  get grandTotal(): number { return this.gstBreakdown.grandTotal; }

  /** Total amount paid so far */
  get totalPaid(): number { return this._payments.reduce((s, p) => s + p.amount, 0); }

  /** Outstanding balance */
  get balanceDue(): number { return this.round(this.grandTotal - this.totalPaid); }

  /** Whether the invoice is past due */
  get isOverdue(): boolean {
    return this.balanceDue > 0 && new Date() > this.dueDate &&
      ![InvoiceStatus.PAID, InvoiceStatus.CANCELLED, InvoiceStatus.WRITTEN_OFF].includes(this._status);
  }

  /** Days overdue (0 if not overdue) */
  get daysOverdue(): number {
    if (!this.isOverdue) return 0;
    return Math.floor((Date.now() - this.dueDate.getTime()) / (24 * 60 * 60 * 1000));
  }

  /**
   * Aging bucket for AR analysis.
   * Categories: Current, 1-30, 31-60, 61-90, 90+
   */
  get agingBucket(): "CURRENT" | "1-30" | "31-60" | "61-90" | "90+" {
    const days = this.daysOverdue;
    if (days === 0) return "CURRENT";
    if (days <= 30) return "1-30";
    if (days <= 60) return "31-60";
    if (days <= 90) return "61-90";
    return "90+";
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  /** Adds a line item to a DRAFT invoice */
  addLineItem(item: Omit<InvoiceLineItem, "amount">): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw new Error(`Cannot modify ${this._status} invoice — cancel and re-issue instead`);
    }
    const amount = item.quantity * item.unitPrice;
    this._lineItems.push({ ...item, amount: this.round(amount) });
  }

  /** Sends the invoice to the client */
  send(): void {
    if (this._status !== InvoiceStatus.DRAFT) {
      throw new Error(`Can only send DRAFT invoices (current: ${this._status})`);
    }
    if (this._lineItems.length === 0) {
      throw new Error("Cannot send invoice with no line items");
    }
    this._status = InvoiceStatus.SENT;
    this._events.push({
      type: "InvoiceSent",
      payload: { invoiceNumber: this.invoiceNumber, clientId: this.clientId, grandTotal: this.grandTotal },
    });
  }

  /** Records a payment against this invoice */
  recordPayment(payment: PaymentRecord): void {
    if ([InvoiceStatus.CANCELLED, InvoiceStatus.WRITTEN_OFF].includes(this._status)) {
      throw new Error(`Cannot record payment on ${this._status} invoice`);
    }
    if (payment.amount <= 0) {
      throw new Error("Payment amount must be positive");
    }
    if (this.totalPaid + payment.amount > this.grandTotal * 1.01) { // 1% tolerance
      throw new Error(`Payment of ₹${payment.amount} exceeds balance due of ₹${this.balanceDue}`);
    }

    this._payments.push(payment);

    if (this.balanceDue <= 0.01) {
      this._status = InvoiceStatus.PAID;
      this._events.push({
        type: "InvoiceFullyPaid",
        payload: { invoiceNumber: this.invoiceNumber, totalPaid: this.totalPaid },
      });
    } else {
      this._status = InvoiceStatus.PARTIALLY_PAID;
      this._events.push({
        type: "PaymentReceived",
        payload: { invoiceNumber: this.invoiceNumber, paymentAmount: payment.amount, balanceDue: this.balanceDue },
      });
    }
  }

  /** Cancels the invoice */
  cancel(reason: string): void {
    if ([InvoiceStatus.PAID, InvoiceStatus.CANCELLED].includes(this._status)) {
      throw new Error(`Cannot cancel ${this._status} invoice`);
    }
    if (this.totalPaid > 0) {
      throw new Error("Cannot cancel invoice with recorded payments — issue a credit note instead");
    }
    this._status = InvoiceStatus.CANCELLED;
    this._events.push({ type: "InvoiceCancelled", payload: { invoiceNumber: this.invoiceNumber, reason } });
  }

  /** Generates dunning (overdue notice) data */
  generateDunningNotice(): {
    invoiceNumber: string;
    clientName: string;
    amountDue: number;
    daysOverdue: number;
    originalDueDate: Date;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    suggestedAction: string;
  } | null {
    if (!this.isOverdue) return null;
    const days = this.daysOverdue;
    const urgency = days > 90 ? "CRITICAL" : days > 60 ? "HIGH" : days > 30 ? "MEDIUM" : "LOW";
    const suggestedAction =
      urgency === "CRITICAL" ? "Escalate to legal / write-off review" :
      urgency === "HIGH" ? "Final notice + phone call" :
      urgency === "MEDIUM" ? "Send formal payment reminder" : "Send friendly reminder email";

    return {
      invoiceNumber: this.invoiceNumber,
      clientName: this.clientName,
      amountDue: this.balanceDue,
      daysOverdue: days,
      originalDueDate: this.dueDate,
      urgency,
      suggestedAction,
    };
  }

  clearEvents(): void { this._events = []; }

  private round(n: number): number { return Math.round(n * 100) / 100; }
}
