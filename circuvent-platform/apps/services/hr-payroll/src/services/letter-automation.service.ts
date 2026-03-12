// ──────────────────────────────────────────────────────────────
// HR & Payroll — Letter Automation Service
// Automated letter generation and dispatch for all HR letter
// types: Offer, Appointment, Call, Experience, Relieving,
// Internship, Salary Revision, Promotion, Transfer, Warning,
// Termination, Bonus, Probation, Contract Renewal, NDA,
// Reference, Absconding, and bulk operations.
// ──────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";
import { createAuditLog } from "@circuvent/audit";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export type LetterType =
  | "OFFER_LETTER"
  | "APPOINTMENT_LETTER"
  | "CALL_LETTER"
  | "EXPERIENCE_LETTER"
  | "RELIEVING_LETTER"
  | "INTERNSHIP_LETTER"
  | "INTERNSHIP_COMPLETION"
  | "PROBATION_CONFIRMATION"
  | "PROMOTION_LETTER"
  | "TRANSFER_LETTER"
  | "WARNING_LETTER"
  | "TERMINATION_LETTER"
  | "SALARY_REVISION_LETTER"
  | "BONUS_LETTER"
  | "NDA_AGREEMENT"
  | "NON_COMPETE"
  | "EMPLOYMENT_VERIFICATION"
  | "ADDRESS_PROOF"
  | "REFERENCE_LETTER"
  | "APPRECIATION_LETTER"
  | "CUSTOM";

export type LetterStatus = "DRAFT" | "GENERATED" | "SENT" | "ACKNOWLEDGED" | "SIGNED" | "REJECTED" | "REVOKED";

export interface OfferLetterData {
  salary: number;
  designation: string;
  department: string;
  joiningDate: string;
  probationMonths?: number;
  benefits?: string[];
}

export interface LetterGenerationResult {
  id: string;
  letterType: LetterType;
  recipientName: string;
  subject: string;
  status: LetterStatus;
  createdAt: Date;
}

export interface LetterStats {
  totalLetters: number;
  draftCount: number;
  sentCount: number;
  acknowledgedCount: number;
  byType: Array<{ letterType: string; count: number }>;
  recentLetters: any[];
  monthlyTrend: Array<{ month: string; count: number }>;
}

export interface BulkResult {
  batchId: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  errors: Array<{ recipientId: string; error: string }>;
}

// ══════════════════════════════════════════════════════════════
// Letter Template HTML Content — Circuvent Branding
// ══════════════════════════════════════════════════════════════

const CIRCUVENT_HEADER = `
<div style="background:#0f172a;padding:32px 40px;text-align:center;">
  <h1 style="color:#38bdf8;margin:0;font-size:28px;letter-spacing:2px;">CIRCUVENT TECHNOLOGIES</h1>
  <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">Innovation · Engineering · Excellence</p>
</div>`;

const CIRCUVENT_FOOTER = `
<div style="border-top:2px solid #1e293b;margin-top:40px;padding-top:20px;text-align:center;color:#64748b;font-size:11px;">
  <p>Circuvent Technologies Pvt. Ltd. · Registered Office: Hyderabad, Telangana, India</p>
  <p>CIN: U72200TG2024PTC000000 · www.circuvent.com · hr@circuvent.com</p>
  <p style="margin-top:8px;font-size:10px;">This is a computer-generated document. No signature required.</p>
</div>`;

