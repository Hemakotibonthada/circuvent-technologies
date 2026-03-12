// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Auth Routes (handled at Gateway level)
// Login, Register, Refresh Token, Logout
// ──────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { PrismaClient } from "@circuvent/database";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  authenticate,
} from "@circuvent/auth";
import { createAuditLog } from "@circuvent/audit";
import { HTTP_STATUS, Role } from "@circuvent/shared";

const router = Router();
const prisma = new PrismaClient();

// ── POST /api/auth/register ──
// Public registration ALWAYS creates a CANDIDATE user.
// Only HR/Admin can later promote to employee/other roles.
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Missing required fields: email, password, firstName, lastName",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        error: "User with this email already exists",
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    // SECURITY: All public registrations get CANDIDATE role.
    // Promotion to employee requires HR/Admin action.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        phone: phone || null,
        role: "CANDIDATE",  // ALWAYS CANDIDATE — never trust client-supplied role
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as Role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role as Role,
    });

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "User",
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { user, accessToken, refreshToken },
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("[AUTH] Register error:", error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: "Registration failed",
    });
  }
});

// ── POST /api/auth/login ──
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Email and password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: "Invalid credentials",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: "Account is inactive or suspended",
      });
      return;
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      await createAuditLog({
        userId: user.id,
        action: "LOGIN_FAILED",
        entity: "User",
        entityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: "Invalid credentials",
      });
      return;
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role as Role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role as Role,
    });

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await createAuditLog({
      userId: user.id,
      action: "LOGIN",
      entity: "User",
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("[AUTH] Login error:", error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: "Login failed",
    });
  }
});

// ── POST /api/auth/refresh ──
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Refresh token is required",
      });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);

    // Verify token exists in DB (prevents reuse of revoked tokens)
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: "Invalid or expired refresh token",
      });
      return;
    }

    // Rotate refresh token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = generateAccessToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });

    const newRefreshToken = generateRefreshToken({
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: decoded.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: "Invalid refresh token",
    });
  }
});

// ── POST /api/auth/logout ──
router.post("/logout", authenticate, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    await createAuditLog({
      userId: req.user?.userId,
      action: "LOGOUT",
      entity: "User",
      entityId: req.user?.userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("[AUTH] Logout error:", error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: "Logout failed",
    });
  }
});

// ── GET /api/auth/me ──
router.get("/me", authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        avatarUrl: true,
        phone: true,
        department: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error("[AUTH] Me error:", error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: "Failed to fetch user",
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT — Role changes, promotions, employee creation
// Only accessible by ADMIN, SUPER_ADMIN, HR_MANAGER
// ═══════════════════════════════════════════════════════════════

/** Roles that can manage other users */
const MANAGEMENT_ROLES = ["ADMIN", "SUPER_ADMIN", "HR_MANAGER"];

/** Helper: check if the requesting user has management access */
function isManager(req: Request): boolean {
  const role = (req as any).user?.role;
  return MANAGEMENT_ROLES.includes(role);
}

// ── GET /api/auth/users — List all users (Admin/HR only) ──
router.get("/users", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can view user list" });
      return;
    }

    const { role, status, search, page = "1", limit = "20" } = req.query;
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: "insensitive" } },
        { lastName: { contains: search as string, mode: "insensitive" } },
        { email: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, department: true, phone: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: users,
      meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (error) {
    console.error("[AUTH] List users error:", error);
    res.status(500).json({ success: false, error: "Failed to list users" });
  }
});

// ── PATCH /api/auth/users/:id/role — Change user role (Admin/HR only) ──
router.patch("/users/:id/role", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can change user roles" });
      return;
    }

    const { role } = req.body;
    const validRoles = ["ADMIN", "SUPER_ADMIN", "HR_MANAGER", "MANAGER", "PRODUCT_MANAGER", "ENGINEER", "DEVELOPER", "TESTER", "INTERN", "MARKETING", "CEO", "CLIENT", "CANDIDATE"];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ success: false, error: `Invalid role. Valid: ${validRoles.join(", ")}` });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    await createAuditLog({
      userId: (req as any).user?.userId,
      action: "UPDATE",
      entity: "User",
      entityId: user.id,
      newValue: { role, changedBy: (req as any).user?.email },
    });

    res.json({ success: true, data: user, message: `Role changed to ${role}` });
  } catch (error) {
    console.error("[AUTH] Change role error:", error);
    res.status(500).json({ success: false, error: "Failed to change role" });
  }
});

