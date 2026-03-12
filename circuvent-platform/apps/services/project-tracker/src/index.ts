// ──────────────────────────────────────────────────────────────
// Circuvent Platform — Project & Engineering Tracker Service
// Module 1: Sprints (Software) + Hardware Revision Tracking (BOM)
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { projectRouter } from "./routes/project.routes";
import { sprintRouter } from "./routes/sprint.routes";
import { hardwareRouter } from "./routes/hardware.routes";
import { bomExportRouter } from "./routes/bom-export.routes";

const config = {
  name: "project-tracker",
  port: Number(process.env.PROJECT_TRACKER_PORT) || SERVICE_PORTS.PROJECT_TRACKER,
};

const app = createService(config);

// ── Service Routes ──
app.use("/api/projects", projectRouter);
app.use("/api/sprints", sprintRouter);
app.use("/api/hardware", hardwareRouter);
app.use("/api/bom-export", bomExportRouter);
// Gateway-proxied paths (frontend uses /projects/sprints etc.)
app.use("/api/projects/sprints", sprintRouter);
app.use("/api/projects/hardware", hardwareRouter);
app.use("/api/projects/bom-export", bomExportRouter);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
