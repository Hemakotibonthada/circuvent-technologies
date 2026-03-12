// ══════════════════════════════════════════════════════════════
// Document Management Routes — Templates, generation, OCR
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ── Document Templates ────────────────────────────────────

router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const where: any = { isActive: true };
    if (category) where.category = category;

    const templates = await prisma.documentTemplate.findMany({ where, orderBy: { name: "asc" } });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch templates" });
  }
});

router.get("/templates/:id", async (req: Request, res: Response) => {
  try {
    const template = await prisma.documentTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch template" });
  }
});

router.post("/templates", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, category, content, variables } = req.body;

    if (!name || !category || !content) {
      res.status(400).json({ success: false, error: "name, category, content required" });
      return;
    }

    const template = await prisma.documentTemplate.create({
      data: { name, category, content, variables: variables || [], createdBy: userId },
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create template" });
  }
});

router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { name, content, variables, isActive } = req.body;
    const template = await prisma.documentTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(content && { content, version: { increment: 1 } }),
        ...(variables && { variables }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update template" });
  }
});

// ── Document Generation ───────────────────────────────────

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { templateId, name, entityType, entityId, data: docData } = req.body;

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }

    // Simple mustache-style variable replacement
    let content = template.content;
    if (docData && typeof docData === "object") {
      for (const [key, value] of Object.entries(docData)) {
        content = content.replace(new RegExp(`{{${key}}}`, "g"), String(value));
      }
    }

    const doc = await prisma.generatedDocument.create({
      data: {
        templateId,
        name: name || `${template.name} - ${new Date().toISOString().split("T")[0]}`,
        category: template.category,
        content,
        format: "HTML",
        entityType, entityId,
        generatedBy: userId,
        data: docData || {},
      },
    });

    res.status(201).json({ success: true, data: doc, message: "Document generated" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate document" });
  }
});

// ── Auto-generate for employee ──
router.post("/generate-for-employee/:employeeId", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { templateId } = req.body;

    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }

    // Auto-populate variables
    const vars: Record<string, string> = {
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      dateOfJoining: employee.dateOfJoining.toLocaleDateString("en-IN"),
      email: employee.user.email,
      baseSalary: Number(employee.baseSalary).toLocaleString("en-IN"),
      currentDate: new Date().toLocaleDateString("en-IN"),
      companyName: "Circuvent Technologies Pvt. Ltd.",
      companyAddress: "Circuvent Technologies, Hyderabad, Telangana, India",
    };

    let content = template.content;
    for (const [key, value] of Object.entries(vars)) {
      content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
    }

    const doc = await prisma.generatedDocument.create({
      data: {
        templateId,
        name: `${template.name} - ${employee.user.firstName} ${employee.user.lastName}`,
        category: template.category,
        content,
        format: "HTML",
        entityType: "Employee",
        entityId: employee.id,
        generatedBy: userId,
        data: vars,
      },
    });

    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate document" });
  }
});

// ── Generated Documents List ──
router.get("/generated", async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, category, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (category) where.category = category;

    const [docs, total] = await Promise.all([
      prisma.generatedDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.generatedDocument.count({ where }),
    ]);

    res.json({ success: true, data: docs, meta: { total } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch documents" });
  }
});

router.get("/generated/:id", async (req: Request, res: Response) => {
  try {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: req.params.id } });
    if (!doc) { res.status(404).json({ success: false, error: "Document not found" }); return; }
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch document" });
  }
});

