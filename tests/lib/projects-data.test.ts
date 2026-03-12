import {
  projects,
  getProjectsByCategory,
  getFeaturedProjects,
  stats,
  type Project,
} from "@/lib/projects-data";

describe("Projects Data", () => {
  describe("projects array", () => {
    it("has at least 20 projects", () => {
      expect(projects.length).toBeGreaterThanOrEqual(20);
    });

    it("every project has required fields", () => {
      projects.forEach((project) => {
        expect(project.id).toBeTruthy();
        expect(project.name).toBeTruthy();
        expect(project.tagline).toBeTruthy();
        expect(project.description).toBeTruthy();
        expect(project.category).toBeTruthy();
        expect(project.techStack.length).toBeGreaterThan(0);
        expect(project.impactScore).toBeGreaterThanOrEqual(0);
        expect(project.impactScore).toBeLessThanOrEqual(100);
        expect(["production", "beta", "alpha", "concept"]).toContain(project.status);
        expect(project.icon).toBeTruthy();
        expect(project.gradient).toBeTruthy();
      });
    });

    it("has unique IDs", () => {
      const ids = projects.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("getProjectsByCategory", () => {
    it("returns all projects for 'All'", () => {
      expect(getProjectsByCategory("All")).toEqual(projects);
    });

    it("filters by category", () => {
      const aiProjects = getProjectsByCategory("AI & Agents");
      aiProjects.forEach((p) => {
        expect(p.category).toBe("AI & Agents");
      });
    });

    it("returns empty for non-existent category", () => {
      expect(getProjectsByCategory("Nonexistent" as never)).toEqual([]);
    });
  });

  describe("getFeaturedProjects", () => {
    it("returns only featured projects", () => {
      const featured = getFeaturedProjects();
      featured.forEach((p) => {
        expect(p.featured).toBe(true);
      });
    });

    it("is sorted by impact score (descending)", () => {
      const featured = getFeaturedProjects();
      for (let i = 1; i < featured.length; i++) {
        expect(featured[i - 1].impactScore).toBeGreaterThanOrEqual(
          featured[i].impactScore
        );
      }
    });
  });

  describe("stats", () => {
    it("has expected stat fields", () => {
      expect(stats.totalProjects).toBeGreaterThan(0);
      expect(stats.productionApps).toBeGreaterThan(0);
      expect(stats.techStacks).toBeGreaterThan(0);
      expect(stats.linesOfCode).toBeTruthy();
    });
  });
});
