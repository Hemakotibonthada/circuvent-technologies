// ──────────────────────────────────────────────────────────────
// HR Payroll — Ticket Automation Service
// Auto-assign, auto-escalate, categorize, predict resolution,
// agent performance metrics, daily report generation.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

type TicketPriority = "P0" | "P1" | "P2" | "P3" | "P4";
type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_ON_CUSTOMER" | "ESCALATED" | "RESOLVED" | "CLOSED" | "REOPENED";
type TicketCategory = "IT_SUPPORT" | "HR_QUERY" | "PAYROLL" | "FACILITIES" | "SECURITY" | "ONBOARDING" | "LEAVE" | "PERFORMANCE" | "GENERAL";

interface Ticket {
  id: string;
  code: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  reporterId: string;
  reporterName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  departmentId: string | null;
  tags: string[];
  slaDeadline: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  escalatedAt: string | null;
  responseTimeMinutes: number | null;
  resolutionTimeMinutes: number | null;
  customerSatisfaction: number | null;
  history: TicketHistoryEntry[];
}

interface TicketHistoryEntry {
  action: string;
  performedBy: string;
  timestamp: string;
  details: string;
}

interface Agent {
  id: string;
  name: string;
  department: string;
  activeTickets: number;
  maxCapacity: number;
  skills: TicketCategory[];
  avgResolutionMinutes: number;
  satisfaction: number;
  isAvailable: boolean;
  shiftStart: string;
  shiftEnd: string;
}

interface AutoAssignResult {
  ticketId: string;
  assignedTo: string;
  assignedToName: string;
  reason: string;
  confidence: number;
}

interface EscalationResult {
  ticketId: string;
  escalatedTo: string;
  escalatedToName: string;
  reason: string;
  previousAssignee: string | null;
  level: number;
}

interface CategorizationResult {
  ticketId: string;
  suggestedCategory: TicketCategory;
  confidence: number;
  suggestedPriority: TicketPriority;
  keywords: string[];
}

interface ResolutionPrediction {
  ticketId: string;
  estimatedMinutes: number;
  confidence: number;
  similarTickets: number;
  suggestedResolution: string;
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsEscalated: number;
  avgResponseMinutes: number;
  avgResolutionMinutes: number;
  slaComplianceRate: number;
  customerSatisfaction: number;
  reopenRate: number;
  firstContactResolutionRate: number;
  utilizationRate: number;
}

interface DailyReport {
  date: string;
  totalTickets: number;
  newTickets: number;
  resolvedTickets: number;
  escalatedTickets: number;
  reopenedTickets: number;
  avgResponseMinutes: number;
  avgResolutionMinutes: number;
  slaComplianceRate: number;
  byCategory: Array<{ category: TicketCategory; count: number; avgResolution: number }>;
  byPriority: Array<{ priority: TicketPriority; count: number; slaCompliance: number }>;
  topAgents: Array<{ agentId: string; name: string; resolved: number; satisfaction: number }>;
  backlog: number;
  trendVsPreviousDay: { newChange: number; resolvedChange: number; backlogChange: number };
}

interface AutoAssignConfig {
  strategy: "ROUND_ROBIN" | "LEAST_LOADED" | "SKILL_BASED" | "HYBRID";
  maxActiveTickets: number;
  considerShift: boolean;
  priorityWeights: Record<TicketPriority, number>;
}

// ══════════════════════════════════════════════════════════════
// Category Keywords
// ══════════════════════════════════════════════════════════════

const CATEGORY_KEYWORDS: Record<TicketCategory, string[]> = {
  IT_SUPPORT: ["laptop", "computer", "vpn", "wifi", "software", "install", "access", "login", "password", "reset", "network", "printer", "monitor", "email setup"],
  HR_QUERY: ["policy", "handbook", "benefits", "insurance", "holiday", "working hours", "remote", "wfh", "contract", "probation"],
  PAYROLL: ["salary", "payslip", "tax", "deduction", "reimbursement", "bonus", "arrears", "pf", "esi", "tds", "ctc", "increment"],
  FACILITIES: ["desk", "chair", "parking", "cafeteria", "ac", "lighting", "maintenance", "cleaning", "elevator", "restroom"],
  SECURITY: ["badge", "id card", "access card", "cctv", "visitor", "lost", "stolen", "breach", "suspicious", "fire"],
  ONBOARDING: ["new joiner", "welcome kit", "orientation", "buddy", "induction", "first day", "equipment", "setup"],
  LEAVE: ["leave", "vacation", "sick", "casual", "earned", "maternity", "paternity", "comp off", "wfh", "absence"],
  PERFORMANCE: ["review", "appraisal", "kpi", "goal", "feedback", "promotion", "rating", "pip", "improvement"],
  GENERAL: ["inquiry", "question", "help", "information", "other", "misc"],
};

