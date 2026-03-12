// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Notification Template Engine
// Predefined templates for leave, expense, payslip, ticket,
// meeting, birthday, onboarding, performance, training,
// document, and system events. Interpolation, validation,
// and full HTML email rendering with Circuvent branding.
// ──────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface NotificationTemplate {
  name: string;
  subject: string;
  body: string;
  htmlBody: string;
  requiredVariables: string[];
  category: string;
}

// ══════════════════════════════════════════════════════════════
// Templates
// ══════════════════════════════════════════════════════════════

const TEMPLATES: Record<string, NotificationTemplate> = {
  leave_approved: {
    name: "leave_approved",
    subject: "Leave Approved — {{leaveType}} ({{startDate}} to {{endDate}})",
    body: "Hi {{employeeName}},\n\nYour {{leaveType}} leave request from {{startDate}} to {{endDate}} has been approved by {{approverName}}.\n\nTotal days: {{totalDays}}\nRemaining balance: {{remainingBalance}} days\n\nRegards,\nCircuvent HR",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your <strong>{{leaveType}}</strong> leave request from <strong>{{startDate}}</strong> to <strong>{{endDate}}</strong> has been approved by <strong>{{approverName}}</strong>.</p><ul><li>Total days: {{totalDays}}</li><li>Remaining balance: {{remainingBalance}} days</li></ul><p>Regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "leaveType", "startDate", "endDate", "approverName", "totalDays", "remainingBalance"],
    category: "leave",
  },
  leave_rejected: {
    name: "leave_rejected",
    subject: "Leave Rejected — {{leaveType}} ({{startDate}} to {{endDate}})",
    body: "Hi {{employeeName}},\n\nYour {{leaveType}} leave request from {{startDate}} to {{endDate}} has been rejected by {{approverName}}.\n\nReason: {{rejectionReason}}\n\nPlease contact your manager for further details.\n\nRegards,\nCircuvent HR",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your <strong>{{leaveType}}</strong> leave request from <strong>{{startDate}}</strong> to <strong>{{endDate}}</strong> has been rejected by <strong>{{approverName}}</strong>.</p><p><strong>Reason:</strong> {{rejectionReason}}</p><p>Please contact your manager for further details.</p><p>Regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "leaveType", "startDate", "endDate", "approverName", "rejectionReason"],
    category: "leave",
  },
  expense_approved: {
    name: "expense_approved",
    subject: "Expense Approved — ₹{{amount}} ({{expenseCategory}})",
    body: "Hi {{employeeName}},\n\nYour expense claim of ₹{{amount}} for {{expenseCategory}} has been approved by {{approverName}}.\n\nExpense ID: {{expenseId}}\nReimbursement will be processed in the next payroll cycle.\n\nRegards,\nCircuvent Finance",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your expense claim of <strong>₹{{amount}}</strong> for <strong>{{expenseCategory}}</strong> has been approved by <strong>{{approverName}}</strong>.</p><p>Expense ID: <code>{{expenseId}}</code></p><p>Reimbursement will be processed in the next payroll cycle.</p><p>Regards,<br/>Circuvent Finance</p>`,
    requiredVariables: ["employeeName", "amount", "expenseCategory", "approverName", "expenseId"],
    category: "finance",
  },
  expense_rejected: {
    name: "expense_rejected",
    subject: "Expense Rejected — ₹{{amount}} ({{expenseCategory}})",
    body: "Hi {{employeeName}},\n\nYour expense claim of ₹{{amount}} for {{expenseCategory}} has been rejected.\n\nReason: {{rejectionReason}}\n\nPlease revise and resubmit if applicable.\n\nRegards,\nCircuvent Finance",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your expense claim of <strong>₹{{amount}}</strong> for <strong>{{expenseCategory}}</strong> has been rejected.</p><p><strong>Reason:</strong> {{rejectionReason}}</p><p>Please revise and resubmit if applicable.</p><p>Regards,<br/>Circuvent Finance</p>`,
    requiredVariables: ["employeeName", "amount", "expenseCategory", "rejectionReason"],
    category: "finance",
  },
  payslip_ready: {
    name: "payslip_ready",
    subject: "Payslip Ready — {{month}} {{year}}",
    body: "Hi {{employeeName}},\n\nYour payslip for {{month}} {{year}} is now available.\n\nNet Salary: ₹{{netSalary}}\nGross Salary: ₹{{grossSalary}}\n\nYou can download your payslip from the HR portal.\n\nRegards,\nCircuvent Payroll",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your payslip for <strong>{{month}} {{year}}</strong> is now available.</p><ul><li>Net Salary: <strong>₹{{netSalary}}</strong></li><li>Gross Salary: ₹{{grossSalary}}</li></ul><p>You can download your payslip from the HR portal.</p><p>Regards,<br/>Circuvent Payroll</p>`,
    requiredVariables: ["employeeName", "month", "year", "netSalary", "grossSalary"],
    category: "payroll",
  },
  ticket_assigned: {
    name: "ticket_assigned",
    subject: "Ticket Assigned — {{ticketCode}}: {{subject}}",
    body: "Hi {{assigneeName}},\n\nA ticket has been assigned to you.\n\nTicket: {{ticketCode}}\nSubject: {{subject}}\nPriority: {{priority}}\nCategory: {{category}}\nSLA Deadline: {{slaDeadline}}\n\nPlease review and take action.\n\nRegards,\nCircuvent ICM",
    htmlBody: `<p>Hi <strong>{{assigneeName}}</strong>,</p><p>A ticket has been assigned to you.</p><table><tr><td><strong>Ticket:</strong></td><td>{{ticketCode}}</td></tr><tr><td><strong>Subject:</strong></td><td>{{subject}}</td></tr><tr><td><strong>Priority:</strong></td><td>{{priority}}</td></tr><tr><td><strong>Category:</strong></td><td>{{category}}</td></tr><tr><td><strong>SLA Deadline:</strong></td><td>{{slaDeadline}}</td></tr></table><p>Please review and take action.</p><p>Regards,<br/>Circuvent ICM</p>`,
    requiredVariables: ["assigneeName", "ticketCode", "subject", "priority", "category", "slaDeadline"],
    category: "icm",
  },
  ticket_resolved: {
    name: "ticket_resolved",
    subject: "Ticket Resolved — {{ticketCode}}: {{subject}}",
    body: "Hi {{reporterName}},\n\nYour ticket {{ticketCode}} has been resolved.\n\nResolution: {{resolution}}\nResolved by: {{resolvedBy}}\n\nIf you need further assistance, please reopen the ticket.\n\nRegards,\nCircuvent ICM",
    htmlBody: `<p>Hi <strong>{{reporterName}}</strong>,</p><p>Your ticket <strong>{{ticketCode}}</strong> has been resolved.</p><p><strong>Resolution:</strong> {{resolution}}</p><p>Resolved by: {{resolvedBy}}</p><p>If you need further assistance, please reopen the ticket.</p><p>Regards,<br/>Circuvent ICM</p>`,
    requiredVariables: ["reporterName", "ticketCode", "subject", "resolution", "resolvedBy"],
    category: "icm",
  },
  meeting_invite: {
    name: "meeting_invite",
    subject: "Meeting Invite — {{meetingTitle}} on {{date}}",
    body: "Hi {{attendeeName}},\n\nYou have been invited to a meeting.\n\nTitle: {{meetingTitle}}\nDate: {{date}}\nTime: {{startTime}} - {{endTime}}\nLocation: {{location}}\nOrganizer: {{organizerName}}\n\nAgenda:\n{{agenda}}\n\nRegards,\nCircuvent Calendar",
    htmlBody: `<p>Hi <strong>{{attendeeName}}</strong>,</p><p>You have been invited to a meeting.</p><table><tr><td><strong>Title:</strong></td><td>{{meetingTitle}}</td></tr><tr><td><strong>Date:</strong></td><td>{{date}}</td></tr><tr><td><strong>Time:</strong></td><td>{{startTime}} - {{endTime}}</td></tr><tr><td><strong>Location:</strong></td><td>{{location}}</td></tr><tr><td><strong>Organizer:</strong></td><td>{{organizerName}}</td></tr></table><p><strong>Agenda:</strong></p><p>{{agenda}}</p><p>Regards,<br/>Circuvent Calendar</p>`,
    requiredVariables: ["attendeeName", "meetingTitle", "date", "startTime", "endTime", "location", "organizerName", "agenda"],
    category: "calendar",
  },
  birthday_wish: {
    name: "birthday_wish",
    subject: "🎂 Happy Birthday, {{employeeName}}!",
    body: "Dear {{employeeName}},\n\nWishing you a very Happy Birthday! 🎉\n\nMay this year bring you great success and happiness.\n\nWarm regards,\nThe Circuvent Family",
    htmlBody: `<p>Dear <strong>{{employeeName}}</strong>,</p><p>Wishing you a very <strong>Happy Birthday!</strong> 🎉🎂</p><p>May this year bring you great success and happiness.</p><p>Warm regards,<br/>The Circuvent Family</p>`,
    requiredVariables: ["employeeName"],
    category: "celebration",
  },
  work_anniversary: {
    name: "work_anniversary",
    subject: "🎉 Happy {{years}}-Year Anniversary, {{employeeName}}!",
    body: "Dear {{employeeName}},\n\nCongratulations on completing {{years}} year(s) with Circuvent Technologies!\n\nJoining Date: {{joiningDate}}\n\nThank you for your valuable contributions to the team.\n\nBest regards,\nCircuvent HR",
    htmlBody: `<p>Dear <strong>{{employeeName}}</strong>,</p><p>Congratulations on completing <strong>{{years}} year(s)</strong> with Circuvent Technologies! 🎉</p><p>Joining Date: {{joiningDate}}</p><p>Thank you for your valuable contributions to the team.</p><p>Best regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "years", "joiningDate"],
    category: "celebration",
  },
  welcome_employee: {
    name: "welcome_employee",
    subject: "Welcome to Circuvent, {{employeeName}}!",
    body: "Dear {{employeeName}},\n\nWelcome to Circuvent Technologies! We're thrilled to have you on board.\n\nEmployee Code: {{employeeCode}}\nDepartment: {{department}}\nDesignation: {{designation}}\nReporting To: {{managerName}}\nStart Date: {{startDate}}\n\nPlease complete your onboarding checklist on the HR portal.\n\nBest regards,\nCircuvent HR",
    htmlBody: `<p>Dear <strong>{{employeeName}}</strong>,</p><p>Welcome to <strong>Circuvent Technologies</strong>! We're thrilled to have you on board. 🎉</p><table><tr><td><strong>Employee Code:</strong></td><td>{{employeeCode}}</td></tr><tr><td><strong>Department:</strong></td><td>{{department}}</td></tr><tr><td><strong>Designation:</strong></td><td>{{designation}}</td></tr><tr><td><strong>Reporting To:</strong></td><td>{{managerName}}</td></tr><tr><td><strong>Start Date:</strong></td><td>{{startDate}}</td></tr></table><p>Please complete your onboarding checklist on the HR portal.</p><p>Best regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "employeeCode", "department", "designation", "managerName", "startDate"],
    category: "onboarding",
  },
  performance_review: {
    name: "performance_review",
    subject: "Performance Review — {{cycle}} for {{employeeName}}",
    body: "Hi {{employeeName}},\n\nYour performance review for {{cycle}} is now available.\n\nOverall Rating: {{overallRating}}/5\nReviewer: {{reviewerName}}\n\nPlease log in to the portal to view detailed feedback and goals.\n\nRegards,\nCircuvent HR",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your performance review for <strong>{{cycle}}</strong> is now available.</p><ul><li>Overall Rating: <strong>{{overallRating}}/5</strong></li><li>Reviewer: {{reviewerName}}</li></ul><p>Please log in to the portal to view detailed feedback and goals.</p><p>Regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "cycle", "overallRating", "reviewerName"],
    category: "performance",
  },
  training_enrolled: {
    name: "training_enrolled",
    subject: "Training Enrollment — {{courseName}}",
    body: "Hi {{employeeName}},\n\nYou have been enrolled in a training program.\n\nCourse: {{courseName}}\nInstructor: {{instructorName}}\nStart Date: {{startDate}}\nDuration: {{duration}}\nMode: {{mode}}\n\nPlease ensure your attendance.\n\nRegards,\nCircuvent L&D",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>You have been enrolled in a training program.</p><table><tr><td><strong>Course:</strong></td><td>{{courseName}}</td></tr><tr><td><strong>Instructor:</strong></td><td>{{instructorName}}</td></tr><tr><td><strong>Start Date:</strong></td><td>{{startDate}}</td></tr><tr><td><strong>Duration:</strong></td><td>{{duration}}</td></tr><tr><td><strong>Mode:</strong></td><td>{{mode}}</td></tr></table><p>Please ensure your attendance.</p><p>Regards,<br/>Circuvent L&D</p>`,
    requiredVariables: ["employeeName", "courseName", "instructorName", "startDate", "duration", "mode"],
    category: "training",
  },
  document_ready: {
    name: "document_ready",
    subject: "Document Ready — {{documentType}}",
    body: "Hi {{employeeName}},\n\nYour {{documentType}} is ready for download.\n\nDocument: {{documentTitle}}\nGenerated: {{generatedDate}}\n\nPlease download it from the HR portal.\n\nRegards,\nCircuvent HR",
    htmlBody: `<p>Hi <strong>{{employeeName}}</strong>,</p><p>Your <strong>{{documentType}}</strong> is ready for download.</p><ul><li>Document: {{documentTitle}}</li><li>Generated: {{generatedDate}}</li></ul><p>Please download it from the HR portal.</p><p>Regards,<br/>Circuvent HR</p>`,
    requiredVariables: ["employeeName", "documentType", "documentTitle", "generatedDate"],
    category: "document",
  },
  system_alert: {
    name: "system_alert",
    subject: "⚠️ System Alert — {{alertType}}",
    body: "Alert: {{alertType}}\n\nSeverity: {{severity}}\nService: {{serviceName}}\nMessage: {{message}}\nTimestamp: {{timestamp}}\n\nPlease investigate immediately.\n\n— Circuvent Monitoring",
    htmlBody: `<p><strong>⚠️ System Alert: {{alertType}}</strong></p><table><tr><td><strong>Severity:</strong></td><td>{{severity}}</td></tr><tr><td><strong>Service:</strong></td><td>{{serviceName}}</td></tr><tr><td><strong>Message:</strong></td><td>{{message}}</td></tr><tr><td><strong>Timestamp:</strong></td><td>{{timestamp}}</td></tr></table><p>Please investigate immediately.</p><p>— Circuvent Monitoring</p>`,
    requiredVariables: ["alertType", "severity", "serviceName", "message", "timestamp"],
    category: "system",
  },
};

