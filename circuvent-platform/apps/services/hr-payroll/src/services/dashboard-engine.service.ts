// ──────────────────────────────────────────────────────────────
// HR Payroll — Dashboard Engine Service
// Role-specific dashboards (CEO/HR/Manager/Dev/Marketing/Admin),
// org health score computation, action items aggregation.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

type DashboardRole = "CEO" | "HR_MANAGER" | "MANAGER" | "DEVELOPER" | "MARKETING" | "ADMIN";

interface DashboardWidget {
  id: string;
  title: string;
  type: "STAT" | "CHART" | "TABLE" | "LIST" | "PROGRESS" | "MAP" | "CALENDAR" | "ALERT";
  size: "SM" | "MD" | "LG" | "XL";
  data: unknown;
  refreshInterval?: number;
  color?: string;
}

interface ActionItem {
  id: string;
  type: "APPROVAL" | "REVIEW" | "DEADLINE" | "ALERT" | "REMINDER" | "TASK";
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  dueDate: string | null;
  sourceModule: string;
  sourceId: string;
  assignedTo: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
  createdAt: string;
}

interface OrgHealthScore {
  overall: number;
  dimensions: OrgHealthDimension[];
  trend: "IMPROVING" | "STABLE" | "DECLINING";
  calculatedAt: string;
}

interface OrgHealthDimension {
  name: string;
  score: number;
  weight: number;
  indicators: Array<{ name: string; value: number; target: number; status: "GOOD" | "WARNING" | "CRITICAL" }>;
}

interface RoleDashboard {
  role: DashboardRole;
  userId: string;
  widgets: DashboardWidget[];
  actionItems: ActionItem[];
  orgHealth: OrgHealthScore;
  lastRefreshed: string;
}

interface HeadcountSummary {
  total: number;
  active: number;
  onLeave: number;
  newHires: number;
  exits: number;
  byDepartment: Array<{ department: string; count: number }>;
  byRole: Array<{ role: string; count: number }>;
  genderRatio: { male: number; female: number; other: number };
  avgTenureMonths: number;
}

interface FinanceSummary {
  totalPayroll: number;
  avgSalary: number;
  totalExpenses: number;
  pendingReimbursements: number;
  budgetUtilization: number;
  revenueThisMonth: number;
  profitMargin: number;
  outstandingInvoices: number;
  cashFlow: number;
}

interface ProjectSummary {
  totalProjects: number;
  activeProjects: number;
  completedThisMonth: number;
  overdue: number;
  totalTasks: number;
  completedTasks: number;
  avgVelocity: number;
  sprintCompletion: number;
}

interface TicketSummary {
  open: number;
  inProgress: number;
  resolved: number;
  escalated: number;
  avgResolutionHours: number;
  slaCompliance: number;
  customerSatisfaction: number;
}

// ══════════════════════════════════════════════════════════════
// DashboardEngineService
// ══════════════════════════════════════════════════════════════

export class DashboardEngineService {
  private actionItems: ActionItem[] = [];

  constructor() {
    this.seedActionItems();
  }

  // ── Role-Specific Dashboard ───────────────────────────────

  getDashboard(role: DashboardRole, userId: string): RoleDashboard {
    const widgets = this.getWidgetsForRole(role, userId);
    const actionItems = this.getActionItemsForUser(userId, role);
    const orgHealth = this.calculateOrgHealth();

    return {
      role,
      userId,
      widgets,
      actionItems,
      orgHealth,
      lastRefreshed: new Date().toISOString(),
    };
  }

  // ── CEO Dashboard ────────────────────────────────────────

