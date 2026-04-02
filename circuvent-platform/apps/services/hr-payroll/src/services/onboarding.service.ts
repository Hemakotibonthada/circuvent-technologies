// ──────────────────────────────────────────────────────────────
// HR & Payroll — Onboarding Service
// Comprehensive employee onboarding automation: checklists,
// mentoring, welcome packages, default benefits/training,
// scheduled check-ins, access requests, and dashboard stats.
// ──────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export interface OnboardingChecklist {
  id: string;
  employeeId: string;
  items: OnboardingChecklistItem[];
  createdAt: Date;
  completionPercent: number;
}

export interface OnboardingChecklistItem {
  id: string;
  title: string;
  description: string;
  category: OnboardingCategory;
  isCompleted: boolean;
  completedAt?: Date;
  dueDate?: Date;
  assignedTo?: string;
  sortOrder: number;
}

export type OnboardingCategory =
  | "DOCUMENTATION"
  | "IT_SETUP"
  | "HR_FORMALITIES"
  | "TEAM_INTEGRATION"
  | "TRAINING"
  | "COMPLIANCE"
  | "FACILITY"
  | "CULTURE";

export interface OnboardingProgress {
  employeeId: string;
  employeeName: string;
  totalItems: number;
  completedItems: number;
  completionPercent: number;
  categories: Array<{
    category: OnboardingCategory;
    total: number;
    completed: number;
    percent: number;
  }>;
  pendingItems: OnboardingChecklistItem[];
  estimatedCompletionDate?: Date;
  mentorName?: string;
  startDate: Date;
  daysInOnboarding: number;
}

export interface WelcomePackage {
  offerLetterGenerated: boolean;
  ndaGenerated: boolean;
  employeeHandbookShared: boolean;
  itPolicyShared: boolean;
  orgChartShared: boolean;
  welcomeEmailSent: boolean;
  documentsCreated: string[];
}

export interface OnboardingDashboard {
  totalInProgress: number;
  totalCompleted: number;
  avgCompletionDays: number;
  avgCompletionPercent: number;
  byDepartment: Array<{ department: string; inProgress: number; completed: number }>;
  recentOnboardings: Array<{
    employeeCode: string;
    name: string;
    department: string;
    startDate: Date;
    completionPercent: number;
    mentorName?: string;
  }>;
  bottlenecks: Array<{ category: string; pendingCount: number }>;
}

// ── Default checklist template ──

