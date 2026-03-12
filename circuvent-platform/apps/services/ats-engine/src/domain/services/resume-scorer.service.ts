// ══════════════════════════════════════════════════════════════════════════════
// ATS Engine — Resume Scorer Domain Service
// Scores candidates against job descriptions using:
// 1. Contextual Keyword Density — weighted skill matching
// 2. Experience Relevance — years + role alignment
// 3. Education Scoring — degree relevance
// 4. Additional Signals — certifications, projects, portfolio
//
// Pure domain logic — no external dependencies.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Job requirements for scoring.
 */
export interface JobRequirements {
  title: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  experienceMin: number;
  experienceMax: number | null;
  division: string;
  description: string;
}

/**
 * Candidate profile for scoring.
 */
export interface CandidateProfile {
  skills: string[];
  experienceYears: number;
  currentRole: string | null;
  education: Array<{ degree: string; institution: string; year: number; grade?: string }> | null;
  resumeText: string | null;
  certifications?: string[];
  portfolioUrl?: string | null;
  githubUrl?: string | null;
}

/**
 * Detailed scoring breakdown.
 */
export interface ScoreBreakdown {
  /** Overall ATS score (0-100) */
  totalScore: number;
  /** Skill match percentage (0-100) */
  skillMatchScore: number;
  /** Experience relevance (0-100) */
  experienceScore: number;
  /** Education relevance (0-100) */
  educationScore: number;
  /** Keyword density in resume (0-100) */
  keywordDensityScore: number;
  /** Bonus points from certifications, portfolio, etc. */
  bonusScore: number;
  /** Individual skill matches */
  matchedSkills: string[];
  /** Required skills not found */
  missingSkills: string[];
  /** Nice-to-have skills matched */
  bonusSkills: string[];
  /** Suggested talent pool tags */
  suggestedTags: string[];
  /** Priority recommendation */
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Human-readable assessment summary */
  summary: string;
}

/** Weights for each scoring component */
const WEIGHTS = {
  skillMatch: 0.35,
  experience: 0.25,
  keywordDensity: 0.20,
  education: 0.10,
  bonus: 0.10,
};

/** High-value skill categories for an AI-IoT company */
const SKILL_TIERS: Record<string, number> = {
  // Tier 1: Core (weight 1.5x)
  typescript: 1.5, python: 1.5, rust: 1.5, "c++": 1.5,
  pytorch: 1.5, tensorflow: 1.5, esp32: 1.5, mqtt: 1.5,
  prisma: 1.3, react: 1.3, "next.js": 1.3, node: 1.3,
  // Tier 2: Valuable (weight 1.2x)
  kubernetes: 1.2, docker: 1.2, aws: 1.2, postgresql: 1.2,
  redis: 1.2, graphql: 1.2, "ci/cd": 1.2, kafka: 1.2,
  // Tier 3: Standard (weight 1.0x) — default
};

/**
 * Resume Scorer Domain Service.
 *
 * Business Rules:
 * 1. Required skills are worth 2x nice-to-have skills
 * 2. Experience within the ideal range scores 100%; over/under scores proportionally
 * 3. Technical degrees (CS, ECE, EE) score higher for engineering roles
 * 4. Keywords from the job description found in resume text increase density score
 * 5. Certifications, portfolio, and GitHub add bonus points
 *
 * @example
 * ```ts
 * const scorer = new ResumeScorerService();
 * const result = scorer.score(jobRequirements, candidateProfile);
 * console.log(result.totalScore);      // 82.5
 * console.log(result.priority);        // "HIGH"
 * console.log(result.suggestedTags);   // ["IoT Expert", "High Priority"]
 * ```
 */
export class ResumeScorerService {

  /**
   * Scores a candidate against a job posting.
   *
   * @param job The job requirements
   * @param candidate The candidate profile
   * @returns Detailed score breakdown
   */
  score(job: JobRequirements, candidate: CandidateProfile): ScoreBreakdown {
    const skillResult = this.scoreSkills(job.requiredSkills, job.niceToHaveSkills, candidate.skills);
    const experienceScore = this.scoreExperience(job.experienceMin, job.experienceMax, candidate.experienceYears, candidate.currentRole, job.title);
    const educationScore = this.scoreEducation(candidate.education, job.division);
    const keywordDensityScore = this.scoreKeywordDensity(job.description, job.requiredSkills, candidate.resumeText);
    const bonusScore = this.scoreBonuses(candidate);

    const totalScore = Math.min(100, Math.round(
      skillResult.score * WEIGHTS.skillMatch +
      experienceScore * WEIGHTS.experience +
      keywordDensityScore * WEIGHTS.keywordDensity +
      educationScore * WEIGHTS.education +
      bonusScore * WEIGHTS.bonus
    ));

    const priority = this.determinePriority(totalScore, skillResult.matchPct, candidate.experienceYears, job.experienceMin);
    const suggestedTags = this.generateTags(job, candidate, totalScore, skillResult);
    const summary = this.generateSummary(job, candidate, totalScore, skillResult, priority);

    return {
      totalScore,
      skillMatchScore: Math.round(skillResult.score),
      experienceScore: Math.round(experienceScore),
      educationScore: Math.round(educationScore),
      keywordDensityScore: Math.round(keywordDensityScore),
      bonusScore: Math.round(bonusScore),
      matchedSkills: skillResult.matched,
      missingSkills: skillResult.missing,
      bonusSkills: skillResult.bonusMatched,
      suggestedTags,
      priority,
      summary,
    };
  }