function wrapTemplate(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.7;margin:0;padding:0;}
  .container{max-width:800px;margin:0 auto;background:#fff;}
  .body-content{padding:40px 48px;}
  table{width:100%;border-collapse:collapse;margin:16px 0;}
  th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;}
  th{background:#f1f5f9;font-weight:600;font-size:13px;}
  td{font-size:13px;}
  .highlight{background:#eff6ff;padding:16px;border-left:4px solid #3b82f6;margin:16px 0;}
  .signature-block{margin-top:48px;}
</style></head><body><div class="container">${CIRCUVENT_HEADER}<div class="body-content">${body}</div>${CIRCUVENT_FOOTER}</div></body></html>`;
}

const LETTER_TEMPLATES: Record<string, { subject: string; html: string }> = {
  OFFER_LETTER: {
    subject: "Offer of Employment — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{candidateName}}</strong>,</p>
      <p>We are pleased to offer you the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at Circuvent Technologies.</p>
      <div class="highlight">
        <p><strong>Compensation:</strong> ₹{{salary}} per annum (CTC)</p>
        <p><strong>Joining Date:</strong> {{joiningDate}}</p>
        <p><strong>Probation Period:</strong> {{probationMonths}} months</p>
        <p><strong>Reporting Location:</strong> Hyderabad, India</p>
      </div>
      <p>Your compensation package includes the following benefits:</p>
      <ul>{{benefitsList}}</ul>
      <p>This offer is contingent upon successful completion of background verification and submission of required documents. The offer is valid for 7 days from the date of this letter.</p>
      <p>Please confirm your acceptance by signing and returning this letter.</p>
      <div class="signature-block">
        <p>Warm regards,</p>
        <p><strong>HR Department</strong><br/>Circuvent Technologies Pvt. Ltd.</p>
      </div>`),
  },

  APPOINTMENT_LETTER: {
    subject: "Appointment Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>With reference to your application and subsequent interview, we are pleased to appoint you as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department, effective <strong>{{joiningDate}}</strong>.</p>
      <h3 style="color:#334155;">Terms & Conditions</h3>
      <table>
        <tr><th>Component</th><th>Details</th></tr>
        <tr><td>Designation</td><td>{{designation}}</td></tr>
        <tr><td>Department</td><td>{{department}}</td></tr>
        <tr><td>Annual CTC</td><td>₹{{salary}}</td></tr>
        <tr><td>Probation Period</td><td>{{probationMonths}} months</td></tr>
        <tr><td>Notice Period</td><td>{{noticePeriod}} days</td></tr>
        <tr><td>Working Hours</td><td>9:00 AM – 6:00 PM, Monday – Friday</td></tr>
      </table>
      <p>You are expected to maintain confidentiality of all proprietary information and adhere to company policies.</p>
      <div class="signature-block">
        <p>For Circuvent Technologies Pvt. Ltd.,</p>
        <p><strong>HR Department</strong></p>
        <p style="margin-top:32px;">Employee Acceptance: ___________________</p>
      </div>`),
  },

  CALL_LETTER: {
    subject: "Interview Call Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{candidateName}}</strong>,</p>
      <p>Thank you for your interest in joining Circuvent Technologies. We are pleased to invite you for an interview for the position you have applied for.</p>
      <div class="highlight">
        <p><strong>Interview Date:</strong> {{interviewDate}}</p>
        <p><strong>Time:</strong> {{interviewTime}}</p>
        <p><strong>Location:</strong> {{location}}</p>
        <p><strong>Interviewer:</strong> {{interviewer}}</p>
      </div>
      <p>Please carry the following documents:</p>
      <ul>
        <li>Updated resume</li><li>Photo ID proof</li><li>Educational certificates</li><li>Experience certificates (if any)</li>
      </ul>
      <p>If you need to reschedule, please contact us at hr@circuvent.com at least 24 hours before the scheduled time.</p>
      <div class="signature-block">
        <p>Best regards,</p><p><strong>Talent Acquisition Team</strong><br/>Circuvent Technologies</p>
      </div>`),
  },

  EXPERIENCE_LETTER: {
    subject: "Experience Certificate — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <h2 style="text-align:center;color:#0f172a;">EXPERIENCE CERTIFICATE</h2>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <strong>{{employeeName}}</strong> (Employee ID: <strong>{{employeeCode}}</strong>) was employed with Circuvent Technologies Pvt. Ltd. as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department from <strong>{{joiningDate}}</strong> to <strong>{{lastWorkingDay}}</strong>.</p>
      <p>During their tenure, {{employeeName}} demonstrated excellent professional competence, dedication, and teamwork. Their contributions to the organization were significant and highly valued.</p>
      <p>We wish {{employeeName}} all the best in their future endeavors.</p>
      <div class="signature-block">
        <p>For Circuvent Technologies Pvt. Ltd.,</p><p><strong>{{signatoryName}}</strong><br/>{{signatoryDesignation}}<br/>HR Department</p>
      </div>`),
  },

  RELIEVING_LETTER: {
    subject: "Relieving Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <h2 style="text-align:center;color:#0f172a;">RELIEVING LETTER</h2>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <strong>{{employeeName}}</strong> (Employee ID: <strong>{{employeeCode}}</strong>) has been relieved from employment with Circuvent Technologies Pvt. Ltd. effective <strong>{{lastWorkingDay}}</strong>.</p>
      <p>{{employeeName}} was working as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department. All dues have been settled, and there are no outstanding obligations on either side.</p>
      <p>We wish them continued success in their career.</p>
      <div class="signature-block">
        <p>For Circuvent Technologies Pvt. Ltd.,</p><p><strong>HR Department</strong></p>
      </div>`),
  },

  INTERNSHIP_LETTER: {
    subject: "Internship Offer — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{candidateName}}</strong>,</p>
      <p>We are pleased to offer you an internship position at Circuvent Technologies in the <strong>{{department}}</strong> department.</p>
      <div class="highlight">
        <p><strong>Duration:</strong> {{duration}}</p>
        <p><strong>Mentor:</strong> {{mentor}}</p>
        <p><strong>Stipend:</strong> ₹{{stipend}} per month</p>
        <p><strong>Start Date:</strong> {{startDate}}</p>
      </div>
      <p>During your internship, you will gain hands-on experience in real-world projects and work alongside experienced professionals. We expect you to maintain punctuality, confidentiality, and professional conduct.</p>
      <div class="signature-block">
        <p>Welcome aboard!</p><p><strong>HR Department</strong><br/>Circuvent Technologies</p>
      </div>`),
  },

  INTERNSHIP_COMPLETION: {
    subject: "Internship Completion Certificate — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <h2 style="text-align:center;color:#0f172a;">INTERNSHIP COMPLETION CERTIFICATE</h2>
      <p>To Whomsoever It May Concern,</p>
      <p>This is to certify that <strong>{{internName}}</strong> successfully completed their internship at Circuvent Technologies Pvt. Ltd. in the <strong>{{department}}</strong> department from <strong>{{startDate}}</strong> to <strong>{{endDate}}</strong>.</p>
      <p><strong>Feedback:</strong> {{feedback}}</p>
      <p>During the internship, they demonstrated commendable skills, enthusiasm, and a willingness to learn. We wish them a bright future ahead.</p>
      <div class="signature-block">
        <p>For Circuvent Technologies Pvt. Ltd.,</p><p><strong>{{mentorName}}</strong><br/>Mentor & Supervisor</p>
      </div>`),
  },

  PROBATION_CONFIRMATION: {
    subject: "Probation Confirmation — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We are pleased to inform you that your probation period has been successfully completed and you are now confirmed as a permanent employee of Circuvent Technologies Pvt. Ltd. effective <strong>{{confirmationDate}}</strong>.</p>
      <table>
        <tr><th>Detail</th><th>Value</th></tr>
        <tr><td>Designation</td><td>{{designation}}</td></tr>
        <tr><td>Department</td><td>{{department}}</td></tr>
        <tr><td>Employee Code</td><td>{{employeeCode}}</td></tr>
        <tr><td>Confirmation Date</td><td>{{confirmationDate}}</td></tr>
      </table>
      <p>Your notice period will now be {{noticePeriod}} days. All other terms and conditions remain as per your appointment letter.</p>
      <p>Congratulations and we wish you a long and fulfilling career at Circuvent Technologies!</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  SALARY_REVISION_LETTER: {
    subject: "Salary Revision — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We are pleased to inform you that your compensation has been revised effective <strong>{{effectiveDate}}</strong>.</p>
      <table>
        <tr><th>Component</th><th>Previous (₹)</th><th>Revised (₹)</th></tr>
        <tr><td>Annual CTC</td><td>{{previousSalary}}</td><td>{{newSalary}}</td></tr>
        <tr><td>Increment</td><td colspan="2">₹{{incrementAmount}} ({{incrementPercentage}}%)</td></tr>
      </table>
      <p>This revision is a recognition of your valuable contributions to the organization. We look forward to your continued excellence.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  PROMOTION_LETTER: {
    subject: "Promotion Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We are delighted to inform you of your promotion, effective <strong>{{effectiveDate}}</strong>.</p>
      <div class="highlight">
        <p><strong>Previous Designation:</strong> {{previousDesignation}}</p>
        <p><strong>New Designation:</strong> {{newDesignation}}</p>
        <p><strong>Revised CTC:</strong> ₹{{newSalary}} per annum</p>
      </div>
      <p>This promotion is in recognition of your outstanding performance, leadership, and commitment. We are confident you will continue to excel in your new role.</p>
      <p>Congratulations!</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  TRANSFER_LETTER: {
    subject: "Transfer Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>This is to inform you that you are being transferred effective <strong>{{effectiveDate}}</strong>.</p>
      <table>
        <tr><th>Detail</th><th>Previous</th><th>New</th></tr>
        <tr><td>Department</td><td>{{previousDepartment}}</td><td>{{newDepartment}}</td></tr>
        <tr><td>Location</td><td>{{previousLocation}}</td><td>{{newLocation}}</td></tr>
        <tr><td>Reporting To</td><td>{{previousManager}}</td><td>{{newManager}}</td></tr>
      </table>
      <p>All other terms and conditions of your employment remain unchanged unless otherwise communicated. Please report to your new department/location on the effective date.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  WARNING_LETTER: {
    subject: "Warning Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>Subject: <strong>{{warningLevel}} Warning</strong></p>
      <p>This letter serves as a formal <strong>{{warningLevel}}</strong> warning regarding the following:</p>
      <div style="background:#fef2f2;padding:16px;border-left:4px solid #ef4444;margin:16px 0;">
        <p><strong>Reason:</strong> {{reason}}</p>
        <p><strong>Date of Incident:</strong> {{incidentDate}}</p>
      </div>
      <p>You are advised to take immediate corrective action. Failure to improve may result in further disciplinary proceedings, up to and including termination of employment.</p>
      <p>You may submit a written response to this warning within 7 days.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  TERMINATION_LETTER: {
    subject: "Termination of Employment — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We regret to inform you that your employment with Circuvent Technologies Pvt. Ltd. is being terminated effective <strong>{{lastDate}}</strong>.</p>
      <div style="background:#fef2f2;padding:16px;border-left:4px solid #ef4444;margin:16px 0;">
        <p><strong>Reason:</strong> {{reason}}</p>
      </div>
      <p>Your final settlement will include all pending dues, leave encashment, and statutory benefits as per company policy and applicable laws.</p>
      <p>You are required to return all company property, including laptops, access cards, and documents, by your last working day.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  BONUS_LETTER: {
    subject: "Bonus Announcement — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We are delighted to inform you that you have been awarded a bonus in recognition of your contributions.</p>
      <div class="highlight">
        <p><strong>Bonus Amount:</strong> ₹{{bonusAmount}}</p>
        <p><strong>Reason:</strong> {{reason}}</p>
        <p><strong>Payment Date:</strong> {{paymentDate}}</p>
      </div>
      <p>Your dedication and hard work are invaluable to the team. Keep up the excellent work!</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  NDA_AGREEMENT: {
    subject: "Non-Disclosure Agreement — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <h2 style="text-align:center;color:#0f172a;">NON-DISCLOSURE AGREEMENT</h2>
      <p>This Non-Disclosure Agreement ("Agreement") is entered into by <strong>{{userName}}</strong> ("Recipient") and Circuvent Technologies Pvt. Ltd. ("Company").</p>
      <h3>1. Confidential Information</h3>
      <p>The Recipient agrees that all proprietary information, trade secrets, technical data, business strategies, client information, source code, designs, and other confidential materials disclosed by the Company shall be treated as strictly confidential.</p>
      <h3>2. Obligations</h3>
      <ul>
        <li>Not to disclose any confidential information to third parties without prior written consent.</li>
        <li>Not to use confidential information for personal gain or any purpose outside the scope of assigned duties.</li>
        <li>To return or destroy all confidential materials upon request or termination of engagement.</li>
      </ul>
      <h3>3. Duration</h3>
      <p>This Agreement shall remain in effect during the period of engagement and for a period of <strong>2 years</strong> after its termination.</p>
      <h3>4. Remedies</h3>
      <p>The Recipient acknowledges that any breach may cause irreparable harm and the Company shall be entitled to seek injunctive relief in addition to any other available remedies.</p>
      <div class="signature-block">
        <div style="display:flex;gap:80px;margin-top:32px;">
          <div><p>For Circuvent Technologies</p><p>___________________________</p><p>Authorized Signatory</p></div>
          <div><p>Recipient</p><p>___________________________</p><p>{{userName}}</p></div>
        </div>
      </div>`),
  },

  REFERENCE_LETTER: {
    subject: "Reference Letter — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>{{toWhom}}</p>
      <p>Subject: Reference Letter for <strong>{{employeeName}}</strong></p>
      <p>Dear Sir/Madam,</p>
      <p>I am writing to recommend <strong>{{employeeName}}</strong>, who was associated with Circuvent Technologies Pvt. Ltd. as <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department from <strong>{{joiningDate}}</strong> to <strong>{{lastWorkingDay}}</strong>.</p>
      <p>During their tenure, {{employeeName}} demonstrated exceptional skills, professionalism, and dedication. They consistently delivered high-quality work and were a valuable asset to our team.</p>
      <p>I confidently recommend {{employeeName}} for any position they may pursue. Should you require further information, please do not hesitate to contact us.</p>
      <div class="signature-block"><p>Sincerely,</p><p><strong>HR Department</strong><br/>Circuvent Technologies Pvt. Ltd.</p></div>`),
  },

  CONTRACT_RENEWAL: {
    subject: "Contract Renewal — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We are pleased to inform you that your contract with Circuvent Technologies has been renewed.</p>
      <div class="highlight">
        <p><strong>New Contract End Date:</strong> {{newEndDate}}</p>
        <p><strong>Terms:</strong> {{terms}}</p>
      </div>
      <p>All other terms and conditions remain as per your original agreement unless otherwise specified. Please sign and return a copy of this letter to HR.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  ABSCONDING_NOTICE: {
    subject: "Absconding Notice — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>Subject: <strong>Notice of Unauthorized Absence</strong></p>
      <p>It has been observed that you have been absent from work without prior approval or intimation since <strong>{{absentSince}}</strong>. Despite multiple attempts to contact you, there has been no response.</p>
      <p>You are hereby directed to report to the office within <strong>3 working days</strong> from the date of this letter with a satisfactory explanation, failing which it will be presumed that you have voluntarily abandoned your employment and your services will be terminated without further notice.</p>
      <p>All pending dues will be withheld until the matter is resolved.</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  APPRECIATION_LETTER: {
    subject: "Letter of Appreciation — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <p>Dear <strong>{{employeeName}}</strong>,</p>
      <p>We would like to take this opportunity to formally appreciate your outstanding contributions to {{achievement}}.</p>
      <p>Your dedication, expertise, and commitment to excellence have set a benchmark for the team. We are proud to have you as part of the Circuvent family.</p>
      <p>Keep up the great work!</p>
      <div class="signature-block"><p><strong>HR Department</strong><br/>Circuvent Technologies</p></div>`),
  },

  NON_COMPETE: {
    subject: "Non-Compete Agreement — Circuvent Technologies",
    html: wrapTemplate(`
      <p style="text-align:right;color:#64748b;">Date: {{date}}</p>
      <h2 style="text-align:center;color:#0f172a;">NON-COMPETE AGREEMENT</h2>
      <p>This agreement is between <strong>{{userName}}</strong> ("Employee") and Circuvent Technologies Pvt. Ltd. ("Company").</p>
      <p>The Employee agrees that during employment and for a period of <strong>12 months</strong> after termination, they will not directly or indirectly engage in any business that competes with the Company's core operations in IoT, embedded systems, and engineering solutions within India.</p>
      <p>Violation of this agreement may result in legal action and recovery of damages.</p>
      <div class="signature-block">
        <div style="display:flex;gap:80px;margin-top:32px;">
          <div><p>For Circuvent Technologies</p><p>___________________________</p></div>
          <div><p>Employee</p><p>___________________________</p><p>{{userName}}</p></div>
        </div>
      </div>`),
  },
};

// ══════════════════════════════════════════════════════════════
// Helper — Populate Variables in Template
// ══════════════════════════════════════════════════════════════

function populateTemplate(html: string, variables: Record<string, string>): string {
  let rendered = html;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value ?? "");
  }
  return rendered;
}

function formatDateStr(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrencyINR(amount: number): string {
  return amount.toLocaleString("en-IN");
}

async function getEmployeeWithUser(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, department: true } },
      salarySlips: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });
  if (!employee) throw new Error(`Employee not found: ${employeeId}`);
  return employee;
}

async function getCandidateById(candidateId: string) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);
  return candidate;
}

async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User not found: ${userId}`);
  return user;
}

async function getOrCreateTemplate(letterType: string, createdBy: string) {
  let template = await prisma.letterTemplate.findFirst({
    where: { letterType: letterType as any, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!template) {
    const defaultContent = LETTER_TEMPLATES[letterType] || LETTER_TEMPLATES.OFFER_LETTER;
    template = await prisma.letterTemplate.create({
      data: {
        name: `${letterType.replace(/_/g, " ")} Template`,
        letterType: letterType as any,
        subject: defaultContent.subject,
        htmlContent: defaultContent.html,
        variables: [],
        category: getTemplateCategory(letterType),
        createdBy,
      },
    });
  }
  return template;
}

function getTemplateCategory(letterType: string): string {
  const exitTypes = ["EXPERIENCE_LETTER", "RELIEVING_LETTER", "TERMINATION_LETTER", "ABSCONDING_NOTICE"];
  const complianceTypes = ["NDA_AGREEMENT", "NON_COMPETE"];
  const internTypes = ["INTERNSHIP_LETTER", "INTERNSHIP_COMPLETION"];
  const recognitionTypes = ["BONUS_LETTER", "PROMOTION_LETTER", "APPRECIATION_LETTER"];

  if (exitTypes.includes(letterType)) return "EXIT";
  if (complianceTypes.includes(letterType)) return "COMPLIANCE";
  if (internTypes.includes(letterType)) return "INTERNSHIP";
  if (recognitionTypes.includes(letterType)) return "RECOGNITION";
  return "EMPLOYMENT";
}

async function createLetterRecord(params: {
  templateId: string | null;
  letterType: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  htmlContent: string;
  metadata?: Record<string, any>;
  createdBy: string;
}): Promise<any> {
  const letter = await prisma.letter.create({
    data: {
      templateId: params.templateId,
      letterType: params.letterType as any,
      recipientId: params.recipientId,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      subject: params.subject,
      htmlContent: params.htmlContent,
      status: "DRAFT",
      metadata: params.metadata || {},
      createdBy: params.createdBy,
    },
  });

  await createAuditLog({
    action: "CREATE",
    entity: "Letter",
    entityId: letter.id,
    userId: params.createdBy,
    metadata: { letterType: params.letterType, recipientName: params.recipientName },
  });

  return letter;
}

// ══════════════════════════════════════════════════════════════
// Letter Automation Service
// ══════════════════════════════════════════════════════════════

export class LetterAutomationService {
  /**
   * Generate Offer Letter for a candidate
   */
  static async generateOfferLetter(
    candidateId: string,
    data: OfferLetterData
  ): Promise<LetterGenerationResult> {
    const candidate = await getCandidateById(candidateId);
    const template = await getOrCreateTemplate("OFFER_LETTER", "system");
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;

    const benefits = data.benefits || [
      "Provident Fund (EPF)", "Health Insurance (Group Mediclaim)",
      "Performance Bonus", "Flexible Work Policy", "Learning & Development Budget",
    ];

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      candidateName,
      designation: data.designation,
      department: data.department,
      salary: formatCurrencyINR(data.salary),
      joiningDate: formatDateStr(data.joiningDate),
      probationMonths: String(data.probationMonths || 6),
      benefitsList: benefits.map((b) => `<li>${b}</li>`).join(""),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "OFFER_LETTER",
      recipientId: candidate.id,
      recipientName: candidateName,
      recipientEmail: candidate.email,
      subject: template.subject,
      htmlContent,
      metadata: { salary: data.salary, designation: data.designation, department: data.department, joiningDate: data.joiningDate },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "OFFER_LETTER", recipientName: candidateName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Call Letter for interview
   */
  static async generateCallLetter(
    candidateId: string,
    interviewDate: string,
    location: string,
    interviewer: string
  ): Promise<LetterGenerationResult> {
    const candidate = await getCandidateById(candidateId);
    const template = await getOrCreateTemplate("CALL_LETTER", "system");
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;

    const dateObj = new Date(interviewDate);
    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      candidateName,
      interviewDate: formatDateStr(interviewDate),
      interviewTime: dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      location,
      interviewer,
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "CALL_LETTER",
      recipientId: candidate.id,
      recipientName: candidateName,
      recipientEmail: candidate.email,
      subject: template.subject,
      htmlContent,
      metadata: { interviewDate, location, interviewer },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "CALL_LETTER", recipientName: candidateName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Internship Letter
   */
  static async generateInternshipLetter(
    candidateId: string,
    duration: string,
    mentor: string,
    stipend: number
  ): Promise<LetterGenerationResult> {
    const candidate = await getCandidateById(candidateId);
    const template = await getOrCreateTemplate("INTERNSHIP_LETTER", "system");
    const candidateName = `${candidate.firstName} ${candidate.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      candidateName,
      department: candidate.currentRole || "Engineering",
      duration,
      mentor,
      stipend: formatCurrencyINR(stipend),
      startDate: formatDateStr(new Date()),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "INTERNSHIP_LETTER",
      recipientId: candidate.id,
      recipientName: candidateName,
      recipientEmail: candidate.email,
      subject: template.subject,
      htmlContent,
      metadata: { duration, mentor, stipend },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "INTERNSHIP_LETTER", recipientName: candidateName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Experience Letter — auto-populate from employee record
   */
  static async generateExperienceLetter(employeeId: string): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("EXPERIENCE_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      joiningDate: formatDateStr(employee.dateOfJoining),
      lastWorkingDay: employee.dateOfLeaving ? formatDateStr(employee.dateOfLeaving) : formatDateStr(new Date()),
      signatoryName: "HR Manager",
      signatoryDesignation: "Head of Human Resources",
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "EXPERIENCE_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { employeeCode: employee.employeeCode, designation: employee.designation, department: employee.department },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "EXPERIENCE_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Relieving Letter — with last working day
   */
  static async generateRelievingLetter(employeeId: string): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("RELIEVING_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      lastWorkingDay: employee.dateOfLeaving ? formatDateStr(employee.dateOfLeaving) : formatDateStr(new Date()),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "RELIEVING_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { employeeCode: employee.employeeCode, lastWorkingDay: variables.lastWorkingDay },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "RELIEVING_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Appointment Letter — formal appointment
   */
  static async generateAppointmentLetter(
    employeeId: string,
    data: { salary: number; probationMonths?: number; noticePeriod?: number }
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("APPOINTMENT_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      designation: employee.designation,
      department: employee.department,
      joiningDate: formatDateStr(employee.dateOfJoining),
      salary: formatCurrencyINR(data.salary),
      probationMonths: String(data.probationMonths || 6),
      noticePeriod: String(data.noticePeriod || 30),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "APPOINTMENT_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { salary: data.salary, designation: employee.designation },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "APPOINTMENT_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Salary Revision Letter
   */
  static async generateSalaryRevisionLetter(
    employeeId: string,
    newSalary: number,
    effectiveDate: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("SALARY_REVISION_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;
    const previousSalary = Number(employee.baseSalary) * 12;
    const increment = newSalary - previousSalary;
    const incrementPct = previousSalary > 0 ? ((increment / previousSalary) * 100).toFixed(1) : "0";

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      effectiveDate: formatDateStr(effectiveDate),
      previousSalary: formatCurrencyINR(previousSalary),
      newSalary: formatCurrencyINR(newSalary),
      incrementAmount: formatCurrencyINR(increment),
      incrementPercentage: incrementPct,
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "SALARY_REVISION_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { previousSalary, newSalary, increment, effectiveDate },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "SALARY_REVISION_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Transfer Letter
   */
  static async generateTransferLetter(
    employeeId: string,
    newDepartment: string,
    newLocation: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("TRANSFER_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      effectiveDate: formatDateStr(new Date(Date.now() + 14 * 86400000)),
      previousDepartment: employee.department,
      newDepartment,
      previousLocation: "Current Location",
      newLocation,
      previousManager: "Current Manager",
      newManager: "TBD",
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "TRANSFER_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { previousDepartment: employee.department, newDepartment, newLocation },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "TRANSFER_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Promotion Letter
   */
  static async generatePromotionLetter(
    employeeId: string,
    newDesignation: string,
    newSalary: number
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("PROMOTION_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      effectiveDate: formatDateStr(new Date()),
      previousDesignation: employee.designation,
      newDesignation,
      newSalary: formatCurrencyINR(newSalary),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "PROMOTION_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { previousDesignation: employee.designation, newDesignation, newSalary },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "PROMOTION_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Warning Letter
   */
  static async generateWarningLetter(
    employeeId: string,
    reason: string,
    warningLevel: "First" | "Second" | "Final"
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("WARNING_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      warningLevel,
      reason,
      incidentDate: formatDateStr(new Date()),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "WARNING_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { warningLevel, reason },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "WARNING_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Termination Letter
   */
  static async generateTerminationLetter(
    employeeId: string,
    reason: string,
    lastDate: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("TERMINATION_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      reason,
      lastDate: formatDateStr(lastDate),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "TERMINATION_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { reason, lastDate },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "TERMINATION_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Bonus Letter
   */
  static async generateBonusLetter(
    employeeId: string,
    bonusAmount: number,
    reason: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("BONUS_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      bonusAmount: formatCurrencyINR(bonusAmount),
      reason,
      paymentDate: formatDateStr(new Date(Date.now() + 7 * 86400000)),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "BONUS_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { bonusAmount, reason },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "BONUS_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Probation Completion Letter
   */
  static async generateProbationCompletionLetter(employeeId: string): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("PROBATION_CONFIRMATION", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      designation: employee.designation,
      department: employee.department,
      employeeCode: employee.employeeCode,
      confirmationDate: formatDateStr(new Date()),
      noticePeriod: "30",
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "PROBATION_CONFIRMATION",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { designation: employee.designation, confirmationDate: formatDateStr(new Date()) },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "PROBATION_CONFIRMATION", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Contract Renewal Letter
   */
  static async generateContractRenewalLetter(
    employeeId: string,
    newEndDate: string,
    terms: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("CONTRACT_RENEWAL", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      newEndDate: formatDateStr(newEndDate),
      terms,
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      // Use CUSTOM since there's no specific CONTRACT_RENEWAL enum value
      letterType: "CUSTOM",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { newEndDate, terms },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "CUSTOM", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate NDA Letter
   */
  static async generateNDALetter(userId: string): Promise<LetterGenerationResult> {
    const user = await getUserById(userId);
    const template = await getOrCreateTemplate("NDA_AGREEMENT", "system");
    const userName = `${user.firstName} ${user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      userName,
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "NDA_AGREEMENT",
      recipientId: user.id,
      recipientName: userName,
      recipientEmail: user.email,
      subject: template.subject,
      htmlContent,
      metadata: {},
      createdBy: "system",
    });

    return { id: letter.id, letterType: "NDA_AGREEMENT", recipientName: userName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Internship Completion Letter
   */
  static async generateInternshipCompletionLetter(
    internId: string,
    feedback: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(internId);
    const template = await getOrCreateTemplate("INTERNSHIP_COMPLETION", "system");
    const internName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      internName,
      department: employee.department,
      startDate: formatDateStr(employee.dateOfJoining),
      endDate: employee.dateOfLeaving ? formatDateStr(employee.dateOfLeaving) : formatDateStr(new Date()),
      feedback,
      mentorName: "Department Head",
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "INTERNSHIP_COMPLETION",
      recipientId: employee.user.id,
      recipientName: internName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { feedback },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "INTERNSHIP_COMPLETION", recipientName: internName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Absconding Notice
   */
  static async generateAbsconding(employeeId: string): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("ABSCONDING_NOTICE", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      employeeName,
      absentSince: formatDateStr(new Date(Date.now() - 7 * 86400000)),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      // Use CUSTOM since ABSCONDING_NOTICE is not in the LetterType enum
      letterType: "CUSTOM",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: "Absconding Notice — Circuvent Technologies",
      htmlContent,
      metadata: { type: "ABSCONDING_NOTICE" },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "CUSTOM", recipientName: employeeName, subject: "Absconding Notice", status: "DRAFT", createdAt: letter.createdAt };
  }

  /**
   * Generate Reference Letter for an employee
   */
  static async generateReferenceLetterForEmployee(
    employeeId: string,
    toWhom: string
  ): Promise<LetterGenerationResult> {
    const employee = await getEmployeeWithUser(employeeId);
    const template = await getOrCreateTemplate("REFERENCE_LETTER", "system");
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;

    const variables: Record<string, string> = {
      date: formatDateStr(new Date()),
      toWhom: toWhom || "To Whomsoever It May Concern",
      employeeName,
      designation: employee.designation,
      department: employee.department,
      joiningDate: formatDateStr(employee.dateOfJoining),
      lastWorkingDay: employee.dateOfLeaving ? formatDateStr(employee.dateOfLeaving) : formatDateStr(new Date()),
    };

    const htmlContent = populateTemplate(template.htmlContent, variables);
    const letter = await createLetterRecord({
      templateId: template.id,
      letterType: "REFERENCE_LETTER",
      recipientId: employee.user.id,
      recipientName: employeeName,
      recipientEmail: employee.user.email,
      subject: template.subject,
      htmlContent,
      metadata: { toWhom },
      createdBy: "system",
    });

    return { id: letter.id, letterType: "REFERENCE_LETTER", recipientName: employeeName, subject: template.subject, status: "DRAFT", createdAt: letter.createdAt };
  }

  // ════════════════════════════════════════════════════════════
  // Bulk Operations
  // ════════════════════════════════════════════════════════════

  /**
   * Bulk generate letters of a given type for multiple recipients
   */
  static async bulkGenerateLetters(
    letterType: LetterType,
    recipientIds: string[],
    data: Record<string, any>
  ): Promise<BulkResult> {
    const batch = await prisma.letterBatch.create({
      data: {
        name: `Bulk ${letterType.replace(/_/g, " ")} — ${new Date().toISOString().split("T")[0]}`,
        letterType: letterType as any,
        templateId: "pending",
        recipientIds,
        totalCount: recipientIds.length,
        status: "PROCESSING",
        startedAt: new Date(),
        createdBy: "system",
      },
    });

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ recipientId: string; error: string }> = [];

    for (const recipientId of recipientIds) {
      try {
        await this.generateLetterByType(letterType, recipientId, data);
        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push({ recipientId, error: error.message || "Unknown error" });
      }
    }

    await prisma.letterBatch.update({
      where: { id: batch.id },
      data: {
        sentCount: successCount,
        failedCount,
        status: failedCount === 0 ? "COMPLETED" : "COMPLETED",
        completedAt: new Date(),
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    return { batchId: batch.id, totalCount: recipientIds.length, successCount, failedCount, errors };
  }

  /** Route letter generation to the right method by type */
  private static async generateLetterByType(
    letterType: LetterType,
    recipientId: string,
    data: Record<string, any>
  ): Promise<LetterGenerationResult> {
    switch (letterType) {
      case "OFFER_LETTER":
        return this.generateOfferLetter(recipientId, data as OfferLetterData);
      case "CALL_LETTER":
        return this.generateCallLetter(recipientId, data.interviewDate, data.location, data.interviewer);
      case "INTERNSHIP_LETTER":
        return this.generateInternshipLetter(recipientId, data.duration, data.mentor, data.stipend);
      case "EXPERIENCE_LETTER":
        return this.generateExperienceLetter(recipientId);
      case "RELIEVING_LETTER":
        return this.generateRelievingLetter(recipientId);
      case "APPOINTMENT_LETTER":
        return this.generateAppointmentLetter(recipientId, data as any);
      case "SALARY_REVISION_LETTER":
        return this.generateSalaryRevisionLetter(recipientId, data.newSalary, data.effectiveDate);
      case "TRANSFER_LETTER":
        return this.generateTransferLetter(recipientId, data.newDepartment, data.newLocation);
      case "PROMOTION_LETTER":
        return this.generatePromotionLetter(recipientId, data.newDesignation, data.newSalary);
      case "WARNING_LETTER":
        return this.generateWarningLetter(recipientId, data.reason, data.warningLevel);
      case "TERMINATION_LETTER":
        return this.generateTerminationLetter(recipientId, data.reason, data.lastDate);
      case "BONUS_LETTER":
        return this.generateBonusLetter(recipientId, data.bonusAmount, data.reason);
      case "PROBATION_CONFIRMATION":
        return this.generateProbationCompletionLetter(recipientId);
      case "NDA_AGREEMENT":
        return this.generateNDALetter(recipientId);
      case "REFERENCE_LETTER":
        return this.generateReferenceLetterForEmployee(recipientId, data.toWhom);
      default:
        throw new Error(`Unsupported letter type for bulk: ${letterType}`);
    }
  }

  // ════════════════════════════════════════════════════════════
  // Dispatch
  // ════════════════════════════════════════════════════════════

  /**
   * Dispatch (send) a letter: mark as SENT, create notification
   */
  static async dispatchLetter(letterId: string): Promise<any> {
    const letter = await prisma.letter.findUnique({ where: { id: letterId } });
    if (!letter) throw new Error(`Letter not found: ${letterId}`);
    if (letter.status !== "DRAFT" && letter.status !== "GENERATED") {
      throw new Error(`Letter cannot be dispatched — current status: ${letter.status}`);
    }

    const updated = await prisma.letter.update({
      where: { id: letterId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sentBy: "system",
      },
    });

    // Create in-app notification for recipient
    try {
      await prisma.notification.create({
        data: {
          userId: letter.recipientId,
          title: `New Letter: ${letter.subject}`,
          message: `You have received a new ${letter.letterType.replace(/_/g, " ").toLowerCase()} from HR.`,
          type: "info",
          module: "LETTER",
        },
      });
    } catch {
      // Notification creation is non-critical
    }

    await createAuditLog({
      action: "UPDATE",
      entity: "Letter",
      entityId: letterId,
      userId: "system",
      metadata: { recipientId: letter.recipientId, letterType: letter.letterType },
    });

    return updated;
  }

  /**
   * Bulk dispatch multiple letters at once
   */
  static async bulkDispatchLetters(letterIds: string[]): Promise<{ dispatched: number; failed: number; errors: string[] }> {
    let dispatched = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const letterId of letterIds) {
      try {
        await this.dispatchLetter(letterId);
        dispatched++;
      } catch (error: any) {
        failed++;
        errors.push(`${letterId}: ${error.message}`);
      }
    }

    return { dispatched, failed, errors };
  }

  // ════════════════════════════════════════════════════════════
  // Query & Stats
  // ════════════════════════════════════════════════════════════

  /**
   * Get all letters for an employee
   */
  static async getLettersByEmployee(employeeId: string): Promise<any[]> {
    // Resolve user ID from employee
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });
    if (!employee) throw new Error(`Employee not found: ${employeeId}`);

    return prisma.letter.findMany({
      where: { recipientId: employee.userId },
      include: { template: { select: { name: true, category: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get all letters of a specific type
   */
  static async getLettersByType(letterType: LetterType): Promise<any[]> {
    return prisma.letter.findMany({
      where: { letterType: letterType as any },
      include: { template: { select: { name: true, category: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get letter dashboard stats
   */
  static async getLetterStats(): Promise<LetterStats> {
    const [totalLetters, draftCount, sentCount, acknowledgedCount, byType, recentLetters] = await Promise.all([
      prisma.letter.count(),
      prisma.letter.count({ where: { status: "DRAFT" } }),
      prisma.letter.count({ where: { status: "SENT" } }),
      prisma.letter.count({ where: { status: "ACKNOWLEDGED" } }),
      prisma.letter.groupBy({ by: ["letterType"], _count: { id: true } }),
      prisma.letter.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, letterType: true, recipientName: true, status: true, createdAt: true },
      }),
    ]);

    // Monthly trend: last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const monthlyData = await prisma.letter.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });

    const monthlyMap = new Map<string, number>();
    for (const l of monthlyData) {
      const key = `${l.createdAt.getFullYear()}-${String(l.createdAt.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
    }
    const monthlyTrend = Array.from(monthlyMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalLetters,
      draftCount,
      sentCount,
      acknowledgedCount,
      byType: byType.map((g) => ({ letterType: g.letterType, count: g._count.id })),
      recentLetters,
      monthlyTrend,
    };
  }
}
