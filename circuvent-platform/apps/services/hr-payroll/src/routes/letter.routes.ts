// ══════════════════════════════════════════════════════════════
// HR Letter Management Routes — One-click letter generation & sending
// Supports: Offer, Appointment, Call, Experience, Relieving, Internship,
// Probation, Promotion, Transfer, Warning, Termination, Salary Revision,
// Bonus, NDA, Non-Compete, Verification, Reference, Appreciation & Custom
// ══════════════════════════════════════════════════════════════

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════
// Letter Templates CRUD
// ═══════════════════════════════════════════════════════════

// GET /letters/templates — List all letter templates
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const { letterType, category, isActive } = req.query;
    const where: any = {};
    if (letterType) where.letterType = letterType;
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === "true";

    const templates = await prisma.letterTemplate.findMany({
      where,
      include: { _count: { select: { letters: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch templates" });
  }
});

// GET /letters/templates/:id
router.get("/templates/:id", async (req: Request, res: Response) => {
  try {
    const template = await prisma.letterTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch template" });
  }
});

// POST /letters/templates — Create template
router.post("/templates", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, letterType, subject, htmlContent, variables, category } = req.body;
    if (!name || !letterType || !subject || !htmlContent) {
      res.status(400).json({ success: false, error: "name, letterType, subject, htmlContent required" });
      return;
    }
    const template = await prisma.letterTemplate.create({
      data: { name, letterType, subject, htmlContent, variables: variables || [], category: category || "EMPLOYMENT", createdBy: userId },
    });
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create template" });
  }
});

// PUT /letters/templates/:id
router.put("/templates/:id", async (req: Request, res: Response) => {
  try {
    const { name, subject, htmlContent, variables, category, isActive } = req.body;
    const template = await prisma.letterTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(subject && { subject }),
        ...(htmlContent && { htmlContent, version: { increment: 1 } }),
        ...(variables && { variables }),
        ...(category && { category }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update template" });
  }
});

// DELETE /letters/templates/:id (soft delete)
router.delete("/templates/:id", async (req: Request, res: Response) => {
  try {
    await prisma.letterTemplate.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, message: "Template deactivated" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to delete template" });
  }
});

// ═══════════════════════════════════════════════════════════
// Letter Generation & Sending
// ═══════════════════════════════════════════════════════════

// GET /letters — List all generated letters
router.get("/", async (req: Request, res: Response) => {
  try {
    const { letterType, status, recipientId, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (letterType) where.letterType = letterType;
    if (status) where.status = status;
    if (recipientId) where.recipientId = recipientId;

    const [letters, total] = await Promise.all([
      prisma.letter.findMany({
        where,
        include: { template: { select: { name: true, letterType: true } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.letter.count({ where }),
    ]);
    res.json({ success: true, data: letters, meta: { total, page: Number(page), limit: Number(limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch letters" });
  }
});

// GET /letters/:id — Single letter detail
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const letter = await prisma.letter.findUnique({
      where: { id: req.params.id },
      include: { template: true },
    });
    if (!letter) { res.status(404).json({ success: false, error: "Letter not found" }); return; }
    res.json({ success: true, data: letter });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch letter" });
  }
});

// GET /letters/my — Letters sent to me
router.get("/my/received", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const letters = await prisma.letter.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: letters });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch your letters" });
  }
});

// ─── ONE-CLICK GENERATE & SEND FOR EMPLOYEE ──────────────

// POST /letters/generate-for-employee — Generate any letter for an employee
router.post("/generate-for-employee", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { employeeId, templateId, letterType, customData, autoSend } = req.body;

    // Get employee details
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, department: true } } },
    });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    // Get template
    let template;
    if (templateId) {
      template = await prisma.letterTemplate.findUnique({ where: { id: templateId } });
    } else if (letterType) {
      template = await prisma.letterTemplate.findFirst({ where: { letterType, isActive: true } });
    }
    if (!template) { res.status(404).json({ success: false, error: "Letter template not found" }); return; }

    // Build variables map
    const vars: Record<string, string> = {
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      firstName: employee.user.firstName,
      lastName: employee.user.lastName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      dateOfJoining: employee.dateOfJoining.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      email: employee.user.email,
      phone: employee.user.phone || "",
      baseSalary: Number(employee.baseSalary).toLocaleString(),
      employmentType: (employee.employmentType || "").replace(/_/g, " "),
      currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      companyName: "Circuvent Technologies Pvt. Ltd.",
      companyAddress: "Circuvent Technologies, Hyderabad, Telangana 500081, India",
      companyEmail: "hr@circuvent.com",
      companyPhone: "+91 40 1234 5678",
      ...customData,
    };

    // Render template
    let content = template.htmlContent;
    let subject = template.subject;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, String(value || ""));
      subject = subject.replace(regex, String(value || ""));
    }

    // Create letter record
    const letter = await prisma.letter.create({
      data: {
        templateId: template.id,
        letterType: template.letterType,
        recipientId: employee.user.id,
        recipientName: `${employee.user.firstName} ${employee.user.lastName}`,
        recipientEmail: employee.user.email,
        subject,
        htmlContent: content,
        status: autoSend ? "SENT" : "GENERATED",
        sentAt: autoSend ? new Date() : undefined,
        sentBy: autoSend ? userId : undefined,
        metadata: vars,
        createdBy: userId,
      },
    });

    // Auto-send notification
    if (autoSend) {
      await prisma.notification.create({
        data: {
          userId: employee.user.id,
          type: "LETTER",
          title: `📄 ${template.name} Received`,
          message: subject,
          module: "LETTER",
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: "CREATE",
        entity: "Letter",
        entityId: letter.id,
        newValue: { letterType: template.letterType, recipient: employee.user.email, autoSent: autoSend },
      },
    });

    res.status(201).json({
      success: true,
      data: letter,
      message: autoSend
        ? `${template.name} sent to ${employee.user.firstName} ${employee.user.lastName}`
        : `${template.name} generated (draft). Send when ready.`,
    });
  } catch (error) {
    console.error("[LETTERS] Generate error:", error);
    res.status(500).json({ success: false, error: "Failed to generate letter" });
  }
});

