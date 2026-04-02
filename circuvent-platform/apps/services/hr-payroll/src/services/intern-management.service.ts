// ──────────────────────────────────────────────────────────────
// HR & Payroll — Intern Management Service
// Comprehensive intern lifecycle: program creation, enrollment,
// mentoring, weekly reports, evaluations, certificates,
// extensions, conversion to full-time, and analytics.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export interface InternProgram {
  id: string;
  name: string;
  department: string;
  durationWeeks: number;
  mentorId: string;
  mentorName?: string;
  stipend: number;
  maxCapacity: number;
  enrolledCount: number;
  status: "ACTIVE" | "COMPLETED" | "UPCOMING" | "CANCELLED";
  startDate: string;
  endDate: string;
  description?: string;
  createdAt: string;
}

export interface InternEnrollment {
  internId: string;
  programId: string;
  programName: string;
  employeeCode: string;
  internName: string;
  mentorName: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "COMPLETED" | "TERMINATED" | "CONVERTED";
}

export interface WeeklyReport {
  id: string;
  internId: string;
  weekNumber: number;
  report: string;
  hoursLogged: number;
  submittedAt: string;
  mentorFeedback?: string;
}

export interface InternEvaluation {
  id: string;
  internId: string;
  evaluatorId: string;
  evaluatorName: string;
  scores: {
    technical: number;     // 1-5
    communication: number; // 1-5
    teamwork: number;      // 1-5
    initiative: number;    // 1-5
    punctuality: number;   // 1-5
    learningAbility: number; // 1-5
  };
  overallScore: number;
  feedback: string;
  recommendation: "CONVERT" | "EXTEND" | "TERMINATE" | "NEUTRAL";
  evaluatedAt: string;
}

export interface InternProgress {
  internId: string;
  internName: string;
  programName: string;
  weekNumber: number;
  totalWeeks: number;
  progressPercent: number;
  tasksAssigned: number;
  tasksCompleted: number;
  weeklyReports: WeeklyReport[];
  evaluations: InternEvaluation[];
  avgScore: number;
  attendanceRate: number;
  hoursLogged: number;
}

export interface InternDashboard {
  totalActiveInterns: number;
  totalPrograms: number;
  activePrograms: number;
  completionRate: number;
  conversionRate: number;
  avgScore: number;
  byDepartment: Array<{ department: string; count: number }>;
  recentEnrollments: Array<{ name: string; program: string; department: string; startDate: string }>;
  upcomingCompletions: Array<{ name: string; program: string; endDate: string; score: number }>;
}

export interface ProgramStats {
  programId: string;
  programName: string;
  department: string;
  totalEnrolled: number;
  activeInterns: number;
  completedInterns: number;
  convertedInterns: number;
  terminatedInterns: number;
  completionRate: number;
  conversionRate: number;
  avgScore: number;
}

// ══════════════════════════════════════════════════════════════
// Intern Management Service
// ══════════════════════════════════════════════════════════════

