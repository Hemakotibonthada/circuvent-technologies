// ──────────────────────────────────────────────────────────────
// Client Portal — Invoice Controller
// Handles invoicing with domain entity validation, PDF
// generation, payment recording, aging reports.
// ──────────────────────────────────────────────────────────────

import { Request, Response } from "express";
import { InvoiceService, LeadService, ClientService } from "../services";
import { InvoiceEntity, LeadEntity } from "../domain/client.entities";
import { InvoicePDFService } from "../services/invoice-pdf.service";
import { createInvoiceSchema, recordPaymentSchema, createLeadSchema, updateLeadStatusSchema } from "../validators";
import { successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";

export class InvoiceController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pagination = normalizePagination(req.query);
      const { status, clientId } = req.query;
      const { data, total } = await InvoiceService.list({
        ...pagination, status: status as string, clientId: clientId as string,
      });
      res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const invoice = await InvoiceService.getById(req.params.id);
      if (!invoice) { res.status(404).json(errorResponse("Invoice not found")); return; }

      // Enrich with domain analysis
      const entity = new InvoiceEntity({
        id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status,
        subtotal: Number(invoice.subtotal), taxRate: Number(invoice.taxRate),
        taxAmount: Number(invoice.taxAmount), discount: Number(invoice.discount),
        totalAmount: Number(invoice.totalAmount), paidAmount: Number(invoice.paidAmount),
        currency: invoice.currency, exchangeRate: Number(invoice.exchangeRate),
        dueDate: new Date(invoice.dueDate), issueDate: new Date(invoice.issueDate),
      });

      res.json(successResponse({
        ...invoice,
        _analysis: {
          balanceDue: entity.getBalanceDue(),
          baseCurrencyTotal: entity.getBaseCurrencyTotal(),
          isOverdue: entity.isOverdue(),
          daysOverdue: entity.getDaysOverdue(),
          daysUntilDue: entity.getDaysUntilDue(),
          paymentProgress: entity.getPaymentProgress(),
          agingBucket: entity.getAgingBucket(),
          gstBreakdown: entity.computeGST(false),
        },
      }));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(errorResponse(parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ")));
        return;
      }
      const createdById = (req as any).user?.userId;
      const invoice = await InvoiceService.create(parsed.data, createdById);
      res.status(201).json(successResponse(invoice, "Invoice created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const parsed = recordPaymentSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }

      // Validate with domain entity
      const existing = await InvoiceService.getById(req.params.id);
      if (!existing) { res.status(404).json(errorResponse("Invoice not found")); return; }

      const entity = new InvoiceEntity({
        id: existing.id, invoiceNumber: existing.invoiceNumber, status: existing.status,
        subtotal: Number(existing.subtotal), taxRate: Number(existing.taxRate),
        taxAmount: Number(existing.taxAmount), discount: Number(existing.discount),
        totalAmount: Number(existing.totalAmount), paidAmount: Number(existing.paidAmount),
        currency: existing.currency, exchangeRate: Number(existing.exchangeRate),
        dueDate: new Date(existing.dueDate), issueDate: new Date(existing.issueDate),
      });

      try {
        entity.recordPayment(parsed.data.amount);
      } catch (domainError: any) {
        res.status(400).json(errorResponse(domainError.message));
        return;
      }

      const actorId = (req as any).user?.userId;
      const invoice = await InvoiceService.recordPayment(
        req.params.id, parsed.data.amount, parsed.data.paymentMethod, parsed.data.paymentRef, actorId
      );
      res.json(successResponse(invoice, "Payment recorded"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async generatePDF(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const { buffer, filename, checksum } = await InvoicePDFService.generate(req.params.id, actorId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Checksum-SHA256", checksum);
      res.send(buffer);
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message));
    }
  }

  static async getRevenueDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { year } = req.query;
      const dashboard = await InvoiceService.getRevenueDashboard(year ? Number(year) : undefined);
      res.json(successResponse(dashboard));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}

// ── Lead Controller ──

export class LeadController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const pagination = normalizePagination(req.query);
      const { status, source, assignedToId } = req.query;
      const { data, total } = await LeadService.list({
        ...pagination, status: status as string, source: source as string, assignedToId: assignedToId as string,
      });
      res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createLeadSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const createdById = (req as any).user?.userId;
      const lead = await LeadService.create(parsed.data, createdById);
      res.status(201).json(successResponse(lead, "Lead created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateLeadStatusSchema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json(errorResponse(parsed.error.errors[0].message)); return; }
      const actorId = (req as any).user?.userId;
      const lead = await LeadService.updateStatus(req.params.id, parsed.data.status, actorId);
      res.json(successResponse(lead, "Lead status updated"));
    } catch (error: any) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json(errorResponse(error.message));
    }
  }

  static async getPipeline(req: Request, res: Response): Promise<void> {
    try {
      const summary = await LeadService.getPipelineSummary();
      res.json(successResponse(summary));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}

// ── Client Controller ──

export class ClientController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const clients = await ClientService.list();
      res.json(successResponse(clients));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const client = await ClientService.getById(req.params.id);
      if (!client) { res.status(404).json(errorResponse("Client not found")); return; }
      res.json(successResponse(client));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const actorId = (req as any).user?.userId;
      const client = await ClientService.create(req.body, actorId);
      res.status(201).json(successResponse(client, "Client created"));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  }
}