// ══════════════════════════════════════════════════════════════
// Interpolation
// ══════════════════════════════════════════════════════════════

export function interpolateTemplate(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

// ══════════════════════════════════════════════════════════════
// Template Access
// ══════════════════════════════════════════════════════════════

export function getTemplate(name: string): NotificationTemplate | null {
  return TEMPLATES[name] || null;
}

export function getAllTemplates(): NotificationTemplate[] {
  return Object.values(TEMPLATES);
}

export function getTemplatesByCategory(category: string): NotificationTemplate[] {
  return Object.values(TEMPLATES).filter((t) => t.category === category);
}

export function getTemplateNames(): string[] {
  return Object.keys(TEMPLATES);
}

// ══════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════

export function validateVariables(
  templateName: string,
  variables: Record<string, string | number>,
): { valid: boolean; missing: string[] } {
  const template = TEMPLATES[templateName];
  if (!template) {
    return { valid: false, missing: [`Template '${templateName}' not found`] };
  }

  const missing = template.requiredVariables.filter((v) => {
    const value = variables[v];
    return value === undefined || value === null || String(value).trim() === "";
  });

  return { valid: missing.length === 0, missing };
}

// ══════════════════════════════════════════════════════════════
// HTML Email Rendering with Circuvent Branding
// ══════════════════════════════════════════════════════════════

export function renderEmailHTML(
  templateName: string,
  variables: Record<string, string | number>,
): string | null {
  const template = TEMPLATES[templateName];
  if (!template) return null;

  const subject = interpolateTemplate(template.subject, variables);
  const body = interpolateTemplate(template.htmlBody, variables);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:24px 32px;text-align:center;">
              <h1 style="color:#ffffff;font-size:20px;margin:0;font-weight:700;letter-spacing:0.5px;">Circuvent Technologies</h1>
            </td>
          </tr>
          <!-- Subject -->
          <tr>
            <td style="padding:24px 32px 8px;border-bottom:1px solid #e5e7eb;">
              <h2 style="color:#111827;font-size:16px;margin:0;font-weight:600;">${escapeHtml(subject)}</h2>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;color:#374151;font-size:14px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#6b7280;font-size:12px;margin:0;">
                &copy; ${new Date().getFullYear()} Circuvent Technologies Pvt. Ltd. All rights reserved.
              </p>
              <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;">
                This is an automated notification. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