// POST /letters/generate-for-candidate — Generate letter for a candidate (not yet employee)
router.post("/generate-for-candidate", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { candidateUserId, templateId, letterType, customData, autoSend } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: candidateUserId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    let template;
    if (templateId) {
      template = await prisma.letterTemplate.findUnique({ where: { id: templateId } });
    } else if (letterType) {
      template = await prisma.letterTemplate.findFirst({ where: { letterType, isActive: true } });
    }
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }

    const vars: Record<string, string> = {
      candidateName: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      companyName: "Circuvent Technologies Pvt. Ltd.",
      companyAddress: "Circuvent Technologies, Hyderabad, Telangana 500081, India",
      ...customData,
    };

    let content = template.htmlContent;
    let subject = template.subject;
    for (const [key, value] of Object.entries(vars)) {
      content = content.replace(new RegExp(`{{${key}}}`, "g"), String(value || ""));
      subject = subject.replace(new RegExp(`{{${key}}}`, "g"), String(value || ""));
    }

    const letter = await prisma.letter.create({
      data: {
        templateId: template.id,
        letterType: template.letterType,
        recipientId: user.id,
        recipientName: `${user.firstName} ${user.lastName}`,
        recipientEmail: user.email,
        subject, htmlContent: content,
        status: autoSend ? "SENT" : "GENERATED",
        sentAt: autoSend ? new Date() : undefined,
        sentBy: autoSend ? userId : undefined,
        metadata: vars,
        createdBy: userId,
      },
    });

    if (autoSend) {
      await prisma.notification.create({
        data: {
          userId: user.id, type: "LETTER",
          title: `📄 ${template.name}`, message: subject,
          module: "LETTER",
        },
      });
    }

    res.status(201).json({ success: true, data: letter,
      message: autoSend ? `Sent to ${user.firstName}` : "Letter generated as draft",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to generate letter for candidate" });
  }
});

