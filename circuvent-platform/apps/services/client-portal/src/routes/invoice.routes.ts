// ──────────────────────────────────────────────────────────────
// Enhanced Invoice Routes — multi-currency + GST + payments
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { HTTP_STATUS, successResponse, errorResponse, normalizePagination, buildPaginationMeta } from "@circuvent/shared";
import { InvoiceService } from "../services";
import { createInvoiceSchema, recordPaymentSchema } from "../validators";

const router = Router();

router.get("/dashboard/revenue", async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const dashboard = await InvoiceService.getRevenueDashboard(year ? Number(year) : undefined);
    res.json(successResponse(dashboard));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch revenue dashboard"));
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const pagination = normalizePagination(req.query);
    const { status, clientId } = req.query;
    const { data, total } = await InvoiceService.list({ ...pagination, status: status as string, clientId: clientId as string });
    res.json(successResponse(data, undefined, buildPaginationMeta(total, pagination.page, pagination.limit)));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch invoices"));
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const invoice = await InvoiceService.getById(req.params.id);
    if (!invoice) { res.status(HTTP_STATUS.NOT_FOUND).json(errorResponse("Invoice not found")); return; }
    res.json(successResponse(invoice));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to fetch invoice"));
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createInvoiceSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const createdById = (req as any).user?.userId;
    const invoice = await InvoiceService.create(parsed.data, createdById);
    res.status(HTTP_STATUS.CREATED).json(successResponse(invoice, "Invoice created"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to create invoice"));
  }
});

router.patch("/:id/payment", async (req: Request, res: Response) => {
  try {
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(HTTP_STATUS.BAD_REQUEST).json(errorResponse(parsed.error.errors[0].message)); return; }
    const actorId = (req as any).user?.userId;
    const invoice = await InvoiceService.recordPayment(req.params.id, parsed.data.amount, parsed.data.paymentMethod, parsed.data.paymentRef, actorId);
    res.json(successResponse(invoice, "Payment recorded"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse(error.message || "Failed to record payment"));
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const actorId = (req as any).user?.userId;
    const invoice = await InvoiceService.updateStatus(req.params.id, status, actorId);
    res.json(successResponse(invoice, "Invoice status updated"));
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json(errorResponse("Failed to update invoice"));
  }
});

export { router as invoiceRouter };
