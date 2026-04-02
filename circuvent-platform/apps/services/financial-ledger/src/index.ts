// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — Financial Ledger Service Entry Point
// Module 6: Double-entry accounting, GST, trial balance, P&L, balance sheet
// Port 3007
// ══════════════════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { accountRoutes } from "./presentation/routes/account.routes";
import { journalRoutes } from "./presentation/routes/journal.routes";
import { reportRoutes } from "./presentation/routes/reports.routes";
import { gstRoutes } from "./presentation/routes/gst.routes";
import { budgetRoutes } from "./presentation/routes/budget.routes";

const config = {
  name: "financial-ledger",
  port: Number(process.env.FINANCIAL_LEDGER_PORT) || SERVICE_PORTS.FINANCIAL_LEDGER,
};

const app = createService(config);

// ── Service Routes ──
app.use("/api/accounts", accountRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/gst", gstRoutes);
app.use("/api/budgets", budgetRoutes);
// Gateway-proxied paths
app.use("/api/finance/accounts", accountRoutes);
app.use("/api/finance/journals", journalRoutes);
app.use("/api/finance/reports", reportRoutes);
app.use("/api/finance/gst", gstRoutes);
app.use("/api/finance/budgets", budgetRoutes);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