  private getCEOWidgets(): DashboardWidget[] {
    const headcount = this.getHeadcountSummary();
    const finance = this.getFinanceSummary();
    const projects = this.getProjectSummary();

    return [
      { id: "ceo-headcount", title: "Headcount Overview", type: "STAT", size: "MD", data: headcount, color: "blue" },
      { id: "ceo-revenue", title: "Revenue & Profit", type: "CHART", size: "LG", data: { revenue: finance.revenueThisMonth, profit: finance.profitMargin, cashFlow: finance.cashFlow } },
      { id: "ceo-projects", title: "Project Portfolio", type: "PROGRESS", size: "MD", data: { active: projects.activeProjects, completed: projects.completedThisMonth, overdue: projects.overdue, completion: projects.sprintCompletion } },
      { id: "ceo-attrition", title: "Attrition Rate", type: "STAT", size: "SM", data: { rate: 4.2, trend: -0.5, benchmark: 5.0 }, color: "green" },
      { id: "ceo-client-sat", title: "Client Satisfaction", type: "STAT", size: "SM", data: { score: 4.6, responses: 145, nps: 72 }, color: "emerald" },
      { id: "ceo-dept-perf", title: "Department Performance", type: "CHART", size: "LG", data: this.getDepartmentPerformance() },
      { id: "ceo-kpi", title: "Strategic KPIs", type: "TABLE", size: "XL", data: this.getStrategicKPIs() },
      { id: "ceo-alerts", title: "Critical Alerts", type: "ALERT", size: "MD", data: this.getCriticalAlerts() },
    ];
  }

  // ── HR Manager Dashboard ──────────────────────────────────

  private getHRWidgets(): DashboardWidget[] {
    const headcount = this.getHeadcountSummary();
    const ticketSummary = this.getTicketSummary();

    return [
      { id: "hr-headcount", title: "Employee Headcount", type: "STAT", size: "MD", data: headcount, color: "blue" },
      { id: "hr-attendance", title: "Today's Attendance", type: "PROGRESS", size: "MD", data: { present: 142, absent: 8, wfh: 25, onLeave: 12, total: 187 } },
      { id: "hr-leaves", title: "Leave Requests", type: "LIST", size: "MD", data: { pending: 8, approved: 23, rejected: 3 }, color: "amber" },
      { id: "hr-payroll", title: "Payroll Status", type: "STAT", size: "SM", data: { processed: true, month: "March 2026", totalAmount: 12500000, employees: 187 }, color: "green" },
      { id: "hr-recruitment", title: "Open Positions", type: "TABLE", size: "LG", data: this.getRecruitmentData() },
      { id: "hr-tickets", title: "ICM Tickets", type: "STAT", size: "MD", data: ticketSummary },
      { id: "hr-onboarding", title: "Onboarding Pipeline", type: "LIST", size: "MD", data: { upcoming: 5, inProgress: 3, completed: 12 } },
      { id: "hr-compliance", title: "Compliance Status", type: "ALERT", size: "SM", data: this.getComplianceAlerts() },
      { id: "hr-birthdays", title: "Upcoming Birthdays", type: "CALENDAR", size: "SM", data: this.getUpcomingBirthdays() },
      { id: "hr-training", title: "Training Programs", type: "PROGRESS", size: "MD", data: { active: 4, completed: 12, enrolled: 89 } },
    ];
  }

  // ── Manager Dashboard ─────────────────────────────────────

  private getManagerWidgets(userId: string): DashboardWidget[] {
    return [
      { id: "mgr-team", title: "My Team", type: "STAT", size: "MD", data: { total: 12, present: 10, onLeave: 2, wfh: 3 }, color: "blue" },
      { id: "mgr-tasks", title: "Team Tasks", type: "PROGRESS", size: "LG", data: { total: 45, completed: 32, inProgress: 8, blocked: 5, completion: 71 } },
      { id: "mgr-leaves", title: "Pending Leave Approvals", type: "LIST", size: "MD", data: this.getPendingApprovals(userId, "leaves") },
      { id: "mgr-expenses", title: "Pending Expense Approvals", type: "LIST", size: "MD", data: this.getPendingApprovals(userId, "expenses") },
      { id: "mgr-sprint", title: "Sprint Progress", type: "CHART", size: "LG", data: { velocity: 42, planned: 50, completed: 42, burndown: [50, 45, 38, 32, 25, 18, 10, 8] } },
      { id: "mgr-performance", title: "Team Performance", type: "TABLE", size: "LG", data: this.getTeamPerformance(userId) },
      { id: "mgr-timesheets", title: "Timesheet Compliance", type: "PROGRESS", size: "SM", data: { submitted: 10, pending: 2, compliance: 83 } },
      { id: "mgr-goals", title: "Team Goals", type: "PROGRESS", size: "MD", data: { total: 15, onTrack: 11, atRisk: 3, behind: 1 } },
    ];
  }