// ── POST /api/auth/users/:id/promote-to-employee — Convert user to employee (Admin/HR only) ──
// This is the key onboarding step: creates an Employee record linked to the User
router.post("/users/:id/promote-to-employee", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can promote users to employees" });
      return;
    }

    const userId = req.params.id;
    const {
      designation, department, employmentType, baseSalary,
      dateOfJoining, panNumber, aadhaarNumber, role,
    } = req.body;

    if (!designation || !department || !baseSalary) {
      res.status(400).json({ success: false, error: "designation, department, and baseSalary required" });
      return;
    }

    // Check user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ success: false, error: "User not found" }); return; }

    // Check not already an employee
    const existingEmployee = await prisma.employee.findUnique({ where: { userId } });
    if (existingEmployee) {
      res.status(409).json({ success: false, error: `User is already an employee (${existingEmployee.employeeCode})` });
      return;
    }

    // Generate employee code
    const empCount = await prisma.employee.count();
    const employeeCode = `CIR-EMP-${String(empCount + 1).padStart(3, "0")}`;

    // Create employee record
    const employee = await prisma.employee.create({
      data: {
        userId,
        employeeCode,
        designation,
        department,
        employmentType: employmentType || "FULL_TIME",
        baseSalary: Number(baseSalary),
        dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
        panNumber: panNumber || null,
        aadhaarNumber: aadhaarNumber || null,
      },
    });

    // Update user role from CANDIDATE to the specified role (default ENGINEER)
    const newRole = role || "ENGINEER";
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole, department },
    });

    await createAuditLog({
      userId: (req as any).user?.userId,
      action: "CREATE",
      entity: "Employee",
      entityId: employee.id,
      newValue: {
        employeeCode, designation, department, baseSalary,
        promotedBy: (req as any).user?.email,
        previousRole: user.role,
        newRole,
      },
    });

    res.status(201).json({
      success: true,
      data: { employee, user: { id: userId, email: user.email, role: newRole } },
      message: `${user.firstName} ${user.lastName} promoted to employee (${employeeCode}) with role ${newRole}`,
    });
  } catch (error) {
    console.error("[AUTH] Promote to employee error:", error);
    res.status(500).json({ success: false, error: "Failed to create employee" });
  }
});

// ── PATCH /api/auth/users/:id/status — Activate/Suspend/Deactivate (Admin only) ──
router.patch("/users/:id/status", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can change user status" });
      return;
    }

    const { status } = req.body;
    if (!["ACTIVE", "INACTIVE", "SUSPENDED"].includes(status)) {
      res.status(400).json({ success: false, error: "Invalid status. Use: ACTIVE, INACTIVE, SUSPENDED" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
    });

    await createAuditLog({
      userId: (req as any).user?.userId,
      action: "UPDATE",
      entity: "User",
      entityId: user.id,
      newValue: { status, changedBy: (req as any).user?.email },
    });

    res.json({ success: true, data: user, message: `User status changed to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ── GET /api/auth/users/candidates — List all candidates pending onboarding ──
router.get("/users/candidates", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can view candidates" });
      return;
    }

    // Find users with CANDIDATE role who don't have an Employee record yet
    const candidates = await prisma.user.findMany({
      where: {
        role: "CANDIDATE",
        status: "ACTIVE",
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, department: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Check which ones already have employee records
    const employeeUserIds = new Set(
      (await prisma.employee.findMany({ select: { userId: true } })).map(e => e.userId)
    );

    const pendingCandidates = candidates.filter(c => !employeeUserIds.has(c.id));

    res.json({
      success: true,
      data: pendingCandidates,
      meta: { total: pendingCandidates.length },
      message: `${pendingCandidates.length} candidates pending onboarding`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to list candidates" });
  }
});

// ── GET /api/auth/users/stats — User statistics dashboard ──
router.get("/users/stats", authenticate, async (req: Request, res: Response) => {
  try {
    if (!isManager(req)) {
      res.status(403).json({ success: false, error: "Only Admin/HR can view user stats" });
      return;
    }

    const [total, byRole, byStatus, recentRegistrations] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: true }),
      prisma.user.groupBy({ by: ["status"], _count: true }),
      prisma.user.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);

    const employeeCount = await prisma.employee.count();
    const candidateCount = byRole.find(r => r.role === "CANDIDATE")?._count || 0;

    res.json({
      success: true,
      data: {
        totalUsers: total,
        totalEmployees: employeeCount,
        pendingCandidates: candidateCount,
        newRegistrations30d: recentRegistrations,
        byRole: byRole.map(r => ({ role: r.role, count: r._count })),
        byStatus: byStatus.map(s => ({ status: s.status, count: s._count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export { router as authRouter };
