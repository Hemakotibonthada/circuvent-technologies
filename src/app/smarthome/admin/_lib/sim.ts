"use client";

// Central simulation + data layer for the Circuvent IoT Admin dashboard.
// Every entity is generated deterministically (seeded RNG) so the UI is stable,
// then exposed through persisted reactive stores so create/edit/delete works
// across the whole admin. Where the real control plane has an endpoint
// (devices, users, events, health, OTA, broadcast) pages call it directly;
// enterprise-only surfaces (tenants, PKI, billing, rules engine, telemetry
// pipeline...) are backed by this store and clearly structured to wire later.

import { createStore, rng, pick, int, float, chance, walk } from "./store";

// ---------------------------------------------------------------- constants --

export const REGIONS = ["us-east-1", "us-west-2", "eu-central-1", "ap-south-1", "ap-southeast-2", "sa-east-1"] as const;
export const DEVICE_TYPES = [
  "smart-plug", "smart-switch", "smart-light", "smart-fan", "smart-lock",
  "curtain", "aquaguard", "home-hub", "motion-sensor", "energy-monitor",
  "thermostat", "gateway", "air-quality", "water-leak", "camera",
] as const;
export const HW_MODELS = ["CV-ESP32-S3", "CV-ESP32-C6", "CV-RP2040", "CV-nRF52840", "CV-STM32H7", "CV-GW-LTE"] as const;
export const FW_VERSIONS = ["3.4.1", "3.4.0", "3.3.2", "3.2.0", "2.9.5"] as const;
export const CONNECTIVITY = ["wifi", "ethernet", "cellular", "zigbee", "thread", "lora"] as const;
export const LIFECYCLE = ["draft", "provisioned", "active", "maintenance", "suspended", "decommissioned"] as const;
export const HEALTH = ["healthy", "warning", "critical", "offline"] as const;

export type Region = (typeof REGIONS)[number];
export type Health = (typeof HEALTH)[number];
export type Lifecycle = (typeof LIFECYCLE)[number];

const FIRST = ["Alex", "Priya", "Sam", "Mei", "Diego", "Yuki", "Omar", "Nina", "Ravi", "Lena", "Tomas", "Aisha", "Kenji", "Sara", "Ivan", "Zoe"];
const LAST = ["Kim", "Patel", "Rivera", "Chen", "Novak", "Okafor", "Haddad", "Sato", "Muller", "Silva", "Ivanov", "Reyes", "Khan", "Adebayo", "Costa", "Bauer"];
const ORGS = ["Northwind Facilities", "Aurora Energy", "Helix Robotics", "Meridian Retail", "Vanta Logistics", "Cobalt Smart Homes"];
const CITIES: Record<Region, [string, number, number]> = {
  "us-east-1": ["Ashburn", 39.04, -77.48],
  "us-west-2": ["Portland", 45.52, -122.68],
  "eu-central-1": ["Frankfurt", 50.11, 8.68],
  "ap-south-1": ["Mumbai", 19.08, 72.88],
  "ap-southeast-2": ["Sydney", -33.87, 151.21],
  "sa-east-1": ["São Paulo", -23.55, -46.63],
};

// ------------------------------------------------------------------- types ---

export interface Tenant {
  id: string;
  name: string;
  plan: "Free" | "Pro" | "Business" | "Enterprise";
  status: "active" | "trial" | "suspended";
  region: Region;
  devices: number;
  deviceQuota: number;
  seats: number;
  seatQuota: number;
  storageGb: number;
  storageQuotaGb: number;
  mrr: number;
  primaryColor: string;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  members: number;
  permissions: string[];
}

export interface AdminUserX {
  id: string;
  name: string;
  email: string;
  role: string;
  tenant: string;
  status: "active" | "invited" | "suspended";
  mfa: boolean;
  lastActive: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  tenant: string;
  createdBy: string;
  lastUsed: string | null;
  createdAt: string;
  expiresAt: string | null;
  status: "active" | "revoked";
}

export interface Session {
  id: string;
  user: string;
  email: string;
  ip: string;
  location: string;
  device: string;
  current: boolean;
  startedAt: string;
  lastSeen: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  category: "auth" | "device" | "config" | "security" | "billing" | "ota";
  ip: string;
  ts: string;
}

