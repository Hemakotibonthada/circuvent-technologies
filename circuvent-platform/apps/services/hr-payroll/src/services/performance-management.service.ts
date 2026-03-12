// ──────────────────────────────────────────────────────────────
// HR & Payroll — Performance Management Service
// Comprehensive performance lifecycle: review cycles, self/
// manager/360 reviews, scoring, PIPs, promotions, salary
// revisions, bell curve analysis, calibration, and reporting.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types & Interfaces
// ══════════════════════════════════════════════════════════════

export type ReviewCycleType = "QUARTERLY" | "HALF_YEARLY" | "ANNUAL" | "PROBATION";

export interface ReviewCycleConfig {
  id: string;
  name: string;
  type: ReviewCycleType;
  startDate: string;
  endDate: string;
  targetRoles: string[];
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  selfReviewWeight: number;
  managerReviewWeight: number;
  peerReviewWeight: number;
  totalParticipants: number;
  completedReviews: number;
  createdAt: string;
}

export interface ReviewScores {
  technical: number;       // 1-5
  communication: number;   // 1-5
  leadership: number;      // 1-5
  initiative: number;      // 1-5
  teamwork?: number;       // 1-5
  innovation?: number;     // 1-5
}

export interface PerformanceImprovementPlan {
  id: string;
  employeeId: string;
  employeeName: string;
  areas: string[];
  goals: Array<{ goal: string; metric: string; target: string }>;
  timeline: number; // days
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "COMPLETED" | "EXTENDED" | "FAILED";
  checkpoints: Array<{ date: string; notes: string; progress: number }>;
  createdBy: string;
  createdAt: string;
}

export interface PerformanceTrend {
  employeeId: string;
  employeeName: string;
  reviews: Array<{
    period: string;
    cycle: ReviewCycleType;
    overallRating: number;
    date: string;
  }>;
  averageRating: number;
  trend: "IMPROVING" | "STABLE" | "DECLINING";
}

export interface BellCurveData {
  cycleId: string;
  totalReviews: number;
  distribution: Array<{
    rating: string;
    range: string;
    count: number;
    percentage: number;
    employees: Array<{ id: string; name: string; rating: number }>;
  }>;
  mean: number;
  standardDeviation: number;
}

export interface PerformanceReport {
  cycleId: string;
  cycleName: string;
  totalParticipants: number;
  completionRate: number;
  avgRating: number;
  byDepartment: Array<{
    department: string;
    avgRating: number;
    totalReviews: number;
    highPerformers: number;
    lowPerformers: number;
  }>;
  topPerformers: Array<{ name: string; department: string; rating: number }>;
  bottomPerformers: Array<{ name: string; department: string; rating: number }>;
  ratingDistribution: Array<{ range: string; count: number; percentage: number }>;
  promotionRecommendations: number;
}

// ══════════════════════════════════════════════════════════════
// Performance Management Service
// ══════════════════════════════════════════════════════════════

