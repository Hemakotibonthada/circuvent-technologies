// Centralized, typed application configuration and environment validation.
//
// A single source of truth for site-wide constants (URLs, branding, contacts)
// and a fail-fast check that required environment variables are present. Import
// `siteConfig` anywhere; call `validateEnv()` once at startup (see logger/boot).
//
// Values are read from environment variables where they may differ per
// deployment, with sensible production defaults so the app never crashes on a
// missing optional var.

/** Canonical public origin. Override per-deployment with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://circuvent.com"
).replace(/\/$/, "");

export const siteConfig = {
  name: "Circuvent Technologies",
  shortName: "Circuvent",
  url: SITE_URL,
  description:
    "Engineering intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code. Zero limits.",
  logo: "/logo-mark.png",
  ogImage: "/og-image.png",
  twitterHandle: "@circuvent_tech",
  themeColor: "#030712",
  social: {
    github: "https://github.com/Hemakotibonthada",
    linkedin: "https://linkedin.com/company/circuvent",
    twitter: "https://twitter.com/circuvent_tech",
  },
  contact: {
    email: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || "hello@circuvent.com",
  },
} as const;

// ------------------------------------------------------- env validation ----

type EnvVar = {
  key: string;
  required: boolean;
  /** Only enforced in production (e.g. payment keys). */
  prodOnly?: boolean;
  description: string;
};

const ENV_SPEC: EnvVar[] = [
  { key: "DATABASE_URL", required: true, prodOnly: true, description: "Postgres connection string (durable store)" },
  { key: "ACCOUNT_SECRET", required: true, prodOnly: true, description: "Customer session token signing secret" },
  { key: "ADMIN_SECRET", required: true, prodOnly: true, description: "Staff session token signing secret" },
  { key: "ADMIN_DEFAULT_PASSWORD", required: false, description: "Seed password for the bootstrap owner account" },
  { key: "RAZORPAY_KEY_ID", required: false, prodOnly: true, description: "Razorpay live key id" },
  { key: "RAZORPAY_KEY_SECRET", required: false, prodOnly: true, description: "Razorpay live key secret" },
  { key: "SMTP_HOST", required: false, description: "Transactional email host" },
  { key: "RESEND_API_KEY", required: false, description: "Resend email fallback" },
];

export interface EnvReport {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates the runtime environment. In production, missing REQUIRED vars are
 * returned as `missing` (callers may choose to throw). Missing optional/prod
 * vars are reported as warnings. Never throws by itself.
 */
export function validateEnv(): EnvReport {
  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_SPEC) {
    const present = !!process.env[v.key]?.trim();
    if (present) continue;
    const enforced = v.required && (!v.prodOnly || isProd);
    if (enforced) missing.push(`${v.key} — ${v.description}`);
    else warnings.push(`${v.key} — ${v.description}`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

/** True when a durable database is configured. */
export const isDbConfigured = (): boolean => !!process.env.DATABASE_URL;

/** True in production. */
export const isProduction = (): boolean => process.env.NODE_ENV === "production";
