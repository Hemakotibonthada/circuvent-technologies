// ──────────────────────────────────────────────────────────────
// Client Portal — CRM Activity Service
// Manages lead activities (calls, emails, meetings, notes),
// follow-up scheduling, activity timeline, and conversion.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

export interface ActivityInput {
  leadId: string;
  type: "call" | "email" | "meeting" | "note" | "demo" | "proposal" | "followup";
  title: string;
  description?: string;
  scheduledAt?: string;
  duration?: number;
  outcome?: string;
  createdById: string;
}

export class CRMActivityService {
  /**
   * Add activity to a lead.
   */
  static async addActivity(input: ActivityInput): Promise<any> {
    const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new Error("Lead not found");

    const activity = await prisma.leadActivity.create({
      data: {
        leadId: input.leadId,
        type: input.type,
        title: input.title,
        description: input.description,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      },
    });

    // Update lead's updatedAt to reflect activity
    await prisma.lead.update({
      where: { id: input.leadId },
      data: { updatedAt: new Date() },
    });

    await createAuditLog({
      userId: input.createdById,
      action: "CREATE",
      entity: "Lead",
      entityId: input.leadId,
      newValue: { activityType: input.type, title: input.title },
    });

    return activity;
  }

  /**
   * Get activity timeline for a lead.
   */
  static async getTimeline(leadId: string): Promise<any[]> {
    return prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Get all upcoming scheduled activities.
   */
  static async getUpcomingActivities(userId?: string): Promise<any[]> {
    const where: any = {
      scheduledAt: { gte: new Date() },
      completedAt: null,
    };

    const activities = await prisma.leadActivity.findMany({
      where,
      orderBy: { scheduledAt: "asc" },
      take: 50,
      include: {
        lead: {
          select: {
            id: true, title: true, status: true,
            client: { select: { companyName: true } },
            assignedTo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return activities;
  }

  /**
   * Complete an activity.
   */
  static async completeActivity(activityId: string, outcome?: string): Promise<any> {
    return prisma.leadActivity.update({
      where: { id: activityId },
      data: { completedAt: new Date(), description: outcome ? `${outcome}` : undefined },
    });
  }

  /**
   * Get activity analytics for a period.
   */
  static async getActivityAnalytics(startDate: Date, endDate: Date): Promise<{
    totalActivities: number;
    byType: Record<string, number>;
    byDay: { date: string; count: number }[];
    completionRate: number;
    activeLeads: number;
  }> {
    const where = { createdAt: { gte: startDate, lte: endDate } };

    const [total, byType, completed, activeLeads] = await Promise.all([
      prisma.leadActivity.count({ where }),
      prisma.leadActivity.groupBy({ by: ["type"], where, _count: { id: true } }),
      prisma.leadActivity.count({ where: { ...where, completedAt: { not: null } } }),
      prisma.lead.count({
        where: {
          status: { notIn: ["WON", "LOST"] },
          activities: { some: { createdAt: { gte: startDate, lte: endDate } } },
        },
      }),
    ]);

    // Build daily activity counts
    const activities = await prisma.leadActivity.findMany({
      where,
      select: { createdAt: true },
    });

    const dayMap: Record<string, number> = {};
    for (const a of activities) {
      const day = a.createdAt.toISOString().split("T")[0];
      dayMap[day] = (dayMap[day] || 0) + 1;
    }

    return {
      totalActivities: total,
      byType: Object.fromEntries(byType.map((t: any) => [t.type, t._count.id])),
      byDay: Object.entries(dayMap).sort().map(([date, count]) => ({ date, count })),
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      activeLeads,
    };
  }

  /**
   * Schedule a follow-up activity for a lead.
   */
  static async scheduleFollowUp(leadId: string, daysFromNow: number, title: string, createdById: string): Promise<any> {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + daysFromNow);

    return this.addActivity({
      leadId,
      type: "followup",
      title,
      scheduledAt: scheduledAt.toISOString(),
      createdById,
    });
  }

  /**
   * Get overdue activities (scheduled but not completed).
   */
  static async getOverdueActivities(): Promise<any[]> {
    return prisma.leadActivity.findMany({
      where: {
        scheduledAt: { lt: new Date() },
        completedAt: null,
      },
      orderBy: { scheduledAt: "asc" },
      include: {
        lead: {
          select: { title: true, client: { select: { companyName: true } } },
        },
      },
    });
  }

  /**
   * Convert lead to won and create client project link.
   */
  static async convertLead(leadId: string, data: {
    contractValue?: number;
    currency?: string;
    projectId?: string;
    actorId: string;
  }): Promise<any> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { client: true },
    });
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "WON") throw new Error("Lead already converted");

    // Update lead status
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "WON" },
    });

    // Create client-project link if project provided
    if (data.projectId && lead.clientId) {
      await prisma.clientProject.create({
        data: {
          clientId: lead.clientId,
          projectId: data.projectId,
          contractValue: data.contractValue,
          currency: data.currency || "INR",
          startDate: new Date(),
        },
      }).catch(() => {}); // Ignore if already linked
    }

    // Add conversion activity
    await this.addActivity({
      leadId,
      type: "note",
      title: "Lead Converted to Won",
      description: data.contractValue
        ? `Contract value: ${data.currency || "INR"} ${data.contractValue.toLocaleString()}`
        : "Lead marked as won",
      createdById: data.actorId,
    });

    await createAuditLog({
      userId: data.actorId,
      action: "UPDATE",
      entity: "Lead",
      entityId: leadId,
      newValue: { status: "WON", contractValue: data.contractValue },
    });

    return { success: true, leadId, status: "WON" };
  }
}
