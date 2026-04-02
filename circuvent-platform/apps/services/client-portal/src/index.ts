// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Client & Consulting Portal Service
// Module 4: Lead tracking, invoicing, multi-currency
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { leadRouter } from "./routes/lead.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { clientRouter } from "./routes/client.routes";
import { activityRouter } from "./routes/activity.routes";

const config = {
  name: "client-portal",
  port: Number(process.env.CLIENT_PORTAL_PORT) || SERVICE_PORTS.CLIENT_PORTAL,
};

const app = createService(config);

// ── Service Routes ──
// Gateway-proxied paths (must come first — more specific prefixes before /api/clients)
app.use("/api/clients/leads", leadRouter);
app.use("/api/clients/invoices", invoiceRouter);
app.use("/api/clients/activities", activityRouter);
app.use("/api/clients/clients", clientRouter);
// Direct routes
app.use("/api/leads", leadRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/activities", activityRouter);
app.use("/api/clients", clientRouter);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
