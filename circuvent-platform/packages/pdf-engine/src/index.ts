export { PDFRenderer } from "./pdf.renderer";
export type { PDFTableColumn, PDFRenderOptions } from "./pdf.renderer";
export { generatePayslipPDF } from "./templates/payslip.template";
export type { PayslipInput } from "./templates/payslip.template";
export { generateInvoicePDF } from "./templates/invoice.template";
export type { InvoiceInput } from "./templates/invoice.template";
export { generateReportPDF, buildPayrollSummaryReport, buildFleetStatusReport, buildRnDTaxReport } from "./templates/report.template";
export type { ReportInput } from "./templates/report.template";

// HTML template paths for email/notification rendering
import path from "path";
const HTML_TEMPLATE_DIR = path.join(__dirname, "templates", "html");
export const payslipHTMLTemplates = {
  cover: path.join(HTML_TEMPLATE_DIR, "payslip_cover.html"),
  notification: path.join(HTML_TEMPLATE_DIR, "payslip_notification.html"),
  statement: path.join(HTML_TEMPLATE_DIR, "payslip_statement.html"),
} as const;