export class PerformanceManagementService {
  /**
   * Create a new review cycle.
   */
  static async createReviewCycle(
    name: string,
    type: ReviewCycleType,
    startDate: Date,
    endDate: Date,
    targetRoles: string[]
  ): Promise<ReviewCycleConfig> {
    if (!name || name.trim().length < 3) throw new Error("Cycle name must be at least 3 characters");
    if (startDate >= endDate) throw new Error("End date must be after start date");
    if (!targetRoles.length) throw new Error("At least one target role is required");

    // Count eligible employees
    const eligibleEmployees = await prisma.employee.count({
      where: {
        dateOfLeaving: null,
        user: { role: { in: targetRoles as any[] } },
      },
    });

    const cycleConfig: Omit<ReviewCycleConfig, "id"> = {
      name: name.trim(),
      type,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      targetRoles,
      status: "DRAFT",
      selfReviewWeight: 0.2,
      managerReviewWeight: 0.5,
      peerReviewWeight: 0.3,
      totalParticipants: eligibleEmployees,
      completedReviews: 0,
      createdAt: new Date().toISOString(),
    };

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Review Cycle — ${name.trim()}`,
        category: "REVIEW_CYCLE",
        entityType: "ReviewCycle",
        entityId: `cycle-${Date.now()}`,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: cycleConfig as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "ReviewCycle",
      entityId: doc.id,
      newValue: { name, type, targetRoles, eligibleEmployees },
    });

    return { ...cycleConfig, id: doc.id };
  }

  /**
   * Assign reviewers to an employee for a review cycle.
   */
  static async assignReviewers(
    employeeId: string,
    reviewerIds: string[]
  ): Promise<{ success: boolean; assigned: number }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    if (!reviewerIds.length) throw new Error("At least one reviewer is required");

    // Remove duplicates and validate
    const uniqueReviewerIds = [...new Set(reviewerIds)];
    const validReviewers: string[] = [];

    for (const reviewerId of uniqueReviewerIds) {
      const reviewer = await prisma.user.findUnique({
        where: { id: reviewerId },
        select: { id: true, firstName: true, lastName: true },
      });

      if (reviewer) {
        validReviewers.push(reviewerId);

        // Notify each reviewer
        await prisma.notification.create({
          data: {
            userId: reviewerId,
            title: "Performance Review Assignment",
            message: `You have been assigned to review ${employee.user.firstName} ${employee.user.lastName} (${employee.employeeCode}).`,
            type: "info",
            module: "hr",
          },
        });
      }
    }

    await prisma.generatedDocument.create({
      data: {
        name: `Reviewer Assignment — ${employee.employeeCode}`,
        category: "REVIEWER_ASSIGNMENT",
        entityType: "ReviewerAssignment",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          reviewerIds: validReviewers,
          assignedAt: new Date().toISOString(),
        } as any,
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "PerformanceReview",
      entityId: employeeId,
      newValue: { reviewerIds: validReviewers },
    });

    return { success: true, assigned: validReviewers.length };
  }

  /**
   * Submit a self-review.
   */
  static async submitSelfReview(
    employeeId: string,
    scores: ReviewScores,
    comments: string
  ): Promise<{ success: boolean; reviewId: string }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    this.validateScores(scores);

    const overallRating = this.computeOverallRating(scores);

    // Check for existing self-review this cycle
    const currentPeriod = this.getCurrentPeriod();
    const existing = await prisma.performanceReview.findFirst({
      where: {
        employeeId,
        reviewerId: employee.userId,
        period: currentPeriod,
      },
    });

    if (existing) throw new Error("Self-review already submitted for this period");

    const review = await prisma.performanceReview.create({
      data: {
        employeeId,
        reviewerId: employee.userId,
        cycle: "ANNUAL",
        period: currentPeriod,
        status: "SELF_REVIEW",
        technicalRating: scores.technical,
        communicationRating: scores.communication,
        leadershipRating: scores.leadership,
        initiativeRating: scores.initiative,
        overallRating,
        selfAssessment: comments.trim(),
        strengths: `Technical: ${scores.technical}/5, Communication: ${scores.communication}/5`,
      },
    });

    await createAuditLog({
      userId: employee.userId,
      action: "CREATE",
      entity: "PerformanceReview",
      entityId: review.id,
      newValue: { type: "SELF_REVIEW", overallRating },
    });

    return { success: true, reviewId: review.id };
  }

  /**
   * Submit a manager review.
   */
  static async submitManagerReview(
    employeeId: string,
    reviewerId: string,
    scores: ReviewScores,
    comments: string
  ): Promise<{ success: boolean; reviewId: string }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    this.validateScores(scores);

    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { firstName: true, lastName: true },
    });

    if (!reviewer) throw new Error("Reviewer not found");

    const overallRating = this.computeOverallRating(scores);
    const currentPeriod = this.getCurrentPeriod();

    // Check for existing manager review
    const existing = await prisma.performanceReview.findFirst({
      where: { employeeId, reviewerId, period: currentPeriod, status: "MANAGER_REVIEW" },
    });

    if (existing) throw new Error("Manager review already submitted for this period");

    const review = await prisma.performanceReview.create({
      data: {
        employeeId,
        reviewerId,
        cycle: "ANNUAL",
        period: currentPeriod,
        status: "MANAGER_REVIEW",
        technicalRating: scores.technical,
        communicationRating: scores.communication,
        leadershipRating: scores.leadership,
        initiativeRating: scores.initiative,
        overallRating,
        managerComments: comments.trim(),
        areasOfImprovement: scores.initiative < 3 ? "Needs to show more initiative" : undefined,
        promotionRecommended: overallRating >= 4.5,
        salaryHikePercent: overallRating >= 4 ? 15 : overallRating >= 3 ? 10 : 5,
      },
    });

    // Notify employee
    await prisma.notification.create({
      data: {
        userId: employee.userId,
        title: "Manager Review Completed",
        message: `Your performance review has been completed by ${reviewer.firstName} ${reviewer.lastName}.`,
        type: "info",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: reviewerId,
      action: "CREATE",
      entity: "PerformanceReview",
      entityId: review.id,
      newValue: { type: "MANAGER_REVIEW", overallRating },
    });

    return { success: true, reviewId: review.id };
  }

  /**
   * Submit a 360-degree peer review.
   */
  static async submit360Review(
    employeeId: string,
    peerId: string,
    scores: ReviewScores,
    comments: string
  ): Promise<{ success: boolean; reviewId: string }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, userId: true },
    });

    if (!employee) throw new Error("Employee not found");
    this.validateScores(scores);

    const overallRating = this.computeOverallRating(scores);
    const currentPeriod = this.getCurrentPeriod();

    const review = await prisma.performanceReview.create({
      data: {
        employeeId,
        reviewerId: peerId,
        cycle: "ANNUAL",
        period: currentPeriod,
        status: "HR_REVIEW", // 360 reviews go to HR review stage
        technicalRating: scores.technical,
        communicationRating: scores.communication,
        leadershipRating: scores.leadership,
        initiativeRating: scores.initiative,
        overallRating,
        hrComments: `360° Peer Review: ${comments.trim()}`,
      },
    });

    await createAuditLog({
      userId: peerId,
      action: "CREATE",
      entity: "PerformanceReview",
      entityId: review.id,
      newValue: { type: "360_REVIEW", overallRating },
    });

    return { success: true, reviewId: review.id };
  }

  /**
   * Calculate the final weighted score for an employee in a cycle.
   */
  static async calculateFinalScore(
    employeeId: string,
    cycleId: string
  ): Promise<{
    finalScore: number;
    selfScore: number | null;
    managerScore: number | null;
    peerScore: number | null;
    recommendation: string;
  }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    // Get cycle weights
    const cycleDoc = await prisma.generatedDocument.findUnique({ where: { id: cycleId } });
    const cycleData = cycleDoc?.data as any;
    const selfWeight = cycleData?.selfReviewWeight || 0.2;
    const managerWeight = cycleData?.managerReviewWeight || 0.5;
    const peerWeight = cycleData?.peerReviewWeight || 0.3;

    // Get all reviews for this employee
    const reviews = await prisma.performanceReview.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });

    const selfReview = reviews.find((r) => r.status === "SELF_REVIEW");
    const managerReview = reviews.find((r) => r.status === "MANAGER_REVIEW");
    const peerReviews = reviews.filter((r) => r.status === "HR_REVIEW" && r.hrComments?.startsWith("360°"));

    const selfScore = selfReview ? Number(selfReview.overallRating) : null;
    const managerScore = managerReview ? Number(managerReview.overallRating) : null;
    const peerScore = peerReviews.length > 0
      ? peerReviews.reduce((sum, r) => sum + Number(r.overallRating || 0), 0) / peerReviews.length
      : null;

    // Weighted average (only consider available scores)
    let totalWeight = 0;
    let weightedSum = 0;

    if (selfScore !== null) {
      weightedSum += selfScore * selfWeight;
      totalWeight += selfWeight;
    }
    if (managerScore !== null) {
      weightedSum += managerScore * managerWeight;
      totalWeight += managerWeight;
    }
    if (peerScore !== null) {
      weightedSum += peerScore * peerWeight;
      totalWeight += peerWeight;
    }

    const finalScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;

    // Determine recommendation
    let recommendation = "No action";
    if (finalScore >= 4.5) recommendation = "Promotion recommended";
    else if (finalScore >= 4.0) recommendation = "Significant salary revision";
    else if (finalScore >= 3.5) recommendation = "Standard increment";
    else if (finalScore >= 3.0) recommendation = "Marginal increment";
    else if (finalScore >= 2.0) recommendation = "Performance improvement plan";
    else recommendation = "Termination review";

    // Store computed final score
    await prisma.generatedDocument.create({
      data: {
        name: `Final Score — ${employee.employeeCode}`,
        category: "FINAL_SCORE",
        entityType: "PerformanceFinalScore",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: { cycleId, finalScore, selfScore, managerScore, peerScore, recommendation } as any,
      },
    });

    return { finalScore, selfScore, managerScore, peerScore, recommendation };
  }

  /**
   * Get performance trend over time.
   */
  static async getPerformanceTrend(employeeId: string): Promise<PerformanceTrend> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const reviews = await prisma.performanceReview.findMany({
      where: { employeeId, status: { in: ["COMPLETED", "ACKNOWLEDGED", "MANAGER_REVIEW"] } },
      orderBy: { createdAt: "asc" },
    });

    const reviewData = reviews
      .filter((r) => r.overallRating !== null)
      .map((r) => ({
        period: r.period,
        cycle: r.cycle as ReviewCycleType,
        overallRating: Number(r.overallRating),
        date: r.createdAt.toISOString(),
      }));

    const ratings = reviewData.map((r) => r.overallRating);
    const averageRating = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
      : 0;

    // Trend analysis — compare first half to second half
    let trend: PerformanceTrend["trend"] = "STABLE";
    if (ratings.length >= 4) {
      const mid = Math.floor(ratings.length / 2);
      const firstHalf = ratings.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
      const secondHalf = ratings.slice(mid).reduce((a, b) => a + b, 0) / (ratings.length - mid);
      if (secondHalf - firstHalf > 0.3) trend = "IMPROVING";
      else if (firstHalf - secondHalf > 0.3) trend = "DECLINING";
    }

    return {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      reviews: reviewData,
      averageRating,
      trend,
    };
  }

  /**
   * Generate a Performance Improvement Plan (PIP).
   */
  static async generatePIP(
    employeeId: string,
    areas: string[],
    goals: Array<{ goal: string; metric: string; target: string }>,
    timeline: number // days
  ): Promise<PerformanceImprovementPlan> {
    if (!areas.length) throw new Error("At least one area of improvement is required");
    if (!goals.length) throw new Error("At least one goal is required");
    if (timeline < 30 || timeline > 180) throw new Error("Timeline must be between 30 and 180 days");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + timeline);

    const pip: Omit<PerformanceImprovementPlan, "id"> = {
      employeeId,
      employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
      areas,
      goals,
      timeline,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: "ACTIVE",
      checkpoints: [],
      createdBy: "SYSTEM",
      createdAt: new Date().toISOString(),
    };

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `PIP — ${employee.employeeCode}`,
        category: "PIP",
        entityType: "PerformanceImprovementPlan",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: pip as any,
      },
    });

    // Notify employee
    await prisma.notification.create({
      data: {
        userId: employee.user.id,
        title: "Performance Improvement Plan",
        message: `A Performance Improvement Plan has been created for you. Duration: ${timeline} days. Please review the goals and work towards improvement.`,
        type: "warning",
        module: "hr",
      },
    });

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "PIP",
      entityId: doc.id,
      newValue: { employeeId, areas, timeline },
    });

    return { ...pip, id: doc.id };
  }

  /**
   * Check PIP progress.
   */
  static async checkPIPProgress(pipId: string): Promise<{
    pip: PerformanceImprovementPlan;
    daysRemaining: number;
    progress: number;
  }> {
    const doc = await prisma.generatedDocument.findUnique({ where: { id: pipId } });
    if (!doc) throw new Error("PIP not found");

    const pip = { id: doc.id, ...(doc.data as any) } as PerformanceImprovementPlan;
    const now = new Date();
    const endDate = new Date(pip.endDate);
    const startDate = new Date(pip.startDate);

    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const elapsed = totalDays - daysRemaining;
    const progress = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;

    return { pip, daysRemaining, progress };
  }

  /**
   * Recommend an employee for promotion.
   */
  static async recommendPromotion(
    employeeId: string,
    newDesignation: string,
    newSalary: number
  ): Promise<{ success: boolean; recommendationId: string }> {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");
    if (!newDesignation) throw new Error("New designation is required");
    if (newSalary <= Number(employee.baseSalary)) throw new Error("New salary must be higher than current");

    const incrementPercent = Math.round(
      ((newSalary - Number(employee.baseSalary)) / Number(employee.baseSalary)) * 100 * 10
    ) / 10;

    const doc = await prisma.generatedDocument.create({
      data: {
        name: `Promotion Recommendation — ${employee.employeeCode}`,
        category: "PROMOTION_RECOMMENDATION",
        entityType: "PromotionRecommendation",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
          currentDesignation: employee.designation,
          newDesignation,
          currentSalary: Number(employee.baseSalary),
          newSalary,
          incrementPercent,
          status: "PENDING",
          recommendedAt: new Date().toISOString(),
        } as any,
      },
    });

    // Notify HR
    const hrAdmins = await prisma.user.findMany({
      where: { role: { in: ["HR_MANAGER", "ADMIN"] }, status: "ACTIVE" },
      select: { id: true },
    });

    for (const admin of hrAdmins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          title: "Promotion Recommendation",
          message: `${employee.user.firstName} ${employee.user.lastName} recommended for promotion to ${newDesignation} (${incrementPercent}% increase).`,
          type: "info",
          module: "hr",
        },
      });
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "PromotionRecommendation",
      entityId: doc.id,
      newValue: { employeeId, newDesignation, incrementPercent },
    });

    return { success: true, recommendationId: doc.id };
  }

  /**
   * Recommend a salary revision.
   */
  static async recommendSalaryRevision(
    employeeId: string,
    percentage: number,
    reason: string
  ): Promise<{ success: boolean; currentSalary: number; proposedSalary: number }> {
    if (percentage <= 0 || percentage > 100) throw new Error("Percentage must be between 1 and 100");
    if (!reason) throw new Error("Reason is required");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const currentSalary = Number(employee.baseSalary);
    const proposedSalary = Math.round(currentSalary * (1 + percentage / 100));

    await prisma.generatedDocument.create({
      data: {
        name: `Salary Revision — ${employee.employeeCode}`,
        category: "SALARY_REVISION",
        entityType: "SalaryRevision",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
          currentSalary,
          proposedSalary,
          percentage,
          reason: reason.trim(),
          status: "PENDING",
          createdAt: new Date().toISOString(),
        } as any,
      },
    });

    return { success: true, currentSalary, proposedSalary };
  }

  /**
   * Link goals to a performance review.
   */
  static async linkGoalsToReview(
    employeeId: string,
    goalIds: string[]
  ): Promise<{ success: boolean; linked: number }> {
    if (!goalIds.length) throw new Error("At least one goal ID is required");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
    });

    if (!employee) throw new Error("Employee not found");

    // Validate and fetch goals
    const goals = await prisma.goal.findMany({
      where: { id: { in: goalIds }, employeeId },
    });

    if (goals.length === 0) throw new Error("No valid goals found for this employee");

    // Calculate goal completion stats
    const completedGoals = goals.filter((g) => g.status === "COMPLETED").length;
    const avgProgress = Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length);

    await prisma.generatedDocument.create({
      data: {
        name: `Goal Linkage — ${employee.employeeCode}`,
        category: "GOAL_REVIEW_LINK",
        entityType: "GoalReviewLink",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "JSON",
        data: {
          employeeId,
          goalIds: goals.map((g) => g.id),
          goalTitles: goals.map((g) => g.title),
          completedGoals,
          totalGoals: goals.length,
          avgProgress,
          linkedAt: new Date().toISOString(),
        } as any,
      },
    });

    return { success: true, linked: goals.length };
  }

  /**
   * Generate a performance report for a cycle.
   */
  static async generatePerformanceReport(cycleId: string): Promise<PerformanceReport> {
    const cycleDoc = await prisma.generatedDocument.findUnique({ where: { id: cycleId } });
    if (!cycleDoc) throw new Error("Review cycle not found");

    const cycleData = cycleDoc.data as any;

    // Get all reviews
    const reviews = await prisma.performanceReview.findMany({
      where: { status: { in: ["MANAGER_REVIEW", "COMPLETED", "ACKNOWLEDGED"] } },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    const totalParticipants = reviews.length;
    const completedReviews = reviews.filter((r) => r.overallRating !== null).length;
    const completionRate = totalParticipants > 0 ? Math.round((completedReviews / totalParticipants) * 100) : 0;

    const ratings = reviews.filter((r) => r.overallRating).map((r) => Number(r.overallRating));
    const avgRating = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0;

    // By department
    const deptMap = new Map<string, { ratings: number[]; count: number }>();
    for (const r of reviews) {
      const dept = r.employee.department;
      const entry = deptMap.get(dept) || { ratings: [], count: 0 };
      entry.count++;
      if (r.overallRating) entry.ratings.push(Number(r.overallRating));
      deptMap.set(dept, entry);
    }

    const byDepartment = Array.from(deptMap.entries()).map(([department, data]) => {
      const deptAvg = data.ratings.length > 0
        ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 100) / 100
        : 0;
      return {
        department,
        avgRating: deptAvg,
        totalReviews: data.count,
        highPerformers: data.ratings.filter((r) => r >= 4).length,
        lowPerformers: data.ratings.filter((r) => r < 3).length,
      };
    }).sort((a, b) => b.avgRating - a.avgRating);

    // Top & bottom performers
    const sortedByRating = reviews
      .filter((r) => r.overallRating)
      .sort((a, b) => Number(b.overallRating) - Number(a.overallRating));

    const topPerformers = sortedByRating.slice(0, 10).map((r) => ({
      name: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
      department: r.employee.department,
      rating: Number(r.overallRating),
    }));

    const bottomPerformers = sortedByRating.slice(-5).reverse().map((r) => ({
      name: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
      department: r.employee.department,
      rating: Number(r.overallRating),
    }));

    // Rating distribution
    const dist: Record<string, number> = { "1.0 - 1.9": 0, "2.0 - 2.9": 0, "3.0 - 3.4": 0, "3.5 - 3.9": 0, "4.0 - 4.4": 0, "4.5 - 5.0": 0 };
    for (const rating of ratings) {
      if (rating < 2) dist["1.0 - 1.9"]++;
      else if (rating < 3) dist["2.0 - 2.9"]++;
      else if (rating < 3.5) dist["3.0 - 3.4"]++;
      else if (rating < 4) dist["3.5 - 3.9"]++;
      else if (rating < 4.5) dist["4.0 - 4.4"]++;
      else dist["4.5 - 5.0"]++;
    }
    const ratingDistribution = Object.entries(dist).map(([range, count]) => ({
      range,
      count,
      percentage: ratings.length > 0 ? Math.round((count / ratings.length) * 100) : 0,
    }));

    const promotionRecommendations = reviews.filter((r) => r.promotionRecommended).length;

    return {
      cycleId,
      cycleName: cycleData?.name || "Review Cycle",
      totalParticipants,
      completionRate,
      avgRating,
      byDepartment,
      topPerformers,
      bottomPerformers,
      ratingDistribution,
      promotionRecommendations,
    };
  }

  /**
   * Get bell curve distribution for a review cycle.
   */
  static async getBellCurve(cycleId: string): Promise<BellCurveData> {
    const reviews = await prisma.performanceReview.findMany({
      where: { overallRating: { not: null } },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    const ratings = reviews.map((r) => Number(r.overallRating));
    const totalReviews = ratings.length;

    // Mean
    const mean = totalReviews > 0 ? ratings.reduce((a, b) => a + b, 0) / totalReviews : 0;

    // Standard deviation
    const variance = totalReviews > 0
      ? ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / totalReviews
      : 0;
    const standardDeviation = Math.sqrt(variance);

    // Bell curve buckets
    const buckets = [
      { rating: "Outstanding", range: "4.5 - 5.0", min: 4.5, max: 5.01 },
      { rating: "Exceeds Expectations", range: "4.0 - 4.4", min: 4.0, max: 4.5 },
      { rating: "Meets Expectations", range: "3.0 - 3.9", min: 3.0, max: 4.0 },
      { rating: "Needs Improvement", range: "2.0 - 2.9", min: 2.0, max: 3.0 },
      { rating: "Unsatisfactory", range: "1.0 - 1.9", min: 1.0, max: 2.0 },
    ];

    const distribution = buckets.map((bucket) => {
      const matching = reviews.filter(
        (r) => Number(r.overallRating) >= bucket.min && Number(r.overallRating) < bucket.max
      );
      return {
        rating: bucket.rating,
        range: bucket.range,
        count: matching.length,
        percentage: totalReviews > 0 ? Math.round((matching.length / totalReviews) * 100) : 0,
        employees: matching.map((r) => ({
          id: r.employeeId,
          name: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
          rating: Number(r.overallRating),
        })),
      };
    });

    return {
      cycleId,
      totalReviews,
      distribution,
      mean: Math.round(mean * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
    };
  }

  /**
   * Get top N high performers.
   */
  static async getHighPerformers(
    cycleId: string,
    topN: number = 10
  ): Promise<Array<{ employeeId: string; name: string; department: string; rating: number }>> {
    const reviews = await prisma.performanceReview.findMany({
      where: { overallRating: { not: null } },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { overallRating: "desc" },
      take: topN,
    });

    return reviews.map((r) => ({
      employeeId: r.employeeId,
      name: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
      department: r.employee.department,
      rating: Number(r.overallRating),
    }));
  }

  /**
   * Get bottom N low performers.
   */
  static async getLowPerformers(
    cycleId: string,
    bottomN: number = 5
  ): Promise<Array<{ employeeId: string; name: string; department: string; rating: number }>> {
    const reviews = await prisma.performanceReview.findMany({
      where: { overallRating: { not: null } },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { overallRating: "asc" },
      take: bottomN,
    });

    return reviews.map((r) => ({
      employeeId: r.employeeId,
      name: `${r.employee.user.firstName} ${r.employee.user.lastName}`,
      department: r.employee.department,
      rating: Number(r.overallRating),
    }));
  }

  /**
   * Calibrate ratings — normalize across departments to ensure fairness.
   */
  static async calibrateRatings(cycleId: string): Promise<{
    adjustments: number;
    avgBefore: number;
    avgAfter: number;
    byDepartment: Array<{ department: string; avgBefore: number; avgAfter: number; adjustments: number }>;
  }> {
    const reviews = await prisma.performanceReview.findMany({
      where: { overallRating: { not: null } },
      include: { employee: { select: { department: true } } },
    });

    if (reviews.length === 0) {
      return { adjustments: 0, avgBefore: 0, avgAfter: 0, byDepartment: [] };
    }

    // Overall mean
    const overallMean = reviews.reduce((sum, r) => sum + Number(r.overallRating), 0) / reviews.length;

    // Department means
    const deptMap = new Map<string, { reviews: typeof reviews; mean: number }>();
    for (const r of reviews) {
      const dept = r.employee.department;
      const entry = deptMap.get(dept) || { reviews: [], mean: 0 };
      entry.reviews.push(r);
      deptMap.set(dept, entry);
    }

    // Compute department means
    for (const [, data] of deptMap) {
      data.mean = data.reviews.reduce((sum, r) => sum + Number(r.overallRating), 0) / data.reviews.length;
    }

    let totalAdjustments = 0;
    const byDepartment: Array<{ department: string; avgBefore: number; avgAfter: number; adjustments: number }> = [];

    for (const [dept, data] of deptMap) {
      const adjustment = overallMean - data.mean;
      let deptAdjustments = 0;

      if (Math.abs(adjustment) > 0.1) {
        for (const review of data.reviews) {
          const currentRating = Number(review.overallRating);
          const newRating = Math.min(5, Math.max(1, Math.round((currentRating + adjustment * 0.5) * 100) / 100));

          if (Math.abs(newRating - currentRating) > 0.05) {
            await prisma.performanceReview.update({
              where: { id: review.id },
              data: { overallRating: newRating },
            });
            deptAdjustments++;
            totalAdjustments++;
          }
        }
      }

      byDepartment.push({
        department: dept,
        avgBefore: Math.round(data.mean * 100) / 100,
        avgAfter: Math.round((data.mean + (Math.abs(overallMean - data.mean) > 0.1 ? (overallMean - data.mean) * 0.5 : 0)) * 100) / 100,
        adjustments: deptAdjustments,
      });
    }

    const avgAfter = reviews.length > 0
      ? Math.round(overallMean * 100) / 100
      : 0;

    await createAuditLog({
      userId: "SYSTEM",
      action: "UPDATE",
      entity: "ReviewCycle",
      entityId: cycleId,
      newValue: { totalAdjustments, avgBefore: Math.round(overallMean * 100) / 100, avgAfter },
    });

    return {
      adjustments: totalAdjustments,
      avgBefore: Math.round(overallMean * 100) / 100,
      avgAfter,
      byDepartment,
    };
  }

  /**
   * Generate an increment letter (HTML) for an employee.
   */
  static async generateIncrementLetter(
    employeeId: string,
    incrementPercentage: number
  ): Promise<string> {
    if (incrementPercentage <= 0 || incrementPercentage > 100) {
      throw new Error("Increment percentage must be between 1 and 100");
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    if (!employee) throw new Error("Employee not found");

    const currentSalary = Number(employee.baseSalary);
    const newSalary = Math.round(currentSalary * (1 + incrementPercentage / 100));
    const incrementAmount = newSalary - currentSalary;
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;
    const effectiveDate = new Date();
    effectiveDate.setMonth(effectiveDate.getMonth() + 1, 1); // First of next month

    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Increment Letter — ${employeeName}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 700px; margin: 40px auto; color: #1a1a1a; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #1e3a5f; margin-bottom: 4px; }
        .header p { color: #666; font-size: 0.9em; }
        .date { text-align: right; margin-bottom: 20px; color: #666; }
        .content { margin: 20px 0; }
        .salary-table { width: 60%; margin: 20px auto; }
        .salary-table td { padding: 8px 16px; }
        .salary-table .label { color: #666; }
        .salary-table .value { font-weight: bold; text-align: right; }
        .new-salary { color: #1e3a5f; font-size: 1.1em; }
        .signature { margin-top: 60px; }
        .sig-line { border-top: 1px solid #333; width: 200px; padding-top: 4px; margin-top: 40px; }
        .confidential { color: #c00; font-size: 0.8em; text-align: center; margin-top: 40px; }
      </style></head>
      <body>
        <div class="header">
          <h1>Circuvent Technologies Pvt. Ltd.</h1>
          <p>Salary Revision Letter</p>
        </div>

        <p class="date">Date: ${new Date().toLocaleDateString()}</p>

        <p>Dear <strong>${employeeName}</strong>,</p>

        <div class="content">
          <p>We are pleased to inform you that based on your performance and contributions to the organization,
          your compensation has been revised effective <strong>${effectiveDate.toLocaleDateString()}</strong>.</p>

          <table class="salary-table">
            <tr><td class="label">Employee Code</td><td class="value">${employee.employeeCode}</td></tr>
            <tr><td class="label">Department</td><td class="value">${employee.department}</td></tr>
            <tr><td class="label">Designation</td><td class="value">${employee.designation}</td></tr>
            <tr><td class="label">Previous CTC (Annual)</td><td class="value">₹${currentSalary.toLocaleString("en-IN")}</td></tr>
            <tr><td class="label">Increment</td><td class="value">${incrementPercentage}% (₹${incrementAmount.toLocaleString("en-IN")})</td></tr>
            <tr><td class="label new-salary">Revised CTC (Annual)</td><td class="value new-salary">₹${newSalary.toLocaleString("en-IN")}</td></tr>
            <tr><td class="label">Effective Date</td><td class="value">${effectiveDate.toLocaleDateString()}</td></tr>
          </table>

          <p>We appreciate your hard work and look forward to your continued contributions.</p>
          <p>Warm regards,</p>
        </div>

        <div class="signature">
          <div class="sig-line">HR Manager<br/>Circuvent Technologies</div>
        </div>

        <p class="confidential">CONFIDENTIAL — This document is for the addressee only.</p>
      </body>
      </html>
    `;

    await prisma.generatedDocument.create({
      data: {
        name: `Increment Letter — ${employee.employeeCode}`,
        category: "INCREMENT_LETTER",
        entityType: "IncrementLetter",
        entityId: employeeId,
        generatedBy: "SYSTEM",
        format: "HTML",
        content: html,
        data: {
          currentSalary,
          newSalary,
          incrementPercentage,
          incrementAmount,
          effectiveDate: effectiveDate.toISOString(),
        } as any,
      },
    });

    return html;
  }

  // ── Private Helpers ──

  private static validateScores(scores: ReviewScores): void {
    const keys: (keyof ReviewScores)[] = ["technical", "communication", "leadership", "initiative"];
    for (const key of keys) {
      const val = scores[key];
      if (val !== undefined && (val < 1 || val > 5)) {
        throw new Error(`${key} score must be between 1 and 5`);
      }
    }
  }

  private static computeOverallRating(scores: ReviewScores): number {
    const values = [
      scores.technical,
      scores.communication,
      scores.leadership,
      scores.initiative,
      scores.teamwork,
      scores.innovation,
    ].filter((v): v is number => v !== undefined);

    if (values.length === 0) return 0;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  private static getCurrentPeriod(): string {
    const now = new Date();
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return `FY${fy}-${String(fy + 1).slice(-2)}`;
  }
}