export class InternManagementService {
  /**
   * Create a new intern program.
   */
  static async createInternProgram(
    name: string,
    department: string,
    durationWeeks: number,
    mentorId: string,
    stipend: number,
    maxCapacity: number,
    description?: string
  ): Promise<InternProgram> {
    if (!name || name.trim().length < 3) throw new Error("Program name must be at least 3 characters");
    if (durationWeeks < 4 || durationWeeks > 52) throw new Error("Duration must be between 4 and 52 weeks");
    if (maxCapacity < 1) throw new Error("Max capacity must be at least 1");
    if (stipend < 0) throw new Error("Stipend cannot be negative");

    const mentor = await prisma.employee.findUnique({
      where: { id: mentorId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!mentor) throw new Error("Mentor not found");

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationWeeks * 7);

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Intern Program — ${name.trim()}`,
        category: "INTERN_PROGRAM",
        entityType: "InternProgram",
        entityId: `prog-${Date.now()}`,
        generatedBy: mentorId,
        format: "JSON",
        data: {
          name: name.trim(),
          department,
          durationWeeks,
          mentorId,
          mentorName: `${mentor.user.firstName} ${mentor.user.lastName}`,
          stipend,
          maxCapacity,
          enrolledCount: 0,
          status: "ACTIVE",
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          description: description?.trim(),
          createdAt: new Date().toISOString(),
        } as any,
      },
    });

    await createAuditLog({
      userId: mentorId,
      action: "CREATE",
      entity: "InternProgram",
      entityId: doc.id,
      newValue: { name, department, durationWeeks, stipend, maxCapacity },
    });

    return {
      id: doc.id,
      name: name.trim(),
      department,
      durationWeeks,
      mentorId,
      mentorName: `${mentor.user.firstName} ${mentor.user.lastName}`,
      stipend,
      maxCapacity,
      enrolledCount: 0,
      status: "ACTIVE",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      description: description?.trim(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Enroll a user as an intern in a program.
   */
  static async enrollIntern(
    userId: string,
    programId: string
  ): Promise<InternEnrollment> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!user) throw new Error("User not found");

    const programDoc = await prisma.generatedDocument.findUnique({ where: { id: programId } });
    if (!programDoc) throw new Error("Intern program not found");

    const programData = programDoc.data as any;
    if (programData.status !== "ACTIVE") throw new Error("Program is not active");
    if (programData.enrolledCount >= programData.maxCapacity) throw new Error("Program has reached maximum capacity");

    // Check if already has an employee record
    const existingEmployee = await prisma.employee.findUnique({ where: { userId } });
    if (existingEmployee) throw new Error("User already has an employee record");

    // Generate employee code
    const internCount = await prisma.employee.count({ where: { employmentType: "INTERN" } });
    const employeeCode = `CIR-INT-${String(internCount + 1).padStart(3, "0")}`;

    // Create employee record as INTERN
    const employee = await prisma.employee.create({
      data: {
        userId,
        employeeCode,
        employmentType: "INTERN",
        designation: "Intern",
        department: programData.department,
        dateOfJoining: new Date(),
        baseSalary: programData.stipend * 12, // Annual equivalent
        currency: "INR",
        payFrequency: "MONTHLY",
      },
    });

    // Update program enrollment count
    await prisma.generatedDocument.update({
      where: { id: programId },
      data: {
        data: { ...programData, enrolledCount: programData.enrolledCount + 1 },
      },
    });

    // Store enrollment record
    await prisma.generatedDocument.create({
      data: {
        name: `Intern Enrollment — ${employeeCode}`,
        category: "INTERN_ENROLLMENT",
        entityType: "InternEnrollment",
        entityId: employee.id,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          internId: employee.id,
          programId,
          programName: programData.name,
          userId,
          internName: `${user.firstName} ${user.lastName}`,
          mentorId: programData.mentorId,
          mentorName: programData.mentorName,
          startDate: new Date().toISOString(),
          endDate: programData.endDate,
          status: "ACTIVE",
          enrolledAt: new Date().toISOString(),
        } as any,
      },
    });

    // Notify the mentor
    await prisma.notification.create({
      data: {
        userId: programData.mentorId,
        title: "New Intern Enrolled",
        message: `${user.firstName} ${user.lastName} has been enrolled in "${programData.name}". Please welcome your new intern!`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId,
      action: "CREATE",
      entity: "InternEnrollment",
      entityId: employee.id,
      newValue: { programId, programName: programData.name, employeeCode },
    });

    return {
      internId: employee.id,
      programId,
      programName: programData.name,
      employeeCode,
      internName: `${user.firstName} ${user.lastName}`,
      mentorName: programData.mentorName,
      startDate: new Date().toISOString(),
      endDate: programData.endDate,
      status: "ACTIVE",
    };
  }

  /**
   * Assign or reassign a mentor to an intern.
   */
  static async assignMentor(
    internId: string,
    mentorId: string
  ): Promise<{ success: boolean; mentorName: string }> {
    const [intern, mentor] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: internId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.employee.findUnique({
        where: { id: mentorId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    if (!intern) throw new Error("Intern not found");
    if (!mentor) throw new Error("Mentor not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    const mentorName = `${mentor.user.firstName} ${mentor.user.lastName}`;

    // Update enrollment doc
    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    if (enrollmentDoc) {
      const data = enrollmentDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: enrollmentDoc.id },
        data: { data: { ...data, mentorId, mentorName } },
      });
    }

    // Notify both parties
    await prisma.notification.create({
      data: {
        userId: mentor.user.id,
        title: "Intern Mentor Assignment",
        message: `You have been assigned as mentor for intern ${intern.user.firstName} ${intern.user.lastName} (${intern.employeeCode}).`,
        type: "info",
        module: "hr",
      },
    });

    await prisma.notification.create({
      data: {
        userId: intern.user.id,
        title: "Mentor Assigned",
        message: `${mentorName} has been assigned as your mentor.`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: mentor.userId,
      action: "UPDATE",
      entity: "InternEnrollment",
      entityId: internId,
      newValue: { mentorId, mentorName },
    });

    return { success: true, mentorName };
  }

  /**
   * Assign tasks to an intern as Goal entries.
   */
  static async assignTasks(
    internId: string,
    tasks: Array<{ title: string; description?: string; targetDate?: Date }>
  ): Promise<{ assigned: number; goalIds: string[] }> {
    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      select: { id: true, employmentType: true },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");
    if (!tasks.length) throw new Error("At least one task is required");

    const goalIds: string[] = [];

    for (const task of tasks) {
      if (!task.title || task.title.trim().length < 3) continue;

      const goal = await prisma.goal.create({
        data: {
          employeeId: internId,
          title: task.title.trim(),
          description: task.description?.trim(),
          category: "PROJECT",
          priority: "MEDIUM",
          status: "NOT_STARTED",
          progress: 0,
          targetDate: task.targetDate,
          quarter: this.getCurrentQuarter(),
        },
      });

      goalIds.push(goal.id);
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "Goal",
      entityId: internId,
      newValue: { tasksAssigned: goalIds.length },
    });

    return { assigned: goalIds.length, goalIds };
  }

  /**
   * Submit a weekly report for an intern.
   */
  static async submitWeeklyReport(
    internId: string,
    weekNumber: number,
    report: string,
    hoursLogged: number
  ): Promise<WeeklyReport> {
    if (weekNumber < 1) throw new Error("Week number must be at least 1");
    if (!report || report.trim().length < 20) throw new Error("Report must be at least 20 characters");
    if (hoursLogged < 0 || hoursLogged > 168) throw new Error("Hours logged must be between 0 and 168");

    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      select: { id: true, employeeCode: true, employmentType: true },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    // Check for duplicate week report
    const existing = await prisma.generatedDocument.findFirst({
      where: {
        entityType: "InternWeeklyReport",
        entityId: internId,
        category: "INTERN_WEEKLY_REPORT",
        data: { path: ["weekNumber"], equals: weekNumber },
      },
    });

    if (existing) throw new Error(`Weekly report for week ${weekNumber} already submitted`);

    const weeklyReport: WeeklyReport = {
      id: `wr-${internId}-w${weekNumber}`,
      internId,
      weekNumber,
      report: report.trim(),
      hoursLogged,
      submittedAt: new Date().toISOString(),
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Weekly Report W${weekNumber} — ${intern.employeeCode}`,
        category: "INTERN_WEEKLY_REPORT",
        entityType: "InternWeeklyReport",
        entityId: internId,
        generatedBy: internId,
        format: "JSON",
        data: weeklyReport as any,
      },
    });

    await createAuditLog({
      userId: internId,
      action: "CREATE",
      entity: "InternWeeklyReport",
      entityId: internId,
      newValue: { weekNumber, hoursLogged },
    });

    return weeklyReport;
  }

  /**
   * Evaluate an intern's performance.
   */
  static async evaluateIntern(
    internId: string,
    evaluatorId: string,
    scores: InternEvaluation["scores"],
    feedback: string
  ): Promise<InternEvaluation> {
    const [intern, evaluator] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: internId },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.employee.findUnique({
        where: { id: evaluatorId },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    if (!intern) throw new Error("Intern not found");
    if (!evaluator) throw new Error("Evaluator not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    // Validate scores
    const scoreValues = Object.values(scores);
    if (scoreValues.some((s) => s < 1 || s > 5)) {
      throw new Error("All scores must be between 1 and 5");
    }

    const overallScore = Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 100) / 100;

    // Determine recommendation
    let recommendation: InternEvaluation["recommendation"] = "NEUTRAL";
    if (overallScore >= 4.0) recommendation = "CONVERT";
    else if (overallScore >= 3.0) recommendation = "EXTEND";
    else if (overallScore < 2.0) recommendation = "TERMINATE";

    const evaluation: InternEvaluation = {
      id: `eval-${internId}-${Date.now()}`,
      internId,
      evaluatorId,
      evaluatorName: `${evaluator.user.firstName} ${evaluator.user.lastName}`,
      scores,
      overallScore,
      feedback: feedback.trim(),
      recommendation,
      evaluatedAt: new Date().toISOString(),
    };

    await prisma.generatedDocument.create({
      data: {
        name: `Intern Evaluation — ${intern.employeeCode}`,
        category: "INTERN_EVALUATION",
        entityType: "InternEvaluation",
        entityId: internId,
        generatedBy: evaluatorId,
        format: "JSON",
        data: evaluation as any,
      },
    });

    // Create a performance review record
    await prisma.performanceReview.create({
      data: {
        employeeId: internId,
        reviewerId: evaluator.userId,
        cycle: "PROBATION",
        period: this.getCurrentQuarter(),
        status: "COMPLETED",
        technicalRating: scores.technical,
        communicationRating: scores.communication,
        leadershipRating: scores.teamwork,
        initiativeRating: scores.initiative,
        overallRating: overallScore,
        managerComments: feedback.trim(),
        strengths: `Punctuality: ${scores.punctuality}/5, Learning: ${scores.learningAbility}/5`,
        completedAt: new Date(),
      },
    });

    // Notify intern
    await prisma.notification.create({
      data: {
        userId: intern.userId,
        title: "Internship Evaluation",
        message: `Your internship evaluation has been completed by ${evaluator.user.firstName} ${evaluator.user.lastName}. Overall Score: ${overallScore}/5.`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: evaluator.userId,
      action: "CREATE",
      entity: "InternEvaluation",
      entityId: internId,
      newValue: { overallScore, recommendation },
    });

    return evaluation;
  }

  /**
   * Generate a completion certificate for an intern (HTML format).
   */
  static async generateInternCertificate(internId: string): Promise<string> {
    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    // Get enrollment details
    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    const enrollData = enrollmentDoc?.data as any;

    // Get latest evaluation
    const evalDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEvaluation", entityId: internId, category: "INTERN_EVALUATION" },
      orderBy: { createdAt: "desc" },
    });

    const evalData = evalDoc?.data as any;
    const internName = `${intern.user.firstName} ${intern.user.lastName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Internship Certificate — ${internName}</title>
      <style>
        body { font-family: 'Georgia', serif; max-width: 800px; margin: 60px auto; color: #1a1a1a; text-align: center; }
        .border-frame { border: 3px double #1e3a5f; padding: 60px 50px; position: relative; }
        h1 { font-size: 2em; color: #1e3a5f; letter-spacing: 2px; margin-bottom: 8px; }
        h2 { font-size: 1.3em; color: #666; font-weight: normal; margin-top: 0; }
        .recipient { font-size: 1.6em; color: #1e3a5f; font-weight: bold; margin: 30px 0 10px; border-bottom: 2px solid #1e3a5f; display: inline-block; padding-bottom: 4px; }
        .details { font-size: 1.05em; line-height: 1.8; margin: 20px 40px; text-align: justify; }
        .score { color: #1e3a5f; font-weight: bold; }
        .signature-block { margin-top: 60px; display: flex; justify-content: space-between; }
        .sig { text-align: center; min-width: 200px; }
        .sig-line { border-top: 1px solid #333; padding-top: 8px; margin-top: 50px; }
        .date { margin-top: 30px; font-size: 0.9em; color: #666; }
        .company { color: #1e3a5f; font-weight: bold; }
      </style></head>
      <body>
        <div class="border-frame">
          <h1>CERTIFICATE OF COMPLETION</h1>
          <h2>Internship Program</h2>
          <p style="font-size: 1.1em;">This is to certify that</p>
          <div class="recipient">${internName}</div>
          <div class="details">
            has successfully completed the internship program
            ${enrollData?.programName ? `"<strong>${enrollData.programName}</strong>"` : ""}
            in the <strong>${intern.department}</strong> department at
            <span class="company">Circuvent Technologies Pvt. Ltd.</span>
            from <strong>${intern.dateOfJoining.toLocaleDateString()}</strong>
            to <strong>${(intern.dateOfLeaving || new Date()).toLocaleDateString()}</strong>.
            ${evalData?.overallScore ? `<br/><br/>The intern achieved an overall evaluation score of <span class="score">${evalData.overallScore}/5.0</span>.` : ""}
          </div>
          <p>We appreciate ${internName}'s contributions and wish them all the best in their future endeavors.</p>
          <div class="signature-block">
            <div class="sig">
              <div class="sig-line">HR Manager</div>
            </div>
            <div class="sig">
              <div class="sig-line">Program Mentor</div>
            </div>
          </div>
          <p class="date">Date: ${new Date().toLocaleDateString()}</p>
        </div>
      </body>
      </html>
    `;

    await prisma.generatedDocument.create({
      data: {
        name: `Intern Certificate — ${intern.employeeCode}`,
        category: "INTERN_CERTIFICATE",
        entityType: "InternCertificate",
        entityId: internId,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: html,
        data: { internName, department: intern.department, score: evalData?.overallScore } as any,
      },
    });

    return html;
  }

  /**
   * Extend an internship with a new end date.
   */
  static async extendInternship(
    internId: string,
    newEndDate: Date,
    reason: string
  ): Promise<{ success: boolean; previousEndDate: string; newEndDate: string }> {
    if (!reason || reason.trim().length < 5) throw new Error("Extension reason is required");

    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      select: { id: true, employeeCode: true, employmentType: true, userId: true },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    if (!enrollmentDoc) throw new Error("Enrollment record not found");

    const data = enrollmentDoc.data as any;
    const previousEndDate = data.endDate;

    if (new Date(newEndDate) <= new Date(previousEndDate)) {
      throw new Error("New end date must be after current end date");
    }

    await prisma.generatedDocument.update({
      where: { id: enrollmentDoc.id },
      data: {
        data: {
          ...data,
          endDate: newEndDate.toISOString(),
          extended: true,
          extensionReason: reason.trim(),
          previousEndDate,
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: intern.userId,
        title: "Internship Extended",
        message: `Your internship has been extended until ${newEndDate.toLocaleDateString()}. Reason: ${reason}`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "InternEnrollment",
      entityId: internId,
      newValue: { previousEndDate, newEndDate: newEndDate.toISOString(), reason },
    });

    return { success: true, previousEndDate, newEndDate: newEndDate.toISOString() };
  }

  /**
   * Convert an intern to a full-time employee.
   */
  static async convertToFullTime(
    internId: string,
    data: {
      designation: string;
      baseSalary: number;
      department?: string;
    }
  ): Promise<{ success: boolean; employeeCode: string; offerGenerated: boolean }> {
    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    // Generate new employee code
    const fullTimeCount = await prisma.employee.count({
      where: { employmentType: "FULL_TIME" },
    });
    const newEmployeeCode = `CIR-EMP-${String(fullTimeCount + 1).padStart(3, "0")}`;

    // Update employee record
    await prisma.employee.update({
      where: { id: internId },
      data: {
        employeeCode: newEmployeeCode,
        employmentType: "FULL_TIME",
        designation: data.designation,
        department: data.department || intern.department,
        baseSalary: data.baseSalary,
        dateOfJoining: new Date(), // Reset joining date
      },
    });

    // Update enrollment status
    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    if (enrollmentDoc) {
      const enData = enrollmentDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: enrollmentDoc.id },
        data: { data: { ...enData, status: "CONVERTED", convertedAt: new Date().toISOString() } },
      });
    }

    // Generate offer letter
    const internName = `${intern.user.firstName} ${intern.user.lastName}`;
    await prisma.generatedDocument.create({
      data: {
        name: `Full-Time Offer — ${newEmployeeCode}`,
        category: "OFFER_LETTER",
        entityType: "Employee",
        entityId: internId,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: `<h1>Offer of Employment</h1><p>Dear ${internName},</p><p>We are pleased to offer you a full-time position as <strong>${data.designation}</strong> at Circuvent Technologies.</p><p>Annual CTC: ₹${data.baseSalary.toLocaleString("en-IN")}</p>`,
        data: {
          designation: data.designation,
          baseSalary: data.baseSalary,
          newEmployeeCode,
          convertedFrom: "INTERN",
        } as any,
      },
    });

    // Notify the new employee
    await prisma.notification.create({
      data: {
        userId: intern.user.id,
        title: "🎉 Congratulations! Full-Time Offer",
        message: `You have been promoted from intern to full-time ${data.designation}. Your new employee code is ${newEmployeeCode}.`,
        type: "success",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "Employee",
      entityId: internId,
      newValue: { oldCode: intern.employeeCode, newCode: newEmployeeCode, designation: data.designation, baseSalary: data.baseSalary },
    });

    return { success: true, employeeCode: newEmployeeCode, offerGenerated: true };
  }

  /**
   * Terminate an internship.
   */
  static async terminateInternship(
    internId: string,
    reason: string
  ): Promise<{ success: boolean }> {
    if (!reason || reason.trim().length < 5) throw new Error("Termination reason is required");

    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!intern) throw new Error("Intern not found");
    if (intern.employmentType !== "INTERN") throw new Error("Employee is not an intern");

    // Set leaving date
    await prisma.employee.update({
      where: { id: internId },
      data: { dateOfLeaving: new Date() },
    });

    // Update enrollment
    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    if (enrollmentDoc) {
      const data = enrollmentDoc.data as any;
      await prisma.generatedDocument.update({
        where: { id: enrollmentDoc.id },
        data: {
          data: {
            ...data,
            status: "TERMINATED",
            terminationReason: reason.trim(),
            terminatedAt: new Date().toISOString(),
          },
        },
      });
    }

    // Deactivate user
    await prisma.user.update({
      where: { id: intern.userId },
      data: { status: "INACTIVE" },
    });

    await prisma.notification.create({
      data: {
        userId: intern.user.id,
        title: "Internship Terminated",
        message: `Your internship at Circuvent Technologies has been terminated. Reason: ${reason}`,
        type: "warning",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "InternEnrollment",
      entityId: internId,
      newValue: { reason },
    });

    return { success: true };
  }

  /**
   * Get the intern management dashboard.
   */
  static async getInternDashboard(): Promise<InternDashboard> {
    // Fetch all programs
    const programDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternProgram", category: "INTERN_PROGRAM" },
    });

    // Fetch all enrollments
    const enrollmentDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternEnrollment", category: "INTERN_ENROLLMENT" },
    });

    // Fetch all evaluations
    const evalDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternEvaluation", category: "INTERN_EVALUATION" },
    });

    const totalPrograms = programDocs.length;
    const activePrograms = programDocs.filter((d) => (d.data as any)?.status === "ACTIVE").length;

    const enrollments = enrollmentDocs.map((d) => d.data as any);
    const activeInterns = enrollments.filter((e) => e.status === "ACTIVE").length;
    const completedInterns = enrollments.filter((e) => e.status === "COMPLETED").length;
    const convertedInterns = enrollments.filter((e) => e.status === "CONVERTED").length;
    const totalCompleted = completedInterns + convertedInterns;

    const completionRate = enrollments.length > 0 ? Math.round((totalCompleted / enrollments.length) * 100) : 0;
    const conversionRate = totalCompleted > 0 ? Math.round((convertedInterns / totalCompleted) * 100) : 0;

    // Average score
    const scores = evalDocs.map((d) => (d.data as any)?.overallScore).filter((s): s is number => typeof s === "number");
    const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

    // By department
    const deptMap = new Map<string, number>();
    for (const e of enrollments) {
      if (e.status === "ACTIVE") {
        const dept = e.department || "Unknown";
        deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
      }
    }
    // Also get department from program
    for (const p of programDocs) {
      const pData = p.data as any;
      if (pData.status === "ACTIVE" && !deptMap.has(pData.department)) {
        deptMap.set(pData.department, 0);
      }
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    // Recent enrollments (last 5)
    const recentEnrollments = enrollments
      .sort((a: any, b: any) => new Date(b.enrolledAt || b.startDate).getTime() - new Date(a.enrolledAt || a.startDate).getTime())
      .slice(0, 5)
      .map((e: any) => ({
        name: e.internName,
        program: e.programName,
        department: e.department || "",
        startDate: e.startDate,
      }));

    // Upcoming completions
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);

    const upcomingCompletions = enrollments
      .filter((e: any) => e.status === "ACTIVE" && new Date(e.endDate) <= thirtyDays && new Date(e.endDate) >= now)
      .map((e: any) => {
        const evalScore = evalDocs.find((ev) => ev.entityId === e.internId);
        return {
          name: e.internName,
          program: e.programName,
          endDate: e.endDate,
          score: (evalScore?.data as any)?.overallScore || 0,
        };
      });

    return {
      totalActiveInterns: activeInterns,
      totalPrograms,
      activePrograms,
      completionRate,
      conversionRate,
      avgScore,
      byDepartment,
      recentEnrollments,
      upcomingCompletions,
    };
  }

  /**
   * Get progress details for a specific intern.
   */
  static async getInternProgress(internId: string): Promise<InternProgress> {
    const intern = await prisma.employee.findUnique({
      where: { id: internId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!intern) throw new Error("Intern not found");

    // Enrollment data
    const enrollmentDoc = await prisma.generatedDocument.findFirst({
      where: { entityType: "InternEnrollment", entityId: internId, category: "INTERN_ENROLLMENT" },
      orderBy: { createdAt: "desc" },
    });

    const enrollData = enrollmentDoc?.data as any;
    const startDate = new Date(enrollData?.startDate || intern.dateOfJoining);
    const endDate = new Date(enrollData?.endDate || new Date());
    const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const elapsedWeeks = Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const weekNumber = Math.min(elapsedWeeks, totalWeeks);
    const progressPercent = totalWeeks > 0 ? Math.min(100, Math.round((weekNumber / totalWeeks) * 100)) : 0;

    // Tasks
    const goals = await prisma.goal.findMany({ where: { employeeId: internId } });
    const tasksCompleted = goals.filter((g) => g.status === "COMPLETED").length;

    // Weekly reports
    const reportDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternWeeklyReport", entityId: internId, category: "INTERN_WEEKLY_REPORT" },
      orderBy: { createdAt: "asc" },
    });
    const weeklyReports: WeeklyReport[] = reportDocs.map((d) => d.data as any);

    // Evaluations
    const evalDocs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternEvaluation", entityId: internId, category: "INTERN_EVALUATION" },
      orderBy: { createdAt: "desc" },
    });
    const evaluations: InternEvaluation[] = evalDocs.map((d) => d.data as any);

    // Average score
    const scores = evaluations.map((e) => e.overallScore);
    const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

    // Attendance
    const attendanceLogs = await prisma.attendanceLog.findMany({
      where: { employeeId: internId },
    });
    const expectedDays = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)) * (5 / 7); // weekdays
    const attendanceRate = expectedDays > 0 ? Math.min(100, Math.round((attendanceLogs.length / expectedDays) * 100)) : 100;

    // Total hours logged
    const hoursLogged = weeklyReports.reduce((sum, r) => sum + (r.hoursLogged || 0), 0);

    return {
      internId,
      internName: `${intern.user.firstName} ${intern.user.lastName}`,
      programName: enrollData?.programName || "Unknown Program",
      weekNumber,
      totalWeeks,
      progressPercent,
      tasksAssigned: goals.length,
      tasksCompleted,
      weeklyReports,
      evaluations,
      avgScore,
      attendanceRate,
      hoursLogged,
    };
  }

  /**
   * Get statistics for a specific intern program.
   */
  static async getProgramStats(programId: string): Promise<ProgramStats> {
    const programDoc = await prisma.generatedDocument.findUnique({ where: { id: programId } });
    if (!programDoc) throw new Error("Program not found");

    const programData = programDoc.data as any;

    // Get all enrollments for this program
    const enrollmentDocs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "InternEnrollment",
        category: "INTERN_ENROLLMENT",
        data: { path: ["programId"], equals: programId },
      },
    });

    const enrollments = enrollmentDocs.map((d) => d.data as any);
    const activeInterns = enrollments.filter((e) => e.status === "ACTIVE").length;
    const completedInterns = enrollments.filter((e) => e.status === "COMPLETED").length;
    const convertedInterns = enrollments.filter((e) => e.status === "CONVERTED").length;
    const terminatedInterns = enrollments.filter((e) => e.status === "TERMINATED").length;

    const totalFinished = completedInterns + convertedInterns + terminatedInterns;
    const completionRate = totalFinished > 0
      ? Math.round(((completedInterns + convertedInterns) / totalFinished) * 100)
      : 0;
    const conversionRate = (completedInterns + convertedInterns) > 0
      ? Math.round((convertedInterns / (completedInterns + convertedInterns)) * 100)
      : 0;

    // Average scores for this program
    const internIds = enrollmentDocs.map((d) => d.entityId).filter(Boolean) as string[];
    const evalDocs = await prisma.generatedDocument.findMany({
      where: {
        entityType: "InternEvaluation",
        category: "INTERN_EVALUATION",
        entityId: { in: internIds },
      },
    });

    const evalScores = evalDocs.map((d) => (d.data as any)?.overallScore).filter((s): s is number => typeof s === "number");
    const avgScore = evalScores.length > 0 ? Math.round((evalScores.reduce((a, b) => a + b, 0) / evalScores.length) * 10) / 10 : 0;

    return {
      programId,
      programName: programData.name,
      department: programData.department,
      totalEnrolled: enrollments.length,
      activeInterns,
      completedInterns,
      convertedInterns,
      terminatedInterns,
      completionRate,
      conversionRate,
      avgScore,
    };
  }

  /**
   * Get all intern programs.
   */
  static async getAllInternPrograms(): Promise<InternProgram[]> {
    const docs = await prisma.generatedDocument.findMany({
      where: { entityType: "InternProgram", category: "INTERN_PROGRAM" },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((doc) => ({
      id: doc.id,
      ...(doc.data as any),
    }));
  }

  /**
   * Generate an intern management report for a given period.
   */
  static async generateInternReport(period: string): Promise<string> {
    const dashboard = await this.getInternDashboard();
    const programs = await this.getAllInternPrograms();

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Intern Management Report — ${period}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; color: #1a1a1a; }
        h1 { color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 8px; }
        h2 { color: #2c5f8a; margin-top: 30px; }
        .stat { display: inline-block; text-align: center; padding: 15px 20px; margin: 5px; background: #f5f7fa; border-radius: 8px; min-width: 120px; }
        .stat-value { font-size: 1.8em; font-weight: bold; color: #1e3a5f; }
        .stat-label { font-size: 0.85em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        th { background: #f5f7fa; font-weight: 600; }
        .footer { margin-top: 40px; font-size: 0.85em; color: #666; text-align: center; }
      </style></head>
      <body>
        <h1>Intern Management Report</h1>
        <p>Period: <strong>${period}</strong> | Generated: ${new Date().toLocaleDateString()}</p>

        <div>
          <div class="stat"><div class="stat-value">${dashboard.totalActiveInterns}</div><div class="stat-label">Active Interns</div></div>
          <div class="stat"><div class="stat-value">${dashboard.totalPrograms}</div><div class="stat-label">Total Programs</div></div>
          <div class="stat"><div class="stat-value">${dashboard.completionRate}%</div><div class="stat-label">Completion Rate</div></div>
          <div class="stat"><div class="stat-value">${dashboard.conversionRate}%</div><div class="stat-label">Conversion Rate</div></div>
          <div class="stat"><div class="stat-value">${dashboard.avgScore}</div><div class="stat-label">Avg Score (/5)</div></div>
        </div>

        <h2>Programs</h2>
        <table>
          <tr><th>Program</th><th>Department</th><th>Capacity</th><th>Enrolled</th><th>Status</th></tr>
          ${programs.map((p) => `<tr><td>${p.name}</td><td>${p.department}</td><td>${p.maxCapacity}</td><td>${p.enrolledCount}</td><td>${p.status}</td></tr>`).join("")}
        </table>

        <h2>Department Distribution</h2>
        <table>
          <tr><th>Department</th><th>Active Interns</th></tr>
          ${dashboard.byDepartment.map((d) => `<tr><td>${d.department}</td><td>${d.count}</td></tr>`).join("")}
        </table>

        <div class="footer">
          <p>Circuvent Technologies Pvt. Ltd. — Intern Management Report</p>
        </div>
      </body>
      </html>
    `;

    await prisma.generatedDocument.create({
      data: {
        name: `Intern Report — ${period}`,
        category: "INTERN_REPORT",
        entityType: "InternReport",
        entityId: `report-${period}`,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: html,
        data: { period, generatedAt: new Date().toISOString(), stats: dashboard } as any,
      },
    });

    return html;
  }

  // ── Helpers ──

  private static getCurrentQuarter(): string {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `Q${q}-${now.getFullYear()}`;
  }
}
