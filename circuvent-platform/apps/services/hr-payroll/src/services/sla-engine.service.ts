// ──────────────────────────────────────────────────────────────
// HR Payroll — SLA Engine Service
// Ticket SLA management: deadline calculation, breach detection,
// escalation, compliance reporting, risk identification.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type SLAStatusLevel = "GREEN" | "AMBER" | "RED";

interface SLARule {
  priority: Priority;
  responseTimeHours: number;
  resolutionTimeHours: number;
  escalationThresholdPercent: number;
}

interface Ticket {
  id: string;
  subject: string;
  priority: Priority;
  category: string;
  status: string;
  createdAt: string;
  resolvedAt?: string | null;
  assigneeId?: string | null;
  escalationLevel: number;
}

interface SLADeadline {
  responseDeadline: Date;
  resolutionDeadline: Date;
  priority: Priority;
  ruleApplied: SLARule;
}

interface SLAStatus {
  level: SLAStatusLevel;
  remainingMinutes: number;
  percentElapsed: number;
  breached: boolean;
  message: string;
}

interface SLAComplianceReport {
  period: { start: string; end: string };
  totalTickets: number;
  resolvedWithinSLA: number;
  breachedSLA: number;
  complianceRate: number;
  byPriority: Record<Priority, { total: number; compliant: number; rate: number }>;
  byCategory: Record<string, { total: number; compliant: number; rate: number }>;
  avgResolutionTimeHours: number;
}

interface ResolutionTimeStat {
  priority: Priority;
  category: string;
  avgHours: number;
  minHours: number;
  maxHours: number;
  count: number;
}

// ══════════════════════════════════════════════════════════════
// SLA Rules — CRITICAL=4h, HIGH=8h, MEDIUM=24h, LOW=72h
// ══════════════════════════════════════════════════════════════

const SLA_RULES: Record<Priority, SLARule> = {
  CRITICAL: {
    priority: "CRITICAL",
    responseTimeHours: 0.5,
    resolutionTimeHours: 4,
    escalationThresholdPercent: 75,
  },
  HIGH: {
    priority: "HIGH",
    responseTimeHours: 1,
    resolutionTimeHours: 8,
    escalationThresholdPercent: 80,
  },
  MEDIUM: {
    priority: "MEDIUM",
    responseTimeHours: 4,
    resolutionTimeHours: 24,
    escalationThresholdPercent: 85,
  },
  LOW: {
    priority: "LOW",
    responseTimeHours: 8,
    resolutionTimeHours: 72,
    escalationThresholdPercent: 90,
  },
};

// Category overrides (multipliers for resolution time)
const CATEGORY_MULTIPLIERS: Record<string, number> = {
  IT_HARDWARE: 1.5,
  IT_SOFTWARE: 1.0,
  IT_NETWORK: 1.2,
  HR_GENERAL: 1.0,
  HR_PAYROLL: 0.8,
  FACILITIES: 1.3,
  SECURITY: 0.7,
};

// ══════════════════════════════════════════════════════════════
// SLAEngineService
// ══════════════════════════════════════════════════════════════

export class SLAEngineService {
  // ── Calculate Deadline ────────────────────────────────────

  calculateSLADeadline(priority: Priority, category: string): SLADeadline {
    const rule = SLA_RULES[priority] ?? SLA_RULES.MEDIUM;
    const multiplier = CATEGORY_MULTIPLIERS[category] ?? 1.0;

    const now = new Date();
    const responseMs = rule.responseTimeHours * 60 * 60 * 1000;
    const resolutionMs = rule.resolutionTimeHours * multiplier * 60 * 60 * 1000;

    return {
      responseDeadline: new Date(now.getTime() + responseMs),
      resolutionDeadline: new Date(now.getTime() + resolutionMs),
      priority,
      ruleApplied: rule,
    };
  }

  // ── Check Breach ──────────────────────────────────────────

  checkSLABreach(ticket: Ticket): boolean {
    const rule = SLA_RULES[ticket.priority] ?? SLA_RULES.MEDIUM;
    const multiplier = CATEGORY_MULTIPLIERS[ticket.category] ?? 1.0;
    const resolutionMs = rule.resolutionTimeHours * multiplier * 60 * 60 * 1000;

    const createdAt = new Date(ticket.createdAt).getTime();
    const deadline = createdAt + resolutionMs;

    if (ticket.resolvedAt) {
      return new Date(ticket.resolvedAt).getTime() > deadline;
    }

    return Date.now() > deadline;
  }

  // ── Get SLA Status ────────────────────────────────────────