const DEFAULT_CHECKLIST_TEMPLATE: Array<{
  title: string;
  description: string;
  category: OnboardingCategory;
  dueDaysFromJoin: number;
  sortOrder: number;
}> = [
  // Documentation
  { title: "Submit identity documents", description: "PAN, Aadhaar, passport, address proof", category: "DOCUMENTATION", dueDaysFromJoin: 1, sortOrder: 1 },
  { title: "Submit education certificates", description: "Degree, mark sheets, relevant certifications", category: "DOCUMENTATION", dueDaysFromJoin: 3, sortOrder: 2 },
  { title: "Submit previous employment documents", description: "Experience letters, relieving letters, last 3 months pay slips", category: "DOCUMENTATION", dueDaysFromJoin: 3, sortOrder: 3 },
  { title: "Sign offer letter", description: "Review and digitally sign the offer letter", category: "DOCUMENTATION", dueDaysFromJoin: 1, sortOrder: 4 },
  { title: "Sign NDA and confidentiality agreement", description: "Non-disclosure agreement for Circuvent Technologies", category: "DOCUMENTATION", dueDaysFromJoin: 1, sortOrder: 5 },
  { title: "Submit bank account details", description: "Account number, IFSC for salary credit", category: "DOCUMENTATION", dueDaysFromJoin: 3, sortOrder: 6 },

  // IT Setup
  { title: "Laptop/workstation allocation", description: "Hardware assigned and configured", category: "IT_SETUP", dueDaysFromJoin: 1, sortOrder: 7 },
  { title: "Email account creation", description: "Company email @circuvent.io set up", category: "IT_SETUP", dueDaysFromJoin: 0, sortOrder: 8 },
  { title: "Slack/Teams workspace access", description: "Added to relevant channels", category: "IT_SETUP", dueDaysFromJoin: 0, sortOrder: 9 },
  { title: "VPN and development environment setup", description: "VPN credentials and dev environment configured", category: "IT_SETUP", dueDaysFromJoin: 1, sortOrder: 10 },
  { title: "GitHub/Git repository access", description: "Access to relevant code repositories", category: "IT_SETUP", dueDaysFromJoin: 2, sortOrder: 11 },
  { title: "JIRA/project management tool access", description: "Added to project boards", category: "IT_SETUP", dueDaysFromJoin: 2, sortOrder: 12 },
  { title: "Badge/access card issuance", description: "Office access card activated", category: "IT_SETUP", dueDaysFromJoin: 1, sortOrder: 13 },

  // HR Formalities
  { title: "Complete PF nomination form", description: "EPF nomination (Form 2)", category: "HR_FORMALITIES", dueDaysFromJoin: 7, sortOrder: 14 },
  { title: "Complete gratuity nomination form", description: "Gratuity nomination (Form F)", category: "HR_FORMALITIES", dueDaysFromJoin: 7, sortOrder: 15 },
  { title: "Tax declaration submission", description: "Submit investment declaration for TDS", category: "HR_FORMALITIES", dueDaysFromJoin: 15, sortOrder: 16 },
  { title: "Emergency contact details", description: "Provide emergency contact information", category: "HR_FORMALITIES", dueDaysFromJoin: 3, sortOrder: 17 },

  // Team Integration
  { title: "Meet with reporting manager", description: "Introduction meeting with direct manager", category: "TEAM_INTEGRATION", dueDaysFromJoin: 1, sortOrder: 18 },
  { title: "Team introduction meeting", description: "Introduction to team members", category: "TEAM_INTEGRATION", dueDaysFromJoin: 2, sortOrder: 19 },
  { title: "Buddy/mentor assignment", description: "Assigned a buddy for first 90 days", category: "TEAM_INTEGRATION", dueDaysFromJoin: 1, sortOrder: 20 },
  { title: "Department walkthrough", description: "Tour of office and introduction to other departments", category: "TEAM_INTEGRATION", dueDaysFromJoin: 3, sortOrder: 21 },

  // Training
  { title: "Company orientation session", description: "Circuvent Technologies overview, mission, values", category: "TRAINING", dueDaysFromJoin: 2, sortOrder: 22 },
  { title: "Product/tech stack overview", description: "Overview of products, tech stack, and architecture", category: "TRAINING", dueDaysFromJoin: 5, sortOrder: 23 },
  { title: "Development process & coding standards", description: "Git workflow, code review process, CI/CD", category: "TRAINING", dueDaysFromJoin: 7, sortOrder: 24 },
  { title: "Security awareness training", description: "Mandatory cybersecurity training module", category: "TRAINING", dueDaysFromJoin: 14, sortOrder: 25 },

  // Compliance
  { title: "POSH training", description: "Prevention of Sexual Harassment at Workplace training", category: "COMPLIANCE", dueDaysFromJoin: 14, sortOrder: 26 },
  { title: "Data protection policy acknowledgement", description: "Read and acknowledge data privacy policies", category: "COMPLIANCE", dueDaysFromJoin: 7, sortOrder: 27 },
  { title: "Code of conduct acknowledgement", description: "Read and sign code of conduct", category: "COMPLIANCE", dueDaysFromJoin: 3, sortOrder: 28 },

  // Facility
  { title: "Parking allocation", description: "Parking spot assigned if applicable", category: "FACILITY", dueDaysFromJoin: 3, sortOrder: 29 },
  { title: "Cafeteria and amenities orientation", description: "Introduction to office amenities", category: "FACILITY", dueDaysFromJoin: 1, sortOrder: 30 },

  // Culture
  { title: "Join company social channels", description: "Join fun, sports, books, etc. channels", category: "CULTURE", dueDaysFromJoin: 7, sortOrder: 31 },
  { title: "First 30-day goal setting", description: "Set initial goals with manager", category: "CULTURE", dueDaysFromJoin: 7, sortOrder: 32 },
];

// ══════════════════════════════════════════════════════════════
// Onboarding Service
// ══════════════════════════════════════════════════════════════