  /**
   * Batch-scores multiple candidates against a job.
   * Returns ranked results (highest score first).
   */
  batchScore(job: JobRequirements, candidates: CandidateProfile[]): Array<ScoreBreakdown & { candidateIndex: number }> {
    return candidates
      .map((c, i) => ({ ...this.score(job, c), candidateIndex: i }))
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  // ── Skill Scoring ─────────────────────────────────────────────────────────

  private scoreSkills(required: string[], niceToHave: string[], candidateSkills: string[]): {
    score: number; matchPct: number; matched: string[]; missing: string[]; bonusMatched: string[];
  } {
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[.\-\/]/g, "");
    const candidateNorm = candidateSkills.map(normalize);

    const matched: string[] = [];
    const missing: string[] = [];
    let requiredScore = 0;
    let maxRequiredScore = 0;

    for (const skill of required) {
      const norm = normalize(skill);
      const tier = SKILL_TIERS[norm] || 1.0;
      const weight = 2.0 * tier; // Required = 2x weight
      maxRequiredScore += weight;

      if (candidateNorm.some(cs => cs.includes(norm) || norm.includes(cs))) {
        matched.push(skill);
        requiredScore += weight;
      } else {
        missing.push(skill);
      }
    }

    const bonusMatched: string[] = [];
    let nthScore = 0;
    let maxNthScore = 0;

    for (const skill of niceToHave) {
      const norm = normalize(skill);
      const tier = SKILL_TIERS[norm] || 1.0;
      maxNthScore += tier;

      if (candidateNorm.some(cs => cs.includes(norm) || norm.includes(cs))) {
        bonusMatched.push(skill);
        nthScore += tier;
      }
    }

    const totalMax = maxRequiredScore + maxNthScore;
    const totalActual = requiredScore + nthScore;
    const score = totalMax > 0 ? (totalActual / totalMax) * 100 : 0;
    const matchPct = required.length > 0 ? (matched.length / required.length) * 100 : 100;

    return { score: Math.min(100, score), matchPct, matched, missing, bonusMatched };
  }

  // ── Experience Scoring ────────────────────────────────────────────────────

  private scoreExperience(minYears: number, maxYears: number | null, candidateYears: number, currentRole: string | null, jobTitle: string): number {
    let score = 0;

    // Years of experience scoring
    const max = maxYears ?? minYears + 5;
    if (candidateYears >= minYears && candidateYears <= max) {
      score = 100; // Sweet spot
    } else if (candidateYears < minYears) {
      const deficit = minYears - candidateYears;
      score = Math.max(0, 100 - deficit * 20); // -20 per year short
    } else {
      const excess = candidateYears - max;
      score = Math.max(60, 100 - excess * 5); // Slightly overqualified
    }

    // Role alignment bonus (up to +15)
    if (currentRole && jobTitle) {
      const roleWords = jobTitle.toLowerCase().split(/[\s\-\/]+/);
      const currentWords = currentRole.toLowerCase().split(/[\s\-\/]+/);
      const overlap = roleWords.filter(w => currentWords.some(cw => cw.includes(w) || w.includes(cw)));
      score = Math.min(100, score + overlap.length * 5);
    }

    return score;
  }

  // ── Education Scoring ─────────────────────────────────────────────────────

  private scoreEducation(education: CandidateProfile["education"], division: string): number {
    if (!education || education.length === 0) return 30; // No education info

    const technicalDegrees = ["computer science", "cs", "ece", "electronics", "electrical", "information technology", "it", "mechanical", "ai", "data science"];
    const premierInstitutions = ["iit", "nit", "bits", "iiit", "iisc", "mit", "stanford", "cmu"];

    let score = 50; // Base for having education info

    for (const edu of education) {
      const degree = edu.degree.toLowerCase();
      const inst = edu.institution.toLowerCase();

      // Technical degree bonus for engineering divisions
      if (["AI_ML", "IOT_EMBEDDED", "FULL_STACK", "DEVOPS", "DATA_SCIENCE"].includes(division)) {
        if (technicalDegrees.some(td => degree.includes(td))) score += 20;
      }

      // Masters/PhD bonus
      if (degree.includes("m.tech") || degree.includes("mtech") || degree.includes("ms") || degree.includes("master")) score += 10;
      if (degree.includes("phd") || degree.includes("doctorate")) score += 15;

      // Premier institution
      if (premierInstitutions.some(pi => inst.includes(pi))) score += 15;

      // Good grade
      if (edu.grade) {
        const grade = edu.grade.toLowerCase();
        if (grade.includes("distinction") || grade.includes("gold") || parseFloat(grade) >= 8.5) score += 10;
      }
    }

    return Math.min(100, score);
  }