// ── Seed default templates ──
router.post("/seed-templates", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const templates = [
      {
        name: "Offer Letter",
        category: "OFFER_LETTER",
        content: `<div style="font-family: Arial; padding: 40px;">
  <h1 style="color: #1e40af;">Circuvent Technologies Pvt. Ltd.</h1>
  <p>Date: {{currentDate}}</p>
  <h2>Offer of Employment</h2>
  <p>Dear <strong>{{employeeName}}</strong>,</p>
  <p>We are pleased to offer you the position of <strong>{{designation}}</strong> in our <strong>{{department}}</strong> department, effective {{dateOfJoining}}.</p>
  <p>Your compensation will be <strong>₹{{baseSalary}}</strong> per month (CTC).</p>
  <p>Employee Code: <strong>{{employeeCode}}</strong></p>
  <p>Please sign and return this letter to confirm your acceptance.</p>
  <br/><p>Sincerely,<br/>HR Department<br/>{{companyName}}</p>
</div>`,
        variables: [
          { name: "employeeName", type: "string", required: true },
          { name: "designation", type: "string", required: true },
          { name: "department", type: "string", required: true },
          { name: "baseSalary", type: "number", required: true },
          { name: "dateOfJoining", type: "date", required: true },
        ],
      },
      {
        name: "Experience Letter",
        category: "EXPERIENCE_LETTER",
        content: `<div style="font-family: Arial; padding: 40px;">
  <h1 style="color: #1e40af;">Circuvent Technologies Pvt. Ltd.</h1>
  <p>Date: {{currentDate}}</p>
  <h2>Experience Certificate</h2>
  <p>This is to certify that <strong>{{employeeName}}</strong> (Employee Code: {{employeeCode}}) was employed with {{companyName}} from <strong>{{dateOfJoining}}</strong> in the capacity of <strong>{{designation}}</strong> in the {{department}} department.</p>
  <p>During the tenure, we found the performance to be satisfactory and commendable.</p>
  <p>We wish all the best in future endeavors.</p>
  <br/><p>For {{companyName}}<br/>HR Department</p>
</div>`,
        variables: [],
      },
      {
        name: "Relieving Letter",
        category: "RELIEVING_LETTER", 
        content: `<div style="font-family: Arial; padding: 40px;">
  <h1 style="color: #1e40af;">Circuvent Technologies Pvt. Ltd.</h1>
  <p>Date: {{currentDate}}</p>
  <h2>Relieving Letter</h2>
  <p>Dear <strong>{{employeeName}}</strong>,</p>
  <p>This is to confirm that you have been relieved from your duties at {{companyName}} effective today. You have completed all formalities and have no outstanding dues with the organization.</p>
  <p>Your employee code was: <strong>{{employeeCode}}</strong></p>
  <p>We wish you all the best in your future career.</p>
  <br/><p>Regards,<br/>HR Department<br/>{{companyName}}</p>
</div>`,
        variables: [],
      },
      {
        name: "NDA Agreement",
        category: "NDA",
        content: `<div style="font-family: Arial; padding: 40px;">
  <h1>NON-DISCLOSURE AGREEMENT</h1>
  <p>This Non-Disclosure Agreement is entered into by and between {{companyName}} ("Company") and <strong>{{employeeName}}</strong> ("Employee"), effective {{currentDate}}.</p>
  <p>The Employee agrees to maintain strict confidentiality regarding all proprietary information, trade secrets, and business strategies of the Company.</p>
  <p>This agreement shall remain in effect for a period of 2 years after the termination of employment.</p>
  <br/><p>Employee Signature: _______________</p>
  <p>Date: {{currentDate}}</p>
</div>`,
        variables: [],
      },
    ];

    let created = 0;
    for (const t of templates) {
      const existing = await prisma.documentTemplate.findFirst({ where: { name: t.name } });
      if (existing) continue;
      await prisma.documentTemplate.create({
        data: { ...t, createdBy: userId },
      });
      created++;
    }

    res.json({ success: true, message: `Created ${created} document templates` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to seed templates" });
  }
});

// Dashboard
router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [totalTemplates, totalGenerated, byCategory] = await Promise.all([
      prisma.documentTemplate.count({ where: { isActive: true } }),
      prisma.generatedDocument.count(),
      prisma.generatedDocument.groupBy({ by: ["category"], _count: true }),
    ]);

    res.json({
      success: true,
      data: {
        totalTemplates,
        totalGenerated,
        byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as documentRouter };