  getSLAStatus(ticket: Ticket): SLAStatus {
    const rule = SLA_RULES[ticket.priority] ?? SLA_RULES.MEDIUM;
    const multiplier = CATEGORY_MULTIPLIERS[ticket.category] ?? 1.0;
    const resolutionMs = rule.resolutionTimeHours * multiplier * 60 * 60 * 1000;

    const createdAt = new Date(ticket.createdAt).getTime();
    const deadline = createdAt + resolutionMs;
    const now = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : Date.now();
    const elapsed = now - createdAt;
    const remaining = deadline - now;
    const percentElapsed = (elapsed / resolutionMs) * 100;
    const remainingMinutes = Math.floor(remaining / (60 * 1000));

    const breached = remaining < 0;
    let level: SLAStatusLevel;
    let message: string;

    if (breached) {
      level = "RED";
      message = `SLA breached by ${Math.abs(remainingMinutes)} minutes`;
    } else if (percentElapsed >= rule.escalationThresholdPercent) {
      level = "AMBER";
      message = `At risk — ${remainingMinutes} minutes remaining (${Math.round(percentElapsed)}% elapsed)`;
    } else {
      level = "GREEN";
      message = `On track — ${remainingMinutes} minutes remaining`;
    }

    return {
      level,
      remainingMinutes,
      percentElapsed: Math.round(percentElapsed * 100) / 100,
      breached,
      message,
    };
  }

  // ── Time to Resolution ────────────────────────────────────

  getTimeToResolution(ticket: Ticket): { hours: number; minutes: number; withinSLA: boolean } | null {
    if (!ticket.resolvedAt) return null;

    const createdMs = new Date(ticket.createdAt).getTime();
    const resolvedMs = new Date(ticket.resolvedAt).getTime();
    const durationMs = resolvedMs - createdMs;
    const hours = Math.floor(durationMs / (60 * 60 * 1000));
    const minutes = Math.floor((durationMs % (60 * 60 * 1000)) / (60 * 1000));

    const rule = SLA_RULES[ticket.priority] ?? SLA_RULES.MEDIUM;
    const multiplier = CATEGORY_MULTIPLIERS[ticket.category] ?? 1.0;
    const maxMs = rule.resolutionTimeHours * multiplier * 60 * 60 * 1000;

    return { hours, minutes, withinSLA: durationMs <= maxMs };
  }

  // ── SLA Compliance Rate ───────────────────────────────────

  async getSLAComplianceRate(
    startDate: string,
    endDate: string,
  ): Promise<{ total: number; compliant: number; rate: number }> {
    const tickets = await this.getTicketsInPeriod(startDate, endDate);
    const resolved = tickets.filter((t) => t.resolvedAt);

    let compliant = 0;
    for (const ticket of resolved) {
      if (!this.checkSLABreach(ticket)) compliant++;
    }

    const rate = resolved.length > 0 ? (compliant / resolved.length) * 100 : 100;
    return { total: resolved.length, compliant, rate: Math.round(rate * 100) / 100 };
  }

  // ── Average Resolution Time ───────────────────────────────

  async getAverageResolutionTime(
    startDate: string,
    endDate: string,
  ): Promise<ResolutionTimeStat[]> {
    const tickets = await this.getTicketsInPeriod(startDate, endDate);
    const resolved = tickets.filter((t) => t.resolvedAt);

    const groups = new Map<string, { durations: number[]; priority: Priority; category: string }>();

    for (const ticket of resolved) {
      const key = `${ticket.priority}|${ticket.category}`;
      if (!groups.has(key)) {
        groups.set(key, { durations: [], priority: ticket.priority, category: ticket.category });
      }
      const createdMs = new Date(ticket.createdAt).getTime();
      const resolvedMs = new Date(ticket.resolvedAt!).getTime();
      groups.get(key)!.durations.push((resolvedMs - createdMs) / (60 * 60 * 1000));
    }

    const stats: ResolutionTimeStat[] = [];
    for (const [, group] of groups) {
      const sorted = group.durations.sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      stats.push({
        priority: group.priority,
        category: group.category,
        avgHours: Math.round((sum / sorted.length) * 100) / 100,
        minHours: Math.round(sorted[0] * 100) / 100,
        maxHours: Math.round(sorted[sorted.length - 1] * 100) / 100,
        count: sorted.length,
      });
    }

    return stats;
  }

  // ── At-Risk Tickets ───────────────────────────────────────

  async identifyAtRiskTickets(thresholdMinutes: number): Promise<Ticket[]> {
    const openTickets = await this.getOpenTickets();
    const atRisk: Ticket[] = [];

    for (const ticket of openTickets) {
      const status = this.getSLAStatus(ticket);
      if (!status.breached && status.remainingMinutes <= thresholdMinutes) {
        atRisk.push(ticket);
      }
    }

    return atRisk.sort((a, b) => {
      const sa = this.getSLAStatus(a);
      const sb = this.getSLAStatus(b);
      return sa.remainingMinutes - sb.remainingMinutes;
    });
  }

  // ── Auto-Escalate Breached ────────────────────────────────