export interface FleetDevice {
  id: string;
  name: string;
  type: string;
  model: string;
  tenant: string;
  region: Region;
  city: string;
  lat: number;
  lng: number;
  health: Health;
  healthScore: number;
  lifecycle: Lifecycle;
  online: boolean;
  fw: string;
  connectivity: string;
  rssi: number;
  battery: number | null;
  powerSource: "grid" | "battery" | "solar" | "poe";
  cpu: number;
  mem: number;
  uptimeSec: number;
  lastSeen: string;
  tags: string[];
  gateway: string | null;
}

export interface ProvisioningJob {
  id: string;
  name: string;
  method: "manual" | "bulk-csv" | "qr" | "jit" | "api";
  total: number;
  succeeded: number;
  failed: number;
  status: "queued" | "running" | "completed" | "failed";
  tenant: string;
  startedAt: string;
}

export interface MetricDef {
  id: string;
  name: string;
  unit: string;
  type: "gauge" | "counter" | "boolean" | "string";
  retentionDays: number;
  downsample: string;
  msgPerMin: number;
}

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: string;
  condition: string;
  action: string;
  runs24h: number;
  lastRun: string | null;
  mode: "live" | "dry-run";
  createdAt: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: "info" | "warning" | "minor" | "major" | "critical";
  status: "active" | "acknowledged" | "resolved";
  device: string;
  tenant: string;
  channel: string[];
  assignee: string | null;
  openedAt: string;
  resolvedAt: string | null;
}

export interface Firmware {
  id: string;
  version: string;
  model: string;
  channel: "stable" | "beta" | "canary";
  sizeBytes: number;
  sha256: string;
  signed: boolean;
  notes: string;
  uploadedAt: string;
}

export interface OtaCampaign {
  id: string;
  name: string;
  firmware: string;
  target: string;
  total: number;
  pending: number;
  downloading: number;
  success: number;
  failed: number;
  status: "draft" | "rolling" | "paused" | "completed" | "aborted";
  strategy: string;
  createdAt: string;
}

export interface Certificate {
  id: string;
  cn: string;
  type: "device" | "server" | "ca" | "intermediate";
  issuer: string;
  serial: string;
  status: "valid" | "expiring" | "expired" | "revoked";
  issuedAt: string;
  expiresAt: string;
}

export interface Integration {
  id: string;
  name: string;
  category: "cloud" | "database" | "messaging" | "erp" | "notify";
  status: "connected" | "error" | "disconnected";
  lastSync: string | null;
  events24h: number;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: "active" | "failing" | "paused";
  successRate: number;
  lastDelivery: string | null;
}

export interface Invoice {
  id: string;
  tenant: string;
  period: string;
  amount: number;
  status: "paid" | "open" | "overdue";
  devices: number;
  apiCalls: number;
  storageGb: number;
  issuedAt: string;
}

export interface Microservice {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs: number;
  cpu: number;
  mem: number;
  instances: number;
  version: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout: number;
  audience: string;
  updatedAt: string;
}

// -------------------------------------------------------------- generators ---

const now = () => Date.now();
const ago = (r: () => number, maxDays: number) => new Date(now() - Math.floor(r() * maxDays * 864e5)).toISOString();
const ahead = (r: () => number, maxDays: number) => new Date(now() + Math.floor(r() * maxDays * 864e5)).toISOString();
const name = (r: () => number) => `${pick(r, FIRST)} ${pick(r, LAST)}`;
const ip = (r: () => number) => `${int(r, 12, 220)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`;
const hex = (r: () => number, len: number) => Array.from({ length: len }, () => "0123456789abcdef"[int(r, 0, 15)]).join("");