  // ── Keyword Density ───────────────────────────────────────────────────────

  private scoreKeywordDensity(jobDescription: string, requiredSkills: string[], resumeText: string | null): number {
    if (!resumeText) return 0;

    const resumeLower = resumeText.toLowerCase();
    const jobWords = [...jobDescription.toLowerCase().split(/\s+/), ...requiredSkills.map(s => s.toLowerCase())];
    const uniqueKeywords = [...new Set(jobWords.filter(w => w.length > 3))];

    let foundCount = 0;
    for (const keyword of uniqueKeywords) {
      if (resumeLower.includes(keyword)) foundCount++;
    }

    const density = uniqueKeywords.length > 0 ? (foundCount / uniqueKeywords.length) * 100 : 0;
    return Math.min(100, density * 1.5); // Scale up since not all keywords will match
  }

  // ── Bonus Scoring ─────────────────────────────────────────────────────────

  private scoreBonuses(candidate: CandidateProfile): number {
    let bonus = 0;

    if (candidate.portfolioUrl) bonus += 25;
    if (candidate.githubUrl) bonus += 20;
    if (candidate.certifications && candidate.certifications.length > 0) {
      bonus += Math.min(40, candidate.certifications.length * 15);
    }

    return Math.min(100, bonus);
  }

  // ── Priority & Tags ───────────────────────────────────────────────────────

  private determinePriority(totalScore: number, skillMatchPct: number, candidateExp: number, requiredExp: number): ScoreBreakdown["priority"] {
    if (totalScore >= 80 && skillMatchPct >= 80) return "CRITICAL";
    if (totalScore >= 65 && skillMatchPct >= 60) return "HIGH";
    if (totalScore >= 45) return "MEDIUM";
    return "LOW";
  }

  private generateTags(
    job: JobRequirements, candidate: CandidateProfile, score: number,
    skillResult: { matched: string[]; bonusMatched: string[] },
  ): string[] {
    const tags: string[] = [];

    if (score >= 85) tags.push("Top Candidate");
    if (score >= 70) tags.push("High Priority");

    // Division-specific tags
    const iotSkills = ["esp32", "mqtt", "embedded", "firmware", "rtos", "stm32", "arduino"];
    const aiSkills = ["pytorch", "tensorflow", "ml", "deep learning", "nlp", "computer vision"];
    const devopsSkills = ["kubernetes", "docker", "terraform", "ci/cd", "aws", "gcp"];

    const allMatched = [...skillResult.matched, ...skillResult.bonusMatched].map(s => s.toLowerCase());

    if (allMatched.some(s => iotSkills.some(is => s.includes(is)))) tags.push("IoT Expert");
    if (allMatched.some(s => aiSkills.some(as => s.includes(as)))) tags.push("AI/ML Specialist");
    if (allMatched.some(s => devopsSkills.some(ds => s.includes(ds)))) tags.push("DevOps Pro");

    if (candidate.experienceYears >= 8) tags.push("Senior");
    if (candidate.experienceYears <= 2 && candidate.experienceYears > 0) tags.push("Early Career");

    return tags;
  }

  private generateSummary(
    job: JobRequirements, candidate: CandidateProfile, score: number,
    skillResult: { matchPct: number; matched: string[]; missing: string[] },
    priority: string,
  ): string {
    const parts: string[] = [];

    parts.push(`Overall ATS Score: ${score}/100 (${priority} priority).`);
    parts.push(`Skills: ${skillResult.matched.length} matched, ${skillResult.missing.length} missing.`);

    if (skillResult.missing.length > 0) {
      parts.push(`Missing: ${skillResult.missing.slice(0, 3).join(", ")}${skillResult.missing.length > 3 ? ` (+${skillResult.missing.length - 3} more)` : ""}.`);
    }

    parts.push(`Experience: ${candidate.experienceYears}y (required: ${job.experienceMin}+).`);

    if (score >= 75) parts.push("Strong candidate — recommend for screening.");
    else if (score >= 50) parts.push("Moderate match — review skills gap.");
    else parts.push("Below threshold — consider for other roles or talent pool.");

    return parts.join(" ");
  }
}
