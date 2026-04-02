// ══════════════════════════════════════════════════════════════════════════════
// Circuvent Platform — ATS Engine Service Entry Point
// Module 7: Recruitment, Applicant Tracking, Talent Pools
// Port 3008
// ══════════════════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { jobRoutes } from "./presentation/routes/job.routes";
import { candidateRoutes } from "./presentation/routes/candidate.routes";
import { applicationRoutes } from "./presentation/routes/application.routes";
import { poolRoutes } from "./presentation/routes/pool.routes";
import { interviewRoutes } from "./presentation/routes/interview.routes";
import { dashboardRoutes } from "./presentation/routes/dashboard.routes";

const config = { name: "ats-engine", port: Number(process.env.ATS_ENGINE_PORT) || SERVICE_PORTS.ATS_ENGINE };
const app = createService(config);

// ── Service Routes ──
app.use("/api/jobs", jobRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/pools", poolRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/recruitment/dashboard", dashboardRoutes);
// Gateway-proxied paths
app.use("/api/recruitment/jobs", jobRoutes);
app.use("/api/recruitment/candidates", candidateRoutes);
app.use("/api/recruitment/applications", applicationRoutes);
app.use("/api/recruitment/pools", poolRoutes);
app.use("/api/recruitment/interviews", interviewRoutes);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);
export default app;