function genTenants(): Tenant[] {
  const r = rng("tenants");
  const colors = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];
  return ORGS.map((n, i) => {
    const devices = int(r, 40, 4200);
    const seats = int(r, 3, 60);
    return {
      id: `ten-${i + 1}`,
      name: n,
      plan: pick(r, ["Pro", "Business", "Enterprise", "Enterprise", "Business"]) as Tenant["plan"],
      status: pick(r, ["active", "active", "active", "trial", "suspended"]) as Tenant["status"],
      region: pick(r, REGIONS),
      devices,
      deviceQuota: Math.ceil((devices * int(r, 120, 200)) / 100 / 100) * 100,
      seats,
      seatQuota: seats + int(r, 5, 40),
      storageGb: float(r, 5, 480, 1),
      storageQuotaGb: 500,
      mrr: int(r, 4, 90) * 100,
      primaryColor: colors[i % colors.length],
      createdAt: ago(r, 900),
    };
  });
}

function genRoles(): Role[] {
  const base = [
    ["Super Admin", "Full platform control across all tenants", ["*"]],
    ["Fleet Manager", "Manage devices, provisioning and OTA", ["device:*", "ota:*", "provision:*", "telemetry:read"]],
    ["Support Engineer", "Diagnose devices and manage incidents", ["device:read", "telemetry:read", "incident:*", "command:execute"]],
    ["Security Officer", "Certificates, audit and compliance", ["security:*", "audit:read", "cert:*"]],
    ["Billing Admin", "Invoices, usage and subscriptions", ["billing:*", "tenant:read"]],
    ["View-Only", "Read-only dashboards", ["*:read"]],
  ];
  const r = rng("roles");
  return base.map(([n, d, p], i) => ({
    id: `role-${i + 1}`,
    name: n as string,
    description: d as string,
    builtin: i < 4,
    members: int(r, 1, 24),
    permissions: p as string[],
  }));
}

function genUsers(): AdminUserX[] {
  const r = rng("users");
  const roles = ["Super Admin", "Fleet Manager", "Support Engineer", "Security Officer", "Billing Admin", "View-Only"];
  return Array.from({ length: 42 }, (_, i) => {
    const nm = name(r);
    return {
      id: `usr-${i + 1}`,
      name: nm,
      email: `${nm.toLowerCase().replace(/[^a-z]+/g, ".")}@${pick(r, ["circuvent.com", "northwind.io", "aurora.energy", "helix.dev"])}`,
      role: i === 0 ? "Super Admin" : pick(r, roles),
      tenant: pick(r, ORGS),
      status: pick(r, ["active", "active", "active", "active", "invited", "suspended"]) as AdminUserX["status"],
      mfa: chance(r, 0.72),
      lastActive: ago(r, 30),
      createdAt: ago(r, 700),
    };
  });
}

function genApiKeys(): ApiKey[] {
  const r = rng("apikeys");
  const scopeSets = [["device:read"], ["device:read", "device:command"], ["telemetry:read"], ["*"], ["ota:deploy", "device:read"], ["provision:create"]];
  return Array.from({ length: 18 }, (_, i) => ({
    id: `key-${i + 1}`,
    name: pick(r, ["CI Pipeline", "Grafana Export", "Mobile Backend", "Partner Integration", "Edge Gateway", "Analytics ETL", "Zapier Hook", "Field Ops App"]),
    prefix: `cv_${pick(r, ["live", "test"])}_${hex(r, 6)}`,
    scopes: pick(r, scopeSets),
    tenant: pick(r, ORGS),
    createdBy: name(r),
    lastUsed: chance(r, 0.8) ? ago(r, 20) : null,
    createdAt: ago(r, 500),
    expiresAt: chance(r, 0.5) ? ahead(r, 365) : null,
    status: chance(r, 0.85) ? "active" : "revoked",
  }));
}

function genSessions(): Session[] {
  const r = rng("sessions");
  const devs = ["Chrome · macOS", "Safari · iOS", "Firefox · Windows", "Edge · Windows", "Chrome · Android", "CLI · Linux"];
  return Array.from({ length: 22 }, (_, i) => {
    const reg = pick(r, REGIONS);
    return {
      id: `ses-${i + 1}`,
      user: name(r),
      email: `user${i}@circuvent.com`,
      ip: ip(r),
      location: `${CITIES[reg][0]} · ${reg}`,
      device: pick(r, devs),
      current: i === 0,
      startedAt: ago(r, 3),
      lastSeen: ago(r, 1),
    };
  });
}