  // ── Developer Dashboard ───────────────────────────────────

  private getDevWidgets(userId: string): DashboardWidget[] {
    return [
      { id: "dev-tasks", title: "My Tasks", type: "LIST", size: "LG", data: this.getUserTasks(userId), color: "purple" },
      { id: "dev-sprint", title: "Current Sprint", type: "PROGRESS", size: "MD", data: { name: "Sprint 14", daysLeft: 5, myTasks: 6, completed: 4, points: 13, totalPoints: 21 } },
      { id: "dev-prs", title: "Pull Requests", type: "LIST", size: "MD", data: { open: 2, reviewing: 1, merged: 5, comments: 3 } },
      { id: "dev-pipeline", title: "CI/CD Pipeline", type: "STAT", size: "SM", data: { lastBuild: "SUCCEEDED", duration: "3m 42s", coverage: 87.5 }, color: "green" },
      { id: "dev-timesheet", title: "This Week", type: "CHART", size: "MD", data: { logged: 32.5, expected: 40, breakdown: { coding: 20, review: 5, meetings: 4.5, other: 3 } } },
      { id: "dev-leaves", title: "Leave Balance", type: "STAT", size: "SM", data: { casual: 8, earned: 12, sick: 5, compOff: 2 }, color: "cyan" },
      { id: "dev-goals", title: "My Goals", type: "PROGRESS", size: "MD", data: { total: 5, completed: 2, inProgress: 2, notStarted: 1, progress: 55 } },
      { id: "dev-recognition", title: "Recent Recognition", type: "LIST", size: "SM", data: this.getUserRecognitions(userId) },
    ];
  }

  // ── Marketing Dashboard ───────────────────────────────────

  private getMarketingWidgets(): DashboardWidget[] {
    return [
      { id: "mkt-campaigns", title: "Active Campaigns", type: "TABLE", size: "LG", data: { total: 5, running: 3, scheduled: 2, completed: 12 } },
      { id: "mkt-leads", title: "Lead Pipeline", type: "CHART", size: "LG", data: { new: 45, qualified: 28, proposal: 15, negotiation: 8, closed: 12, conversionRate: 26.7 } },
      { id: "mkt-social", title: "Social Media", type: "STAT", size: "MD", data: { followers: 15200, engagement: 4.8, posts: 23, reach: 52000 }, color: "pink" },
      { id: "mkt-content", title: "Content Calendar", type: "CALENDAR", size: "MD", data: { upcoming: 8, published: 15, inReview: 3 } },
      { id: "mkt-budget", title: "Marketing Budget", type: "PROGRESS", size: "SM", data: { total: 500000, spent: 325000, remaining: 175000, utilization: 65 } },
      { id: "mkt-events", title: "Upcoming Events", type: "LIST", size: "MD", data: this.getUpcomingEvents() },
    ];
  }

  // ── Admin Dashboard ───────────────────────────────────────

