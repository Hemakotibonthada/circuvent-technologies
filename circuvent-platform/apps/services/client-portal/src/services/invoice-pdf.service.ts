// ──────────────────────────────────────────────────────────────
// Client Portal — Invoice PDF Service
// Generates GST-compliant multi-currency invoices using
// the PDF engine, with full line item breakdown.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

type InvoiceInput = any;
async function getInvoicePDFGenerator() {
  try {
    const m = await import("@circuvent/pdf-engine");
    return m.generateInvoicePDF;
  } catch {
    throw new Error("PDF engine not available. Build @circuvent/pdf-engine first.");
  }
}

const prisma = new PrismaClient();

const COMPANY_INFO = {
  name: "Circuvent Technologies Pvt. Ltd.",
  address: "HSR Layout, Bengaluru, Karnataka 560102, India",
  gstin: "29AABCC1234F1Z5",
  pan: "AABCC1234F",
  bankName: "HDFC Bank",
  bankAccount: "50200012345678",
  bankIFSC: "HDFC0001234",
};

export class InvoicePDFService {
  /**
   * Generate and return invoice PDF buffer.
   */
  static async generate(invoiceId: string, actorId: string): Promise<{
    buffer: Buffer;
    filename: string;
    checksum: string;
  }> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lineItems: true,
        client: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!invoice) throw new Error("Invoice not found");

    // Determine if inter-state (simplified: different state prefix in GSTIN)
    const isInterState = this.determineInterState(
      COMPANY_INFO.gstin,
      invoice.client.taxId || ""
    );

    const pdfInput: InvoiceInput = {
      invoice: {
        number: invoice.invoiceNumber,
        title: invoice.title,
        description: invoice.description || undefined,
        issueDate: invoice.issueDate.toISOString().split("T")[0],
        dueDate: invoice.dueDate.toISOString().split("T")[0],
        subtotal: Number(invoice.subtotal),
        taxRate: Number(invoice.taxRate),
        taxAmount: Number(invoice.taxAmount),
        discount: Number(invoice.discount),
        totalAmount: Number(invoice.totalAmount),
        currency: invoice.currency,
        exchangeRate: Number(invoice.exchangeRate),
        baseCurrencyTotal: Number(invoice.baseCurrencyTotal),
        paidAmount: Number(invoice.paidAmount),
        status: invoice.status,
        notes: invoice.notes || undefined,
        terms: invoice.termsConditions || undefined,
      },
      client: {
        companyName: invoice.client.companyName,
        contactName: `${invoice.client.user.firstName} ${invoice.client.user.lastName}`,
        email: invoice.client.user.email,
        billingAddress: invoice.client.billingAddress || undefined,
        taxId: invoice.client.taxId || undefined,
        country: invoice.client.country,
      },
      company: COMPANY_INFO,
      lineItems: invoice.lineItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
        taxable: item.taxable,
      })),
      isInterState,
    };

    const generatePDF = await getInvoicePDFGenerator();
    const { buffer, checksum } = await generatePDF(pdfInput);

    await createAuditLog({
      userId: actorId,
      action: "EXPORT",
      entity: "Invoice",
      entityId: invoiceId,
      newValue: { action: "PDF_GENERATED", checksum, sizeBytes: buffer.length },
    });

    const filename = `${invoice.invoiceNumber.replace(/\//g, "-")}.pdf`;

    return { buffer, filename, checksum };
  }

  /**
   * Determine IGST vs CGST+SGST based on GSTIN state codes.
   * First 2 digits of GSTIN = state code.
   */
  private static determineInterState(supplierGSTIN: string, buyerGSTIN: string): boolean {
    if (!supplierGSTIN || !buyerGSTIN || buyerGSTIN.length < 2) return false;
    return supplierGSTIN.slice(0, 2) !== buyerGSTIN.slice(0, 2);
  }
}