function genAudit(): AuditEntry[] {
  const r = rng("audit");
  const acts: [string, AuditEntry["category"]][] = [
    ["signed in", "auth"], ["rotated API key", "security"], ["deployed OTA campaign", "ota"],
    ["updated role permissions", "security"], ["decommissioned device", "device"],
    ["changed billing plan", "billing"], ["created tenant", "config"], ["revoked certificate", "security"],
    ["acknowledged incident", "device"], ["exported audit log", "security"], ["enabled feature flag", "config"],
    ["suspended user", "auth"], ["pushed config", "config"], ["quarantined device", "security"],
  ];
  return Array.from({ length: 60 }, (_, i) => {
    const [action, category] = pick(r, acts);
    return {
      id: `aud-${i + 1}`,
      actor: name(r),
      action,
      target: pick(r, ["dev-8f2a1c", "ten-2", "role-3", "campaign-4", "key-7", "user-12", "eu-central-1"]),
      category,
      ip: ip(r),
      ts: ago(r, 21),
    };
  });
}

function genFleet(): FleetDevice[] {
  const r = rng("fleet-v2");
  return Array.from({ length: 160 }, (_, i) => {
    const region = pick(r, REGIONS);
    const [city, lat, lng] = CITIES[region];
    const online = chance(r, 0.86);
    const type = pick(r, DEVICE_TYPES);
    const battery = ["motion-sensor", "water-leak", "smart-lock", "air-quality"].includes(type) ? int(r, 4, 100) : null;
    const score = online ? int(r, 40, 100) : int(r, 0, 55);
    const health: Health = !online ? "offline" : score > 80 ? "healthy" : score > 60 ? "warning" : "critical";
    return {
      id: `dev-${hex(r, 6)}`,
      name: `${type}-${int(r, 100, 999)}`,
      type,
      model: pick(r, HW_MODELS),
      tenant: pick(r, ORGS),
      region,
      city,
      lat: lat + float(r, -1.4, 1.4, 3),
      lng: lng + float(r, -1.4, 1.4, 3),
      health,
      healthScore: score,
      lifecycle: online ? pick(r, ["active", "active", "active", "maintenance"]) : pick(r, ["active", "suspended", "provisioned"]),
      online,
      fw: pick(r, FW_VERSIONS),
      connectivity: pick(r, CONNECTIVITY),
      rssi: -int(r, 34, 92),
      battery,
      powerSource: battery ? (chance(r, 0.3) ? "solar" : "battery") : pick(r, ["grid", "grid", "poe"]),
      cpu: int(r, 3, 92),
      mem: int(r, 18, 95),
      uptimeSec: int(r, 300, 90 * 86400),
      lastSeen: online ? ago(r, 0.02) : ago(r, 14),
      tags: [pick(r, ["prod", "staging", "field"]), pick(r, ["rack-01", "floor-2", "zone-a", "warehouse"])],
      gateway: chance(r, 0.4) ? `gw-${hex(r, 4)}` : null,
    };
  });
}

function genProvisioning(): ProvisioningJob[] {
  const r = rng("prov");
  return Array.from({ length: 14 }, (_, i) => {
    const total = int(r, 5, 800);
    const failed = int(r, 0, Math.floor(total * 0.15));
    const done = chance(r, 0.6);
    const succeeded = done ? total - failed : int(r, 0, total - failed);
    return {
      id: `job-${i + 1}`,
      name: pick(r, ["Warehouse rollout", "Retail Q3 batch", "Field sensors", "Gateway refresh", "Pilot units", "EU expansion"]) + ` #${int(r, 10, 99)}`,
      method: pick(r, ["bulk-csv", "qr", "jit", "manual", "api"]),
      total,
      succeeded,
      failed,
      status: done ? (failed > total * 0.1 ? "failed" : "completed") : pick(r, ["running", "queued"]),
      tenant: pick(r, ORGS),
      startedAt: ago(r, 30),
    };
  });
}