  async autoEscalateBreachedTickets(): Promise<{ escalated: string[]; total: number }> {
    const openTickets = await this.getOpenTickets();
    const escalated: string[] = [];

    for (const ticket of openTickets) {
      if (!this.checkSLABreach(ticket)) continue;

      const doc = await prisma.generatedDocument.findFirst({
        where: { id: ticket.id },
      });
      if (!doc?.data) continue;

      const data = doc.data as Record<string, any>;
      const currentLevel = data.escalationLevel ?? 0;
      const newLevel = Math.min(currentLevel + 1, 3);

      data.escalationLevel = newLevel;
      data.lastEscalatedAt = new Date().toISOString();
      data.escalationHistory = [
        ...(data.escalationHistory ?? []),
        {
          level: newLevel,
          reason: "SLA breach auto-escalation",
          escalatedAt: new Date().toISOString(),
        },
      ];

      // Upgrade priority for severe escalations
      if (newLevel >= 2 && data.priority !== "CRITICAL") {
        const priorities: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
        const currentIdx = priorities.indexOf(data.priority);
        if (currentIdx < priorities.length - 1) {
          data.priority = priorities[currentIdx + 1];
        }
      }

      await prisma.generatedDocument.update({
        where: { id: ticket.id },
        data: { data },
      });

      escalated.push(ticket.id);
    }

    return { escalated, total: escalated.length };
  }

  // ── SLA Report ────────────────────────────────────────────

  async generateSLAReport(startDate: string, endDate: string): Promise<SLAComplianceReport> {
    const tickets = await this.getTicketsInPeriod(startDate, endDate);

    const byPriority: Record<string, { total: number; compliant: number }> = {};
    const byCategory: Record<string, { total: number; compliant: number }> = {};
    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const ticket of tickets) {
      // By priority
      if (!byPriority[ticket.priority]) byPriority[ticket.priority] = { total: 0, compliant: 0 };
      byPriority[ticket.priority].total++;

      // By category
      if (!byCategory[ticket.category]) byCategory[ticket.category] = { total: 0, compliant: 0 };
      byCategory[ticket.category].total++;

      if (ticket.resolvedAt) {
        resolvedCount++;
        const resMs = new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime();
        totalResolutionMs += resMs;

        if (!this.checkSLABreach(ticket)) {
          byPriority[ticket.priority].compliant++;
          byCategory[ticket.category].compliant++;
        }
      }
    }

    const buildGroup = (data: Record<string, { total: number; compliant: number }>) => {
      const result: Record<string, { total: number; compliant: number; rate: number }> = {};
      for (const [key, val] of Object.entries(data)) {
        const rate = val.total > 0 ? (val.compliant / val.total) * 100 : 100;
        result[key] = { ...val, rate: Math.round(rate * 100) / 100 };
      }
      return result;
    };

    const resolvedWithinSLA = Object.values(byPriority).reduce((s, v) => s + v.compliant, 0);
    const complianceRate = resolvedCount > 0 ? (resolvedWithinSLA / resolvedCount) * 100 : 100;
    const avgResolutionMs = resolvedCount > 0 ? totalResolutionMs / resolvedCount : 0;

    return {
      period: { start: startDate, end: endDate },
      totalTickets: tickets.length,
      resolvedWithinSLA,
      breachedSLA: resolvedCount - resolvedWithinSLA,
      complianceRate: Math.round(complianceRate * 100) / 100,
      byPriority: buildGroup(byPriority) as any,
      byCategory: buildGroup(byCategory),
      avgResolutionTimeHours: Math.round((avgResolutionMs / (60 * 60 * 1000)) * 100) / 100,
    };
  }

  // ── Helpers: Fetch tickets from GeneratedDocument ─────────

  private async getTicketsInPeriod(startDate: string, endDate: string): Promise<Ticket[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        category: "HELPDESK_TICKET",
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });
    return docs.map((d) => this.docToTicket(d));
  }

  private async getOpenTickets(): Promise<Ticket[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: {
        category: "HELPDESK_TICKET",
      },
    });

    return docs
      .map((d) => this.docToTicket(d))
      .filter((t) => t.status !== "RESOLVED" && t.status !== "CLOSED");
  }

  private docToTicket(doc: any): Ticket {
    const data = (doc.data ?? {}) as Record<string, any>;
    return {
      id: doc.id,
      subject: data.subject ?? doc.name ?? "",
      priority: data.priority ?? "MEDIUM",
      category: data.category ?? "IT_SOFTWARE",
      status: data.status ?? "OPEN",
      createdAt: doc.createdAt.toISOString(),
      resolvedAt: data.resolvedAt ?? null,
      assigneeId: data.assigneeId ?? null,
      escalationLevel: data.escalationLevel ?? 0,
    };
  }
}

export const slaEngineService = new SLAEngineService();