  private getAdminWidgets(): DashboardWidget[] {
    return [
      { id: "adm-users", title: "System Users", type: "STAT", size: "MD", data: { total: 195, active: 187, inactive: 5, suspended: 3 }, color: "blue" },
      { id: "adm-audit", title: "Audit Activity", type: "CHART", size: "LG", data: { today: 234, thisWeek: 1456, topActions: [{ action: "LOGIN", count: 89 }, { action: "UPDATE", count: 67 }, { action: "CREATE", count: 45 }] } },
      { id: "adm-system", title: "System Health", type: "STAT", size: "MD", data: { uptime: 99.97, cpu: 42, memory: 68, disk: 55, services: { healthy: 7, degraded: 0, down: 0 } }, color: "green" },
      { id: "adm-api", title: "API Performance", type: "CHART", size: "LG", data: { avgLatency: 45, p95: 120, p99: 250, requestsPerMin: 340, errorRate: 0.2 } },
      { id: "adm-backups", title: "Backup Status", type: "STAT", size: "SM", data: { lastBackup: new Date(Date.now() - 3600000).toISOString(), size: "2.3 GB", status: "COMPLETED" }, color: "green" },
      { id: "adm-security", title: "Security Events", type: "ALERT", size: "MD", data: { failedLogins: 12, suspiciousIPs: 2, lastScan: new Date(Date.now() - 7200000).toISOString() } },
      { id: "adm-integrations", title: "Integration Status", type: "TABLE", size: "LG", data: this.getIntegrationStatus() },
      { id: "adm-jobs", title: "Scheduled Jobs", type: "LIST", size: "MD", data: this.getScheduledJobs() },
    ];
  }

  // ── Widget Router ─────────────────────────────────────────

  private getWidgetsForRole(role: DashboardRole, userId: string): DashboardWidget[] {
    switch (role) {
      case "CEO": return this.getCEOWidgets();
      case "HR_MANAGER": return this.getHRWidgets();
      case "MANAGER": return this.getManagerWidgets(userId);
      case "DEVELOPER": return this.getDevWidgets(userId);
      case "MARKETING": return this.getMarketingWidgets();
      case "ADMIN": return this.getAdminWidgets();
      default: return this.getDevWidgets(userId);
    }
  }

  // ── Org Health Score ──────────────────────────────────────

  calculateOrgHealth(): OrgHealthScore {
    const dimensions: OrgHealthDimension[] = [
      {
        name: "People & Culture",
        score: 82,
        weight: 0.25,
        indicators: [
          { name: "Employee Satisfaction", value: 4.3, target: 4.5, status: "WARNING" },
          { name: "Attrition Rate", value: 4.2, target: 5.0, status: "GOOD" },
          { name: "Engagement Score", value: 78, target: 80, status: "WARNING" },
          { name: "Training Completion", value: 85, target: 90, status: "WARNING" },
          { name: "eNPS", value: 52, target: 50, status: "GOOD" },
        ],
      },
      {
        name: "Financial Health",
        score: 88,
        weight: 0.25,
        indicators: [
          { name: "Revenue Growth", value: 15, target: 12, status: "GOOD" },
          { name: "Profit Margin", value: 22, target: 20, status: "GOOD" },
          { name: "Cash Flow", value: 95, target: 90, status: "GOOD" },
          { name: "Budget Compliance", value: 92, target: 95, status: "WARNING" },
        ],
      },
      {
        name: "Operational Excellence",
        score: 79,
        weight: 0.25,
        indicators: [
          { name: "Sprint Completion", value: 84, target: 90, status: "WARNING" },
          { name: "SLA Compliance", value: 91, target: 95, status: "WARNING" },
          { name: "Deployment Frequency", value: 3.2, target: 5, status: "WARNING" },
          { name: "System Uptime", value: 99.97, target: 99.9, status: "GOOD" },
        ],
      },
      {
        name: "Customer Success",
        score: 85,
        weight: 0.25,
        indicators: [
          { name: "Client Satisfaction", value: 4.6, target: 4.5, status: "GOOD" },
          { name: "NPS", value: 72, target: 70, status: "GOOD" },
          { name: "Ticket Resolution Time", value: 4.2, target: 4.0, status: "WARNING" },
          { name: "Client Retention", value: 96, target: 95, status: "GOOD" },
        ],
      },
    ];

    const overall = Math.round(
      dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
    );

    return {
      overall,
      dimensions,
      trend: overall >= 85 ? "IMPROVING" : overall >= 75 ? "STABLE" : "DECLINING",
      calculatedAt: new Date().toISOString(),
    };
  }

  // ── Action Items ──────────────────────────────────────────

