// ──────────────────────────────────────────────────────────────
// Employee Portal — Company Directory & Org-Chart Routes
// Search employees, department views, birthday/anniversary lists
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@circuvent/database";
import { successResponse, errorResponse } from "@circuvent/shared";

const router = Router();

// ── GET / — Full directory (searchable) ──
router.get("/", async (req: Request, res: Response) => {
  try {
    const { search, department, designation, page = "1", limit = "50" } = req.query;
    const where: any = { dateOfLeaving: null };
    if (department) where.department = department;
    if (designation) where.designation = { contains: designation as string, mode: "insensitive" };
    if (search) {
      where.OR = [
        { user: { firstName: { contains: search as string, mode: "insensitive" } } },
        { user: { lastName: { contains: search as string, mode: "insensitive" } } },
        { user: { email: { contains: search as string, mode: "insensitive" } } },
        { employeeCode: { contains: search as string, mode: "insensitive" } },
        { designation: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, department: true } },
        },
        orderBy: [{ department: "asc" }, { user: { firstName: "asc" } }],
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.employee.count({ where }),
    ]);

    const mapped = employees.map(e => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: `${e.user.firstName} ${e.user.lastName}`,
      email: e.user.email,
      phone: e.user.phone,
      avatar: e.user.avatarUrl,
      department: e.department,
      designation: e.designation,
      dateOfJoining: e.dateOfJoining,
    }));

    res.json(successResponse(mapped, undefined, { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) }));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /departments — List unique departments with headcounts ──
router.get("/departments", async (_req: Request, res: Response) => {
  try {
    const departments = await prisma.employee.groupBy({
      by: ["department"],
      _count: true,
      where: { dateOfLeaving: null },
      orderBy: { department: "asc" },
    });
    res.json(successResponse(departments.map(d => ({ name: d.department, count: d._count }))));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /birthdays — Upcoming birthdays (this month) ──
router.get("/birthdays", async (_req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true, department: true, avatarUrl: true } } },
      orderBy: { dateOfJoining: "asc" },
    });
    // Use dateOfJoining as proxy for birthday list (in production, would have DOB field)
    const today = new Date();
    const thisMonth = today.getMonth();
    const upcoming = employees.filter(e => {
      const doj = new Date(e.dateOfJoining);
      return doj.getMonth() === thisMonth;
    }).map(e => ({
      id: e.id,
      name: `${e.user.firstName} ${e.user.lastName}`,
      department: e.department,
      avatar: e.user.avatarUrl,
      date: e.dateOfJoining,
    }));
    res.json(successResponse(upcoming));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /anniversaries — Work anniversaries this month ──
router.get("/anniversaries", async (_req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true, department: true, avatarUrl: true } } },
    });
    const today = new Date();
    const thisMonth = today.getMonth();
    const anniversaries = employees.filter(e => {
      const doj = new Date(e.dateOfJoining);
      return doj.getMonth() === thisMonth && doj.getFullYear() < today.getFullYear();
    }).map(e => {
      const years = today.getFullYear() - new Date(e.dateOfJoining).getFullYear();
      return {
        id: e.id,
        name: `${e.user.firstName} ${e.user.lastName}`,
        department: e.department,
        avatar: e.user.avatarUrl,
        dateOfJoining: e.dateOfJoining,
        years,
      };
    }).sort((a, b) => b.years - a.years);
    res.json(successResponse(anniversaries));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

// ── GET /org-chart — Org chart data (by department) ──
router.get("/org-chart", async (_req: Request, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      where: { dateOfLeaving: null },
      include: { user: { select: { firstName: true, lastName: true, avatarUrl: true, role: true } } },
      orderBy: [{ department: "asc" }, { designation: "asc" }],
    });
    const departments: Record<string, any[]> = {};
    employees.forEach(e => {
      if (!departments[e.department]) departments[e.department] = [];
      departments[e.department].push({
        id: e.id, employeeCode: e.employeeCode,
        name: `${e.user.firstName} ${e.user.lastName}`,
        designation: e.designation, avatar: e.user.avatarUrl,
        role: e.user.role,
      });
    });
    res.json(successResponse(departments));
  } catch (error: any) {
    res.status(500).json(errorResponse(error.message));
  }
});

export { router as directoryRouter };
