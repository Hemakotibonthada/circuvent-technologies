// ══════════════════════════════════════════════════════════════════════════════
// Unit Tests — Resume Scorer Service
// Tests skill matching, experience scoring, keyword density, tagging.
// ══════════════════════════════════════════════════════════════════════════════

import { ResumeScorerService, JobRequirements, CandidateProfile } from "../../../src/domain/services/resume-scorer.service";

const scorer = new ResumeScorerService();

const baseJob: JobRequirements = {
  title: "Senior IoT Engineer",
  requiredSkills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"],
  niceToHaveSkills: ["Prisma", "Docker", "Kubernetes", "Python"],
  experienceMin: 3,
  experienceMax: 8,
  division: "IOT_EMBEDDED",
  description: "Build IoT firmware and cloud infrastructure for sensor networks using TypeScript and ESP32 microcontrollers.",
};

describe("ResumeScorerService", () => {
  describe("Skill Matching", () => {
    it("should score high for perfect skill match", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL", "Prisma", "Docker"],
        experienceYears: 5, currentRole: "IoT Developer",
        education: [{ degree: "B.Tech Computer Science", institution: "NIT", year: 2021 }],
        resumeText: "Experienced IoT developer with TypeScript ESP32 MQTT expertise",
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.skillMatchScore).toBeGreaterThan(70);
      expect(result.matchedSkills).toContain("TypeScript");
      expect(result.matchedSkills).toContain("ESP32");
      expect(result.missingSkills.length).toBe(0);
    });

    it("should identify missing skills", () => {
      const candidate: CandidateProfile = {
        skills: ["Python", "Django"], experienceYears: 3,
        currentRole: null, education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.missingSkills.length).toBeGreaterThan(0);
      expect(result.missingSkills).toContain("TypeScript");
      expect(result.missingSkills).toContain("ESP32");
    });

    it("should give bonus for nice-to-have skills", () => {
      const withBonus: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL", "Prisma", "Docker", "Kubernetes"],
        experienceYears: 5, currentRole: null, education: null, resumeText: null,
      };
      const withoutBonus: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"],
        experienceYears: 5, currentRole: null, education: null, resumeText: null,
      };
      const scoreWith = scorer.score(baseJob, withBonus);
      const scoreWithout = scorer.score(baseJob, withoutBonus);
      expect(scoreWith.totalScore).toBeGreaterThan(scoreWithout.totalScore);
      expect(scoreWith.bonusSkills.length).toBeGreaterThan(0);
    });
  });

  describe("Experience Scoring", () => {
    it("should score 100% for experience in ideal range", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"],
        experienceYears: 5, currentRole: "IoT Engineer",
        education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.experienceScore).toBeGreaterThanOrEqual(90);
    });

    it("should penalize insufficient experience", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"],
        experienceYears: 1, currentRole: null,
        education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.experienceScore).toBeLessThan(80);
    });

    it("should slightly penalize overqualification", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"],
        experienceYears: 15, currentRole: null,
        education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.experienceScore).toBeGreaterThan(50); // Not severely penalized
      expect(result.experienceScore).toBeLessThan(100); // But not perfect
    });
  });

  describe("Keyword Density", () => {
    it("should score high for resume with relevant keywords", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript"], experienceYears: 4, currentRole: null,
        education: null,
        resumeText: "I have extensive experience with TypeScript and ESP32 microcontrollers. I've built IoT firmware and cloud infrastructure for sensor networks. Proficient in MQTT protocol, Node.js backends, and PostgreSQL databases.",
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.keywordDensityScore).toBeGreaterThan(40);
    });

    it("should score 0 for missing resume text", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript"], experienceYears: 4, currentRole: null,
        education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.keywordDensityScore).toBe(0);
    });
  });

  describe("Priority Determination", () => {
    it("should assign CRITICAL priority for top candidates", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL", "Prisma", "Docker"],
        experienceYears: 5, currentRole: "Senior IoT Engineer",
        education: [{ degree: "M.Tech ECE", institution: "IIT Bombay", year: 2019, grade: "9.2" }],
        resumeText: "Senior IoT Engineer with TypeScript ESP32 MQTT Node.js PostgreSQL experience",
        portfolioUrl: "https://portfolio.example.com", githubUrl: "https://github.com/example",
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.priority).toBe("CRITICAL");
    });

    it("should assign LOW priority for weak matches", () => {
      const candidate: CandidateProfile = {
        skills: ["Java", "Spring Boot"], experienceYears: 1,
        currentRole: "Junior Backend Dev", education: null,
        resumeText: "Java Spring Boot developer with 1 year experience",
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.priority).toBe("LOW");
    });
  });

  describe("Tag Generation", () => {
    it("should tag IoT expert for IoT skills", () => {
      const candidate: CandidateProfile = {
        skills: ["ESP32", "MQTT", "firmware", "embedded C"],
        experienceYears: 6, currentRole: null, education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.suggestedTags).toContain("IoT Expert");
    });

    it("should tag Senior for 8+ years", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript"], experienceYears: 10,
        currentRole: null, education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.suggestedTags).toContain("Senior");
    });
  });

  describe("Batch Scoring", () => {
    it("should rank candidates by score (descending)", () => {
      const candidates: CandidateProfile[] = [
        { skills: ["Java"], experienceYears: 1, currentRole: null, education: null, resumeText: null },
        { skills: ["TypeScript", "ESP32", "MQTT", "Node.js", "PostgreSQL"], experienceYears: 5, currentRole: "IoT Engineer", education: null, resumeText: "TypeScript ESP32 MQTT" },
        { skills: ["TypeScript", "Python"], experienceYears: 3, currentRole: null, education: null, resumeText: null },
      ];
      const results = scorer.batchScore(baseJob, candidates);
      expect(results[0].candidateIndex).toBe(1); // Best match first
      expect(results[0].totalScore).toBeGreaterThan(results[1].totalScore);
      expect(results[1].totalScore).toBeGreaterThan(results[2].totalScore);
    });
  });

  describe("Summary Generation", () => {
    it("should generate a human-readable summary", () => {
      const candidate: CandidateProfile = {
        skills: ["TypeScript", "ESP32"], experienceYears: 4,
        currentRole: null, education: null, resumeText: null,
      };
      const result = scorer.score(baseJob, candidate);
      expect(result.summary).toContain("ATS Score");
      expect(result.summary.length).toBeGreaterThan(50);
    });
  });
});