function genMetrics(): MetricDef[] {
  const defs: [string, string, MetricDef["type"]][] = [
    ["temperature", "°C", "gauge"], ["humidity", "%", "gauge"], ["power", "W", "gauge"],
    ["energy", "kWh", "counter"], ["voltage", "V", "gauge"], ["current", "A", "gauge"],
    ["motion", "", "boolean"], ["co2", "ppm", "gauge"], ["water_level", "%", "gauge"],
    ["rssi", "dBm", "gauge"], ["battery", "%", "gauge"], ["door", "", "boolean"],
  ];
  const r = rng("metrics");
  return defs.map(([n, u, t], i) => ({
    id: `met-${i + 1}`,
    name: n,
    unit: u,
    type: t,
    retentionDays: pick(r, [7, 30, 90, 365]),
    downsample: pick(r, ["1m avg", "5m avg/max", "1h min/max/avg", "raw"]),
    msgPerMin: int(r, 20, 5200),
  }));
}

function genRules(): Rule[] {
  const r = rng("rules");
  const templates = [
    ["High temperature shutoff", "temperature > 80°C for 5m", "notify + power off relay"],
    ["Night lighting", "every day 22:00", "turn off all lights"],
    ["Leak response", "water_leak == true", "close valve + SMS on-call"],
    ["Occupancy HVAC", "motion == false for 30m", "setpoint eco mode"],
    ["Low battery alert", "battery < 15%", "notify field ops"],
    ["Geofence arm", "phone exits home", "arm security"],
    ["Peak shaving", "grid_price > 0.30", "shift load to battery"],
    ["Anomaly guard", "ML anomaly score > 0.9", "quarantine device"],
  ];
  return templates.map(([n, c, a], i) => ({
    id: `rule-${i + 1}`,
    name: n,
    enabled: chance(r, 0.78),
    trigger: c.split(" ")[0],
    condition: c,
    action: a,
    runs24h: int(r, 0, 340),
    lastRun: chance(r, 0.8) ? ago(r, 2) : null,
    mode: chance(r, 0.85) ? "live" : "dry-run",
    createdAt: ago(r, 300),
  }));
}

function genIncidents(): Incident[] {
  const r = rng("incidents");
  const titles = ["Device offline > 30m", "Tank overflow detected", "High CPU on gateway", "Certificate expiring", "Abnormal payload rate", "SOS triggered", "Firmware rollback", "MQTT broker latency", "Battery critical", "Tamper detected"];
  return Array.from({ length: 24 }, (_, i) => {
    const status = pick(r, ["active", "active", "acknowledged", "resolved", "resolved"]) as Incident["status"];
    return {
      id: `inc-${1000 + i}`,
      title: pick(r, titles),
      severity: pick(r, ["info", "warning", "warning", "minor", "major", "critical"]),
      status,
      device: `dev-${hex(r, 6)}`,
      tenant: pick(r, ORGS),
      channel: [pick(r, ["email", "sms", "slack", "teams", "push"]), pick(r, ["email", "webhook"])],
      assignee: status === "active" ? null : name(r),
      openedAt: ago(r, 10),
      resolvedAt: status === "resolved" ? ago(r, 2) : null,
    };
  });
}

function genFirmware(): Firmware[] {
  const r = rng("firmware");
  const list: Firmware[] = [];
  FW_VERSIONS.forEach((v, i) => {
    HW_MODELS.slice(0, 3).forEach((m) => {
      list.push({
        id: `fw-${v}-${m}`,
        version: v,
        model: m,
        channel: i === 0 ? "beta" : i === 1 ? "stable" : "stable",
        sizeBytes: int(r, 480_000, 2_400_000),
        sha256: hex(r, 64),
        signed: chance(r, 0.9),
        notes: pick(r, ["Security patches + OTA resume", "MQTT reconnect fixes", "Power calibration", "New sensor driver", "Watchdog hardening"]),
        uploadedAt: ago(r, 120),
      });
    });
  });
  return list;
}

