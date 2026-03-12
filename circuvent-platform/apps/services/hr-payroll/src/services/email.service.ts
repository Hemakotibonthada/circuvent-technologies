// ──────────────────────────────────────────────────────────────
// HR & Payroll — Email Service
// Template-based email sending with Circuvent branding,
// bulk email support, and email log tracking.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type EmailTemplate =
  | "welcome_employee"
  | "leave_approved"
  | "leave_rejected"
  | "payslip_ready"
  | "birthday_wishes"
  | "work_anniversary"
  | "meeting_invite"
  | "expense_approved"
  | "password_reset"
  | "otp_verification";

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; encoding?: string }>;
}

export interface EmailLogEntry {
  id: string;
  to: string;
  subject: string;
  template?: string;
  status: "SENT" | "FAILED" | "QUEUED";
  sentAt: Date;
  error?: string;
}

export interface BulkEmailResult {
  totalRecipients: number;
  sent: number;
  failed: number;
  failedRecipients: string[];
}

export interface TemplateVariables {
  employeeName?: string;
  employeeCode?: string;
  managerName?: string;
  department?: string;
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  month?: string;
  year?: string;
  netSalary?: string;
  companyName?: string;
  otp?: string;
  resetLink?: string;
  meetingTitle?: string;
  meetingDate?: string;
  meetingTime?: string;
  meetingLink?: string;
  expenseAmount?: string;
  yearsOfService?: string;
  [key: string]: string | undefined;
}

// ══════════════════════════════════════════════════════════════
// Email Templates
// ══════════════════════════════════════════════════════════════

const TEMPLATE_SUBJECTS: Record<EmailTemplate, string> = {
  welcome_employee: "Welcome to Circuvent Technologies! 🎉",
  leave_approved: "Leave Request Approved ✅",
  leave_rejected: "Leave Request Update",
  payslip_ready: "Your Payslip for {{month}} {{year}} is Ready",
  birthday_wishes: "Happy Birthday, {{employeeName}}! 🎂",
  work_anniversary: "Happy Work Anniversary! 🎊",
  meeting_invite: "Meeting Invite: {{meetingTitle}}",
  expense_approved: "Expense Report Approved ✅",
  password_reset: "Password Reset Request",
  otp_verification: "Your OTP Verification Code",
};

const TEMPLATE_BODIES: Record<EmailTemplate, string> = {
  welcome_employee: `
Dear {{employeeName}},

Welcome to Circuvent Technologies! We're thrilled to have you join our team.

Your employee code is: {{employeeCode}}
Department: {{department}}
Reporting to: {{managerName}}

Here's what to expect on your first day:
• Complete your onboarding checklist
• Set up your workstation and development environment
• Meet your team and buddy
• Attend the company orientation session

If you have any questions, please don't hesitate to reach out to our HR team.

Best regards,
Circuvent Technologies HR Team
`,

  leave_approved: `
Dear {{employeeName}},

Your {{leaveType}} leave request has been approved.

Leave Details:
• Type: {{leaveType}}
• From: {{startDate}}
• To: {{endDate}}

Approved by: {{managerName}}

Please ensure proper handover of your responsibilities before going on leave.

Best regards,
HR Team — Circuvent Technologies
`,

  leave_rejected: `
Dear {{employeeName}},

Your leave request has been reviewed and could not be approved at this time.

Leave Details:
• Type: {{leaveType}}
• From: {{startDate}}
• To: {{endDate}}

Reason: {{reason}}

Please contact your manager or HR for further discussion.

Best regards,
HR Team — Circuvent Technologies
`,

  payslip_ready: `
Dear {{employeeName}},

Your salary slip for {{month}} {{year}} has been generated and is now available.

Net Salary Credited: ₹{{netSalary}}

You can view your detailed payslip by logging into the Circuvent Employee Portal.

This is a system-generated email. For any discrepancies, please contact HR.

Best regards,
Payroll Team — Circuvent Technologies
`,

  birthday_wishes: `
Dear {{employeeName}},

🎂 Wishing you a very Happy Birthday!

May this year bring you great success, good health, and happiness. We're glad to have you as part of the Circuvent family.

Enjoy your special day!

Warm regards,
Team Circuvent Technologies
`,

  work_anniversary: `
Dear {{employeeName}},

🎊 Congratulations on completing {{yearsOfService}} years at Circuvent Technologies!

Your dedication and contributions have been invaluable to our success. Thank you for being an integral part of our journey.

Here's to many more years of growth and achievement together!

Best regards,
Team Circuvent Technologies
`,

  meeting_invite: `
Dear {{employeeName}},

You've been invited to a meeting:

📅 {{meetingTitle}}
🗓️ Date: {{meetingDate}}
⏰ Time: {{meetingTime}}
🔗 Link: {{meetingLink}}

Please confirm your attendance.

Best regards,
Circuvent Technologies
`,

  expense_approved: `
Dear {{employeeName}},

Your expense report has been approved.

Amount: ₹{{expenseAmount}}

The reimbursement will be processed in the next payroll cycle.

Best regards,
Finance Team — Circuvent Technologies
`,

  password_reset: `
Dear {{employeeName}},

We received a request to reset your password. Click the link below to set a new password:

{{resetLink}}

This link will expire in 1 hour. If you did not request this, please ignore this email or contact IT support.

Best regards,
IT Team — Circuvent Technologies
`,

  otp_verification: `
Dear {{employeeName}},

Your one-time verification code is:

{{otp}}

This code is valid for 10 minutes. Do not share this code with anyone.

Best regards,
Circuvent Technologies
`,
};