// ══════════════════════════════════════════════════════════════
// Priority Keywords & SLA
// ══════════════════════════════════════════════════════════════

const PRIORITY_KEYWORDS: Record<TicketPriority, string[]> = {
  P0: ["critical", "down", "outage", "emergency", "urgent", "production", "blocker", "security breach"],
  P1: ["high", "important", "asap", "blocking", "cannot work", "broken"],
  P2: ["medium", "normal", "issue", "bug", "problem", "error"],
  P3: ["low", "minor", "nice to have", "improvement", "enhancement"],
  P4: ["informational", "suggestion", "feedback", "cosmetic"],
};

const SLA_MINUTES: Record<TicketPriority, { response: number; resolution: number }> = {
  P0: { response: 15, resolution: 120 },
  P1: { response: 60, resolution: 480 },
  P2: { response: 240, resolution: 1440 },
  P3: { response: 480, resolution: 4320 },
  P4: { response: 1440, resolution: 10080 },
};

// ══════════════════════════════════════════════════════════════
// TicketAutomationService
// ══════════════════════════════════════════════════════════════

export class TicketAutomationService {
  private tickets: Ticket[] = [];
  private agents: Agent[] = [];
  private roundRobinIndex = 0;
  private config: AutoAssignConfig = {
    strategy: "HYBRID",
    maxActiveTickets: 15,
    considerShift: true,
    priorityWeights: { P0: 5, P1: 4, P2: 3, P3: 2, P4: 1 },
  };

  constructor() {
    this.seedAgents();
  }

  // ── Auto-Assign ───────────────────────────────────────────

  autoAssign(ticket: Ticket): AutoAssignResult {
    const availableAgents = this.agents.filter(
      (a) => a.isAvailable && a.activeTickets < a.maxCapacity,
    );

    if (availableAgents.length === 0) {
      return { ticketId: ticket.id, assignedTo: "", assignedToName: "Unassigned (queue)", reason: "No agents available", confidence: 0 };
    }

    let selectedAgent: Agent;
    let reason: string;
    let confidence: number;

    switch (this.config.strategy) {
      case "ROUND_ROBIN": {
        selectedAgent = availableAgents[this.roundRobinIndex % availableAgents.length];
        this.roundRobinIndex++;
        reason = "Round-robin assignment";
        confidence = 0.7;
        break;
      }
      case "LEAST_LOADED": {
        selectedAgent = availableAgents.sort((a, b) => a.activeTickets - b.activeTickets)[0];
        reason = `Least loaded (${selectedAgent.activeTickets} active tickets)`;
        confidence = 0.8;
        break;
      }
      case "SKILL_BASED": {
        const skilled = availableAgents.filter((a) => a.skills.includes(ticket.category));
        if (skilled.length > 0) {
          selectedAgent = skilled.sort((a, b) => a.avgResolutionMinutes - b.avgResolutionMinutes)[0];
          reason = `Skill match for ${ticket.category}`;
          confidence = 0.9;
        } else {
          selectedAgent = availableAgents.sort((a, b) => a.activeTickets - b.activeTickets)[0];
          reason = "No skill match; fallback to least loaded";
          confidence = 0.5;
        }
        break;
      }
      case "HYBRID":
      default: {
        const scored = availableAgents.map((agent) => {
          let score = 0;
          if (agent.skills.includes(ticket.category)) score += 40;
          score += Math.max(0, 30 - agent.activeTickets * 5);
          score += agent.satisfaction * 10;
          score += Math.max(0, 20 - agent.avgResolutionMinutes / 60);
          return { agent, score };
        }).sort((a, b) => b.score - a.score);

        selectedAgent = scored[0].agent;
        reason = `Hybrid scoring (score: ${scored[0].score.toFixed(1)})`;
        confidence = Math.min(0.95, scored[0].score / 100);
        break;
      }
    }

    selectedAgent.activeTickets++;
    ticket.assigneeId = selectedAgent.id;
    ticket.assigneeName = selectedAgent.name;
    ticket.status = "IN_PROGRESS";
    ticket.history.push({
      action: "AUTO_ASSIGNED",
      performedBy: "system",
      timestamp: new Date().toISOString(),
      details: `Auto-assigned to ${selectedAgent.name}. Reason: ${reason}`,
    });

    return {
      ticketId: ticket.id,
      assignedTo: selectedAgent.id,
      assignedToName: selectedAgent.name,
      reason,
      confidence,
    };
  }

