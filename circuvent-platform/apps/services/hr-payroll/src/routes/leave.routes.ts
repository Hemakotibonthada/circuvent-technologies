// ──────────────────────────────────────────────────────────────
// HR Payroll — Leave Management Routes
// REST endpoints for leave requests, approvals, balance
// checks, team calendar, and pending leaves.
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { EmployeeController } from "../controllers/employee.controller";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── GET /api/leave — List all leave requests ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { status, employeeId } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    const leaves = await prisma.leaveRecord.findMany({
      where,
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(successResponse(leaves));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message || "Failed to fetch leave records"));
  }
});

// ── POST /api/leave — Submit leave request ──
router.post("/", EmployeeController.submitLeave);

// ── GET /api/leave/pending — Pending approvals ──
router.get("/pending", EmployeeController.getPendingLeaves);

// ── GET /api/leave/calendar — Team calendar ──
router.get("/calendar", EmployeeController.getTeamCalendar);

// ── GET /api/leave/balance/:employeeId — Leave balance ──
router.get("/balance/:employeeId", EmployeeController.getLeaveBalance);

// ── PATCH /api/leave/:id/approve — Approve leave ──
router.patch("/:id/approve", EmployeeController.approveLeave);

// ── PATCH /api/leave/:id/reject — Reject leave ──
router.patch("/:id/reject", EmployeeController.rejectLeave);

// ── PATCH /api/leave/:id/cancel — Cancel leave ──
router.patch("/:id/cancel", EmployeeController.cancelLeave);

export { router as leaveRouter };