// ══════════════════════════════════════════════════════════════
// Email Service
// ══════════════════════════════════════════════════════════════

export class EmailService {
  /**
   * Send a plain email.
   */
  static async sendEmail(
    to: string,
    subject: string,
    body: string,
    options?: { cc?: string[]; bcc?: string[]; replyTo?: string }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const html = this.generateEmailHTML("custom", { body } as any);

      // In production, integrate with an email provider (SES, SendGrid, etc.)
      // For now, log the email to the database
      const log = await prisma.generatedDocument.create({
        data: {
          name: `Email: ${subject}`,
          category: "EMAIL_LOG",
          entityType: "Email",
          entityId: `email-${Date.now()}`,
          generatedBy: "EmailService",
          format: "HTML",
          data: {
            to,
            subject,
            body,
            html,
            cc: options?.cc || [],
            bcc: options?.bcc || [],
            status: "SENT",
            sentAt: new Date().toISOString(),
          },
        },
      });

      console.log(`[EmailService] Email sent to ${to}: ${subject}`);
      return { success: true, messageId: log.id };
    } catch (error: any) {
      console.error(`[EmailService] Failed to send email to ${to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a template-based email.
   */
  static async sendTemplateEmail(
    to: string,
    templateName: EmailTemplate,
    variables: TemplateVariables
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const subjectTemplate = TEMPLATE_SUBJECTS[templateName];
    const bodyTemplate = TEMPLATE_BODIES[templateName];

    if (!subjectTemplate || !bodyTemplate) {
      return { success: false, error: `Template "${templateName}" not found` };
    }

    const subject = this.interpolateTemplate(subjectTemplate, variables);
    const body = this.interpolateTemplate(bodyTemplate, variables);
    const html = this.generateEmailHTML(templateName, variables, body);

    return this.sendEmail(to, subject, body);
  }

  /**
   * Generate branded HTML email content.
   */
  static generateEmailHTML(
    template: string,
    variables: TemplateVariables,
    plainBody?: string
  ): string {
    const body = plainBody || TEMPLATE_BODIES[template as EmailTemplate] || "";
    const interpolatedBody = this.interpolateTemplate(body, variables);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${variables.companyName || "Circuvent Technologies"}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#1e293b;border-radius:12px;overflow:hidden;">
    <!-- Header -->
    <tr>
      <td style="padding:24px 32px;background:linear-gradient(135deg,#6366f1,#8b5cf6);text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
          Circuvent Technologies
        </h1>
        <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;">
          Enterprise Resource Platform
        </p>
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding:32px;color:#e2e8f0;font-size:14px;line-height:1.6;">
        ${interpolatedBody.replace(/\n/g, "<br>")}
      </td>
    </tr>
    <!-- Footer -->
    <tr>
      <td style="padding:16px 32px;border-top:1px solid #334155;text-align:center;">
        <p style="margin:0;color:#64748b;font-size:11px;">
          © ${new Date().getFullYear()} Circuvent Technologies Pvt. Ltd. All rights reserved.
        </p>
        <p style="margin:4px 0 0;color:#475569;font-size:10px;">
          This is a system-generated email. Please do not reply directly.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  /**
   * Send the same email to multiple recipients.
   */
  static async sendBulkEmail(
    recipients: string[],
    subject: string,
    body: string
  ): Promise<BulkEmailResult> {
    let sent = 0;
    const failedRecipients: string[] = [];

    for (const recipient of recipients) {
      const result = await this.sendEmail(recipient, subject, body);
      if (result.success) {
        sent++;
      } else {
        failedRecipients.push(recipient);
      }
    }

    await createAuditLog({
      userId: "SYSTEM",
      action: "CREATE",
      entity: "Email",
      entityId: `bulk-${Date.now()}`,
      newValue: { totalRecipients: recipients.length, sent, failed: failedRecipients.length },
    });

    return {
      totalRecipients: recipients.length,
      sent,
      failed: failedRecipients.length,
      failedRecipients,
    };
  }

  /**
   * Retrieve email log entries with pagination.
   */
  static async getEmailLog(
    page: number = 1,
    limit: number = 20
  ): Promise<{ entries: EmailLogEntry[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.generatedDocument.findMany({
        where: { category: "EMAIL_LOG" },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: { id: true, name: true, data: true, createdAt: true },
      }),
      prisma.generatedDocument.count({ where: { category: "EMAIL_LOG" } }),
    ]);

    const entries: EmailLogEntry[] = logs.map((log) => {
      const data = log.data as any;
      return {
        id: log.id,
        to: data?.to || "",
        subject: (log.name || "").replace("Email: ", ""),
        template: data?.template,
        status: data?.status || "SENT",
        sentAt: log.createdAt,
        error: data?.error,
      };
    });

    return { entries, total, page, limit };
  }

  // ══════════════════════════════════════════════════════════════
  // Private Helpers
  // ══════════════════════════════════════════════════════════════

  /**
   * Replace {{variable}} placeholders with actual values.
   */
  private static interpolateTemplate(template: string, variables: TemplateVariables): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] ?? `{{${key}}}`;
    });
  }
}
