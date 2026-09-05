/**
 * Public product catalog for the Circuvent SaaS portal.
 *
 * Marketing discovery, pricing, comparison, and checkout all read from here.
 * Domains map to the live product hosts under circuvent.com.
 */

export type SaaSDomain =
  | "mail"
  | "workspace"
  | "business"
  | "people"
  | "admin"
  | "assets"
  | "insights";

export type PlanInterval = "monthly" | "yearly";

export interface SaaSProduct {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  domain: SaaSDomain;
  domainLabel: string;
  href: string;
  accent: string;
  gradient: string;
  features: string[];
  /** Capability matrix for compare page */
  capabilities: Record<string, "yes" | "no" | "partial">;
  /** Subscription plans for this product (or product family) */
  plans: SaaSPlan[];
  featured?: boolean;
}

export interface SaaSPlan {
  id: string;
  name: string;
  interval: PlanInterval;
  price: number;
  seats: number;
  blurb: string;
  features: string[];
  highlight?: boolean;
}

export interface SaaSDomainGroup {
  id: SaaSDomain;
  label: string;
  description: string;
  productIds: string[];
}

export const SAAS_PLAN_LABELS: Record<PlanInterval, string> = {
  monthly: "/seat/mo",
  yearly: "/seat/yr",
};

/** Prices are monthly INR for a single seat (yearly is billed annually). */
export const SAAS_PLANS: SaaSPlan[] = [
  {
    id: "starter",
    name: "Starter",
    interval: "monthly",
    price: 499,
    seats: 5,
    blurb: "Mail + workspace for small teams.",
    features: [
      "CV-365 workspace",
      "Domain mail (up to 25 users)",
      "Basic admin",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    interval: "monthly",
    price: 999,
    seats: 25,
    blurb: "Full suite for growing companies.",
    features: [
      "Everything in Starter",
      "ATS, HRMS, Paystub",
      "Devices & assets",
      "SSO / security groups",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    interval: "monthly",
    price: 0,
    seats: 10_000,
    blurb: "Custom scale, SAML, dedicated support.",
    features: [
      "Unlimited seats",
      "SAML / SCIM",
      "Dedicated success manager",
      "Custom domains & SLAs",
    ],
  },
];

export const SAAS_PRODUCTS: SaaSProduct[] = [
  {
    id: "mail",
    slug: "mail",
    name: "Mail",
    tagline: "Domain email for your organisation",
    description:
      "Enterprise mail on your domain — IMAP/SMTP, shared calendars, contacts and admin analytics. Hosted at mail.circuvent.com.",
    domain: "mail",
    domainLabel: "Domain mailing",
    href: "https://mail.circuvent.com",
    accent: "#0078d4",
    gradient: "linear-gradient(135deg, #0078d4 0%, #50e6ff 100%)",
    features: [
      "Custom domain + full IMAP/SMTP",
      "Spam filtering and admin dashboard",
      "AI-assisted smart inbox",
      "Shared calendars and team contacts",
    ],
    capabilities: {
      Mail: "yes",
      Workspace: "no",
      CRM: "no",
      ATS: "partial",
      Devices: "no",
      Insights: "yes",
    },
    plans: [
      {
        id: "mail-starter",
        name: "Mail Starter",
        interval: "monthly",
        price: 499,
        seats: 25,
        blurb: "Mailbox for up to 25 seats.",
        features: ["Domain mail", "Shared calendar", "Admin"],
      },
      {
        id: "mail-growth",
        name: "Mail Growth",
        interval: "monthly",
        price: 999,
        seats: 100,
        blurb: "Team mail with more seats.",
        features: ["Everything Starter", "AI inbox", "Analytics"],
        highlight: true,
      },
    ],
  },
  {
    id: "workspace",
    slug: "workspace",
    name: "CV-365 Workspace",
    tagline: "Docs, sheets, slides, chat, drive and more",
    description:
      "One productivity suite for communication and collaboration — Docs, Sheets, Slides, whiteboard, Drive, notes, tasks and meetings.",
    domain: "workspace",
    domainLabel: "Workspace & productivity",
    href: "https://work.circuvent.com",
    accent: "#185abd",
    gradient: "linear-gradient(135deg, #185abd 0%, #41a5ee 100%)",
    features: [
      "Real-time co-editing with TipTap",
      "Sheets, slides and whiteboard",
      "Drive, notes and tasks",
      "Video meetings with screen share",
    ],
    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "partial",
      ATS: "no",
      Devices: "no",
      Insights: "yes",
    },
    plans: [
      {
        id: "ws-starter",
        name: "Workspace Starter",
        interval: "monthly",
        price: 499,
        seats: 10,
        blurb: "Workspace for small teams.",
        features: ["CV-365 core", "Drive", "Tasks"],
      },
      {
        id: "ws-growth",
        name: "Workspace Growth",
        interval: "monthly",
        price: 999,
        seats: 50,
        blurb: "Full workspace for growing orgs.",
        features: ["Everything Starter", "Meetings", "Whiteboards"],
        highlight: true,
      },
    ],
  },
  {
    id: "business",
    slug: "business",
    name: "Business & CRM",
    tagline: "CRM and all business tools",
    description:
      "Customer relationships, pipelines and business operations — CRM and adjacent business modules under one organisation.",
    domain: "business",
    domainLabel: "Business",
    href: "https://crm.circuvent.com",
    accent: "#0f6cbd",
    gradient: "linear-gradient(135deg, #0f6cbd 0%, #62abf5 100%)",
    features: [
      "Customer CRM",
      "Pipeline tracking",
      "Team directories",
      "Integrates with workspace",
    ],
    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "yes",
      ATS: "partial",
      Devices: "no",
      Insights: "yes",
    },
    plans: [
      {
        id: "biz-starter",
        name: "Business Starter",
        interval: "monthly",
        price: 499,
        seats: 5,
        blurb: "CRM for small teams.",
        features: ["CRM", "Pipeline", "Basic reports"],
      },
      {
        id: "biz-growth",
        name: "Business Growth",
        interval: "monthly",
        price: 999,
        seats: 25,
        blurb: "Full CRM for growing sales teams.",
        features: ["Everything Starter", "Automation", "Shared views"],
        highlight: true,
      },
    ],
  },
  {
    id: "people",
    slug: "people",
    name: "People & Payroll",
    tagline: "Careers, ATS, HRMS, Paystub",
    description:
      "Onboarding and employee management — Careers, ATS, HRMS and Paystub for hiring through payroll.",
    domain: "people",
    domainLabel: "People & HR",
    href: "https://hrms.circuvent.com",
    accent: "#107c10",
    gradient: "linear-gradient(135deg, #107c10 0%, #6ccb5f 100%)",
    features: [
      "Careers and ATS",
      "HRMS for employees",
      "Automated payroll",
      "Payslips and filings",
    ],
    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "no",
      ATS: "yes",
      Devices: "no",
      Insights: "yes",
    },
    plans: [
      {
        id: "people-starter",
        name: "People Starter",
        interval: "monthly",
        price: 499,
        seats: 25,
        blurb: "Hiring + HR for small teams.",
        features: ["ATS", "Careers", "HRMS"],
      },
      {
        id: "people-growth",
        name: "People Growth",
        interval: "monthly",
        price: 999,
        seats: 100,
        blurb: "Full people stack with payroll.",
        features: ["Everything Starter", "Paystub", "Performance"],
        highlight: true,
      },
    ],
  },
  {
    id: "admin",
    slug: "admin",
    name: "Admin & SSO",
    tagline: "Identity, security groups and access",
    description:
      "Account portal for SSO, security groups, employee access management and organisation administration.",
    domain: "admin",
    domainLabel: "Admin",
    href: "https://myaccount.circuvent.com",
    accent: "#0f6cbd",
    gradient: "linear-gradient(135deg, #0f6cbd 0%, #62abf5 100%)",
    features: [
      "SSO / SAML",
      "Security groups",
      "Employee access management",
      "Role and group admin",
    ],
    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "yes",
      ATS: "yes",
      Devices: "no",
      Insights: "no",
    },
    plans: [
      {
        id: "admin-starter",
        name: "Admin Starter",
        interval: "monthly",
        price: 499,
        seats: 10,
        blurb: "SSO for small teams.",
        features: ["SSO", "Groups", "Profile"],
      },
      {
        id: "admin-growth",
        name: "Admin Growth",
        interval: "monthly",
        price: 999,
        seats: 50,
        blurb: "Full identity for growing orgs.",
        features: ["Everything Starter", "SAML", "SCIM"],
        highlight: true,
      },
    ],
  },
  {
    id: "assets",
    slug: "assets",
    name: "Assets & Devices",
    tagline: "Device inventory and IT control",
    description:
      "Asset management — devices, inventory and IT control for the organisation.",
    domain: "assets",
    domainLabel: "Assets",
    href: "https://assets.circuvent.com",
    accent: "#004e8c",
    gradient: "linear-gradient(135deg, #004e8c 0%, #2899f5 100%)",
    features: [
      "Device inventory",
      "IT policy and deployment",
      "Asset assignment",
      "Admin control",
    ],
    capabilities: {
      Mail: "no",
      Workspace: "partial",
      CRM: "no",
      ATS: "no",
      Devices: "yes",
      Insights: "partial",
    },
    plans: [
      {
        id: "assets-starter",
        name: "Assets Starter",
        interval: "monthly",
        price: 499,
        seats: 10,
        blurb: "Asset inventory for small teams.",
        features: ["Devices", "Inventory", "Assignment"],
      },
      {
        id: "assets-growth",
        name: "Assets Growth",
        interval: "monthly",
        price: 999,
        seats: 50,
        blurb: "Full asset control for growing orgs.",
        features: ["Everything Starter", "IT policies"],
        highlight: true,
      },
    ],
  },
  {
    id: "insights",
    slug: "insights",
    name: "Insights & ICM",
    tagline: "Analytics and incident control",
    description:
      "Operational insights, app status and incident management for the organisation.",
    domain: "insights",
    domainLabel: "Insights",
    href: "https://insights.circuvent.com",
    accent: "#0f6cbd",
    gradient: "linear-gradient(135deg, #0f6cbd 0%, #41a5ee 100%)",
    features: [
      "App status and availability",
      "Incident management",
      "Usage analytics",
      "Custom reports",
    ],
    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "partial",
      ATS: "no",
      Devices: "partial",
      Insights: "yes",
    },
    plans: [
      {
        id: "insights-starter",
        name: "Insights Starter",
        interval: "monthly",
        price: 499,
        seats: 5,
        blurb: "Status and incident visibility.",
        features: ["Status", "Incidents", "Basic reports"],
      },
      {
        id: "insights-growth",
        name: "Insights Growth",
        interval: "monthly",
        price: 999,
        seats: 25,
        blurb: "Full insights for growing teams.",
        features: ["Everything Starter", "Advanced analytics"],
        highlight: true,
      },
    ],
  },
];

