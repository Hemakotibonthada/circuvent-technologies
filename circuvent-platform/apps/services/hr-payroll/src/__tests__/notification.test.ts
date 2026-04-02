// ──────────────────────────────────────────────────────────────
// HR & Payroll — Notification Service Test Suite
// Tests for send single/bulk/role/department notifications,
// read/unread/mark-all-read, pagination, contextual notifiers
// (leave, expense, payslip, birthday), and cleanup.
// ──────────────────────────────────────────────────────────────

import {
  NotificationService,
  NotificationType,
  NotificationModule,
} from "../services/notification.service";

// ══════════════════════════════════════════════════════════════
// Mock PrismaClient
// ══════════════════════════════════════════════════════════════

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  notification: {
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn(),
  },
  employee: { findMany: jest.fn(), findUnique: jest.fn() },
  leaveRecord: { findUnique: jest.fn() },
  expenseClaim: { findUnique: jest.fn() },
};

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {},
}));

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("NotificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // Send Single Notification
  // ────────────────────────────────────────────────────────────
  describe("sendNotification", () => {
    it("should send a notification to an active user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n1" });

      const result = await NotificationService.sendNotification(
        "u1", "info", "Test Title", "Test message"
      );

      expect(result.success).toBe(true);
      expect(result.id).toBe("n1");
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "u1",
            type: "info",
            title: "Test Title",
            message: "Test message",
          }),
        })
      );
    });

    it("should fail for inactive user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", status: "INACTIVE" });

      const result = await NotificationService.sendNotification(
        "u2", "info", "Title", "Msg"
      );

      expect(result.success).toBe(false);
      expect(result.id).toBe("");
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it("should fail for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await NotificationService.sendNotification(
        "nonexistent", "error", "Title", "Msg"
      );

      expect(result.success).toBe(false);
    });

    it("should pass module and actionUrl when provided", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n2" });

      await NotificationService.sendNotification(
        "u1", "success", "Title", "Msg",
        { module: "hr", actionUrl: "/hr/leaves/123" }
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            module: "hr",
            actionUrl: "/hr/leaves/123",
          }),
        })
      );
    });

    it("should handle database errors gracefully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockRejectedValue(new Error("DB error"));

      const result = await NotificationService.sendNotification(
        "u1", "info", "Title", "Msg"
      );

      expect(result.success).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Send Bulk Notification
  // ────────────────────────────────────────────────────────────
  describe("sendBulkNotification", () => {
    it("should send to multiple active users", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "u1" }, { id: "u2" },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await NotificationService.sendBulkNotification(
        ["u1", "u2", "u3"], "info", "Bulk Title", "Bulk message"
      );

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.failedUserIds).toContain("u3");
    });

    it("should fail all when none are active", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });

      const result = await NotificationService.sendBulkNotification(
        ["u1", "u2"], "info", "Title", "Msg"
      );

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(2);
    });

    it("should handle empty user list", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });

      const result = await NotificationService.sendBulkNotification(
        [], "info", "Title", "Msg"
      );

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should pass module and actionUrl", async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });

      await NotificationService.sendBulkNotification(
        ["u1"], "warning", "Title", "Msg", "hr", "/hr/dashboard"
      );

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ module: "hr", actionUrl: "/hr/dashboard" }),
          ]),
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // Send Role-based Notification
  // ────────────────────────────────────────────────────────────
  describe("sendRoleNotification", () => {
    it("should send to all users with specified role", async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: "mgr1" }, { id: "mgr2" },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await NotificationService.sendRoleNotification(
        "MANAGER", "System Update", "New feature deployed"
      );

      expect(result.sent).toBe(2);
      expect(result.targetedRole).toBe("MANAGER");
    });

    it("should return 0 when no users have the role", async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await NotificationService.sendRoleNotification(
        "CEO", "Title", "Msg"
      );

      expect(result.sent).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Send Department Notification
  // ────────────────────────────────────────────────────────────
  describe("sendDepartmentNotification", () => {
    it("should send to all active employees in department", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { userId: "u1" }, { userId: "u2" }, { userId: "u3" },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const result = await NotificationService.sendDepartmentNotification(
        "Engineering", "Sprint Review", "Sprint review at 3 PM"
      );

      expect(result.sent).toBe(3);
      expect(result.department).toBe("Engineering");
    });

    it("should return 0 when department has no employees", async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await NotificationService.sendDepartmentNotification(
        "EmptyDept", "Title", "Msg"
      );

      expect(result.sent).toBe(0);
      expect(result.department).toBe("EmptyDept");
    });
  });

  // ────────────────────────────────────────────────────────────
  // Read / Unread / Mark-All-Read
  // ────────────────────────────────────────────────────────────
  describe("getUnreadCount", () => {
    it("should return unread count for a user", async () => {
      mockPrisma.notification.count.mockResolvedValue(7);

      const count = await NotificationService.getUnreadCount("u1");

      expect(count).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", isRead: false },
        })
      );
    });
  });

  describe("markAsRead", () => {
    it("should mark a notification as read", async () => {
      mockPrisma.notification.update.mockResolvedValue({});

      const result = await NotificationService.markAsRead("n1");

      expect(result).toBe(true);
      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "n1" },
          data: { isRead: true },
        })
      );
    });

    it("should return false when notification not found", async () => {
      mockPrisma.notification.update.mockRejectedValue(new Error("Not found"));

      const result = await NotificationService.markAsRead("invalid");

      expect(result).toBe(false);
    });
  });

  describe("markAllRead", () => {
    it("should mark all user notifications as read", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 12 });

      const count = await NotificationService.markAllRead("u1");

      expect(count).toBe(12);
      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", isRead: false },
          data: { isRead: true },
        })
      );
    });

    it("should return 0 when all are already read", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      const count = await NotificationService.markAllRead("u1");

      expect(count).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Pagination
  // ────────────────────────────────────────────────────────────
  describe("getUserNotifications", () => {
    it("should return paginated notifications", async () => {
      const mockNotifications = Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`, title: `Notif ${i}`, message: "msg",
        type: "info", module: "hr", isRead: false,
        actionUrl: null, createdAt: new Date(),
      }));
      mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
      mockPrisma.notification.count
        .mockResolvedValueOnce(25) // total
        .mockResolvedValueOnce(10); // unreadCount

      const result = await NotificationService.getUserNotifications("u1", 1, 5);

      expect(result.notifications.length).toBe(5);
      expect(result.total).toBe(25);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(5);
      expect(result.unreadCount).toBe(10);
      expect(result.hasMore).toBe(true);
    });

    it("should clamp page to minimum 1", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await NotificationService.getUserNotifications("u1", -5, 10);

      expect(result.page).toBe(1);
    });

    it("should cap limit at 100", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await NotificationService.getUserNotifications("u1", 1, 500);

      expect(result.limit).toBe(100);
    });

    it("should filter by type when specified", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await NotificationService.getUserNotifications("u1", 1, 20, { type: "error" });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: "error" }),
        })
      );
    });

    it("should filter by unread only", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await NotificationService.getUserNotifications("u1", 1, 20, { unreadOnly: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isRead: false }),
        })
      );
    });

    it("should indicate hasMore=false when on last page", async () => {
      mockPrisma.notification.findMany.mockResolvedValue([{ id: "n1" }]);
      mockPrisma.notification.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      const result = await NotificationService.getUserNotifications("u1", 1, 20);

      expect(result.hasMore).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Delete Notification
  // ────────────────────────────────────────────────────────────
  describe("deleteNotification", () => {
    it("should delete a notification", async () => {
      mockPrisma.notification.delete.mockResolvedValue({});

      const result = await NotificationService.deleteNotification("n1");

      expect(result).toBe(true);
    });

    it("should return false on failure", async () => {
      mockPrisma.notification.delete.mockRejectedValue(new Error("Not found"));

      const result = await NotificationService.deleteNotification("bad-id");

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Contextual Notifiers — Leave
  // ────────────────────────────────────────────────────────────
  describe("notifyLeaveApproval", () => {
    it("should send approval notification", async () => {
      mockPrisma.leaveRecord.findUnique.mockResolvedValue({
        id: "lv-1", leaveType: "CASUAL",
        startDate: new Date("2025-03-10"), endDate: new Date("2025-03-11"),
        totalDays: 2,
        employee: { userId: "u1", employeeCode: "CT-001", user: { firstName: "Alice" } },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n1" });

      const result = await NotificationService.notifyLeaveApproval("lv-1", "APPROVED");

      expect(result).toBe(true);
    });

    it("should send rejection notification with comments", async () => {
      mockPrisma.leaveRecord.findUnique.mockResolvedValue({
        id: "lv-2", leaveType: "SICK",
        startDate: new Date("2025-04-01"), endDate: new Date("2025-04-02"),
        totalDays: 2,
        employee: { userId: "u2", employeeCode: "CT-002", user: { firstName: "Bob" } },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u2", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n2" });

      const result = await NotificationService.notifyLeaveApproval(
        "lv-2", "REJECTED", "Team is short-staffed"
      );

      expect(result).toBe(true);
    });

    it("should return false when leave not found", async () => {
      mockPrisma.leaveRecord.findUnique.mockResolvedValue(null);

      const result = await NotificationService.notifyLeaveApproval("bad", "APPROVED");

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Contextual Notifiers — Expense
  // ────────────────────────────────────────────────────────────
  describe("notifyExpenseApproval", () => {
    it("should send expense approval notification", async () => {
      mockPrisma.expenseClaim.findUnique.mockResolvedValue({
        id: "exp-1", title: "Travel Q1", claimCode: "EXP-001", totalAmount: 15000,
        employee: { userId: "u1", employeeCode: "CT-001", user: { firstName: "Alice" } },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n1" });

      const result = await NotificationService.notifyExpenseApproval("exp-1", "APPROVED");

      expect(result).toBe(true);
    });

    it("should handle reimbursed status", async () => {
      mockPrisma.expenseClaim.findUnique.mockResolvedValue({
        id: "exp-2", title: "Office Supplies", claimCode: "EXP-002", totalAmount: 3000,
        employee: { userId: "u1", employeeCode: "CT-001", user: { firstName: "Alice" } },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n2" });

      const result = await NotificationService.notifyExpenseApproval("exp-2", "REIMBURSED");

      expect(result).toBe(true);
    });

    it("should return false when expense not found", async () => {
      mockPrisma.expenseClaim.findUnique.mockResolvedValue(null);

      const result = await NotificationService.notifyExpenseApproval("bad", "APPROVED");

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Contextual Notifiers — Payslip
  // ────────────────────────────────────────────────────────────
  describe("notifyPayslipGenerated", () => {
    it("should notify when payslip is generated", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        userId: "u1", employeeCode: "CT-001",
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "n1" });

      const result = await NotificationService.notifyPayslipGenerated("e1", 3, 2025);

      expect(result).toBe(true);
    });

    it("should return false when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await NotificationService.notifyPayslipGenerated("bad", 3, 2025);

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Contextual Notifiers — Birthday
  // ────────────────────────────────────────────────────────────
  describe("notifyBirthdayWishes", () => {
    it("should wish employee and notify team", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: "e1", userId: "u1", department: "Engineering",
        user: { id: "u1", firstName: "Alice", lastName: "Dev", department: "Engineering" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "wish" });
      mockPrisma.employee.findMany.mockResolvedValue([
        { userId: "u2" }, { userId: "u3" },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });

      const result = await NotificationService.notifyBirthdayWishes("e1");

      expect(result.wished).toBe(true);
      expect(result.teamNotified).toBe(2);
    });

    it("should return wished=false when employee not found", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const result = await NotificationService.notifyBirthdayWishes("bad");

      expect(result.wished).toBe(false);
      expect(result.teamNotified).toBe(0);
    });

    it("should handle team with no other members", async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: "e1", userId: "u1", department: "Solo",
        user: { id: "u1", firstName: "Solo", lastName: "Dev", department: "Solo" },
      });
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE" });
      mockPrisma.notification.create.mockResolvedValue({ id: "wish" });
      mockPrisma.employee.findMany.mockResolvedValue([]);

      const result = await NotificationService.notifyBirthdayWishes("e1");

      expect(result.wished).toBe(true);
      expect(result.teamNotified).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Notification Stats & Cleanup
  // ────────────────────────────────────────────────────────────
  describe("getNotificationStats", () => {
    it("should aggregate notification statistics", async () => {
      mockPrisma.notification.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(15); // unread
      mockPrisma.notification.groupBy
        .mockResolvedValueOnce([
          { type: "info", _count: { id: 30 } },
          { type: "error", _count: { id: 10 } },
          { type: "success", _count: { id: 10 } },
        ])
        .mockResolvedValueOnce([
          { module: "hr", _count: { id: 40 } },
          { module: "system", _count: { id: 10 } },
        ]);

      const stats = await NotificationService.getNotificationStats("u1");

      expect(stats.total).toBe(50);
      expect(stats.unread).toBe(15);
      expect(stats.read).toBe(35);
      expect(stats.byType.info).toBe(30);
      expect(stats.byModule.hr).toBe(40);
    });
  });

  describe("cleanupOldNotifications", () => {
    it("should delete old read notifications", async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 100 });

      const count = await NotificationService.cleanupOldNotifications(90);

      expect(count).toBe(100);
      expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: true,
          }),
        })
      );
    });

    it("should use default 90 days when not specified", async () => {
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 5 });

      await NotificationService.cleanupOldNotifications();

      expect(mockPrisma.notification.deleteMany).toHaveBeenCalled();
    });
  });
});