function genCampaigns(): OtaCampaign[] {
  const r = rng("campaigns");
  return Array.from({ length: 8 }, (_, i) => {
    const total = int(r, 40, 3200);
    const success = int(r, 0, total);
    const failed = int(r, 0, Math.floor((total - success) * 0.4));
    const rem = total - success - failed;
    return {
      id: `campaign-${i + 1}`,
      name: pick(r, ["Security rollout", "3.4.1 stable", "Gateway refresh", "Beta canary", "EU fleet update"]) + ` ${int(r, 1, 9)}`,
      firmware: pick(r, FW_VERSIONS),
      target: pick(r, ["All active", "region: eu-central-1", "model: CV-ESP32-S3", "fw < 3.3.0", "tag: prod"]),
      total,
      pending: Math.max(0, Math.floor(rem * 0.6)),
      downloading: Math.max(0, Math.ceil(rem * 0.4)),
      success,
      failed,
      status: pick(r, ["rolling", "completed", "paused", "draft", "completed"]),
      strategy: pick(r, ["5% → 25% → 100%", "Canary 2%", "All at once", "Ring deployment"]),
      createdAt: ago(r, 40),
    };
  });
}

function genCerts(): Certificate[] {
  const r = rng("certs");
  return Array.from({ length: 28 }, (_, i) => {
    const days = int(r, -20, 400);
    const status: Certificate["status"] = chance(r, 0.08) ? "revoked" : days < 0 ? "expired" : days < 30 ? "expiring" : "valid";
    return {
      id: `crt-${i + 1}`,
      cn: i < 3 ? pick(r, ["Circuvent Root CA", "Device Issuing CA", "Server CA"]) : `dev-${hex(r, 6)}.devices.circuvent.com`,
      type: i === 0 ? "ca" : i < 3 ? "intermediate" : chance(r, 0.15) ? "server" : "device",
      issuer: pick(r, ["Circuvent Root CA", "Device Issuing CA"]),
      serial: hex(r, 16).toUpperCase(),
      status,
      issuedAt: ago(r, 400),
      expiresAt: new Date(now() + days * 864e5).toISOString(),
    };
  });
}

function genIntegrations(): Integration[] {
  const items: [string, Integration["category"]][] = [
    ["AWS IoT Core", "cloud"], ["Azure IoT Hub", "cloud"], ["Google Cloud IoT", "cloud"],
    ["InfluxDB", "database"], ["Snowflake", "database"], ["PostgreSQL", "database"],
    ["Apache Kafka", "messaging"], ["RabbitMQ", "messaging"], ["Slack", "notify"],
    ["Microsoft Teams", "notify"], ["Twilio SMS", "notify"], ["Salesforce", "erp"],
    ["SAP", "erp"], ["ServiceNow", "erp"],
  ];
  const r = rng("integrations");
  return items.map(([n, c], i) => ({
    id: `int-${i + 1}`,
    name: n,
    category: c,
    status: pick(r, ["connected", "connected", "connected", "error", "disconnected"]),
    lastSync: chance(r, 0.8) ? ago(r, 1) : null,
    events24h: int(r, 0, 82000),
  }));
}

function genWebhooks(): Webhook[] {
  const r = rng("webhooks");
  return Array.from({ length: 10 }, (_, i) => ({
    id: `wh-${i + 1}`,
    url: `https://${pick(r, ["hooks.zapier.com", "api.partner.io", "ops.internal.net", "events.acme.co"])}/${hex(r, 8)}`,
    events: [pick(r, ["device.online", "device.offline", "incident.created", "ota.completed", "telemetry.threshold"]), pick(r, ["device.claimed", "rule.triggered"])],
    status: pick(r, ["active", "active", "active", "failing", "paused"]),
    successRate: float(r, 82, 100, 1),
    lastDelivery: chance(r, 0.9) ? ago(r, 1) : null,
  }));
}

function genInvoices(): Invoice[] {
  const r = rng("invoices");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const out: Invoice[] = [];
  ORGS.forEach((t, ti) => {
    months.slice(0, 4).forEach((m, mi) => {
      const devices = int(r, 40, 4000);
      out.push({
        id: `inv-${ti}-${mi}`,
        tenant: t,
        period: `${m} 2026`,
        amount: devices * float(r, 0.4, 1.2, 2) + int(r, 100, 900),
        status: mi === 3 ? pick(r, ["open", "overdue"]) : "paid",
        devices,
        apiCalls: int(r, 50_000, 9_000_000),
        storageGb: float(r, 5, 480, 1),
        issuedAt: ago(r, (4 - mi) * 30),
      });
    });
  });
  return out;
}