export const SAAS_DOMAIN_GROUPS: SaaSDomainGroup[] = [
  {
    id: "mail",
    label: "Domain mailing",
    description: "Email for your organisation on your domain.",
    productIds: ["mail"],
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "CV-365 — communication, docs, sheets, slides, drive and more.",
    productIds: ["workspace"],
  },
  {
    id: "business",
    label: "Business",
    description: "CRM and all business tools.",
    productIds: ["business"],
  },
  {
    id: "people",
    label: "Onboarding & payroll",
    description: "Careers, ATS, HRMS and Paystub.",
    productIds: ["people"],
  },
  {
    id: "admin",
    label: "Admin",
    description: "SSO, security groups and employee access.",
    productIds: ["admin"],
  },
  {
    id: "assets",
    label: "Assets",
    description: "Device inventory and IT control.",
    productIds: ["assets"],
  },
  {
    id: "insights",
    label: "Insights & ICM",
    description: "Operational analytics and incident control.",
    productIds: ["insights"],
  },
];

export function getProductBySlug(slug: string): SaaSProduct | undefined {
  return SAAS_PRODUCTS.find((p) => p.slug === slug);
}

export function productsByDomain(domain: SaaSDomain): SaaSProduct[] {
  return SAAS_PRODUCTS.filter((p) => p.domain === domain);
}

export function formatPlanPrice(price: number): string {
  if (price <= 0) return "Custom";
  return `₹${price.toLocaleString("en-IN")}`;
}

export function productDomainLabel(domain: SaaSDomain): string {
  const g = SAAS_DOMAIN_GROUPS.find((d) => d.id === domain);
  return g?.label ?? domain;
}

export function compareRows(): string[] {
  return ["Mail", "Workspace", "CRM", "ATS", "Devices", "Insights"];
}
