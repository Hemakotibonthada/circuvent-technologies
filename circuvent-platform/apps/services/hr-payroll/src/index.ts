// ──────────────────────────────────────────────────────────────
// Circuvent Platform — HR & Payroll Engine
// Module 3: Employee DB, salary calculations, India tax, expenses
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { employeeRouter } from "./routes/employee.routes";
import { payrollRouter } from "./routes/payroll.routes";
import { expenseRouter } from "./routes/expense.routes";
import { enhancedPayrollRouter } from "./routes/enhanced-payroll.routes";
import { statutoryRouter } from "./routes/statutory.routes";
import { leaveRouter } from "./routes/leave.routes";
import { attendanceRouter } from "./routes/attendance.routes";
import { performanceRouter } from "./routes/performance.routes";
import { goalsRouter } from "./routes/goals.routes";
import { directoryRouter } from "./routes/directory.routes";
import { portalRouter } from "./routes/portal.routes";
import { adminAnalyticsRouter } from "./routes/admin-analytics.routes";
import { travelRouter } from "./routes/travel.routes";
import { assetRouter } from "./routes/asset.routes";
import { shiftRouter } from "./routes/shift.routes";
import { grievanceRouter } from "./routes/grievance.routes";
import { timesheetRouter } from "./routes/timesheet.routes";
import { recognitionRouter } from "./routes/recognition.routes";
import { calendarRouter } from "./routes/calendar.routes";
import { workflowRouter } from "./routes/workflow.routes";
import { surveyRouter } from "./routes/survey.routes";
import { documentRouter } from "./routes/document.routes";
import { visitorRouter } from "./routes/visitor.routes";
import { benefitsRouter } from "./routes/benefits.routes";
import { featureFlagRouter } from "./routes/feature-flag.routes";
import { letterRouter } from "./routes/letter.routes";
import { purchaseRequestRouter } from "./routes/purchase-request.routes";
import { fundsRouter } from "./routes/funds.routes";
import { salaryAdvanceRouter } from "./routes/salary-advance.routes";
import { resignationRouter } from "./routes/resignation.routes";
import { icmRouter } from "./routes/icm.routes";
import { workstationRouter } from "./routes/workstation.routes";
import { messagingRouter } from "./routes/messaging.routes";
import { wikiRouter } from "./routes/wiki.routes";
import { apiDocsRouter } from "./routes/api-docs.routes";
import { devflowRouter } from "./routes/devflow.routes";

const config = {
  name: "hr-payroll",
  port: Number(process.env.HR_PAYROLL_PORT) || SERVICE_PORTS.HR_PAYROLL,
};

const app = createService(config);

// ── Service Routes ──
app.use("/api/employees", employeeRouter);
app.use("/api/payroll", payrollRouter);
app.use("/api/expenses", expenseRouter);
app.use("/api/payroll", enhancedPayrollRouter);
app.use("/api/statutory", statutoryRouter);
app.use("/api/leave", leaveRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/directory", directoryRouter);
app.use("/api/portal", portalRouter);
app.use("/api/admin", adminAnalyticsRouter);
app.use("/api/travel", travelRouter);
app.use("/api/assets", assetRouter);
app.use("/api/shifts", shiftRouter);
app.use("/api/grievances", grievanceRouter);
app.use("/api/timesheets", timesheetRouter);
app.use("/api/recognition", recognitionRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api/workflows", workflowRouter);
app.use("/api/surveys", surveyRouter);
app.use("/api/documents", documentRouter);
app.use("/api/visitors", visitorRouter);
app.use("/api/benefits", benefitsRouter);
app.use("/api/feature-flags", featureFlagRouter);
app.use("/api/letters", letterRouter);
app.use("/api/purchase-requests", purchaseRequestRouter);
app.use("/api/funds", fundsRouter);
app.use("/api/salary-advances", salaryAdvanceRouter);
app.use("/api/resignations", resignationRouter);
app.use("/api/icm", icmRouter);
app.use("/api/workstation", workstationRouter);
app.use("/api/messages", messagingRouter);
app.use("/api/wiki", wikiRouter);
app.use("/api/api-docs", apiDocsRouter);
app.use("/api/devflow", devflowRouter);
// Gateway-proxied paths
app.use("/api/hr/employees", employeeRouter);
app.use("/api/hr/payroll", enhancedPayrollRouter);
app.use("/api/hr/payroll", payrollRouter);
app.use("/api/hr/expenses", expenseRouter);
app.use("/api/hr/statutory", statutoryRouter);
app.use("/api/hr/leave", leaveRouter);
app.use("/api/hr/attendance", attendanceRouter);
app.use("/api/hr/performance", performanceRouter);
app.use("/api/hr/goals", goalsRouter);
app.use("/api/hr/directory", directoryRouter);
app.use("/api/hr/portal", portalRouter);
app.use("/api/hr/admin", adminAnalyticsRouter);
app.use("/api/hr/travel", travelRouter);
app.use("/api/hr/assets", assetRouter);
app.use("/api/hr/shifts", shiftRouter);
app.use("/api/hr/grievances", grievanceRouter);
app.use("/api/hr/timesheets", timesheetRouter);
app.use("/api/hr/recognition", recognitionRouter);
app.use("/api/hr/calendar", calendarRouter);
app.use("/api/hr/workflows", workflowRouter);
app.use("/api/hr/surveys", surveyRouter);
app.use("/api/hr/documents", documentRouter);
app.use("/api/hr/visitors", visitorRouter);
app.use("/api/hr/benefits", benefitsRouter);
app.use("/api/hr/feature-flags", featureFlagRouter);
app.use("/api/hr/letters", letterRouter);
app.use("/api/hr/purchase-requests", purchaseRequestRouter);
app.use("/api/hr/funds", fundsRouter);
app.use("/api/hr/salary-advances", salaryAdvanceRouter);
app.use("/api/hr/resignations", resignationRouter);
app.use("/api/hr/icm", icmRouter);
app.use("/api/hr/workstation", workstationRouter);
app.use("/api/hr/messages", messagingRouter);
app.use("/api/hr/wiki", wikiRouter);
app.use("/api/hr/api-docs", apiDocsRouter);
app.use("/api/hr/devflow", devflowRouter);
app.use("/api/hr/directory", directoryRouter);
app.use("/api/hr/portal", portalRouter);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
