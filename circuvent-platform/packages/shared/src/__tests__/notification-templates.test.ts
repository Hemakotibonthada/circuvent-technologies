// ──────────────────────────────────────────────────────────────
// NotificationTemplates — Test Suite
// Tests for template interpolation, validation, HTML rendering,
// template lookup, required variables check, categories.
// ──────────────────────────────────────────────────────────────

import {
  getTemplate,
  interpolateTemplate,
  renderEmailHTML,
  validateVariables,
  getAllTemplates,
  getTemplatesByCategory,
} from "../utils/notification-templates";

// Helper to render a template by name (getTemplate + interpolateTemplate)
function renderTemplate(name: string, variables: Record<string, string | number>): string {
  const template = getTemplate(name);
  if (!template) return "";
  return interpolateTemplate(template.body, variables);
}

function renderHtmlTemplate(name: string, variables: Record<string, string | number>): string {
  return renderEmailHTML(name, variables) ?? "";
}

function validateTemplateVariables(name: string, variables: Record<string, string | number>) {
  return validateVariables(name, variables);
}

function listTemplates() {
  return getAllTemplates();
}

// ══════════════════════════════════════════════════════════════
// Template Lookup
// ══════════════════════════════════════════════════════════════

describe("Template Lookup", () => {
  it("should retrieve leave_approved template", () => {
    const template = getTemplate("leave_approved");
    expect(template).toBeDefined();
    expect(template?.name).toBe("leave_approved");
    expect(template?.category).toBe("leave");
    expect(template?.requiredVariables.length).toBeGreaterThan(0);
  });

  it("should retrieve expense_approved template", () => {
    const template = getTemplate("expense_approved");
    expect(template).toBeDefined();
    expect(template?.category).toBe("finance");
  });

  it("should retrieve payslip_ready template", () => {
    const template = getTemplate("payslip_ready");
    expect(template).toBeDefined();
    expect(template?.category).toBe("payroll");
  });

  it("should retrieve ticket_assigned template", () => {
    const template = getTemplate("ticket_assigned");
    expect(template).toBeDefined();
    expect(template?.category).toBe("icm");
  });

  it("should return undefined for unknown template", () => {
    const template = getTemplate("non_existent_template");
    expect(template).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// Template Rendering
// ══════════════════════════════════════════════════════════════

describe("Template Rendering", () => {
  it("should render leave_approved template with variables", () => {
    const result = renderTemplate("leave_approved", {
      employeeName: "Ravi Kumar",
      leaveType: "Casual Leave",
      startDate: "2026-03-15",
      endDate: "2026-03-16",
      approverName: "Manager Sharma",
      totalDays: "2",
      remainingBalance: "6",
    });

    expect(result).toContain("Ravi Kumar");
    expect(result).toContain("Casual Leave");
    expect(result).toContain("2026-03-15");
    expect(result).toContain("Manager Sharma");
  });

  it("should render expense_approved template", () => {
    const result = renderTemplate("expense_approved", {
      employeeName: "Priya Sharma",
      amount: "15000",
      expenseCategory: "Travel",
      approverName: "HR Manager",
      expenseId: "EXP-001",
    });

    expect(result).toContain("Priya Sharma");
    expect(result).toContain("15000");
    expect(result).toContain("Travel");
  });

  it("should leave unmatched variables as-is", () => {
    const result = renderTemplate("leave_approved", {
      employeeName: "Test",
    });
    // Other variables should remain as {{varName}}
    expect(result).toContain("{{leaveType}}");
  });

  it("should return empty string for unknown template", () => {
    const result = renderTemplate("unknown", {});
    expect(result).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════
// HTML Rendering
// ══════════════════════════════════════════════════════════════

describe("HTML Rendering", () => {
  it("should render HTML template", () => {
    const result = renderHtmlTemplate("leave_approved", {
      employeeName: "Ravi",
      leaveType: "Earned Leave",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      approverName: "Manager",
      totalDays: "5",
      remainingBalance: "7",
    });

    expect(result).toContain("<strong>Ravi</strong>");
    expect(result).toContain("Earned Leave");
  });

  it("should return empty string for unknown template html", () => {
    const result = renderHtmlTemplate("unknown", {});
    expect(result).toBe("");
  });
});

// ══════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════

describe("Variable Validation", () => {
  it("should pass validation with all required variables", () => {
    const result = validateTemplateVariables("leave_approved", {
      employeeName: "Test",
      leaveType: "CL",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      approverName: "Manager",
      totalDays: "1",
      remainingBalance: "5",
    });

    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);
  });

  it("should fail validation with missing variables", () => {
    const result = validateTemplateVariables("leave_approved", {
      employeeName: "Test",
    });

    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing).toContain("leaveType");
  });

  it("should return invalid for unknown template", () => {
    const result = validateTemplateVariables("unknown", {});
    expect(result.valid).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════
// Listing & Categories
// ══════════════════════════════════════════════════════════════

describe("Listing & Categories", () => {
  it("should list all templates", () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThan(5);
  });

  it("should filter templates by category", () => {
    const leaveTemplates = getTemplatesByCategory("leave");
    expect(leaveTemplates.length).toBeGreaterThan(0);
    for (const t of leaveTemplates) {
      expect(t.category).toBe("leave");
    }
  });

  it("should return empty array for unknown category", () => {
    const templates = getTemplatesByCategory("nonexistent");
    expect(templates.length).toBe(0);
  });

  it("should have unique template names", () => {
    const templates = listTemplates();
    const names = templates.map((t) => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

// ══════════════════════════════════════════════════════════════
// Subject Rendering
// ══════════════════════════════════════════════════════════════

describe("Subject Rendering", () => {
  it("should have subject line with interpolation markers", () => {
    const template = getTemplate("leave_approved");
    expect(template?.subject).toContain("{{leaveType}}");
    expect(template?.subject).toContain("{{startDate}}");
  });

  it("should have subject line for payslip_ready", () => {
    const template = getTemplate("payslip_ready");
    expect(template?.subject).toContain("{{month}}");
    expect(template?.subject).toContain("{{year}}");
  });
});