  getActionItemsForUser(userId: string, role: DashboardRole): ActionItem[] {
    let items = this.actionItems.filter((a) => a.assignedTo === userId || a.assignedTo === role);
    // Add role-based generic items
    if (role === "HR_MANAGER") {
      items.push(
        { id: "ai-hr-1", type: "APPROVAL", title: "8 pending leave requests", description: "Review and approve/reject leave requests", priority: "HIGH", dueDate: new Date().toISOString(), sourceModule: "LEAVE", sourceId: "", assignedTo: role, status: "PENDING", createdAt: new Date().toISOString() },
        { id: "ai-hr-2", type: "REMINDER", title: "Payroll processing due", description: "March 2026 payroll needs to be processed by 25th", priority: "HIGH", dueDate: new Date(Date.now() + 14 * 86400000).toISOString(), sourceModule: "PAYROLL", sourceId: "", assignedTo: role, status: "PENDING", createdAt: new Date().toISOString() },
      );
    }
    if (role === "MANAGER") {
      items.push(
        { id: "ai-mgr-1", type: "REVIEW", title: "3 timesheets pending review", description: "Review team timesheets for this week", priority: "MEDIUM", dueDate: new Date(Date.now() + 2 * 86400000).toISOString(), sourceModule: "TIMESHEET", sourceId: "", assignedTo: role, status: "PENDING", createdAt: new Date().toISOString() },
        { id: "ai-mgr-2", type: "DEADLINE", title: "Sprint 14 ends in 5 days", description: "Ensure all sprint tasks are on track", priority: "HIGH", dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), sourceModule: "SPRINT", sourceId: "", assignedTo: role, status: "IN_PROGRESS", createdAt: new Date().toISOString() },
      );
    }
    return items.sort((a, b) => {
      const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  addActionItem(item: ActionItem): void {
    this.actionItems.push(item);
  }

  completeActionItem(id: string): boolean {
    const item = this.actionItems.find((a) => a.id === id);
    if (!item) return false;
    item.status = "COMPLETED";
    return true;
  }

  // ── Data Helpers ──────────────────────────────────────────

  private getHeadcountSummary(): HeadcountSummary {
    return {
      total: 195, active: 187, onLeave: 12, newHires: 8, exits: 2,
      byDepartment: [
        { department: "Engineering", count: 72 }, { department: "HR", count: 18 },
        { department: "Finance", count: 15 }, { department: "Marketing", count: 12 },
        { department: "Operations", count: 25 }, { department: "Sales", count: 20 },
        { department: "QA", count: 18 }, { department: "Design", count: 10 },
        { department: "Management", count: 5 },
      ],
      byRole: [
        { role: "Engineer", count: 72 }, { role: "Manager", count: 15 },
        { role: "Analyst", count: 25 }, { role: "Executive", count: 20 },
        { role: "Intern", count: 8 }, { role: "Other", count: 55 },
      ],
      genderRatio: { male: 112, female: 78, other: 5 },
      avgTenureMonths: 28,
    };
  }

  private getFinanceSummary(): FinanceSummary {
    return {
      totalPayroll: 12500000, avgSalary: 66845, totalExpenses: 3200000,
      pendingReimbursements: 245000, budgetUtilization: 72, revenueThisMonth: 25000000,
      profitMargin: 22, outstandingInvoices: 4500000, cashFlow: 8500000,
    };
  }

  private getProjectSummary(): ProjectSummary {
    return {
      totalProjects: 24, activeProjects: 15, completedThisMonth: 3,
      overdue: 2, totalTasks: 342, completedTasks: 245, avgVelocity: 42, sprintCompletion: 84,
    };
  }

  private getTicketSummary(): TicketSummary {
    return { open: 23, inProgress: 15, resolved: 145, escalated: 3, avgResolutionHours: 4.2, slaCompliance: 91, customerSatisfaction: 4.3 };
  }

  private getDepartmentPerformance(): Array<{ department: string; score: number; trend: string }> {
    return [
      { department: "Engineering", score: 88, trend: "up" },
      { department: "HR", score: 82, trend: "stable" },
      { department: "Finance", score: 90, trend: "up" },
      { department: "Marketing", score: 78, trend: "down" },
      { department: "Operations", score: 85, trend: "up" },
    ];
  }

  private getStrategicKPIs(): Array<{ kpi: string; current: number; target: number; status: string }> {
    return [
      { kpi: "Revenue Growth (%)", current: 15, target: 12, status: "GOOD" },
      { kpi: "Employee NPS", current: 52, target: 50, status: "GOOD" },
      { kpi: "Client Retention (%)", current: 96, target: 95, status: "GOOD" },
      { kpi: "Sprint Velocity", current: 42, target: 50, status: "WARNING" },
      { kpi: "System Uptime (%)", current: 99.97, target: 99.9, status: "GOOD" },
      { kpi: "Attrition Rate (%)", current: 4.2, target: 5, status: "GOOD" },
    ];
  }

  private getCriticalAlerts(): Array<{ message: string; severity: string; timestamp: string }> {
    return [
      { message: "2 projects overdue by >1 week", severity: "WARNING", timestamp: new Date().toISOString() },
      { message: "Payroll processing due in 14 days", severity: "INFO", timestamp: new Date().toISOString() },
    ];
  }

  private getRecruitmentData(): Array<{ position: string; department: string; applications: number; stage: string }> {
    return [
      { position: "Senior DevOps Engineer", department: "Engineering", applications: 45, stage: "Interviews" },
      { position: "Product Manager", department: "Product", applications: 32, stage: "Screening" },
      { position: "UI/UX Designer", department: "Design", applications: 28, stage: "Shortlisted" },
    ];
  }

  private getComplianceAlerts(): Array<{ item: string; status: string; dueDate: string }> {
    return [
      { item: "PF Filing — March 2026", status: "UPCOMING", dueDate: new Date(Date.now() + 20 * 86400000).toISOString() },
      { item: "ESI Filing — Q4 FY26", status: "UPCOMING", dueDate: new Date(Date.now() + 30 * 86400000).toISOString() },
    ];
  }

  private getUpcomingBirthdays(): Array<{ name: string; date: string; department: string }> {
    return [
      { name: "Ravi Kumar", date: new Date(Date.now() + 86400000).toISOString(), department: "Engineering" },
      { name: "Priya Sharma", date: new Date(Date.now() + 3 * 86400000).toISOString(), department: "HR" },
      { name: "Amit Patel", date: new Date(Date.now() + 5 * 86400000).toISOString(), department: "Finance" },
    ];
  }

  private getPendingApprovals(_userId: string, type: string): Array<{ id: string; employee: string; detail: string; submittedAt: string }> {
    if (type === "leaves") {
      return [
        { id: "LA-001", employee: "Sneha Reddy", detail: "Casual Leave: Mar 15–16", submittedAt: new Date(Date.now() - 86400000).toISOString() },
        { id: "LA-002", employee: "Karthik Nair", detail: "Earned Leave: Mar 20–25", submittedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      ];
    }
    return [
      { id: "EX-001", employee: "Amit Patel", detail: "Travel: ₹15,000", submittedAt: new Date(Date.now() - 86400000).toISOString() },
    ];
  }

  private getTeamPerformance(_userId: string): Array<{ name: string; tasksCompleted: number; velocity: number; rating: number }> {
    return [
      { name: "Alice Johnson", tasksCompleted: 12, velocity: 21, rating: 4.5 },
      { name: "Bob Smith", tasksCompleted: 10, velocity: 18, rating: 4.2 },
      { name: "Charlie Brown", tasksCompleted: 8, velocity: 15, rating: 3.9 },
    ];
  }

  private getUserTasks(_userId: string): Array<{ id: string; title: string; status: string; priority: string; sprint: string }> {
    return [
      { id: "TASK-101", title: "Implement DevFlow pipeline UI", status: "IN_PROGRESS", priority: "HIGH", sprint: "Sprint 14" },
      { id: "TASK-102", title: "Fix WebSocket reconnection", status: "TODO", priority: "MEDIUM", sprint: "Sprint 14" },
      { id: "TASK-103", title: "Write integration tests for API", status: "IN_REVIEW", priority: "HIGH", sprint: "Sprint 14" },
      { id: "TASK-104", title: "Update documentation", status: "TODO", priority: "LOW", sprint: "Sprint 14" },
    ];
  }

  private getUserRecognitions(_userId: string): Array<{ from: string; badge: string; message: string; date: string }> {
    return [
      { from: "Manager", badge: "Star Performer", message: "Great work on the CI/CD pipeline!", date: new Date(Date.now() - 3 * 86400000).toISOString() },
      { from: "Peer", badge: "Team Player", message: "Thanks for helping with the deployment", date: new Date(Date.now() - 7 * 86400000).toISOString() },
    ];
  }

  private getUpcomingEvents(): Array<{ name: string; date: string; type: string }> {
    return [
      { name: "Product Launch Webinar", date: new Date(Date.now() + 7 * 86400000).toISOString(), type: "WEBINAR" },
      { name: "Tech Conference 2026", date: new Date(Date.now() + 30 * 86400000).toISOString(), type: "CONFERENCE" },
    ];
  }

  private getIntegrationStatus(): Array<{ name: string; status: string; lastSync: string }> {
    return [
      { name: "Slack", status: "CONNECTED", lastSync: new Date(Date.now() - 300000).toISOString() },
      { name: "GitHub", status: "CONNECTED", lastSync: new Date(Date.now() - 600000).toISOString() },
      { name: "Jira", status: "CONNECTED", lastSync: new Date(Date.now() - 900000).toISOString() },
      { name: "Google Workspace", status: "CONNECTED", lastSync: new Date(Date.now() - 1200000).toISOString() },
    ];
  }

  private getScheduledJobs(): Array<{ name: string; schedule: string; lastRun: string; status: string }> {
    return [
      { name: "Daily Backup", schedule: "0 2 * * *", lastRun: new Date(Date.now() - 8 * 3600000).toISOString(), status: "SUCCESS" },
      { name: "Attendance Sync", schedule: "*/30 * * * *", lastRun: new Date(Date.now() - 1800000).toISOString(), status: "SUCCESS" },
      { name: "Report Generation", schedule: "0 6 * * 1", lastRun: new Date(Date.now() - 2 * 86400000).toISOString(), status: "SUCCESS" },
    ];
  }

  private seedActionItems(): void {
    this.actionItems = [
      { id: "ai-001", type: "APPROVAL", title: "Approve expense claim ₹12,500", description: "Travel expense from Ravi Kumar", priority: "MEDIUM", dueDate: new Date(Date.now() + 86400000).toISOString(), sourceModule: "EXPENSE", sourceId: "EXP-045", assignedTo: "MANAGER", status: "PENDING", createdAt: new Date().toISOString() },
      { id: "ai-002", type: "DEADLINE", title: "Q4 Performance reviews due", description: "Complete performance reviews for your team", priority: "HIGH", dueDate: new Date(Date.now() + 7 * 86400000).toISOString(), sourceModule: "PERFORMANCE", sourceId: "", assignedTo: "MANAGER", status: "IN_PROGRESS", createdAt: new Date().toISOString() },
      { id: "ai-003", type: "TASK", title: "Complete sprint retrospective", description: "Sprint 13 retrospective document", priority: "LOW", dueDate: new Date(Date.now() + 2 * 86400000).toISOString(), sourceModule: "SPRINT", sourceId: "SPR-013", assignedTo: "DEVELOPER", status: "PENDING", createdAt: new Date().toISOString() },
      { id: "ai-004", type: "ALERT", title: "3 SLA breaches detected", description: "Tickets TKT-234, TKT-237, TKT-241 breached SLA", priority: "HIGH", dueDate: null, sourceModule: "ICM", sourceId: "", assignedTo: "ADMIN", status: "PENDING", createdAt: new Date().toISOString() },
    ];
  }
}
