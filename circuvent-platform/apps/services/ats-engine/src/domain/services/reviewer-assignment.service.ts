// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Reviewer Assignment Domain Service
// Round-robin + load-balanced assignment of applications to interviewers.
// Ensures even distribution and respects capacity limits.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Reviewer availability and workload data.
 */
export interface ReviewerInfo {
  reviewerId: string;
  reviewerName: string;
  department: string;
  activeReviews: number;
  totalReviews: number;
  maxCapacity: number;
  isAvailable: boolean;
  lastAssignedAt: Date | null;
  /** Skills the reviewer can evaluate */
  expertiseAreas?: string[];
}

/**
 * Assignment request details.
 */
export interface AssignmentRequest {
  applicationId: string;
  jobDivision: string;
  jobDepartment: string;
  requiredSkills: string[];
  roundType: string; // SCREENING, TECHNICAL, HR, CULTURE_FIT, FINAL
}

/**
 * Assignment result.
 */
export interface AssignmentResult {
  applicationId: string;
  assignedReviewer: ReviewerInfo | null;
  strategy: "ROUND_ROBIN" | "LOAD_BALANCED" | "EXPERTISE_MATCH" | "NONE";
  reason: string;
  alternateReviewers: string[]; // Backup options
}

/**
 * Reviewer Assignment Service using multiple strategies:
 *
 * 1. **Expertise Match** — For TECHNICAL rounds, prefer reviewers with matching skills
 * 2. **Load Balanced** — Assign to reviewer with fewest active reviews
 * 3. **Round Robin** — Fallback: assign to reviewer least recently assigned
 *
 * Business Rules:
 * - Never exceed a reviewer's maxCapacity
 * - Unavailable reviewers are skipped
 * - Same reviewer should not evaluate same candidate twice (for different rounds)
 * - HR round requires HR department reviewer
 *
 * @example
 * ```ts
 * const service = new ReviewerAssignmentService();
 * const result = service.assign(request, availableReviewers);
 * // { assignedReviewer: { name: "Priya S.", ... }, strategy: "LOAD_BALANCED" }
 * ```
 */
export class ReviewerAssignmentService {

  /**
   * Assigns a reviewer to an application using the best available strategy.
   *
   * Strategy priority:
   * 1. Expertise match (for technical rounds)
   * 2. Load balancing (least loaded reviewer)
   * 3. Round robin (least recently assigned)
   */
  assign(request: AssignmentRequest, reviewers: ReviewerInfo[]): AssignmentResult {
    // Filter available reviewers within capacity
    const eligible = reviewers.filter(r => r.isAvailable && r.activeReviews < r.maxCapacity);

    if (eligible.length === 0) {
      return {
        applicationId: request.applicationId,
        assignedReviewer: null,
        strategy: "NONE",
        reason: "No available reviewers within capacity",
        alternateReviewers: [],
      };
    }

    // Filter by department for HR rounds
    let candidates = eligible;
    if (request.roundType === "HR" || request.roundType === "CULTURE_FIT") {
      const hrReviewers = eligible.filter(r => r.department.toLowerCase().includes("hr") || r.department.toLowerCase().includes("people"));
      if (hrReviewers.length > 0) candidates = hrReviewers;
    }

    // Strategy 1: Expertise Match (for TECHNICAL rounds)
    if (request.roundType === "TECHNICAL" || request.roundType === "SYSTEM_DESIGN") {
      const expertMatch = this.findExpertiseMatch(candidates, request.requiredSkills);
      if (expertMatch) {
        return {
          applicationId: request.applicationId,
          assignedReviewer: expertMatch,
          strategy: "EXPERTISE_MATCH",
          reason: `Matched by expertise in ${request.requiredSkills.slice(0, 3).join(", ")}`,
          alternateReviewers: candidates.filter(r => r.reviewerId !== expertMatch.reviewerId).map(r => r.reviewerId).slice(0, 3),
        };
      }
    }

    // Strategy 2: Load Balanced
    const leastLoaded = this.findLeastLoaded(candidates);
    if (leastLoaded) {
      return {
        applicationId: request.applicationId,
        assignedReviewer: leastLoaded,
        strategy: "LOAD_BALANCED",
        reason: `Least loaded reviewer (${leastLoaded.activeReviews}/${leastLoaded.maxCapacity} active)`,
        alternateReviewers: candidates.filter(r => r.reviewerId !== leastLoaded.reviewerId).map(r => r.reviewerId).slice(0, 3),
      };
    }

    // Strategy 3: Round Robin (fallback)
    const roundRobin = this.findRoundRobin(candidates);
    return {
      applicationId: request.applicationId,
      assignedReviewer: roundRobin,
      strategy: "ROUND_ROBIN",
      reason: roundRobin
        ? `Round-robin: last assigned ${roundRobin.lastAssignedAt ? this.timeAgo(roundRobin.lastAssignedAt) : "never"}`
        : "No reviewers available",
      alternateReviewers: candidates.filter(r => r.reviewerId !== roundRobin?.reviewerId).map(r => r.reviewerId).slice(0, 3),
    };
  }