  // ── Auto-Escalate ─────────────────────────────────────────

  autoEscalate(ticket: Ticket): EscalationResult | null {
    const createdAt = new Date(ticket.createdAt).getTime();
    const now = Date.now();
    const elapsedMinutes = (now - createdAt) / 60_000;
    const sla = SLA_MINUTES[ticket.priority];

    if (elapsedMinutes < sla.resolution * 0.8) return null;
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return null;

    const escalationManagers = this.agents.filter(
      (a) => a.department === "MANAGEMENT" || a.skills.length >= 5,
    );

    const escalateTo = escalationManagers[0] ?? this.agents.find((a) => a.id !== ticket.assigneeId) ?? this.agents[0];

    const level = ticket.history.filter((h) => h.action === "ESCALATED").length + 1;

    ticket.status = "ESCALATED";
    ticket.escalatedAt = new Date().toISOString();
    ticket.history.push({
      action: "ESCALATED",
      performedBy: "system",
      timestamp: new Date().toISOString(),
      details: `Auto-escalated to ${escalateTo.name}. SLA ${Math.round((elapsedMinutes / sla.resolution) * 100)}% elapsed. Level ${level}.`,
    });

    return {
      ticketId: ticket.id,
      escalatedTo: escalateTo.id,
      escalatedToName: escalateTo.name,
      reason: `SLA breach risk: ${Math.round(elapsedMinutes)}/${sla.resolution} minutes elapsed`,
      previousAssignee: ticket.assigneeId,
      level,
    };
  }

  // ── Categorize ────────────────────────────────────────────