function genMicroservices(): Microservice[] {
  const svcs = ["auth-service", "device-registry", "ingestion-pipeline", "rules-engine", "ota-service", "notification-service", "billing-service", "api-gateway", "websocket-hub", "mqtt-broker"];
  const r = rng("svcs");
  return svcs.map((s, i) => ({
    id: `svc-${i + 1}`,
    name: s,
    status: chance(r, 0.85) ? "operational" : chance(r, 0.6) ? "degraded" : "down",
    latencyMs: int(r, 8, 340),
    cpu: int(r, 10, 88),
    mem: int(r, 22, 90),
    instances: int(r, 2, 12),
    version: `v${int(r, 1, 4)}.${int(r, 0, 9)}.${int(r, 0, 9)}`,
  }));
}

function genFlags(): FeatureFlag[] {
  const flags = [
    ["digital-twin-ui", "New device digital twin viewer"],
    ["ml-anomaly", "ML-based anomaly detection in rules"],
    ["edge-rules", "Deploy rules to edge gateways"],
    ["delta-ota", "Differential/delta OTA updates"],
    ["graphql-api", "GraphQL API endpoint"],
    ["kiosk-mode", "TV/kiosk dashboard mode"],
    ["i18n-de", "German localization"],
    ["passwordless", "WebAuthn passwordless login"],
    ["billing-v2", "Usage-based billing engine v2"],
    ["heatmaps", "Sensor heatmap visualization"],
  ];
  const r = rng("flags");
  return flags.map(([k, d], i) => ({
    id: `flag-${i + 1}`,
    key: k,
    description: d,
    enabled: chance(r, 0.5),
    rollout: pick(r, [0, 5, 10, 25, 50, 100]),
    audience: pick(r, ["all tenants", "beta program", "internal", "Enterprise plan"]),
    updatedAt: ago(r, 40),
  }));
}

// ----------------------------------------------------------------- stores ---

export const tenantsStore = createStore("tenants", genTenants);
export const rolesStore = createStore("roles", genRoles);
export const usersStore = createStore("users", genUsers);
export const apiKeysStore = createStore("apikeys", genApiKeys);
export const sessionsStore = createStore("sessions", genSessions, { persist: false });
export const auditStore = createStore("audit", genAudit, { persist: false });
export const fleetStore = createStore("fleet", genFleet);
export const provisioningStore = createStore("provisioning", genProvisioning);
export const metricsStore = createStore("metrics", genMetrics);
export const rulesStore = createStore("rules", genRules);
export const incidentsStore = createStore("incidents", genIncidents);
export const firmwareStore = createStore("firmware", genFirmware);
export const campaignsStore = createStore("campaigns", genCampaigns);
export const certsStore = createStore("certs", genCerts);
export const integrationsStore = createStore("integrations", genIntegrations);
export const webhooksStore = createStore("webhooks", genWebhooks);
export const invoicesStore = createStore("invoices", genInvoices, { persist: false });
export const servicesStore = createStore("services", genMicroservices, { persist: false });
export const flagsStore = createStore("flags", genFlags);

// ----------------------------------------------------- derived / read-only ---

/** Live-ish telemetry stream lines for the stream viewer. */
export function telemetryStream(count = 40): { ts: string; device: string; metric: string; value: string }[] {
  const r = rng("stream" + Math.floor(Date.now() / 3000));
  const metrics = genMetrics();
  return Array.from({ length: count }, (_, i) => {
    const m = pick(r, metrics);
    return {
      ts: new Date(Date.now() - i * int(r, 40, 900)).toISOString(),
      device: `dev-${hex(r, 6)}`,
      metric: m.name,
      value: m.type === "boolean" ? pick(r, ["true", "false"]) : `${float(r, 0, 100, 2)}${m.unit}`,
    };
  });
}

export const series = { walk };
