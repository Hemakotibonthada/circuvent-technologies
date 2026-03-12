// ──────────────────────────────────────────────────────────────
// Invoice Template — Generates multi-currency GST invoice PDF
// ──────────────────────────────────────────────────────────────

import { PDFRenderer, PDFTableColumn } from "../pdf.renderer";

export interface InvoiceInput {
  invoice: {
    number: string; title: string; description?: string;
    issueDate: string; dueDate: string;
    subtotal: number; taxRate: number; taxAmount: number;
    discount: number; totalAmount: number;
    currency: string; exchangeRate: number; baseCurrencyTotal: number;
    paidAmount: number; status: string;
    notes?: string; terms?: string;
  };
  client: {
    companyName: string; contactName: string; email: string;
    billingAddress?: string; taxId?: string; country: string;
  };
  company: {
    name: string; address: string; gstin?: string; pan?: string;
    bankName?: string; bankAccount?: string; bankIFSC?: string;
  };
  lineItems: {
    description: string; quantity: number; unitPrice: number;
    amount: number; taxable: boolean;
  }[];
  isInterState: boolean;
}

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateInvoicePDF(input: InvoiceInput): Promise<{ buffer: Buffer; checksum: string }> {
  const renderer = new PDFRenderer({
    title: `Tax Invoice`,
    subtitle: input.invoice.number,
    companyName: input.company.name,
    companyAddress: input.company.address,
    pageSize: "A4",
  });

  renderer.renderHeader();

  // Invoice meta
  renderer.renderKeyValueSection("Invoice Details", [
    ["Invoice Number", input.invoice.number],
    ["Issue Date", input.invoice.issueDate],
    ["Due Date", input.invoice.dueDate],
    ["Status", input.invoice.status],
    ["Currency", input.invoice.currency],
    ...(input.invoice.currency !== "INR" ? [["Exchange Rate", `1 ${input.invoice.currency} = ₹${input.invoice.exchangeRate}` as string] as [string, string]] : []),
  ]);

  renderer.moveDown(0.5);

  // Bill To
  renderer.renderKeyValueSection("Bill To", [
    ["Company", input.client.companyName],
    ["Contact", input.client.contactName],
    ["Email", input.client.email],
    ["Address", input.client.billingAddress || "N/A"],
    ["Tax ID / GST", input.client.taxId || "N/A"],
    ["Country", input.client.country],
  ]);

  renderer.moveDown(0.5);

  // Line items table
  const columns: PDFTableColumn[] = [
    { header: "#", key: "index", width: 30, align: "center" },
    { header: "Description", key: "description", width: 220, align: "left" },
    { header: "Qty", key: "quantity", width: 50, align: "center" },
    { header: "Unit Price", key: "unitPrice", width: 90, align: "right", format: (v) => formatCurrency(v as number, input.invoice.currency) },
    { header: "Amount", key: "amount", width: 100, align: "right", format: (v) => formatCurrency(v as number, input.invoice.currency) },
  ];

  const rows = input.lineItems.map((item, i) => ({
    index: i + 1,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
  }));

  renderer.renderTable(columns, rows);

  renderer.moveDown(0.5);

  // Totals
  const cur = input.invoice.currency;
  renderer.renderSummaryRow("Subtotal", formatCurrency(input.invoice.subtotal, cur));

  if (input.invoice.discount > 0) {
    renderer.renderSummaryRow("Discount", `- ${formatCurrency(input.invoice.discount, cur)}`);
  }

  if (input.isInterState) {
    renderer.renderSummaryRow(`IGST (${input.invoice.taxRate}%)`, formatCurrency(input.invoice.taxAmount, cur));
  } else {
    const halfTax = input.invoice.taxAmount / 2;
    renderer.renderSummaryRow(`CGST (${input.invoice.taxRate / 2}%)`, formatCurrency(halfTax, cur));
    renderer.renderSummaryRow(`SGST (${input.invoice.taxRate / 2}%)`, formatCurrency(halfTax, cur));
  }

  renderer.renderSummaryRow("TOTAL", formatCurrency(input.invoice.totalAmount, cur), true);

  if (input.invoice.currency !== "INR") {
    renderer.renderSummaryRow("Equivalent (INR)", formatCurrency(input.invoice.baseCurrencyTotal, "INR"));
  }

  if (input.invoice.paidAmount > 0) {
    renderer.renderSummaryRow("Paid", formatCurrency(input.invoice.paidAmount, cur));
    renderer.renderSummaryRow("Balance Due", formatCurrency(input.invoice.totalAmount - input.invoice.paidAmount, cur), true);
  }

  renderer.moveDown(1);

  // Bank details
  if (input.company.bankName) {
    renderer.renderKeyValueSection("Payment Details", [
      ["Bank", input.company.bankName],
      ["Account", input.company.bankAccount || "N/A"],
      ["IFSC", input.company.bankIFSC || "N/A"],
      ["PAN", input.company.pan || "N/A"],
      ["GSTIN", input.company.gstin || "N/A"],
    ], 3);
  }

  if (input.invoice.notes) {
    renderer.renderNote(`Notes: ${input.invoice.notes}`);
  }
  if (input.invoice.terms) {
    renderer.renderNote(`Terms & Conditions: ${input.invoice.terms}`);
  }

  renderer.renderFooter();

  return renderer.toBuffer();
}