  categorize(subject: string, description: string): CategorizationResult {
    const text = `${subject} ${description}`.toLowerCase();
    const scores: Array<{ category: TicketCategory; score: number; keywords: string[] }> = [];

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matchedKeywords = keywords.filter((kw) => text.includes(kw));
      scores.push({
        category: category as TicketCategory,
        score: matchedKeywords.length,
        keywords: matchedKeywords,
      });
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    let suggestedPriority: TicketPriority = "P3";
    for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        suggestedPriority = priority as TicketPriority;
        break;
      }
    }

    return {
      ticketId: "",
      suggestedCategory: best.score > 0 ? best.category : "GENERAL",
      confidence: best.score > 0 ? Math.min(0.95, best.score * 0.25) : 0.3,
      suggestedPriority,
      keywords: best.keywords,
    };
  }

  // ── Predict Resolution ────────────────────────────────────

  predictResolution(ticket: Ticket): ResolutionPrediction {
    const similar = this.tickets.filter(
      (t) =>
        t.category === ticket.category &&
        t.priority === ticket.priority &&
        t.status === "RESOLVED" &&
        t.resolutionTimeMinutes != null,
    );

    if (similar.length === 0) {
      return {
        ticketId: ticket.id,
        estimatedMinutes: SLA_MINUTES[ticket.priority].resolution * 0.6,
        confidence: 0.3,
        similarTickets: 0,
        suggestedResolution: "No similar resolved tickets found.",
      };
    }

    const avgResolution = similar.reduce((sum, t) => sum + (t.resolutionTimeMinutes ?? 0), 0) / similar.length;
    const suggestions = similar
      .filter((t) => t.history.some((h) => h.action === "RESOLVED"))
      .map((t) => t.history.find((h) => h.action === "RESOLVED")?.details ?? "")
      .filter(Boolean);

    return {
      ticketId: ticket.id,
      estimatedMinutes: Math.round(avgResolution),
      confidence: Math.min(0.9, similar.length * 0.15),
      similarTickets: similar.length,
      suggestedResolution: suggestions[0] ?? `Based on ${similar.length} similar tickets, average resolution is ${Math.round(avgResolution)} minutes.`,
    };
  }

  // ── Agent Metrics ─────────────────────────────────────────

  getAgentMetrics(agentId: string): AgentMetrics | null {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) return null;

    const agentTickets = this.tickets.filter((t) => t.assigneeId === agentId);
    const resolved = agentTickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");
    const escalated = agentTickets.filter((t) => t.history.some((h) => h.action === "ESCALATED"));
    const reopened = agentTickets.filter((t) => t.status === "REOPENED");

    const responseTimes = agentTickets
      .filter((t) => t.responseTimeMinutes != null)
      .map((t) => t.responseTimeMinutes!);
    const resolutionTimes = resolved
      .filter((t) => t.resolutionTimeMinutes != null)
      .map((t) => t.resolutionTimeMinutes!);

    const slaCompliant = resolved.filter((t) => {
      const sla = SLA_MINUTES[t.priority];
      return (t.resolutionTimeMinutes ?? Infinity) <= sla.resolution;
    });

    const satisfactionRatings = agentTickets
      .filter((t) => t.customerSatisfaction != null)
      .map((t) => t.customerSatisfaction!);

    return {
      agentId,
      agentName: agent.name,
      ticketsAssigned: agentTickets.length,
      ticketsResolved: resolved.length,
      ticketsEscalated: escalated.length,
      avgResponseMinutes: responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0,
      avgResolutionMinutes: resolutionTimes.length > 0 ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) : 0,
      slaComplianceRate: resolved.length > 0 ? Math.round((slaCompliant.length / resolved.length) * 100) : 100,
      customerSatisfaction: satisfactionRatings.length > 0 ? parseFloat((satisfactionRatings.reduce((a, b) => a + b, 0) / satisfactionRatings.length).toFixed(1)) : 0,
      reopenRate: agentTickets.length > 0 ? Math.round((reopened.length / agentTickets.length) * 100) : 0,
      firstContactResolutionRate: resolved.length > 0 ? Math.round((resolved.filter((t) => !t.history.some((h) => h.action === "ESCALATED" || h.action === "REASSIGNED")).length / resolved.length) * 100) : 0,
      utilizationRate: Math.round((agent.activeTickets / agent.maxCapacity) * 100),
    };
  }

  // ── All Agents Metrics ────────────────────────────────────

  getAllAgentMetrics(): AgentMetrics[] {
    return this.agents.map((a) => this.getAgentMetrics(a.id)!).filter(Boolean);
  }

  // ── Daily Report ──────────────────────────────────────────

  generateDailyReport(date?: string): DailyReport {
    const targetDate = date ?? new Date().toISOString().split("T")[0];
    const dayStart = new Date(`${targetDate}T00:00:00Z`).getTime();
    const dayEnd = dayStart + 86_400_000;

    const todayTickets = this.tickets.filter((t) => {
      const created = new Date(t.createdAt).getTime();
      return created >= dayStart && created < dayEnd;
    });

    const resolvedToday = this.tickets.filter((t) => {
      if (!t.resolvedAt) return false;
      const resolved = new Date(t.resolvedAt).getTime();
      return resolved >= dayStart && resolved < dayEnd;
    });

    const escalatedToday = this.tickets.filter((t) => {
      if (!t.escalatedAt) return false;
      const escalated = new Date(t.escalatedAt).getTime();
      return escalated >= dayStart && escalated < dayEnd;
    });

    const reopenedToday = this.tickets.filter((t) =>
      t.history.some((h) => h.action === "REOPENED" && new Date(h.timestamp).getTime() >= dayStart && new Date(h.timestamp).getTime() < dayEnd),
    );

    const responseTimesToday = todayTickets.filter((t) => t.responseTimeMinutes != null).map((t) => t.responseTimeMinutes!);
    const resolutionTimesToday = resolvedToday.filter((t) => t.resolutionTimeMinutes != null).map((t) => t.resolutionTimeMinutes!);

    const slaCompliantToday = resolvedToday.filter((t) => {
      const sla = SLA_MINUTES[t.priority];
      return (t.resolutionTimeMinutes ?? Infinity) <= sla.resolution;
    });

    const byCategory: DailyReport["byCategory"] = (Object.keys(CATEGORY_KEYWORDS) as TicketCategory[]).map((cat) => {
      const catTickets = todayTickets.filter((t) => t.category === cat);
      const catResolved = catTickets.filter((t) => t.resolutionTimeMinutes != null);
      return {
        category: cat,
        count: catTickets.length,
        avgResolution: catResolved.length > 0 ? Math.round(catResolved.reduce((s, t) => s + (t.resolutionTimeMinutes ?? 0), 0) / catResolved.length) : 0,
      };
    }).filter((c) => c.count > 0);

    const byPriority: DailyReport["byPriority"] = (["P0", "P1", "P2", "P3", "P4"] as TicketPriority[]).map((p) => {
      const pTickets = todayTickets.filter((t) => t.priority === p);
      const pResolved = pTickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED");
      const pSla = pResolved.filter((t) => (t.resolutionTimeMinutes ?? Infinity) <= SLA_MINUTES[p].resolution);
      return {
        priority: p,
        count: pTickets.length,
        slaCompliance: pResolved.length > 0 ? Math.round((pSla.length / pResolved.length) * 100) : 100,
      };
    }).filter((p) => p.count > 0);

    const agentResolvedCounts = new Map<string, { name: string; resolved: number; satisfaction: number[] }>();
    for (const t of resolvedToday) {
      if (!t.assigneeId) continue;
      const entry = agentResolvedCounts.get(t.assigneeId) ?? { name: t.assigneeName ?? "", resolved: 0, satisfaction: [] };
      entry.resolved++;
      if (t.customerSatisfaction != null) entry.satisfaction.push(t.customerSatisfaction);
      agentResolvedCounts.set(t.assigneeId, entry);
    }

    const topAgents = Array.from(agentResolvedCounts.entries())
      .map(([agentId, data]) => ({
        agentId,
        name: data.name,
        resolved: data.resolved,
        satisfaction: data.satisfaction.length > 0 ? parseFloat((data.satisfaction.reduce((a, b) => a + b, 0) / data.satisfaction.length).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.resolved - a.resolved)
      .slice(0, 5);

    const backlog = this.tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS" || t.status === "ESCALATED").length;

    return {
      date: targetDate,
      totalTickets: this.tickets.length,
      newTickets: todayTickets.length,
      resolvedTickets: resolvedToday.length,
      escalatedTickets: escalatedToday.length,
      reopenedTickets: reopenedToday.length,
      avgResponseMinutes: responseTimesToday.length > 0 ? Math.round(responseTimesToday.reduce((a, b) => a + b, 0) / responseTimesToday.length) : 0,
      avgResolutionMinutes: resolutionTimesToday.length > 0 ? Math.round(resolutionTimesToday.reduce((a, b) => a + b, 0) / resolutionTimesToday.length) : 0,
      slaComplianceRate: resolvedToday.length > 0 ? Math.round((slaCompliantToday.length / resolvedToday.length) * 100) : 100,
      byCategory,
      byPriority,
      topAgents,
      backlog,
      trendVsPreviousDay: { newChange: 0, resolvedChange: 0, backlogChange: 0 },
    };
  }

  // ── Helpers ───────────────────────────────────────────────

  addTicket(ticket: Ticket): void {
    this.tickets.push(ticket);
  }

  getTickets(): Ticket[] {
    return [...this.tickets];
  }

  getAgents(): Agent[] {
    return [...this.agents];
  }

  setConfig(config: Partial<AutoAssignConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private seedAgents(): void {
    this.agents = [
      { id: "AGT-001", name: "Ravi Kumar", department: "IT", activeTickets: 3, maxCapacity: 15, skills: ["IT_SUPPORT", "SECURITY"], avgResolutionMinutes: 120, satisfaction: 4.5, isAvailable: true, shiftStart: "09:00", shiftEnd: "18:00" },
      { id: "AGT-002", name: "Priya Sharma", department: "HR", activeTickets: 5, maxCapacity: 12, skills: ["HR_QUERY", "ONBOARDING", "LEAVE", "PERFORMANCE"], avgResolutionMinutes: 90, satisfaction: 4.8, isAvailable: true, shiftStart: "09:00", shiftEnd: "18:00" },
      { id: "AGT-003", name: "Amit Patel", department: "FINANCE", activeTickets: 2, maxCapacity: 10, skills: ["PAYROLL", "GENERAL"], avgResolutionMinutes: 180, satisfaction: 4.2, isAvailable: true, shiftStart: "10:00", shiftEnd: "19:00" },
      { id: "AGT-004", name: "Sneha Reddy", department: "FACILITIES", activeTickets: 7, maxCapacity: 15, skills: ["FACILITIES", "SECURITY", "GENERAL"], avgResolutionMinutes: 60, satisfaction: 4.6, isAvailable: true, shiftStart: "08:00", shiftEnd: "17:00" },
      { id: "AGT-005", name: "Karthik Nair", department: "MANAGEMENT", activeTickets: 1, maxCapacity: 8, skills: ["IT_SUPPORT", "HR_QUERY", "PAYROLL", "FACILITIES", "SECURITY"], avgResolutionMinutes: 45, satisfaction: 4.9, isAvailable: true, shiftStart: "09:00", shiftEnd: "18:00" },
    ];
  }
}