export class OnboardingService {
  /**
   * Create an onboarding checklist for a new employee using the default template.
   */
  static async createOnboardingChecklist(employeeId: string): Promise<OnboardingChecklist> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, dateOfJoining: true, userId: true, employeeCode: true },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Generate checklist items with due dates relative to joining date
    const items: OnboardingChecklistItem[] = DEFAULT_CHECKLIST_TEMPLATE.map((template, index) => {
      const dueDate = new Date(employee.dateOfJoining);
      dueDate.setDate(dueDate.getDate() + template.dueDaysFromJoin);

      return {
        id: `onb-${employee.id}-${index + 1}`,
        title: template.title,
        description: template.description,
        category: template.category,
        isCompleted: false,
        dueDate,
        sortOrder: template.sortOrder,
      };
    });

    // Store checklist as a generated document (using metadata storage)
    await prisma.generatedDocument.create({
      data: {
        name: `Onboarding Checklist — ${employee.employeeCode}`,
        category: "ONBOARDING_CHECKLIST",
        entityType: "Employee",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: { items: JSON.parse(JSON.stringify(items)), status: "IN_PROGRESS", createdAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "OnboardingChecklist",
      entityId: employeeId,
      newValue: { itemCount: items.length, employeeCode: employee.employeeCode },
    });

    return {
      id: `checklist-${employeeId}`,
      employeeId,
      items,
      createdAt: new Date(),
      completionPercent: 0,
    };
  }

  /**
   * Get onboarding progress for an employee.
   */
  static async getOnboardingProgress(employeeId: string): Promise<OnboardingProgress> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Retrieve checklist from stored document
    const doc = await prisma.generatedDocument.findFirst({
      where: { entityType: "Employee", entityId: employeeId, category: "ONBOARDING_CHECKLIST" },
      orderBy: { createdAt: "desc" },
    });

    const items: OnboardingChecklistItem[] = (doc?.data as any)?.items || [];
    const completedItems = items.filter(i => i.isCompleted);
    const totalItems = items.length;
    const completionPercent = totalItems > 0 ? Math.round((completedItems.length / totalItems) * 100) : 0;

    // Category breakdown
    const categoryMap = new Map<OnboardingCategory, { total: number; completed: number }>();
    for (const item of items) {
      const entry = categoryMap.get(item.category) || { total: 0, completed: 0 };
      entry.total++;
      if (item.isCompleted) entry.completed++;
      categoryMap.set(item.category, entry);
    }
    const categories = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      total: data.total,
      completed: data.completed,
      percent: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }));

    const pendingItems = items.filter(i => !i.isCompleted);
    const daysInOnboarding = Math.floor(
      (Date.now() - employee.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Find mentor assignment
    const mentorDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "Employee", entityId: employeeId, category: "MENTOR_ASSIGNMENT" },
    });
    const mentorName = (mentorDoc?.data as any)?.mentorName;

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      totalItems,
      completedItems: completedItems.length,
      completionPercent,
      categories,
      pendingItems,
      startDate: employee.dateOfJoining,
      daysInOnboarding,
      mentorName,
    };
  }

  /**
   * Mark a checklist item as completed.
   */
  static async completeChecklistItem(
    employeeId: string,
    itemId: string,
    completedBy?: string
  ): Promise<{ success: boolean; completionPercent: number }> {
    const doc = await prisma.generatedDocument.findFirst({
      where: { entityType: "Employee", entityId: employeeId, category: "ONBOARDING_CHECKLIST" },
      orderBy: { createdAt: "desc" },
    });

    if (!doc) {
      throw new Error("Onboarding checklist not found for this employee");
    }

    const data = doc.data as any;
    const items: OnboardingChecklistItem[] = data.items || [];
    const itemIndex = items.findIndex(i => i.id === itemId);

    if (itemIndex === -1) {
      throw new Error("Checklist item not found");
    }

    items[itemIndex].isCompleted = true;
    items[itemIndex].completedAt = new Date();

    const completionPercent = Math.round(
      (items.filter(i => i.isCompleted).length / items.length) * 100
    );

    // Check if all items are completed
    const allCompleted = items.every(i => i.isCompleted);

    await prisma.generatedDocument.update({
      where: { id: doc.id },
      data: {
        data: {
          ...data,
          items,
          status: allCompleted ? "COMPLETED" : "IN_PROGRESS",
          completedAt: allCompleted ? new Date() : undefined,
        },
      },
    });

    await createAuditLog({
      userId: completedBy || "SYSTEM",
      action: "UPDATE",
      entity: "OnboardingChecklist",
      entityId: employeeId,
      newValue: { itemId, completed: true, completionPercent },
    });

    // If fully completed, notify HR
    if (allCompleted) {
      const hrAdmins = await prisma.user.findMany({
        where: { role: { in: ["HR_MANAGER", "ADMIN"] }, status: "ACTIVE" },
        select: { id: true },
      });

      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { employeeCode: true, user: { select: { firstName: true, lastName: true } } },
      });

      for (const admin of hrAdmins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            title: "Onboarding Completed",
            message: `${employee?.user.firstName} ${employee?.user.lastName} (${employee?.employeeCode}) has completed all onboarding steps.`,
            type: "success",
            module: "hr",
          },
        });
      }
    }

    return { success: true, completionPercent };
  }

  /**
   * Assign a mentor to a new employee.
   */
  static async assignMentor(
    employeeId: string,
    mentorId: string,
    assignedBy?: string
  ): Promise<{ success: boolean; mentorName: string }> {
    const [employee, mentor] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.employee.findUnique({
        where: { id: mentorId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    if (!employee) throw new Error("Employee not found");
    if (!mentor) throw new Error("Mentor not found");

    const mentorName = `${mentor.user.firstName} ${mentor.user.lastName}`;
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    // Store mentor assignment
    await prisma.generatedDocument.create({
      data: {
        name: `Mentor Assignment — ${employee.employeeCode}`,
        category: "MENTOR_ASSIGNMENT",
        entityType: "Employee",
        entityId: employeeId,
        generatedBy: assignedBy || "SYSTEM",
        format: "JSON",
        data: {
          mentorId,
          mentorName,
          mentorEmployeeCode: mentor.employeeCode,
          assignedAt: new Date(),
        },
      },
    });

    // Notify the mentor
    await prisma.notification.create({
      data: {
        userId: mentor.user.id,
        title: "Mentor Assignment",
        message: `You have been assigned as a mentor for ${employeeName} (${employee.employeeCode}). Please help them with their onboarding journey.`,
        type: "info",
        module: "hr",
      },
    });

    // Notify the employee
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "Mentor Assigned",
        message: `${mentorName} has been assigned as your mentor. Feel free to reach out for any questions during your onboarding.`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: assignedBy || "SYSTEM",
      action: "UPDATE",
      entity: "Employee",
      entityId: employeeId,
      newValue: { mentorId, mentorName },
    });

    return { success: true, mentorName };
  }

  /**
   * Generate welcome package documents for a new employee.
   */
  static async generateWelcomePackage(employeeId: string): Promise<WelcomePackage> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!employee) throw new Error("Employee not found");

    const result: WelcomePackage = {
      offerLetterGenerated: false,
      ndaGenerated: false,
      employeeHandbookShared: false,
      itPolicyShared: false,
      orgChartShared: false,
      welcomeEmailSent: false,
      documentsCreated: [],
    };

    const docTemplates = [
      { name: "Offer Letter", category: "OFFER_LETTER" },
      { name: "NDA", category: "NDA" },
      { name: "Employee Handbook", category: "POLICY" },
      { name: "IT Security Policy", category: "POLICY" },
      { name: "Organization Chart", category: "OTHER" },
    ];

    for (const template of docTemplates) {
      try {
        await prisma.generatedDocument.create({
          data: {
            name: `${template.name} — ${employee.employeeCode}`,
            category: template.category,
            entityType: "Employee",
            entityId: employeeId,
            generatedBy: "SYSTEM",
            format: "PDF",
            data: {
              employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
              employeeCode: employee.employeeCode,
              department: employee.department,
              designation: employee.designation,
              dateOfJoining: employee.dateOfJoining,
              generatedAt: new Date(),
            },
          },
        });
        result.documentsCreated.push(template.name);

        if (template.name === "Offer Letter") result.offerLetterGenerated = true;
        if (template.name === "NDA") result.ndaGenerated = true;
        if (template.name === "Employee Handbook") result.employeeHandbookShared = true;
        if (template.name === "IT Security Policy") result.itPolicyShared = true;
        if (template.name === "Organization Chart") result.orgChartShared = true;
      } catch (err: any) {
        console.error(`Failed to generate ${template.name}: ${err.message}`);
      }
    }

    // Send welcome notification
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "Welcome to Circuvent Technologies!",
        message: `Hi ${employee.user.firstName}, welcome aboard! Your welcome package documents are ready for review. Please check your documents section.`,
        type: "success",
        module: "hr",
        actionUrl: "/hr/documents",
      },
    });
    result.welcomeEmailSent = true;

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "Employee",
      entityId: employeeId,
      newValue: result as unknown as Record<string, unknown>,
    });

    return result;
  }

  /**
   * Setup default benefit plans for a new employee.
   */
  static async setupDefaultBenefits(employeeId: string): Promise<{
    enrolledPlans: string[];
    skippedPlans: string[];
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, dateOfJoining: true },
    });

    if (!employee) throw new Error("Employee not found");

    const defaultPlans = await prisma.benefitPlan.findMany({
      where: { isActive: true },
    });

    const enrolledPlans: string[] = [];
    const skippedPlans: string[] = [];

    for (const plan of defaultPlans) {
      try {
        // Check if already enrolled
        const existing = await prisma.benefitEnrollment.findFirst({
          where: { planId: plan.id, employeeId },
        });

        if (existing) {
          skippedPlans.push(plan.name);
          continue;
        }

        await prisma.benefitEnrollment.create({
          data: {
            planId: plan.id,
            employeeId,
            startDate: employee.dateOfJoining,
            status: "ACTIVE",
          },
        });

        enrolledPlans.push(plan.name);
      } catch (err: any) {
        skippedPlans.push(`${plan.name} (error: ${err.message})`);
      }
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "Employee",
      entityId: employeeId,
      newValue: { enrolledPlans, skippedPlans },
    });

    return { enrolledPlans, skippedPlans };
  }

  /**
   * Assign mandatory training programs to a new employee.
   */
  static async assignDefaultTraining(employeeId: string): Promise<{
    enrolledPrograms: string[];
    skippedPrograms: string[];
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, department: true },
    });

    if (!employee) throw new Error("Employee not found");

    // Find mandatory + relevant training programs
    const programs = await prisma.trainingProgram.findMany({
      where: {
        status: { in: ["UPCOMING", "ONGOING"] },
        OR: [
          { mandatory: true },
          { department: employee.department },
          { department: null }, // Open to all
        ],
      },
    });

    const enrolledPrograms: string[] = [];
    const skippedPrograms: string[] = [];

    for (const program of programs) {
      try {
        const existing = await prisma.trainingEnrollment.findUnique({
          where: {
            programId_employeeId: { programId: program.id, employeeId },
          },
        });

        if (existing) {
          skippedPrograms.push(program.title);
          continue;
        }

        // Check seat availability
        if (program.maxSeats) {
          const enrolled = await prisma.trainingEnrollment.count({
            where: { programId: program.id, status: { not: "DROPPED" } },
          });
          if (enrolled >= program.maxSeats) {
            skippedPrograms.push(`${program.title} (full)`);
            continue;
          }
        }

        await prisma.trainingEnrollment.create({
          data: {
            programId: program.id,
            employeeId,
            status: "ENROLLED",
            progress: 0,
          },
        });

        enrolledPrograms.push(program.title);
      } catch (err: any) {
        skippedPrograms.push(`${program.title} (error)`);
      }
    }

    return { enrolledPrograms, skippedPrograms };
  }

  /**
   * Schedule 30/60/90 day check-in meetings for the new hire.
   */
  static async scheduleCheckIns(
    employeeId: string,
    managerId?: string
  ): Promise<{ scheduled: number; events: string[] }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const checkIns = [
      { days: 30, title: "30-Day Check-In", description: "First month review — settling in, initial feedback" },
      { days: 60, title: "60-Day Check-In", description: "Two month review — project integration, learning progress" },
      { days: 90, title: "90-Day Check-In", description: "Probation review — performance assessment, goal review" },
    ];

    const organizerId = managerId || employee.userId;
    const events: string[] = [];

    for (const checkIn of checkIns) {
      const startTime = new Date(employee.dateOfJoining);
      startTime.setDate(startTime.getDate() + checkIn.days);
      startTime.setHours(10, 0, 0, 0); // 10:00 AM

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      try {
        const event = await prisma.calendarEvent.create({
          data: {
            title: `${checkIn.title} — ${employee.user.firstName} ${employee.user.lastName}`,
            description: checkIn.description,
            startTime,
            endTime,
            eventType: "MEETING",
            organizerId,
            attendees: {
              create: [
                { userId: employee.userId },
                ...(managerId && managerId !== employee.userId
                  ? [{ userId: managerId }]
                  : []),
              ],
            },
            reminders: {
              create: [
                { minutesBefore: 60, type: "NOTIFICATION" },
                { minutesBefore: 1440, type: "EMAIL" }, // 1 day before
              ],
            },
          },
        });

        events.push(`${checkIn.title} on ${startTime.toISOString().split("T")[0]}`);
      } catch (err: any) {
        events.push(`${checkIn.title} — failed: ${err.message}`);
      }
    }

    return { scheduled: events.filter(e => !e.includes("failed")).length, events };
  }

  /**
   * Create IT equipment and access requests for a new employee.
   */
  static async createAccessRequests(employeeId: string): Promise<{
    requestsCreated: number;
    requests: string[];
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, designation: true, department: true },
    });

    if (!employee) throw new Error("Employee not found");

    const standardEquipment = [
      { category: "LAPTOP", justification: "Standard laptop for daily work" },
      { category: "MONITOR", justification: "External monitor for productivity" },
      { category: "KEYBOARD", justification: "External keyboard" },
      { category: "MOUSE", justification: "Wireless mouse" },
      { category: "HEADSET", justification: "Headset for meetings" },
    ];

    const requests: string[] = [];
    let created = 0;

    for (const item of standardEquipment) {
      try {
        await prisma.assetRequest.create({
          data: {
            employeeId,
            assetCategory: item.category,
            justification: `Onboarding standard equipment: ${item.justification}`,
            status: "PENDING",
          },
        });
        requests.push(`${item.category} — requested`);
        created++;
      } catch (err: any) {
        requests.push(`${item.category} — failed`);
      }
    }

    // Create a help ticket for IT access setup
    try {
      const ticketCount = await prisma.helpTicket.count();
      await prisma.helpTicket.create({
        data: {
          ticketCode: `TKT-${String(ticketCount + 1).padStart(3, "0")}`,
          employeeId,
          category: "IT_ACCESS",
          priority: "HIGH",
          status: "OPEN",
          subject: "New Employee IT Access Setup",
          description: `Please set up the following for new employee:\n- Email account\n- VPN access\n- GitHub/GitLab access\n- Slack workspace\n- JIRA/Project management tools\n- Development environment\nDepartment: ${employee.department}\nDesignation: ${employee.designation}`,
        },
      });
      requests.push("IT Access Setup ticket — created");
      created++;
    } catch (err: any) {
      requests.push("IT Access ticket — failed");
    }

    return { requestsCreated: created, requests };
  }

  /**
   * Send welcome notifications to the employee and their team.
   */
  static async sendWelcomeNotifications(employeeId: string): Promise<{
    employeeNotified: boolean;
    teamNotified: number;
    managersNotified: number;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
    });

    if (!employee) throw new Error("Employee not found");

    const name = `${employee.user.firstName} ${employee.user.lastName}`;
    let employeeNotified = false;
    let teamNotified = 0;
    let managersNotified = 0;

    // Welcome notification to the employee
    try {
      await prisma.notification.create({
        data: {
          userId: employee.userId,
          title: "Welcome to Circuvent Technologies! 🚀",
          message: `Welcome aboard, ${employee.user.firstName}! We're thrilled to have you join the team as ${employee.designation} in ${employee.department}. Check out your onboarding checklist to get started.`,
          type: "success",
          module: "hr",
          actionUrl: "/hr/onboarding",
        },
      });
      employeeNotified = true;
    } catch {}

    // Notify team members
    const teamMembers = await prisma.employee.findMany({
      where: {
        department: employee.department,
        dateOfLeaving: null,
        id: { not: employeeId },
      },
      select: { userId: true },
    });

    if (teamMembers.length > 0) {
      try {
        const result = await prisma.notification.createMany({
          data: teamMembers.map(tm => ({
            userId: tm.userId,
            type: "info" as const,
            title: "New Team Member! 👋",
            message: `Please welcome ${name} who is joining ${employee.department} as ${employee.designation}. Give them a warm welcome!`,
            module: "hr" as const,
          })),
        });
        teamNotified = result.count;
      } catch {}
    }

    // Notify managers and HR
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ["HR_MANAGER", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (managers.length > 0) {
      try {
        const result = await prisma.notification.createMany({
          data: managers.map(m => ({
            userId: m.id,
            type: "info" as const,
            title: "New Employee Onboarded",
            message: `${name} (${employee.employeeCode}) has been onboarded in ${employee.department} as ${employee.designation}. Date of joining: ${employee.dateOfJoining.toISOString().split("T")[0]}.`,
            module: "hr" as const,
          })),
        });
        managersNotified = result.count;
      } catch {}
    }

    return { employeeNotified, teamNotified, managersNotified };
  }

  /**
   * Aggregate onboarding dashboard statistics.
   */
  static async getOnboardingDashboard(): Promise<OnboardingDashboard> {
    // Get all onboarding checklists
    const checklists = await prisma.generatedDocument.findMany({
      where: { category: "ONBOARDING_CHECKLIST" },
      orderBy: { createdAt: "desc" },
    });

    // Deduplicate by employee (latest only)
    const latestByEmployee = new Map<string, any>();
    for (const doc of checklists) {
      if (doc.entityId && !latestByEmployee.has(doc.entityId)) {
        latestByEmployee.set(doc.entityId, doc);
      }
    }

    let totalInProgress = 0;
    let totalCompleted = 0;
    let completionDaysSum = 0;
    let completionPercentSum = 0;
    const deptMap = new Map<string, { inProgress: number; completed: number }>();
    const categoryPendingMap = new Map<string, number>();
    const recentOnboardings: OnboardingDashboard["recentOnboardings"] = [];

    // Get all relevant employees in one query
    const employeeIds = Array.from(latestByEmployee.keys());
    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    const employeeMap = new Map(employees.map(e => [e.id, e]));

    // Process each checklist
    for (const [empId, doc] of latestByEmployee) {
      const data = doc.data as any;
      const items: OnboardingChecklistItem[] = data?.items || [];
      const status = data?.status;
      const employee = employeeMap.get(empId);

      if (!employee) continue;

      const completed = items.filter(i => i.isCompleted).length;
      const total = items.length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

      completionPercentSum += percent;

      if (status === "COMPLETED") {
        totalCompleted++;
        const completedAt = data.completedAt ? new Date(data.completedAt) : new Date();
        const days = Math.floor(
          (completedAt.getTime() - employee.dateOfJoining.getTime()) / (1000 * 60 * 60 * 24)
        );
        completionDaysSum += days;
      } else {
        totalInProgress++;
      }

      // Department tracking
      const dept = employee.department;
      const deptEntry = deptMap.get(dept) || { inProgress: 0, completed: 0 };
      if (status === "COMPLETED") deptEntry.completed++;
      else deptEntry.inProgress++;
      deptMap.set(dept, deptEntry);

      // Category bottlenecks
      for (const item of items) {
        if (!item.isCompleted) {
          categoryPendingMap.set(item.category, (categoryPendingMap.get(item.category) || 0) + 1);
        }
      }

      // Get mentor name
      const mentorDoc = await prisma.generatedDocument.findFirst({
        where: { entityType: "Employee", entityId: empId, category: "MENTOR_ASSIGNMENT" },
      });

      recentOnboardings.push({
        employeeCode: employee.employeeCode,
        name: `${employee.user.firstName} ${employee.user.lastName}`,
        department: employee.department,
        startDate: employee.dateOfJoining,
        completionPercent: percent,
        mentorName: (mentorDoc?.data as any)?.mentorName,
      });
    }

    const totalDocs = latestByEmployee.size;

    return {
      totalInProgress,
      totalCompleted,
      avgCompletionDays: totalCompleted > 0 ? Math.round(completionDaysSum / totalCompleted) : 0,
      avgCompletionPercent: totalDocs > 0 ? Math.round(completionPercentSum / totalDocs) : 0,
      byDepartment: Array.from(deptMap.entries()).map(([department, data]) => ({
        department, ...data,
      })),
      recentOnboardings: recentOnboardings
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
        .slice(0, 10),
      bottlenecks: Array.from(categoryPendingMap.entries())
        .map(([category, pendingCount]) => ({ category, pendingCount }))
        .sort((a, b) => b.pendingCount - a.pendingCount),
    };
  }
}