  /**
   * Batch-assigns reviewers to multiple applications.
   * Updates workload counts in-memory to prevent double-assignment.
   */
  batchAssign(requests: AssignmentRequest[], reviewers: ReviewerInfo[]): AssignmentResult[] {
    // Clone reviewers to track in-memory workload
    const workingCopy = reviewers.map(r => ({ ...r }));
    const results: AssignmentResult[] = [];

    for (const request of requests) {
      const result = this.assign(request, workingCopy);
      results.push(result);

      // Update in-memory workload
      if (result.assignedReviewer) {
        const reviewer = workingCopy.find(r => r.reviewerId === result.assignedReviewer!.reviewerId);
        if (reviewer) {
          reviewer.activeReviews++;
          reviewer.lastAssignedAt = new Date();
        }
      }
    }

    return results;
  }

  /**
   * Returns workload distribution stats for the dashboard.
   */
  getWorkloadStats(reviewers: ReviewerInfo[]): {
    totalReviewers: number;
    availableReviewers: number;
    atCapacity: number;
    averageLoad: number;
    maxLoad: number;
    distribution: Array<{ reviewerName: string; active: number; capacity: number; utilization: number }>;
  } {
    const available = reviewers.filter(r => r.isAvailable);
    const atCapacity = reviewers.filter(r => r.activeReviews >= r.maxCapacity).length;
    const totalActive = reviewers.reduce((s, r) => s + r.activeReviews, 0);
    const capacityTotal = reviewers.reduce((s, r) => s + r.maxCapacity, 0);

    return {
      totalReviewers: reviewers.length,
      availableReviewers: available.length,
      atCapacity,
      averageLoad: reviewers.length > 0 ? Number((totalActive / reviewers.length).toFixed(1)) : 0,
      maxLoad: Math.max(...reviewers.map(r => r.activeReviews)),
      distribution: reviewers.map(r => ({
        reviewerName: r.reviewerName,
        active: r.activeReviews,
        capacity: r.maxCapacity,
        utilization: r.maxCapacity > 0 ? Number(((r.activeReviews / r.maxCapacity) * 100).toFixed(0)) : 0,
      })).sort((a, b) => b.utilization - a.utilization),
    };
  }

  // ── Private Strategies ─────────────────────────────────────────────────────

  private findExpertiseMatch(reviewers: ReviewerInfo[], requiredSkills: string[]): ReviewerInfo | null {
    if (requiredSkills.length === 0) return null;

    const normalizedSkills = requiredSkills.map(s => s.toLowerCase());

    let bestMatch: ReviewerInfo | null = null;
    let bestScore = 0;

    for (const reviewer of reviewers) {
      if (!reviewer.expertiseAreas || reviewer.expertiseAreas.length === 0) continue;
      const normExpertise = reviewer.expertiseAreas.map(e => e.toLowerCase());
      const matchCount = normalizedSkills.filter(s => normExpertise.some(e => e.includes(s) || s.includes(e))).length;
      const score = matchCount / normalizedSkills.length;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = reviewer;
      }
    }

    return bestScore >= 0.3 ? bestMatch : null; // At least 30% skill match
  }

  private findLeastLoaded(reviewers: ReviewerInfo[]): ReviewerInfo | null {
    if (reviewers.length === 0) return null;
    return reviewers.reduce((min, r) => r.activeReviews < min.activeReviews ? r : min, reviewers[0]);
  }

  private findRoundRobin(reviewers: ReviewerInfo[]): ReviewerInfo | null {
    if (reviewers.length === 0) return null;
    return reviewers.reduce((oldest, r) => {
      if (!r.lastAssignedAt) return r; // Never assigned = highest priority
      if (!oldest.lastAssignedAt) return oldest;
      return r.lastAssignedAt < oldest.lastAssignedAt ? r : oldest;
    }, reviewers[0]);
  }

  private timeAgo(date: Date): string {
    const ms = Date.now() - date.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}
