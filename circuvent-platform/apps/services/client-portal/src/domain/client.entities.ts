// ──────────────────────────────────────────────────────────────
// Client Portal — Invoice Domain Entity
// Encapsulates invoice lifecycle, GST computation,
// multi-currency handling, and overdue detection.
// ──────────────────────────────────────────────────────────────

export type InvoiceStatus = "DRAFT" | "SENT" | "VIEWED" | "PAID" | "OVERDUE" | "CANCELLED" | "PARTIALLY_PAID";

const INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["VIEWED", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"],
  VIEWED: ["PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "OVERDUE", "CANCELLED"],
  PAID: [],
  OVERDUE: ["PAID", "PARTIALLY_PAID", "CANCELLED"],
  CANCELLED: [],
};

export interface InvoiceProps {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  currency: string;
  exchangeRate: number;
  dueDate: Date;
  issueDate: Date;
}

export class InvoiceEntity {
  constructor(private props: InvoiceProps) {}

  get id() { return this.props.id; }
  get invoiceNumber() { return this.props.invoiceNumber; }
  get status() { return this.props.status; }
  get totalAmount() { return this.props.totalAmount; }
  get paidAmount() { return this.props.paidAmount; }
  get currency() { return this.props.currency; }

  canTransitionTo(newStatus: InvoiceStatus): boolean {
    return INVOICE_TRANSITIONS[this.props.status].includes(newStatus);
  }

  getBalanceDue(): number {
    return Math.max(0, this.props.totalAmount - this.props.paidAmount);
  }

  getBaseCurrencyTotal(): number {
    return Math.round(this.props.totalAmount * this.props.exchangeRate * 100) / 100;
  }

  isOverdue(): boolean {
    return this.props.status !== "PAID" &&
           this.props.status !== "CANCELLED" &&
           new Date() > this.props.dueDate;
  }

  getDaysOverdue(): number {
    if (!this.isOverdue()) return 0;
    return Math.floor((Date.now() - this.props.dueDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  getDaysUntilDue(): number {
    if (this.isOverdue()) return 0;
    return Math.floor((this.props.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  recordPayment(amount: number): { newPaidAmount: number; isFullyPaid: boolean; newStatus: InvoiceStatus } {
    if (amount <= 0) throw new Error("Payment amount must be positive");
    if (this.props.status === "PAID") throw new Error("Invoice is already fully paid");
    if (this.props.status === "CANCELLED") throw new Error("Cannot pay cancelled invoice");

    const newPaidAmount = this.props.paidAmount + amount;
    const isFullyPaid = newPaidAmount >= this.props.totalAmount;

    return {
      newPaidAmount,
      isFullyPaid,
      newStatus: isFullyPaid ? "PAID" : "PARTIALLY_PAID",
    };
  }

  computeGST(isInterState: boolean): {
    cgst: number; sgst: number; igst: number; totalGST: number;
  } {
    const taxableAmount = this.props.subtotal - this.props.discount;
    const totalGST = this.props.taxAmount;

    if (isInterState) {
      return { cgst: 0, sgst: 0, igst: totalGST, totalGST };
    }

    const halfTax = Math.round(totalGST * 100 / 2) / 100;
    return { cgst: halfTax, sgst: halfTax, igst: 0, totalGST };
  }

  getPaymentProgress(): number {
    if (this.props.totalAmount === 0) return 100;
    return Math.round((this.props.paidAmount / this.props.totalAmount) * 100);
  }

  getAgingBucket(): "CURRENT" | "30_DAYS" | "60_DAYS" | "90_DAYS" | "OVER_90" {
    if (!this.isOverdue()) return "CURRENT";
    const days = this.getDaysOverdue();
    if (days <= 30) return "30_DAYS";
    if (days <= 60) return "60_DAYS";
    if (days <= 90) return "90_DAYS";
    return "OVER_90";
  }
}

// ── Lead Domain ──

export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL_SENT" | "NEGOTIATION" | "WON" | "LOST";

const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL_SENT", "LOST"],
  PROPOSAL_SENT: ["NEGOTIATION", "WON", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  WON: [],
  LOST: ["NEW"], // Allow reopening
};

export class LeadEntity {
  constructor(
    public readonly id: string,
    private _status: LeadStatus,
    public readonly estimatedValue: number | null,
    public readonly probability: number | null,
  ) {}

  get status() { return this._status; }

  canTransitionTo(newStatus: LeadStatus): boolean {
    return LEAD_TRANSITIONS[this._status].includes(newStatus);
  }

  transitionTo(newStatus: LeadStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Invalid lead transition: ${this._status} → ${newStatus}`);
    }
    this._status = newStatus;
  }

  getWeightedValue(): number {
    if (!this.estimatedValue || !this.probability) return 0;
    return Math.round(this.estimatedValue * (this.probability / 100));
  }

  isOpen(): boolean {
    return !["WON", "LOST"].includes(this._status);
  }

  isHighValue(threshold = 500000): boolean {
    return (this.estimatedValue || 0) >= threshold;
  }
}
