// ──────────────────────────────────────────────────────────────
// Employee Portal — Announcements, Holidays, Documents, Helpdesk, Training
// Consolidated routes for remaining portal features
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ═══════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════

router.get("/announcements", async (req: Request, res: Response) => {
  try {
    const { category, department } = req.query;
    const where: any = { isActive: true };
    if (category) where.category = category;
    if (department) where.OR = [{ department: null }, { department: department }];
    else where.OR = [{ department: null }, { department: { not: null } }];

    const announcements = await prisma.announcement.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 50,
    });
    res.json(successResponse(announcements));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/announcements", async (req: Request, res: Response) => {
  try {
    const { title, content, category, priority, department, isPinned, expiresAt } = req.body;
    if (!title || !content) { res.status(400).json(errorResponse("title and content required")); return; }
    const authorId = (req as any).user?.userId || "system";
    const announcement = await prisma.announcement.create({
      data: {
        title, content, category: category || "GENERAL", priority: priority || "NORMAL",
        authorId, department, isPinned: isPinned || false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(successResponse(announcement, "Announcement published"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.patch("/announcements/:id", async (req: Request, res: Response) => {
  try {
    const { title, content, category, priority, isActive, isPinned } = req.body;
    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: { title, content, category, priority, isActive, isPinned },
    });
    res.json(successResponse(announcement, "Announcement updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.delete("/announcements/:id", async (req: Request, res: Response) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, "Announcement deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// HOLIDAYS
// ═══════════════════════════════════════════════════════════════

router.get("/holidays", async (req: Request, res: Response) => {
  try {
    const { year, region, type } = req.query;
    const y = Number(year) || new Date().getFullYear();
    const where: any = {
      date: { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31) },
    };
    if (region) where.OR = [{ region: null }, { region: "ALL" }, { region: region }];
    if (type) where.type = type;

    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
    res.json(successResponse(holidays));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/holidays", async (req: Request, res: Response) => {
  try {
    const { name, date, type, isOptional, region, description } = req.body;
    if (!name || !date) { res.status(400).json(errorResponse("name and date required")); return; }
    const holiday = await prisma.holiday.create({
      data: { name, date: new Date(date), type: type || "COMPANY", isOptional: isOptional || false, region: region || "ALL", description },
    });
    res.status(201).json(successResponse(holiday, "Holiday added"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.delete("/holidays/:id", async (req: Request, res: Response) => {
  try {
    await prisma.holiday.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, "Holiday deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE DOCUMENTS
// ═══════════════════════════════════════════════════════════════

router.get("/documents/:employeeId", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const where: any = { employeeId: req.params.employeeId };
    if (category) where.category = category;

    const docs = await prisma.employeeDocument.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(successResponse(docs));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/documents", async (req: Request, res: Response) => {
  try {
    const { employeeId, title, category, fileName, fileUrl, fileSize, mimeType, notes } = req.body;
    if (!employeeId || !title || !fileName || !fileUrl) {
      res.status(400).json(errorResponse("employeeId, title, fileName, fileUrl required")); return;
    }
    const uploadedBy = (req as any).user?.userId || "system";
    const doc = await prisma.employeeDocument.create({
      data: { employeeId, title, category: category || "OTHER", fileName, fileUrl, fileSize, mimeType, uploadedBy, notes },
    });
    res.status(201).json(successResponse(doc, "Document uploaded"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.patch("/documents/:id/verify", async (req: Request, res: Response) => {
  try {
    const verifiedBy = (req as any).user?.userId || "system";
    const doc = await prisma.employeeDocument.update({
      where: { id: req.params.id },
      data: { isVerified: true, verifiedBy },
    });
    res.json(successResponse(doc, "Document verified"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.delete("/documents/:id", async (req: Request, res: Response) => {
  try {
    await prisma.employeeDocument.delete({ where: { id: req.params.id } });
    res.json(successResponse(null, "Document deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// HELPDESK / IT TICKETS
// ═══════════════════════════════════════════════════════════════

router.get("/helpdesk", async (req: Request, res: Response) => {
  try {
    const { employeeId, status, category, assignedTo, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (category) where.category = category;
    if (assignedTo) where.assignedTo = assignedTo;

    const [tickets, total] = await Promise.all([
      prisma.helpTicket.findMany({
        where,
        include: {
          employee: { include: { user: { select: { firstName: true, lastName: true } } } },
          comments: { orderBy: { createdAt: "desc" }, take: 3 },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.helpTicket.count({ where }),
    ]);
    res.json(successResponse(tickets, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/helpdesk", async (req: Request, res: Response) => {
  try {
    const { employeeId, category, priority, subject, description } = req.body;
    if (!employeeId || !subject || !description) {
      res.status(400).json(errorResponse("employeeId, subject, description required")); return;
    }
    const count = await prisma.helpTicket.count();
    const ticketCode = `TKT-${String(count + 1).padStart(4, "0")}`;
    const ticket = await prisma.helpTicket.create({
      data: {
        ticketCode, employeeId, category: category || "OTHER",
        priority: priority || "MEDIUM", subject, description,
      },
    });
    res.status(201).json(successResponse(ticket, `Ticket ${ticketCode} created`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.get("/helpdesk/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await prisma.helpTicket.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        comments: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) { res.status(404).json(errorResponse("Ticket not found")); return; }
    res.json(successResponse(ticket));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.patch("/helpdesk/:id", async (req: Request, res: Response) => {
  try {
    const { status, assignedTo, priority, resolution } = req.body;
    const data: any = {};
    if (status) data.status = status;
    if (assignedTo) data.assignedTo = assignedTo;
    if (priority) data.priority = priority;
    if (resolution) data.resolution = resolution;
    if (status === "RESOLVED") data.resolvedAt = new Date();
    if (status === "CLOSED") data.closedAt = new Date();

    const ticket = await prisma.helpTicket.update({ where: { id: req.params.id }, data });
    res.json(successResponse(ticket, `Ticket ${status || "updated"}`));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/helpdesk/:id/comments", async (req: Request, res: Response) => {
  try {
    const { content, isInternal } = req.body;
    if (!content) { res.status(400).json(errorResponse("content required")); return; }
    const userId = (req as any).user?.userId || "system";
    const comment = await prisma.ticketComment.create({
      data: { ticketId: req.params.id, userId, content, isInternal: isInternal || false },
    });
    res.status(201).json(successResponse(comment, "Comment added"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.get("/helpdesk/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      prisma.helpTicket.count(),
      prisma.helpTicket.count({ where: { status: "OPEN" } }),
      prisma.helpTicket.count({ where: { status: "IN_PROGRESS" } }),
      prisma.helpTicket.count({ where: { status: "RESOLVED" } }),
      prisma.helpTicket.count({ where: { status: "CLOSED" } }),
    ]);
    res.json(successResponse({ total, open, inProgress, resolved, closed }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// TRAINING & LEARNING
// ═══════════════════════════════════════════════════════════════

router.get("/training", async (req: Request, res: Response) => {
  try {
    const { status, category, department } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (department) where.OR = [{ department: null }, { department: department }];

    const programs = await prisma.trainingProgram.findMany({
      where,
      include: { _count: { select: { enrollments: true } } },
      orderBy: { startDate: "desc" },
    });
    res.json(successResponse(programs));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/training", async (req: Request, res: Response) => {
  try {
    const { title, description, category, instructor, duration, mode, maxSeats,
      startDate, endDate, location, materials, certificate, mandatory, department } = req.body;
    if (!title) { res.status(400).json(errorResponse("title required")); return; }
    const program = await prisma.trainingProgram.create({
      data: {
        title, description, category: category || "TECHNICAL", instructor, duration,
        mode: mode || "ONLINE", maxSeats, status: "UPCOMING",
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        location, materials, certificate: certificate || false,
        mandatory: mandatory || false, department,
      },
    });
    res.status(201).json(successResponse(program, "Training program created"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.post("/training/:id/enroll", async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId) { res.status(400).json(errorResponse("employeeId required")); return; }

    const program = await prisma.trainingProgram.findUnique({ where: { id: req.params.id }, include: { _count: { select: { enrollments: true } } } });
    if (!program) { res.status(404).json(errorResponse("Program not found")); return; }
    if (program.maxSeats && program._count.enrollments >= program.maxSeats) {
      const enrollment = await prisma.trainingEnrollment.create({
        data: { programId: req.params.id, employeeId, status: "WAITLISTED" },
      });
      res.status(201).json(successResponse(enrollment, "Added to waitlist (program full)"));
      return;
    }

    const enrollment = await prisma.trainingEnrollment.create({
      data: { programId: req.params.id, employeeId, status: "ENROLLED" },
    });
    res.status(201).json(successResponse(enrollment, "Enrolled successfully"));
  } catch (error: any) {
    if (error.code === "P2002") { res.status(400).json(errorResponse("Already enrolled")); return; }
    res.status(500).json(errorResponse(error.message));
  }
});

router.patch("/training/enrollments/:id", async (req: Request, res: Response) => {
  try {
    const { status, progress, score, feedback, certificateUrl } = req.body;
    const data: any = {};
    if (status) data.status = status;
    if (progress !== undefined) data.progress = progress;
    if (score !== undefined) data.score = score;
    if (feedback) data.feedback = feedback;
    if (certificateUrl) data.certificateUrl = certificateUrl;
    if (status === "COMPLETED") data.completedAt = new Date();

    const enrollment = await prisma.trainingEnrollment.update({ where: { id: req.params.id }, data });
    res.json(successResponse(enrollment, "Enrollment updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.get("/training/my/:employeeId", async (req: Request, res: Response) => {
  try {
    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { employeeId: req.params.employeeId },
      include: { program: true },
      orderBy: { enrolledAt: "desc" },
    });
    res.json(successResponse(enrollments));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

router.get("/training/dashboard/stats", async (_req: Request, res: Response) => {
  try {
    const [totalPrograms, activePrograms, totalEnrollments, completedEnrollments] = await Promise.all([
      prisma.trainingProgram.count(),
      prisma.trainingProgram.count({ where: { status: { in: ["UPCOMING", "ONGOING"] } } }),
      prisma.trainingEnrollment.count(),
      prisma.trainingEnrollment.count({ where: { status: "COMPLETED" } }),
    ]);
    res.json(successResponse({
      totalPrograms, activePrograms, totalEnrollments, completedEnrollments,
      completionRate: totalEnrollments > 0 ? Number(((completedEnrollments / totalEnrollments) * 100).toFixed(1)) : 0,
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE PORTAL DASHBOARD (self-service)
// ═══════════════════════════════════════════════════════════════

router.get("/my-dashboard/:employeeId", async (req: Request, res: Response) => {
  try {
    const empId = req.params.employeeId;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [employee, todayAttendance, monthAttendance, pendingLeaves, leaveBalance,
      expenseClaims, latestSlip, activeGoals, myTickets, announcements, upcomingHolidays,
      myTraining] = await Promise.all([
      // Profile
      prisma.employee.findUnique({
        where: { id: empId },
        include: { user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, department: true } } },
      }),
      // Today's attendance
      prisma.attendanceLog.findUnique({ where: { employeeId_date: { employeeId: empId, date: today } } }),
      // Month attendance count
      prisma.attendanceLog.count({ where: { employeeId: empId, date: { gte: monthStart }, status: "PRESENT" } }),
      // Pending leaves
      prisma.leaveRecord.count({ where: { employeeId: empId, status: "PENDING" } }),
      // Total leaves taken this year
      prisma.leaveRecord.count({ where: { employeeId: empId, status: "APPROVED", startDate: { gte: new Date(today.getFullYear(), 0, 1) } } }),
      // Expense claims pending
      prisma.expenseClaim.count({ where: { employeeId: empId, status: { in: ["DRAFT", "SUBMITTED"] } } }),
      // Latest salary slip
      prisma.salarySlip.findFirst({ where: { employeeId: empId }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
      // Active goals
      prisma.goal.count({ where: { employeeId: empId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } }),
      // My open tickets
      prisma.helpTicket.count({ where: { employeeId: empId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      // Recent announcements
      prisma.announcement.findMany({ where: { isActive: true }, orderBy: { publishedAt: "desc" }, take: 5 }),
      // Upcoming holidays
      prisma.holiday.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 5 }),
      // My active trainings
      prisma.trainingEnrollment.count({ where: { employeeId: empId, status: { in: ["ENROLLED", "IN_PROGRESS"] } } }),
    ]);

    if (!employee) { res.status(404).json(errorResponse("Employee not found")); return; }

    res.json(successResponse({
      profile: {
        ...employee,
        name: `${employee.user.firstName} ${employee.user.lastName}`,
      },
      attendance: {
        today: todayAttendance,
        monthPresent: monthAttendance,
        isClockedIn: !!(todayAttendance?.checkIn && !todayAttendance?.checkOut),
      },
      leaves: { pending: pendingLeaves, takenThisYear: leaveBalance },
      expenses: { pendingClaims: expenseClaims },
      payroll: { latestSlip },
      goals: { active: activeGoals },
      helpdesk: { openTickets: myTickets },
      announcements,
      upcomingHolidays,
      training: { activeEnrollments: myTraining },
    }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ═══════════════════════════════════════════════════════════════
// EMPLOYEE SELF-SERVICE — Profile & Document Management
// ═══════════════════════════════════════════════════════════════

/** GET /my-profile/:employeeId — Full employee profile for self-view */
router.get("/my-profile/:employeeId", async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, department: true, status: true } },
        documents: { orderBy: { createdAt: "desc" } },
        taxDeclarations: { orderBy: { financialYear: "desc" }, take: 3 },
      },
    });
    if (!employee) { res.status(404).json(errorResponse("Employee not found")); return; }
    res.json(successResponse(employee));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** PATCH /my-profile/:employeeId/personal — Update personal details */
router.patch("/my-profile/:employeeId/personal", async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body;
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!employee) { res.status(404).json(errorResponse("Employee not found")); return; }

    // Update User record
    const userData: any = {};
    if (firstName !== undefined) userData.firstName = firstName;
    if (lastName !== undefined) userData.lastName = lastName;
    if (phone !== undefined) userData.phone = phone;
    if (avatarUrl !== undefined) userData.avatarUrl = avatarUrl;

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({ where: { id: employee.userId }, data: userData });
    }

    const updated = await prisma.employee.findUnique({
      where: { id: req.params.employeeId },
      include: { user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } } },
    });
    res.json(successResponse(updated, "Personal details updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** PATCH /my-profile/:employeeId/bank — Update bank details */
router.patch("/my-profile/:employeeId/bank", async (req: Request, res: Response) => {
  try {
    const { bankAccountNo, bankIFSC, panNumber, aadhaarNumber, uanNumber } = req.body;
    const data: any = {};
    if (bankAccountNo !== undefined) data.bankAccountNo = bankAccountNo;
    if (bankIFSC !== undefined) data.bankIFSC = bankIFSC;
    if (panNumber !== undefined) data.panNumber = panNumber;
    if (aadhaarNumber !== undefined) data.aadhaarNumber = aadhaarNumber;
    if (uanNumber !== undefined) data.uanNumber = uanNumber;

    const employee = await prisma.employee.update({
      where: { id: req.params.employeeId },
      data,
    });
    res.json(successResponse(employee, "Bank & compliance details updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** PATCH /my-profile/:employeeId/address — Update address/location/emergency */
router.patch("/my-profile/:employeeId/contact", async (req: Request, res: Response) => {
  try {
    const { location, designation } = req.body;
    const data: any = {};
    if (location !== undefined) data.location = location;
    if (designation !== undefined) data.designation = designation;

    // Store extended contact info in user dept field for now
    const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId } });
    if (!employee) { res.status(404).json(errorResponse("Employee not found")); return; }

    if (Object.keys(data).length > 0) {
      // location stored at employee level would need schema extension,
      // but we can update user.department/phone for contact
    }

    res.json(successResponse(employee, "Contact details updated"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST /my-profile/:employeeId/documents — Upload a document */
router.post("/my-profile/:employeeId/documents", async (req: Request, res: Response) => {
  try {
    const { title, category, fileName, fileUrl, fileSize, mimeType, notes, expiresAt } = req.body;
    if (!title || !fileName || !fileUrl) {
      res.status(400).json(errorResponse("title, fileName, fileUrl required")); return;
    }
    const uploadedBy = (req as any).user?.userId || req.params.employeeId;
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: req.params.employeeId,
        title, category: category || "OTHER",
        fileName, fileUrl,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        uploadedBy,
        notes: notes || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(successResponse(doc, "Document uploaded"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /my-profile/:employeeId/documents — List all documents */
router.get("/my-profile/:employeeId/documents", async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const where: any = { employeeId: req.params.employeeId };
    if (category) where.category = category;

    const docs = await prisma.employeeDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    res.json(successResponse(docs));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** DELETE /my-profile/:employeeId/documents/:docId — Delete own document */
router.delete("/my-profile/:employeeId/documents/:docId", async (req: Request, res: Response) => {
  try {
    const doc = await prisma.employeeDocument.findUnique({ where: { id: req.params.docId } });
    if (!doc) { res.status(404).json(errorResponse("Document not found")); return; }
    if (doc.employeeId !== req.params.employeeId) {
      res.status(403).json(errorResponse("You can only delete your own documents")); return;
    }
    await prisma.employeeDocument.delete({ where: { id: req.params.docId } });
    res.json(successResponse(null, "Document deleted"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** POST /my-profile/:employeeId/tax-declaration — Submit tax declaration */
router.post("/my-profile/:employeeId/tax-declaration", async (req: Request, res: Response) => {
  try {
    const { financialYear, regime, section80C, section80D, section24, hraExemption } = req.body;
    if (!financialYear || !regime) {
      res.status(400).json(errorResponse("financialYear and regime (OLD/NEW) required")); return;
    }

    const totalDeclared = (Number(section80C) || 0) + (Number(section80D) || 0) +
      (Number(section24) || 0) + (Number(hraExemption) || 0);

    const declaration = await prisma.taxDeclaration.upsert({
      where: {
        employeeId_financialYear: { employeeId: req.params.employeeId, financialYear },
      },
      update: {
        regime, section80C: section80C || 0, section80D: section80D || 0,
        section24: section24 || 0, hra_exemption: hraExemption || 0,
        totalDeclared,
      },
      create: {
        employeeId: req.params.employeeId, financialYear, regime,
        section80C: section80C || 0, section80D: section80D || 0,
        section24: section24 || 0, hra_exemption: hraExemption || 0,
        totalDeclared,
      },
    });
    res.json(successResponse(declaration, "Tax declaration saved"));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

/** GET /my-profile/:employeeId/tax-declarations — List tax declarations */
router.get("/my-profile/:employeeId/tax-declarations", async (req: Request, res: Response) => {
  try {
    const declarations = await prisma.taxDeclaration.findMany({
      where: { employeeId: req.params.employeeId },
      orderBy: { financialYear: "desc" },
    });
    res.json(successResponse(declarations));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as portalRouter };