// POST /letters/:id/send — Send a draft letter
router.post("/:id/send", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const letter = await prisma.letter.update({
      where: { id: req.params.id },
      data: { status: "SENT", sentAt: new Date(), sentBy: userId },
    });

    // Notify recipient
    await prisma.notification.create({
      data: {
        userId: letter.recipientId, type: "LETTER",
        title: `📄 New Letter: ${letter.subject}`,
        message: `You have received a ${letter.letterType.replace(/_/g, " ")} from HR`,
        module: "LETTER",
      },
    });

    res.json({ success: true, data: letter, message: `Letter sent to ${letter.recipientName}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to send letter" });
  }
});

// POST /letters/:id/acknowledge — Recipient acknowledges receipt
router.post("/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const letter = await prisma.letter.update({
      where: { id: req.params.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
    });
    res.json({ success: true, data: letter, message: "Letter acknowledged" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to acknowledge" });
  }
});

// POST /letters/:id/sign — Digital signature
router.post("/:id/sign", async (req: Request, res: Response) => {
  try {
    const { signatureUrl } = req.body;
    const letter = await prisma.letter.update({
      where: { id: req.params.id },
      data: { status: "SIGNED", signedAt: new Date(), signatureUrl },
    });
    res.json({ success: true, data: letter, message: "Letter signed" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to sign" });
  }
});

// POST /letters/:id/revoke — Revoke a sent letter
router.post("/:id/revoke", async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const letter = await prisma.letter.update({
      where: { id: req.params.id },
      data: { status: "REVOKED", notes: `Revoked: ${reason || "N/A"}` },
    });
    res.json({ success: true, data: letter, message: "Letter revoked" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to revoke" });
  }
});

// ─── BATCH OPERATIONS ────────────────────────────────────

// POST /letters/batch-send — Send letters to multiple recipients
router.post("/batch-send", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { templateId, letterType, recipientIds, customData } = req.body;

    if (!recipientIds || recipientIds.length === 0) {
      res.status(400).json({ success: false, error: "recipientIds array required" });
      return;
    }

    let template;
    if (templateId) {
      template = await prisma.letterTemplate.findUnique({ where: { id: templateId } });
    } else if (letterType) {
      template = await prisma.letterTemplate.findFirst({ where: { letterType, isActive: true } });
    }
    if (!template) { res.status(404).json({ success: false, error: "Template not found" }); return; }

    // Create batch record
    const batch = await prisma.letterBatch.create({
      data: {
        name: `${template.name} - Batch ${new Date().toISOString().split("T")[0]}`,
        letterType: template.letterType,
        templateId: template.id,
        recipientIds,
        totalCount: recipientIds.length,
        status: "PROCESSING",
        startedAt: new Date(),
        createdBy: userId,
      },
    });

    // Process each recipient
    let sentCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (const recId of recipientIds) {
      try {
        const user = await prisma.user.findUnique({ where: { id: recId }, select: { id: true, firstName: true, lastName: true, email: true } });
        if (!user) { errors.push({ recipientId: recId, error: "User not found" }); failedCount++; continue; }

        // Try to get employee data for richer templates
        const employee = await prisma.employee.findUnique({ where: { userId: recId } });

        const vars: Record<string, string> = {
          employeeName: `${user.firstName} ${user.lastName}`,
          firstName: user.firstName, lastName: user.lastName,
          email: user.email,
          employeeCode: employee?.employeeCode || "N/A",
          designation: employee?.designation || "N/A",
          department: employee?.department || "N/A",
          dateOfJoining: employee?.dateOfJoining?.toLocaleDateString("en-IN") || "N/A",
          baseSalary: employee?.baseSalary ? Number(employee.baseSalary).toLocaleString() : "N/A",
          currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
          companyName: "Circuvent Technologies Pvt. Ltd.",
          ...customData,
        };

        let content = template.htmlContent;
        let subject = template.subject;
        for (const [key, value] of Object.entries(vars)) {
          content = content.replace(new RegExp(`{{${key}}}`, "g"), String(value));
          subject = subject.replace(new RegExp(`{{${key}}}`, "g"), String(value));
        }

        await prisma.letter.create({
          data: {
            templateId: template.id, letterType: template.letterType,
            recipientId: user.id, recipientName: `${user.firstName} ${user.lastName}`,
            recipientEmail: user.email, subject, htmlContent: content,
            status: "SENT", sentAt: new Date(), sentBy: userId,
            metadata: vars, createdBy: userId,
          },
        });

        await prisma.notification.create({
          data: { userId: user.id, type: "LETTER", title: `📄 ${template.name}`, message: subject, module: "LETTER" },
        });

        sentCount++;
      } catch (err) {
        errors.push({ recipientId: recId, error: String(err) });
        failedCount++;
      }
    }

    // Update batch status
    await prisma.letterBatch.update({
      where: { id: batch.id },
      data: { sentCount, failedCount, status: failedCount === recipientIds.length ? "FAILED" : "COMPLETED", completedAt: new Date(), errors: errors.length > 0 ? errors : undefined },
    });

    res.status(201).json({
      success: true,
      data: { batchId: batch.id, sent: sentCount, failed: failedCount, errors },
      message: `Batch complete: ${sentCount} sent, ${failedCount} failed`,
    });
  } catch (error) {
    console.error("[LETTERS] Batch error:", error);
    res.status(500).json({ success: false, error: "Failed to batch send" });
  }
});

// GET /letters/batches — List batch operations
router.get("/batches/list", async (_req: Request, res: Response) => {
  try {
    const batches = await prisma.letterBatch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    res.json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch batches" });
  }
});

// ─── ONE-CLICK QUICK ACTIONS ─────────────────────────────

// POST /letters/quick/offer — Send offer letter with one click
router.post("/quick/offer", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { candidateUserId, designation, department, salary, joiningDate } = req.body;
    const user = await prisma.user.findUnique({ where: { id: candidateUserId } });
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    const template = await prisma.letterTemplate.findFirst({ where: { letterType: "OFFER_LETTER", isActive: true } });
    if (!template) { res.status(404).json({ success: false, error: "No offer letter template. Seed templates first." }); return; }

    const vars = {
      candidateName: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName, designation: designation || "Software Engineer",
      department: department || "Engineering", baseSalary: Number(salary || 50000).toLocaleString("en-IN"),
      joiningDate: joiningDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN"),
      currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      companyName: "Circuvent Technologies Pvt. Ltd.", offerValidity: "7 days",
    };

    let content = template.htmlContent;
    let subject = template.subject;
    for (const [k, v] of Object.entries(vars)) {
      content = content.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      subject = subject.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }

    const letter = await prisma.letter.create({
      data: {
        templateId: template.id, letterType: "OFFER_LETTER",
        recipientId: user.id, recipientName: `${user.firstName} ${user.lastName}`,
        recipientEmail: user.email, subject, htmlContent: content,
        status: "SENT", sentAt: new Date(), sentBy: userId,
        metadata: vars, createdBy: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.notification.create({
      data: { userId: user.id, type: "LETTER", title: "🎉 Offer Letter from Circuvent!", message: `Congratulations! You have received an Offer Letter for the ${designation || "Software Engineer"} role.`, module: "LETTER" },
    });

    res.status(201).json({ success: true, data: letter, message: `Offer letter sent to ${user.firstName} ${user.lastName}!` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to send offer letter" });
  }
});

// POST /letters/quick/experience — Send experience letter with one click
router.post("/quick/experience", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { employeeId, lastWorkingDate, performanceRating } = req.body;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }

    const template = await prisma.letterTemplate.findFirst({ where: { letterType: "EXPERIENCE_LETTER", isActive: true } });
    if (!template) { res.status(404).json({ success: false, error: "No experience letter template" }); return; }

    const vars = {
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      employeeCode: employee.employeeCode, designation: employee.designation,
      department: employee.department, dateOfJoining: employee.dateOfJoining.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      lastWorkingDate: lastWorkingDate || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      performanceRating: performanceRating || "Satisfactory",
      currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      companyName: "Circuvent Technologies Pvt. Ltd.",
    };

    let content = template.htmlContent; let subject = template.subject;
    for (const [k, v] of Object.entries(vars)) { content = content.replace(new RegExp(`{{${k}}}`, "g"), String(v)); subject = subject.replace(new RegExp(`{{${k}}}`, "g"), String(v)); }

    const letter = await prisma.letter.create({
      data: { templateId: template.id, letterType: "EXPERIENCE_LETTER", recipientId: employee.user.id, recipientName: `${employee.user.firstName} ${employee.user.lastName}`, recipientEmail: employee.user.email, subject, htmlContent: content, status: "SENT", sentAt: new Date(), sentBy: userId, metadata: vars, createdBy: userId },
    });

    await prisma.notification.create({ data: { userId: employee.user.id, type: "LETTER", title: "📄 Experience Letter Generated", message: "Your experience letter is ready", module: "LETTER" } });
    res.status(201).json({ success: true, data: letter, message: `Experience letter sent to ${employee.user.firstName}` });
  } catch (error) { res.status(500).json({ success: false, error: "Failed to send experience letter" }); }
});

// POST /letters/quick/internship — Send internship letter
router.post("/quick/internship", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { candidateUserId, role, department, duration, stipend, startDate, mentorName } = req.body;
    const user = await prisma.user.findUnique({ where: { id: candidateUserId } });
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
    const template = await prisma.letterTemplate.findFirst({ where: { letterType: "INTERNSHIP_LETTER", isActive: true } });
    if (!template) { res.status(404).json({ success: false, error: "No internship letter template" }); return; }

    const vars = { candidateName: `${user.firstName} ${user.lastName}`, firstName: user.firstName, role: role || "Intern", department: department || "Engineering", duration: duration || "3 months", stipend: Number(stipend || 15000).toLocaleString("en-IN"), startDate: startDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN"), mentorName: mentorName || "To be assigned", currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), companyName: "Circuvent Technologies Pvt. Ltd." };

    let content = template.htmlContent; let subject = template.subject;
    for (const [k, v] of Object.entries(vars)) { content = content.replace(new RegExp(`{{${k}}}`, "g"), String(v)); subject = subject.replace(new RegExp(`{{${k}}}`, "g"), String(v)); }

    const letter = await prisma.letter.create({ data: { templateId: template.id, letterType: "INTERNSHIP_LETTER", recipientId: user.id, recipientName: `${user.firstName} ${user.lastName}`, recipientEmail: user.email, subject, htmlContent: content, status: "SENT", sentAt: new Date(), sentBy: userId, metadata: vars, createdBy: userId } });
    await prisma.notification.create({ data: { userId: user.id, type: "LETTER", title: "🎓 Internship Letter!", message: `You have received an Internship Letter for ${role || "Intern"} role`, module: "LETTER" } });
    res.status(201).json({ success: true, data: letter, message: `Internship letter sent to ${user.firstName}` });
  } catch (error) { res.status(500).json({ success: false, error: "Failed to send internship letter" }); }
});

// POST /letters/quick/call — Send call letter (interview)
router.post("/quick/call", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { candidateUserId, position, interviewDate, interviewTime, venue, interviewType, panelMembers } = req.body;
    const user = await prisma.user.findUnique({ where: { id: candidateUserId } });
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }
    const template = await prisma.letterTemplate.findFirst({ where: { letterType: "CALL_LETTER", isActive: true } });
    if (!template) { res.status(404).json({ success: false, error: "No call letter template" }); return; }

    const vars = { candidateName: `${user.firstName} ${user.lastName}`, position: position || "Software Engineer", interviewDate: interviewDate || "TBD", interviewTime: interviewTime || "10:00 AM IST", venue: venue || "Circuvent Technologies Office, Hyderabad", interviewType: interviewType || "In-Person", panelMembers: panelMembers || "HR Team", currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), companyName: "Circuvent Technologies Pvt. Ltd." };

    let content = template.htmlContent; let subject = template.subject;
    for (const [k, v] of Object.entries(vars)) { content = content.replace(new RegExp(`{{${k}}}`, "g"), String(v)); subject = subject.replace(new RegExp(`{{${k}}}`, "g"), String(v)); }

    const letter = await prisma.letter.create({ data: { templateId: template.id, letterType: "CALL_LETTER", recipientId: user.id, recipientName: `${user.firstName} ${user.lastName}`, recipientEmail: user.email, subject, htmlContent: content, status: "SENT", sentAt: new Date(), sentBy: userId, metadata: vars, createdBy: userId } });
    await prisma.notification.create({ data: { userId: user.id, type: "LETTER", title: "📞 Interview Call Letter", message: `Interview scheduled for ${position || "Software Engineer"} on ${interviewDate || "TBD"}`, module: "LETTER" } });
    res.status(201).json({ success: true, data: letter, message: `Call letter sent to ${user.firstName}` });
  } catch (error) { res.status(500).json({ success: false, error: "Failed to send call letter" }); }
});

// POST /letters/quick/relieving — Send relieving letter
router.post("/quick/relieving", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { employeeId, lastWorkingDate, clearanceStatus } = req.body;
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
    if (!employee) { res.status(404).json({ success: false, error: "Employee not found" }); return; }
    const template = await prisma.letterTemplate.findFirst({ where: { letterType: "RELIEVING_LETTER", isActive: true } });
    if (!template) { res.status(404).json({ success: false, error: "No relieving letter template" }); return; }
    const vars = { employeeName: `${employee.user.firstName} ${employee.user.lastName}`, employeeCode: employee.employeeCode, designation: employee.designation, department: employee.department, dateOfJoining: employee.dateOfJoining.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), lastWorkingDate: lastWorkingDate || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), clearanceStatus: clearanceStatus || "All clearances completed", currentDate: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), companyName: "Circuvent Technologies Pvt. Ltd." };
    let content = template.htmlContent; let subject = template.subject;
    for (const [k, v] of Object.entries(vars)) { content = content.replace(new RegExp(`{{${k}}}`, "g"), String(v)); subject = subject.replace(new RegExp(`{{${k}}}`, "g"), String(v)); }
    const letter = await prisma.letter.create({ data: { templateId: template.id, letterType: "RELIEVING_LETTER", recipientId: employee.user.id, recipientName: `${employee.user.firstName} ${employee.user.lastName}`, recipientEmail: employee.user.email, subject, htmlContent: content, status: "SENT", sentAt: new Date(), sentBy: userId, metadata: vars, createdBy: userId } });
    await prisma.notification.create({ data: { userId: employee.user.id, type: "LETTER", title: "📄 Relieving Letter", message: "Your relieving letter has been issued", module: "LETTER" } });
    res.status(201).json({ success: true, data: letter, message: `Relieving letter sent to ${employee.user.firstName}` });
  } catch (error) { res.status(500).json({ success: false, error: "Failed to send relieving letter" }); }
});

// ─── SEED DEFAULT TEMPLATES ──────────────────────────────

router.post("/seed-templates", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const templates = [
      { name: "Offer Letter", letterType: "OFFER_LETTER" as const, subject: "Offer of Employment — {{designation}} at Circuvent Technologies", category: "EMPLOYMENT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1><p style="color:#64748b;margin:5px 0 0">AI, IoT & Embedded Systems</p></div><p style="color:#64748b;text-align:right">Date: {{currentDate}}</p><h2 style="color:#1e3a5f">Offer of Employment</h2><p>Dear <strong>{{candidateName}}</strong>,</p><p>We are pleased to extend an offer of employment for the position of <strong>{{designation}}</strong> in our <strong>{{department}}</strong> department at {{companyName}}.</p><h3 style="color:#1e40af">Compensation Details</h3><table style="width:100%;border-collapse:collapse;margin:15px 0"><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Base Salary (Monthly)</td><td style="padding:10px;border:1px solid #e2e8f0">₹{{baseSalary}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Joining Date</td><td style="padding:10px;border:1px solid #e2e8f0">{{joiningDate}}</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Offer Validity</td><td style="padding:10px;border:1px solid #e2e8f0">{{offerValidity}}</td></tr></table><p>This offer is contingent upon satisfactory background verification and completion of all joining formalities.</p><p>Please confirm your acceptance by signing and returning this letter within the validity period.</p><br/><p>Warm Regards,<br/><strong>HR Department</strong><br/>{{companyName}}<br/>{{companyAddress}}</p></div>` },
      { name: "Call Letter (Interview)", letterType: "CALL_LETTER" as const, subject: "Interview Invitation — {{position}} at Circuvent Technologies", category: "EMPLOYMENT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="color:#64748b;text-align:right">Date: {{currentDate}}</p><h2 style="color:#1e3a5f">Interview Invitation</h2><p>Dear <strong>{{candidateName}}</strong>,</p><p>Thank you for your interest in the <strong>{{position}}</strong> position at Circuvent Technologies. We are pleased to invite you for an interview.</p><table style="width:100%;border-collapse:collapse;margin:15px 0"><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Date</td><td style="padding:10px;border:1px solid #e2e8f0">{{interviewDate}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Time</td><td style="padding:10px;border:1px solid #e2e8f0">{{interviewTime}}</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Mode</td><td style="padding:10px;border:1px solid #e2e8f0">{{interviewType}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Venue/Link</td><td style="padding:10px;border:1px solid #e2e8f0">{{venue}}</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Panel</td><td style="padding:10px;border:1px solid #e2e8f0">{{panelMembers}}</td></tr></table><p>Please carry a valid photo ID and two copies of your resume. If you need to reschedule, kindly reply to this email.</p><p>Best Wishes,<br/><strong>HR Team</strong><br/>{{companyName}}</p></div>` },
      { name: "Experience Letter", letterType: "EXPERIENCE_LETTER" as const, subject: "Experience Certificate — {{employeeName}}", category: "EXIT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2 style="text-align:center;color:#1e3a5f">EXPERIENCE CERTIFICATE</h2><p style="text-align:center;color:#64748b">Ref: CIR/EXP/{{employeeCode}}</p><p>To Whom It May Concern,</p><p>This is to certify that <strong>{{employeeName}}</strong> (Employee Code: {{employeeCode}}) was employed with Circuvent Technologies Pvt. Ltd. from <strong>{{dateOfJoining}}</strong> to <strong>{{lastWorkingDate}}</strong> in the capacity of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department.</p><p>During the tenure with us, we found the conduct and performance to be <strong>{{performanceRating}}</strong>.</p><p>We wish all the best in future endeavors.</p><br/><p>For <strong>{{companyName}}</strong></p><br/><p>________________________<br/>Authorized Signatory<br/>HR Department</p></div>` },
      { name: "Relieving Letter", letterType: "RELIEVING_LETTER" as const, subject: "Relieving Letter — {{employeeName}}", category: "EXIT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2 style="text-align:center;color:#1e3a5f">RELIEVING LETTER</h2><p>Dear <strong>{{employeeName}}</strong>,</p><p>This is to confirm that you have been relieved from your duties at {{companyName}} effective <strong>{{lastWorkingDate}}</strong>.</p><p>Employee Code: <strong>{{employeeCode}}</strong><br/>Designation: <strong>{{designation}}</strong><br/>Department: <strong>{{department}}</strong><br/>Date of Joining: <strong>{{dateOfJoining}}</strong></p><p>Clearance Status: <strong>{{clearanceStatus}}</strong></p><p>You have no outstanding dues or obligations with the organization. We thank you for your service and wish you success in your career.</p><br/><p>For <strong>{{companyName}}</strong></p><p>________________________<br/>HR Department</p></div>` },
      { name: "Internship Letter", letterType: "INTERNSHIP_LETTER" as const, subject: "Internship Offer — {{role}} at Circuvent Technologies", category: "INTERNSHIP", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2>Internship Offer</h2><p>Dear <strong>{{candidateName}}</strong>,</p><p>We are pleased to offer you an internship position at Circuvent Technologies.</p><table style="width:100%;border-collapse:collapse;margin:15px 0"><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Role</td><td style="padding:10px;border:1px solid #e2e8f0">{{role}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Department</td><td style="padding:10px;border:1px solid #e2e8f0">{{department}}</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Duration</td><td style="padding:10px;border:1px solid #e2e8f0">{{duration}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Stipend (Monthly)</td><td style="padding:10px;border:1px solid #e2e8f0">₹{{stipend}}</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Start Date</td><td style="padding:10px;border:1px solid #e2e8f0">{{startDate}}</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Mentor</td><td style="padding:10px;border:1px solid #e2e8f0">{{mentorName}}</td></tr></table><p>Please confirm your acceptance. A completion certificate will be provided upon successful completion.</p><p>Best Regards,<br/><strong>HR Team</strong><br/>{{companyName}}</p></div>` },
      { name: "Appointment Letter", letterType: "APPOINTMENT_LETTER" as const, subject: "Appointment Letter — {{designation}} at Circuvent Technologies", category: "EMPLOYMENT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2>Letter of Appointment</h2><p>Dear <strong>{{employeeName}}</strong>,</p><p>This is your formal appointment as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at {{companyName}}, effective <strong>{{dateOfJoining}}</strong>.</p><p>Employee Code: <strong>{{employeeCode}}</strong><br/>CTC: <strong>₹{{baseSalary}}/month</strong><br/>Employment Type: <strong>{{employmentType}}</strong></p><p>The detailed terms and conditions of employment are enclosed. This appointment is subject to the company's policies.</p><p>Welcome to Circuvent Technologies!</p><p>For <strong>{{companyName}}</strong><br/>HR Department</p></div>` },
      { name: "Promotion Letter", letterType: "PROMOTION_LETTER" as const, subject: "Congratulations on Your Promotion! — {{employeeName}}", category: "RECOGNITION", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2 style="color:#065f46">🎉 Promotion Letter</h2><p>Dear <strong>{{employeeName}}</strong>,</p><p>We are delighted to inform you that based on your outstanding performance and dedication, you have been promoted to <strong>{{newDesignation}}</strong> in the <strong>{{department}}</strong> department, effective <strong>{{effectiveDate}}</strong>.</p><p>Your revised compensation is <strong>₹{{newSalary}}/month</strong>.</p><p>We look forward to your continued contributions and wish you success in your new role!</p><p>Congratulations!<br/><strong>HR Department</strong><br/>{{companyName}}</p></div>` },
      { name: "Warning Letter", letterType: "WARNING_LETTER" as const, subject: "Formal Warning — {{employeeName}}", category: "COMPLIANCE", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #dc2626;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#dc2626;margin:0">Circuvent Technologies Pvt. Ltd.</h1><p style="color:#64748b">CONFIDENTIAL</p></div><p style="text-align:right">Date: {{currentDate}}</p><h2 style="color:#dc2626">Formal Warning</h2><p>Dear <strong>{{employeeName}}</strong> ({{employeeCode}}),</p><p>This letter serves as a formal warning regarding <strong>{{warningReason}}</strong>.</p><p>{{warningDetails}}</p><p>Please ensure immediate corrective action. Failure may lead to further disciplinary action.</p><p>For <strong>{{companyName}}</strong><br/>HR Department</p></div>` },
      { name: "Salary Revision Letter", letterType: "SALARY_REVISION_LETTER" as const, subject: "Salary Revision — {{employeeName}}", category: "EMPLOYMENT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2>Salary Revision Letter</h2><p>Dear <strong>{{employeeName}}</strong>,</p><p>We are pleased to inform you of a revision in your compensation, effective <strong>{{effectiveDate}}</strong>.</p><table style="width:100%;border-collapse:collapse;margin:15px 0"><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Previous Salary</td><td style="padding:10px;border:1px solid #e2e8f0">₹{{previousSalary}}/month</td></tr><tr><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Revised Salary</td><td style="padding:10px;border:1px solid #e2e8f0">₹{{newSalary}}/month</td></tr><tr style="background:#f1f5f9"><td style="padding:10px;border:1px solid #e2e8f0;font-weight:bold">Increment</td><td style="padding:10px;border:1px solid #e2e8f0">{{incrementPercentage}}%</td></tr></table><p>Congratulations!<br/><strong>HR Department</strong></p></div>` },
      { name: "Internship Completion Certificate", letterType: "INTERNSHIP_COMPLETION" as const, subject: "Internship Completion — {{employeeName}}", category: "INTERNSHIP", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:2px solid #1e40af"><div style="text-align:center;padding:20px"><h1 style="color:#1e40af">CERTIFICATE OF COMPLETION</h1><p style="color:#64748b;font-size:18px">Internship Program</p></div><hr style="border:1px solid #e2e8f0"/><div style="text-align:center;padding:20px"><p style="font-size:16px">This is to certify that</p><h2 style="color:#1e3a5f">{{employeeName}}</h2><p>has successfully completed the internship program at <strong>{{companyName}}</strong></p><table style="width:80%;margin:20px auto;border-collapse:collapse"><tr><td style="padding:8px;text-align:left;font-weight:bold">Department</td><td style="padding:8px">{{department}}</td></tr><tr><td style="padding:8px;text-align:left;font-weight:bold">Duration</td><td style="padding:8px">{{duration}}</td></tr><tr><td style="padding:8px;text-align:left;font-weight:bold">Project</td><td style="padding:8px">{{projectName}}</td></tr><tr><td style="padding:8px;text-align:left;font-weight:bold">Performance</td><td style="padding:8px">{{performanceRating}}</td></tr></table><p>Date: {{currentDate}}</p><br/><p>________________________<br/>Authorized Signatory</p></div></div>` },
      { name: "Employment Verification Letter", letterType: "EMPLOYMENT_VERIFICATION" as const, subject: "Employment Verification — {{employeeName}}", category: "EMPLOYMENT", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #1e40af;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#1e40af;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2>Employment Verification</h2><p>To Whom It May Concern,</p><p>This is to confirm that <strong>{{employeeName}}</strong> (Employee Code: {{employeeCode}}) is currently employed with {{companyName}} since <strong>{{dateOfJoining}}</strong>.</p><p>Designation: <strong>{{designation}}</strong><br/>Department: <strong>{{department}}</strong></p><p>This letter is issued at the request of the employee for official purposes.</p><p>For <strong>{{companyName}}</strong><br/>HR Department</p></div>` },
      { name: "Appreciation Letter", letterType: "APPRECIATION_LETTER" as const, subject: "Appreciation — Outstanding Contribution by {{employeeName}}", category: "RECOGNITION", htmlContent: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;padding:40px;background:#fff;border:1px solid #e2e8f0"><div style="border-bottom:3px solid #059669;padding-bottom:20px;margin-bottom:30px"><h1 style="color:#059669;margin:0">Circuvent Technologies Pvt. Ltd.</h1></div><p style="text-align:right">Date: {{currentDate}}</p><h2 style="color:#059669">🌟 Letter of Appreciation</h2><p>Dear <strong>{{employeeName}}</strong>,</p><p>We would like to express our sincere appreciation for your outstanding contribution to <strong>{{achievement}}</strong>.</p><p>Your dedication, hard work, and commitment to excellence exemplify the values we cherish at Circuvent Technologies.</p><p>{{personalMessage}}</p><p>Keep up the great work!</p><p>With appreciation,<br/><strong>{{senderName}}</strong><br/>{{senderDesignation}}<br/>{{companyName}}</p></div>` },
    ];

    let created = 0;
    for (const t of templates) {
      const existing = await prisma.letterTemplate.findFirst({ where: { letterType: t.letterType } });
      if (existing) continue;
      await prisma.letterTemplate.create({ data: { ...t, variables: [], createdBy: userId } });
      created++;
    }
    res.json({ success: true, message: `Created ${created} letter templates (${templates.length - created} already existed)` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to seed templates" });
  }
});

// ─── DASHBOARD ────────────────────────────────────────────

router.get("/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [total, byType, byStatus, thisMonth, batches] = await Promise.all([
      prisma.letter.count(),
      prisma.letter.groupBy({ by: ["letterType"], _count: true, orderBy: { _count: { letterType: "desc" } } }),
      prisma.letter.groupBy({ by: ["status"], _count: true }),
      prisma.letter.count({ where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
      prisma.letterBatch.count(),
    ]);

    const templateCount = await prisma.letterTemplate.count({ where: { isActive: true } });
    const pendingAcknowledgment = await prisma.letter.count({ where: { status: "SENT" } });

    res.json({
      success: true,
      data: {
        totalLetters: total,
        thisMonth,
        activeTemplates: templateCount,
        totalBatches: batches,
        pendingAcknowledgment,
        byType: byType.map(t => ({ type: t.letterType, count: t._count })),
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as letterRouter };
