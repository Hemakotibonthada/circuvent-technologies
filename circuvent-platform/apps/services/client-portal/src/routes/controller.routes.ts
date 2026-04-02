// ──────────────────────────────────────────────────────────────
// Client Portal — Controller-backed Routes (Phase 2)
// Wires the InvoiceController, LeadController, and
// ClientController to RESTful endpoints with full domain
// entity validation and PDF generation.
// ──────────────────────────────────────────────────────────────

import { Router } from "express";
import { InvoiceController, LeadController, ClientController } from "../controllers/invoice.controller";

const router = Router();

// ═══ Client Routes ═══
router.get("/clients", ClientController.list);
router.get("/clients/:id", ClientController.getById);
router.post("/clients", ClientController.create);

// ═══ Lead Routes ═══
router.get("/leads/pipeline/summary", LeadController.getPipeline);
router.get("/leads", LeadController.list);
router.post("/leads", LeadController.create);
router.patch("/leads/:id/status", LeadController.updateStatus);

// ═══ Invoice Routes ═══
router.get("/invoices/dashboard/revenue", InvoiceController.getRevenueDashboard);
router.get("/invoices", InvoiceController.list);
router.get("/invoices/:id", InvoiceController.getById);
router.post("/invoices", InvoiceController.create);
router.patch("/invoices/:id/payment", InvoiceController.recordPayment);
router.get("/invoices/:id/pdf", InvoiceController.generatePDF);

export { router as controllerRouter };
