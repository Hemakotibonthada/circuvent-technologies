// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Pool Assignment Domain Service
// Automatically routes candidates to talent pools based on configurable
// rules: skill match, experience level, source, and division fit.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Talent pool definition with auto-assignment rules.
 */
export interface TalentPoolRule {
  poolId: string;
  poolName: string;
  category: string;
  division: string | null;
  rules: {
    /** Skills that trigger pool assignment (ANY match) */
    skills?: string[];
    /** Minimum experience years */
    minExperience?: number;
    /** Maximum experience years */
    maxExperience?: number;
    /** Candidate sources to match */
    sources?: string[];
    /** Minimum ATS score */
    minScore?: number;
    /** Tags that trigger assignment */
    tags?: string[];
  };
}

/**
 * Candidate data for pool matching.
 */
export interface PoolCandidate {
  candidateId: string;
  skills: string[];
  experienceYears: number;
  source: string;
  atsScore: number;
  tags: string[];
}

/**
 * Pool assignment result.
 */
export interface PoolAssignmentResult {
  candidateId: string;
  assignedPools: Array<{
    poolId: string;
    poolName: string;
    category: string;
    matchReason: string;
    priority: string;
  }>;
  /** Pools the candidate was NOT assigned to and why */
  rejectedPools: Array<{ poolId: string; poolName: string; reason: string }>;
}

/**
 * Pool Assignment Domain Service.
 *
 * Business Rules:
 * 1. A candidate can belong to multiple pools simultaneously
 * 2. Pool assignment is based on OR logic for skills (any skill match triggers)
 * 3. Experience and score thresholds are AND conditions (must meet all)
 * 4. High-scoring candidates (85+) are auto-tagged "High Priority"
 * 5. Candidates with niche IoT/AI skills get tagged for specialist pools
 *
 * @example
 * ```ts
 * const service = new PoolAssignmentService();
 * const result = service.assignToPool(candidate, poolRules);
 * // result.assignedPools = [{ poolName: "IoT Firmware", ... }]
 * ```
 */
export class PoolAssignmentService {

  /**
   * Evaluates a candidate against all pool rules and returns assignments.
   */
  assignToPool(candidate: PoolCandidate, pools: TalentPoolRule[]): PoolAssignmentResult {
    const assignedPools: PoolAssignmentResult["assignedPools"] = [];
    const rejectedPools: PoolAssignmentResult["rejectedPools"] = [];

    for (const pool of pools) {
      const { matches, reasons, rejectReasons } = this.evaluateRule(candidate, pool);

      if (matches) {
        assignedPools.push({
          poolId: pool.poolId,
          poolName: pool.poolName,
          category: pool.category,
          matchReason: reasons.join("; "),
          priority: this.determinePriority(candidate.atsScore, candidate.experienceYears),
        });
      } else {
        rejectedPools.push({
          poolId: pool.poolId,
          poolName: pool.poolName,
          reason: rejectReasons.join("; "),
        });
      }
    }

    return { candidateId: candidate.candidateId, assignedPools, rejectedPools };
  }

  /**
   * Batch-assigns multiple candidates to pools.
   */
  batchAssign(candidates: PoolCandidate[], pools: TalentPoolRule[]): PoolAssignmentResult[] {
    return candidates.map(c => this.assignToPool(c, pools));
  }

  /**
   * Suggests which pools should be created based on unmatched candidates.
   */
  suggestNewPools(
    unassignedCandidates: PoolCandidate[],
  ): Array<{ suggestedName: string; reason: string; candidateCount: number }> {
    const skillCounts = new Map<string, number>();
    for (const c of unassignedCandidates) {
      for (const skill of c.skills) {
        const norm = skill.toLowerCase();
        skillCounts.set(norm, (skillCounts.get(norm) || 0) + 1);
      }
    }

    const suggestions: Array<{ suggestedName: string; reason: string; candidateCount: number }> = [];
    for (const [skill, count] of skillCounts) {
      if (count >= 3) {
        suggestions.push({
          suggestedName: `${skill.charAt(0).toUpperCase() + skill.slice(1)} Specialists`,
          reason: `${count} unassigned candidates have "${skill}" skill`,
          candidateCount: count,
        });
      }
    }

    return suggestions.sort((a, b) => b.candidateCount - a.candidateCount).slice(0, 5);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private evaluateRule(
    candidate: PoolCandidate,
    pool: TalentPoolRule,
  ): { matches: boolean; reasons: string[]; rejectReasons: string[] } {
    const reasons: string[] = [];
    const rejectReasons: string[] = [];
    const rules = pool.rules;
    let hasMatchCriteria = false;
    let critical = true; // All AND conditions must pass

    // Skill match (OR — any skill triggers)
    if (rules.skills && rules.skills.length > 0) {
      hasMatchCriteria = true;
      const norm = candidate.skills.map(s => s.toLowerCase());
      const matched = rules.skills.filter(rs => norm.some(cs => cs.includes(rs.toLowerCase()) || rs.toLowerCase().includes(cs)));
      if (matched.length > 0) {
        reasons.push(`Skills: ${matched.join(", ")}`);
      } else {
        rejectReasons.push(`No skill match (needs: ${rules.skills.join(", ")})`);
        critical = false;
      }
    }

    // Experience (AND — must meet range)
    if (rules.minExperience !== undefined) {
      hasMatchCriteria = true;
      if (candidate.experienceYears >= rules.minExperience) {
        reasons.push(`Experience: ${candidate.experienceYears}y >= ${rules.minExperience}y`);
      } else {
        rejectReasons.push(`Experience too low (${candidate.experienceYears}y < ${rules.minExperience}y)`);
        critical = false;
      }
    }

    if (rules.maxExperience !== undefined && candidate.experienceYears > rules.maxExperience) {
      rejectReasons.push(`Experience too high (${candidate.experienceYears}y > ${rules.maxExperience}y)`);
      critical = false;
    }

    // Source match
    if (rules.sources && rules.sources.length > 0) {
      hasMatchCriteria = true;
      if (rules.sources.includes(candidate.source)) {
        reasons.push(`Source: ${candidate.source}`);
      } else {
        rejectReasons.push(`Source mismatch (${candidate.source} not in ${rules.sources.join(", ")})`);
        critical = false;
      }
    }

    // Minimum ATS score
    if (rules.minScore !== undefined) {
      hasMatchCriteria = true;
      if (candidate.atsScore >= rules.minScore) {
        reasons.push(`ATS Score: ${candidate.atsScore} >= ${rules.minScore}`);
      } else {
        rejectReasons.push(`ATS score below threshold (${candidate.atsScore} < ${rules.minScore})`);
        critical = false;
      }
    }

    // Tag match
    if (rules.tags && rules.tags.length > 0) {
      hasMatchCriteria = true;
      const matched = rules.tags.filter(t => candidate.tags.some(ct => ct.toLowerCase() === t.toLowerCase()));
      if (matched.length > 0) {
        reasons.push(`Tags: ${matched.join(", ")}`);
      }
    }

    // Must have at least one match criterion
    if (!hasMatchCriteria) {
      return { matches: false, reasons: [], rejectReasons: ["No assignment rules defined"] };
    }

    return { matches: critical && reasons.length > 0, reasons, rejectReasons };
  }

  private determinePriority(atsScore: number, experience: number): string {
    if (atsScore >= 85) return "CRITICAL";
    if (atsScore >= 70 || experience >= 8) return "HIGH";
    if (atsScore >= 50) return "NORMAL";
    return "LOW";
  }
}
