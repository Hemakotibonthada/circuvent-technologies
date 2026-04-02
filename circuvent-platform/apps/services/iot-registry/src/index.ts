// ──────────────────────────────────────────────────────────────
// Circuvent Platform — IoT Device Registry Service
// Module 2: Device monitoring, MAC addresses, firmware versions
// ──────────────────────────────────────────────────────────────

import dotenv from "dotenv";
dotenv.config({ path: "../../../.env" });

import { createService, startService, SERVICE_PORTS } from "@circuvent/shared";
import { deviceRouter } from "./routes/device.routes";
import { telemetryRouter } from "./routes/telemetry.routes";
import { heartbeatRouter } from "./routes/heartbeat.routes";
import { firmwareRouter } from "./routes/firmware.routes";
import { provisioningRouter } from "./routes/provisioning.routes";

const config = {
  name: "iot-registry",
  port: Number(process.env.IOT_REGISTRY_PORT) || SERVICE_PORTS.IOT_REGISTRY,
};

const app = createService(config);

// ── Service Routes (mounted at both /api/* and /api/iot/* for gateway compatibility) ──
app.use("/api/devices", deviceRouter);
app.use("/api/telemetry", telemetryRouter);
app.use("/api/heartbeat", heartbeatRouter);
app.use("/api/firmware", firmwareRouter);
app.use("/api/provisioning", provisioningRouter);
// Gateway-proxied paths (gateway sends /api/iot/devices etc.)
app.use("/api/iot/devices", deviceRouter);
app.use("/api/iot/telemetry", telemetryRouter);
app.use("/api/iot/heartbeat", heartbeatRouter);
app.use("/api/iot/firmware", firmwareRouter);
app.use("/api/iot/provisioning", provisioningRouter);
app.use("/api/firmware", firmwareRouter);

// ── Error Handler ──
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error(`[${config.name}] Error:`, err.message);
  res.status(500).json({ success: false, error: err.message });
});

startService(app, config);

export default app;
