/**
 * Circuvent SaaS Product Catalog
 *
 * Single source of truth for:
 * - Product discovery
 * - Product detail pages
 * - Pricing
 * - Comparison
 * - Checkout
 * - Customer portal
 * - Cross-sell / related products
 *
 * Live applications are hosted under the Circuvent domain ecosystem.
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

export type CapabilityState = "yes" | "no" | "partial";

export type ProductStatus =
  | "available"
  | "beta"
  | "coming-soon";

export interface SaaSPlan {
  id: string;

  name: string;

  interval: PlanInterval;

  /**
   * Price in INR.
   * 0 means custom / contact sales.
   */
  price: number;

  seats: number;

  blurb: string;

  features: string[];

  highlight?: boolean;

  /**
   * Optional badge displayed on pricing cards.
   * Example: "Most popular"
   */
  badge?: string;

  /**
   * Free trial duration.
   * 0 or undefined means no trial.
   */
  trialDays?: number;
}

export interface SaaSProductBenefit {
  title: string;
  description: string;
}

export interface SaaSProduct {
  id: string;

  slug: string;

  name: string;

  /**
   * Short brand-friendly name.
   * Useful for compact UI cards.
   */
  shortName?: string;

  tagline: string;

  description: string;

  /**
   * Shorter description for cards and search results.
   */
  shortDescription?: string;

  domain: SaaSDomain;

  domainLabel: string;

  /**
   * Live Circuvent product URL.
   */
  href: string;

  /**
   * Lucide icon name.
   *
   * Keep this as a string so this catalog remains
   * framework/component independent.
   */
  icon: string;

  accent: string;

  /**
   * Secondary accent for richer product visuals.
   */
  accentSecondary?: string;

  gradient: string;

  features: string[];

  /**
   * Rich benefits for product-detail sections.
   */
  benefits?: SaaSProductBenefit[];

  capabilities: Record<string, CapabilityState>;

  plans: SaaSPlan[];

  /**
   * UI metadata.
   */
  badge?: string;

  featured?: boolean;

  status?: ProductStatus;

  sortOrder?: number;

  /**
   * Short audience descriptions.
   */
  recommendedFor?: string[];

  /**
   * Related products displayed on the product page.
   */
  relatedProducts?: string[];
}

export interface SaaSDomainGroup {
  id: SaaSDomain;

  label: string;

  description: string;

  productIds: string[];

  /**
   * Lucide icon name for navigation.
   */
  icon?: string;

  sortOrder?: number;
}

/* -------------------------------------------------------------------------- */
/*                               PLAN METADATA                                */
/* -------------------------------------------------------------------------- */

export const SAAS_PLAN_LABELS: Record<PlanInterval, string> = {
  monthly: "/mo",
  yearly: "/yr",
};

/**
 * Main Circuvent Suite bundles.
 *
 * These plans can be used on /pricing for customers
 * who want multiple Circuvent products together.
 */
export const SAAS_PLANS: SaaSPlan[] = [
  {
    id: "starter",
    name: "Starter",
    interval: "monthly",
    price: 499,
    seats: 5,

    blurb:
      "Essential communication and productivity tools for small teams.",

    features: [
      "CV-365 Workspace",
      "Circuvent Mail",
      "Up to 5 team members",
      "Basic administration",
      "Standard support",
    ],

    trialDays: 14,
  },

  {
    id: "growth",
    name: "Growth",
    interval: "monthly",
    price: 999,
    seats: 25,

    blurb:
      "The complete Circuvent operating suite for growing companies.",

    features: [
      "Everything in Starter",
      "People & Payroll",
      "Business & CRM",
      "Assets & Devices",
      "Advanced analytics",
      "SSO and security groups",
      "Priority support",
    ],

    highlight: true,
    badge: "Most popular",
    trialDays: 14,
  },

  {
    id: "enterprise",
    name: "Enterprise",
    interval: "monthly",
    price: 0,
    seats: 10_000,

    blurb:
      "Enterprise-grade security, scale and dedicated support.",

    features: [
      "Everything in Growth",
      "Flexible seat limits",
      "SAML / SCIM",
      "Advanced access controls",
      "Custom domains",
      "Custom SLAs",
      "Dedicated success manager",
      "Enterprise onboarding",
    ],

    badge: "Enterprise",
  },
];

/* -------------------------------------------------------------------------- */
/*                                  PRODUCTS                                  */
/* -------------------------------------------------------------------------- */

export const SAAS_PRODUCTS: SaaSProduct[] = [
  /* ------------------------------------------------------------------------ */
  /*                                   MAIL                                   */
  /* ------------------------------------------------------------------------ */

  {
    id: "mail",

    slug: "mail",

    name: "Circuvent Mail",

    shortName: "Mail",

    tagline:
      "Professional email built for your organisation.",

    description:
      "Secure business email on your own domain with shared calendars, contacts, smart inbox capabilities, spam protection and organisation-wide administration.",

    shortDescription:
      "Secure domain email, shared calendars and smart inbox tools for your organisation.",

    domain: "mail",

    domainLabel: "Mail & communication",

    href: "https://mail.circuvent.com",

    icon: "Mail",

    accent: "#2563EB",

    accentSecondary: "#22D3EE",

    gradient:
      "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",

    badge: "Business Email",

    featured: true,

    status: "available",

    sortOrder: 1,

    recommendedFor: [
      "Startups",
      "Small businesses",
      "Enterprise teams",
      "Distributed teams",
    ],

    features: [
      "Custom business email domain",
      "IMAP and SMTP support",
      "AI-assisted smart inbox",
      "Spam and threat filtering",
      "Shared team calendars",
      "Shared contacts",
      "Mailbox administration",
      "Usage and admin analytics",
    ],

    benefits: [
      {
        title: "Professional identity",
        description:
          "Give every employee a professional email address using your company domain.",
      },
      {
        title: "Smarter inbox",
        description:
          "Reduce inbox overload with intelligent organisation and productivity features.",
      },
      {
        title: "Central administration",
        description:
          "Manage accounts, permissions and mailbox access from one place.",
      },
    ],

    capabilities: {
      Mail: "yes",
      Workspace: "partial",
      CRM: "partial",
      ATS: "partial",
      Devices: "no",
      Insights: "yes",
    },

    relatedProducts: [
      "workspace",
      "admin",
      "insights",
    ],

    plans: [
      {
        id: "mail-starter",

        name: "Mail Starter",

        interval: "monthly",

        price: 499,

        seats: 25,

        blurb:
          "Professional email for small teams.",

        features: [
          "Up to 25 mailboxes",
          "Custom domain email",
          "Shared calendar",
          "Contacts",
          "Admin console",
        ],

        trialDays: 14,
      },

      {
        id: "mail-growth",

        name: "Mail Growth",

        interval: "monthly",

        price: 999,

        seats: 100,

        blurb:
          "Advanced mail for growing organisations.",

        features: [
          "Everything in Starter",
          "Up to 100 mailboxes",
          "AI smart inbox",
          "Advanced analytics",
          "Enhanced administration",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                                WORKSPACE                                 */
  /* ------------------------------------------------------------------------ */

  {
    id: "workspace",

    slug: "workspace",

    name: "CV-365 Workspace",

    shortName: "Workspace",

    tagline:
      "One workspace for documents, communication and collaboration.",

    description:
      "A unified productivity environment for creating documents, spreadsheets and presentations while collaborating through Drive, notes, tasks, whiteboards and meetings.",

    shortDescription:
      "Docs, sheets, slides, Drive, meetings, tasks and collaboration in one workspace.",

    domain: "workspace",

    domainLabel: "Workspace & productivity",

    href: "https://work.circuvent.com",

    icon: "Layers",

    accent: "#7C3AED",

    accentSecondary: "#38BDF8",

    gradient:
      "linear-gradient(135deg, #7C3AED 0%, #2563EB 55%, #38BDF8 100%)",

    badge: "Productivity",

    featured: true,

    status: "available",

    sortOrder: 2,

    recommendedFor: [
      "Remote teams",
      "Product teams",
      "Startups",
      "Enterprise collaboration",
    ],

    features: [
      "Real-time document editing",
      "Spreadsheets",
      "Presentations",
      "Cloud Drive",
      "Team chat",
      "Notes",
      "Tasks and projects",
      "Whiteboards",
      "Video meetings",
      "Screen sharing",
    ],

    benefits: [
      {
        title: "One workspace",
        description:
          "Reduce app switching by keeping your company's everyday productivity tools together.",
      },
      {
        title: "Real-time collaboration",
        description:
          "Work together across documents, tasks and communication in real time.",
      },
      {
        title: "Built for teams",
        description:
          "Create shared spaces where teams can collaborate and organise company knowledge.",
      },
    ],

    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "partial",
      ATS: "no",
      Devices: "no",
      Insights: "yes",
    },

    relatedProducts: [
      "mail",
      "business",
      "admin",
      "insights",
    ],

    plans: [
      {
        id: "ws-starter",

        name: "Workspace Starter",

        interval: "monthly",

        price: 499,

        seats: 10,

        blurb:
          "Collaboration tools for small teams.",

        features: [
          "Up to 10 users",
          "Docs",
          "Drive",
          "Notes",
          "Tasks",
        ],

        trialDays: 14,
      },

      {
        id: "ws-growth",

        name: "Workspace Growth",

        interval: "monthly",

        price: 999,

        seats: 50,

        blurb:
          "Advanced productivity for growing teams.",

        features: [
          "Everything in Starter",
          "Up to 50 users",
          "Video meetings",
          "Whiteboards",
          "Advanced collaboration",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                              BUSINESS / CRM                              */
  /* ------------------------------------------------------------------------ */

  {
    id: "business",

    slug: "business",

    name: "Business & CRM",

    shortName: "CRM",

    tagline:
      "Turn customer relationships into predictable growth.",

    description:
      "Manage customers, sales pipelines, business operations and team collaboration from one connected CRM environment.",

    shortDescription:
      "Customer relationships, sales pipelines and business operations in one place.",

    domain: "business",

    domainLabel: "Business & CRM",

    href: "https://crm.circuvent.com",

    icon: "Building2",

    accent: "#F97316",

    accentSecondary: "#FACC15",

    gradient:
      "linear-gradient(135deg, #EA580C 0%, #F97316 55%, #FACC15 100%)",

    badge: "CRM",

    status: "available",

    sortOrder: 3,

    recommendedFor: [
      "Sales teams",
      "Business development",
      "Customer success",
      "Growing companies",
    ],

    features: [
      "Customer CRM",
      "Lead management",
      "Sales pipeline tracking",
      "Activity tracking",
      "Team directories",
      "Shared customer views",
      "Business automation",
      "Workspace integration",
    ],

    benefits: [
      {
        title: "Know every customer",
        description:
          "Keep customer conversations, activity and relationship history organised.",
      },
      {
        title: "Build predictable pipelines",
        description:
          "Track every opportunity from first contact through conversion.",
      },
      {
        title: "Connected operations",
        description:
          "Connect CRM workflows with Circuvent Workspace and communication tools.",
      },
    ],

    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "yes",
      ATS: "partial",
      Devices: "no",
      Insights: "yes",
    },

    relatedProducts: [
      "workspace",
      "mail",
      "insights",
    ],

    plans: [
      {
        id: "biz-starter",

        name: "Business Starter",

        interval: "monthly",

        price: 499,

        seats: 5,

        blurb:
          "CRM essentials for small sales teams.",

        features: [
          "CRM",
          "Leads",
          "Pipeline",
          "Basic reports",
        ],

        trialDays: 14,
      },

      {
        id: "biz-growth",

        name: "Business Growth",

        interval: "monthly",

        price: 999,

        seats: 25,

        blurb:
          "Advanced sales operations for growing teams.",

        features: [
          "Everything in Starter",
          "Automation",
          "Shared views",
          "Advanced reporting",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                                 PEOPLE                                   */
  /* ------------------------------------------------------------------------ */

  {
    id: "people",

    slug: "people",

    name: "People & Payroll",

    shortName: "People",

    tagline:
      "From first application to every payday.",

    description:
      "Manage recruiting, onboarding, employees, attendance, leave, payroll and payslips from one connected people platform.",

    shortDescription:
      "Careers, ATS, HRMS, attendance, payroll and employee operations.",

    domain: "people",

    domainLabel: "People & HR",

    href: "https://hrms.circuvent.com",

    icon: "Users",

    accent: "#16A34A",

    accentSecondary: "#4ADE80",

    gradient:
      "linear-gradient(135deg, #15803D 0%, #22C55E 60%, #86EFAC 100%)",

    badge: "HR & Payroll",

    featured: true,

    status: "available",

    sortOrder: 4,

    recommendedFor: [
      "HR teams",
      "Recruiters",
      "Managers",
      "Growing organisations",
    ],

    features: [
      "Careers portal",
      "Applicant tracking system",
      "Employee HRMS",
      "Employee onboarding",
      "Attendance management",
      "Leave management",
      "Payroll automation",
      "Payslip generation",
      "Performance workflows",
    ],

    benefits: [
      {
        title: "Hire better",
        description:
          "Manage candidates and recruiting pipelines from job posting through onboarding.",
      },
      {
        title: "Run HR operations",
        description:
          "Keep employee records, attendance, leave and HR workflows in one place.",
      },
      {
        title: "Simplify payroll",
        description:
          "Automate payroll workflows and provide secure digital payslips.",
      },
    ],

    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "no",
      ATS: "yes",
      Devices: "no",
      Insights: "yes",
    },

    relatedProducts: [
      "workspace",
      "admin",
      "mail",
      "insights",
    ],

    plans: [
      {
        id: "people-starter",

        name: "People Starter",

        interval: "monthly",

        price: 499,

        seats: 25,

        blurb:
          "Hiring and HR essentials for small organisations.",

        features: [
          "ATS",
          "Careers",
          "Employee HRMS",
          "Attendance",
        ],

        trialDays: 14,
      },

      {
        id: "people-growth",

        name: "People Growth",

        interval: "monthly",

        price: 999,

        seats: 100,

        blurb:
          "Complete people operations with payroll.",

        features: [
          "Everything in Starter",
          "Payroll",
          "Payslips",
          "Performance management",
          "Advanced HR reporting",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                                  ADMIN                                   */
  /* ------------------------------------------------------------------------ */

  {
    id: "admin",

    slug: "admin",

    name: "Admin & Identity",

    shortName: "Admin",

    tagline:
      "Secure every user, application and organisation.",

    description:
      "Central identity and administration for Circuvent applications with SSO, security groups, access policies and organisation-wide user management.",

    shortDescription:
      "Central SSO, identity, security groups and employee access management.",

    domain: "admin",

    domainLabel: "Identity & administration",

    href: "https://myaccount.circuvent.com",

    icon: "Shield",

    accent: "#DC2626",

    accentSecondary: "#F97316",

    gradient:
      "linear-gradient(135deg, #B91C1C 0%, #EF4444 55%, #FB923C 100%)",

    badge: "Security",

    status: "available",

    sortOrder: 5,

    recommendedFor: [
      "IT administrators",
      "Security teams",
      "Enterprise organisations",
      "Operations teams",
    ],

    features: [
      "Single sign-on",
      "SAML",
      "SCIM",
      "Security groups",
      "Role-based permissions",
      "Employee access management",
      "Application access policies",
      "Organisation administration",
    ],

    benefits: [
      {
        title: "One identity",
        description:
          "Give employees secure access to the entire Circuvent suite using one account.",
      },
      {
        title: "Central controls",
        description:
          "Manage roles, groups and application access from a unified admin portal.",
      },
      {
        title: "Enterprise security",
        description:
          "Support modern identity standards including SAML and SCIM.",
      },
    ],

    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "yes",
      ATS: "yes",
      Devices: "partial",
      Insights: "partial",
    },

    relatedProducts: [
      "mail",
      "workspace",
      "people",
      "assets",
    ],

    plans: [
      {
        id: "admin-starter",

        name: "Admin Starter",

        interval: "monthly",

        price: 499,

        seats: 10,

        blurb:
          "Identity management for small organisations.",

        features: [
          "SSO",
          "Groups",
          "User profiles",
          "Access management",
        ],

        trialDays: 14,
      },

      {
        id: "admin-growth",

        name: "Admin Growth",

        interval: "monthly",

        price: 999,

        seats: 50,

        blurb:
          "Advanced identity and security controls.",

        features: [
          "Everything in Starter",
          "SAML",
          "SCIM",
          "Advanced access policies",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                                  ASSETS                                  */
  /* ------------------------------------------------------------------------ */

  {
    id: "assets",

    slug: "assets",

    name: "Assets & Devices",

    shortName: "Assets",

    tagline:
      "Know every device your organisation owns.",

    description:
      "Manage company devices, inventory, ownership, assignments and IT policies from a central asset management environment.",

    shortDescription:
      "Device inventory, assignments, lifecycle management and IT controls.",

    domain: "assets",

    domainLabel: "IT & Assets",

    href: "https://assets.circuvent.com",

    icon: "Cpu",

    accent: "#0891B2",

    accentSecondary: "#22D3EE",

    gradient:
      "linear-gradient(135deg, #0E7490 0%, #06B6D4 55%, #67E8F9 100%)",

    badge: "IT Operations",

    status: "available",

    sortOrder: 6,

    recommendedFor: [
      "IT teams",
      "Operations",
      "Device-heavy organisations",
      "Enterprise companies",
    ],

    features: [
      "Device inventory",
      "Asset assignment",
      "Employee-device mapping",
      "Device lifecycle tracking",
      "IT policy management",
      "Deployment records",
      "Asset status monitoring",
      "Administrative controls",
    ],

    benefits: [
      {
        title: "Complete visibility",
        description:
          "Know which assets your organisation owns and where they are assigned.",
      },
      {
        title: "Simpler IT operations",
        description:
          "Centralise device records, ownership and operational policies.",
      },
      {
        title: "Connected administration",
        description:
          "Integrate assets with Circuvent identity and employee management.",
      },
    ],

    capabilities: {
      Mail: "no",
      Workspace: "partial",
      CRM: "no",
      ATS: "no",
      Devices: "yes",
      Insights: "partial",
    },

    relatedProducts: [
      "admin",
      "people",
      "insights",
    ],

    plans: [
      {
        id: "assets-starter",

        name: "Assets Starter",

        interval: "monthly",

        price: 499,

        seats: 10,

        blurb:
          "Asset inventory for small organisations.",

        features: [
          "Device inventory",
          "Asset assignment",
          "Lifecycle tracking",
        ],

        trialDays: 14,
      },

      {
        id: "assets-growth",

        name: "Assets Growth",

        interval: "monthly",

        price: 999,

        seats: 50,

        blurb:
          "Advanced IT asset control.",

        features: [
          "Everything in Starter",
          "IT policies",
          "Advanced reporting",
          "Administration controls",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },

  /* ------------------------------------------------------------------------ */
  /*                                 INSIGHTS                                 */
  /* ------------------------------------------------------------------------ */

  {
    id: "insights",

    slug: "insights",

    name: "Insights & ICM",

    shortName: "Insights",

    tagline:
      "Understand everything happening across your organisation.",

    description:
      "Monitor service availability, incidents, product usage and operational performance across your Circuvent environment.",

    shortDescription:
      "Operational analytics, application status, incidents and business intelligence.",

    domain: "insights",

    domainLabel: "Analytics & operations",

    href: "https://insights.circuvent.com",

    icon: "BarChart3",

    accent: "#9333EA",

    accentSecondary: "#EC4899",

    gradient:
      "linear-gradient(135deg, #7E22CE 0%, #A855F7 55%, #EC4899 100%)",

    badge: "Analytics",

    status: "available",

    sortOrder: 7,

    recommendedFor: [
      "Operations teams",
      "Leadership",
      "IT teams",
      "Product teams",
    ],

    features: [
      "Application health monitoring",
      "Service availability",
      "Incident management",
      "Operational dashboards",
      "Usage analytics",
      "Custom reports",
      "Organisation insights",
      "Cross-product visibility",
    ],

    benefits: [
      {
        title: "See your organisation",
        description:
          "Bring operational and product activity into one unified analytics layer.",
      },
      {
        title: "Respond faster",
        description:
          "Detect and manage application incidents before they become larger problems.",
      },
      {
        title: "Make informed decisions",
        description:
          "Turn product and operational activity into actionable reports.",
      },
    ],

    capabilities: {
      Mail: "partial",
      Workspace: "yes",
      CRM: "partial",
      ATS: "partial",
      Devices: "partial",
      Insights: "yes",
    },

    relatedProducts: [
      "workspace",
      "business",
      "people",
      "assets",
    ],

    plans: [
      {
        id: "insights-starter",

        name: "Insights Starter",

        interval: "monthly",

        price: 499,

        seats: 5,

        blurb:
          "Essential operational visibility.",

        features: [
          "Service status",
          "Incident management",
          "Basic reports",
        ],

        trialDays: 14,
      },

      {
        id: "insights-growth",

        name: "Insights Growth",

        interval: "monthly",

        price: 999,

        seats: 25,

        blurb:
          "Advanced organisational analytics.",

        features: [
          "Everything in Starter",
          "Advanced analytics",
          "Custom reports",
          "Cross-product insights",
        ],

        highlight: true,

        badge: "Recommended",

        trialDays: 14,
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                               DOMAIN GROUPS                                */
/* -------------------------------------------------------------------------- */

export const SAAS_DOMAIN_GROUPS: SaaSDomainGroup[] = [
  {
    id: "mail",

    label: "Mail",

    description:
      "Professional email and communication for your organisation.",

    productIds: ["mail"],

    icon: "Mail",

    sortOrder: 1,
  },

  {
    id: "workspace",

    label: "Workspace",

    description:
      "Documents, collaboration, storage and communication.",

    productIds: ["workspace"],

    icon: "Layers",

    sortOrder: 2,
  },

  {
    id: "business",

    label: "Business",

    description:
      "CRM, customers, sales and business operations.",

    productIds: ["business"],

    icon: "Building2",

    sortOrder: 3,
  },

  {
    id: "people",

    label: "People",

    description:
      "Hiring, HR, employee operations and payroll.",

    productIds: ["people"],

    icon: "Users",

    sortOrder: 4,
  },

  {
    id: "admin",

    label: "Admin & Identity",

    description:
      "Identity, SSO, security and organisation administration.",

    productIds: ["admin"],

    icon: "Shield",

    sortOrder: 5,
  },

  {
    id: "assets",

    label: "Assets",

    description:
      "Devices, inventory and IT asset management.",

    productIds: ["assets"],

    icon: "Cpu",

    sortOrder: 6,
  },

  {
    id: "insights",

    label: "Insights",

    description:
      "Analytics, availability and incident management.",

    productIds: ["insights"],

    icon: "BarChart3",

    sortOrder: 7,
  },
];

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

export function getProductBySlug(
  slug: string
): SaaSProduct | undefined {
  return SAAS_PRODUCTS.find(
    (product) => product.slug === slug
  );
}

export function getProductById(
  id: string
): SaaSProduct | undefined {
  return SAAS_PRODUCTS.find(
    (product) => product.id === id
  );
}

export function productsByDomain(
  domain: SaaSDomain
): SaaSProduct[] {
  return SAAS_PRODUCTS
    .filter((product) => product.domain === domain)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 999) -
        (b.sortOrder ?? 999)
    );
}

export function getFeaturedProducts(): SaaSProduct[] {
  return SAAS_PRODUCTS
    .filter((product) => product.featured)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 999) -
        (b.sortOrder ?? 999)
    );
}

export function getAvailableProducts(): SaaSProduct[] {
  return SAAS_PRODUCTS
    .filter(
      (product) =>
        !product.status ||
        product.status === "available"
    )
    .sort(
      (a, b) =>
        (a.sortOrder ?? 999) -
        (b.sortOrder ?? 999)
    );
}

export function getRelatedProducts(
  product: SaaSProduct
): SaaSProduct[] {
  if (!product.relatedProducts?.length) {
    return [];
  }

  return product.relatedProducts
    .map((id) => getProductById(id))
    .filter(
      (item): item is SaaSProduct =>
        Boolean(item)
    );
}

export function formatPlanPrice(
  price: number
): string {
  if (price <= 0) {
    return "Custom";
  }

  return `₹${price.toLocaleString("en-IN")}`;
}

export function formatPlanPriceWithInterval(
  plan: SaaSPlan
): string {
  if (plan.price <= 0) {
    return "Custom pricing";
  }

  return `${formatPlanPrice(plan.price)}${SAAS_PLAN_LABELS[plan.interval]
    }`;
}

export function productDomainLabel(
  domain: SaaSDomain
): string {
  const group = SAAS_DOMAIN_GROUPS.find(
    (item) => item.id === domain
  );

  return group?.label ?? domain;
}

export function compareRows(): string[] {
  return [
    "Mail",
    "Workspace",
    "CRM",
    "ATS",
    "Devices",
    "Insights",
  ];
}

export function getLowestProductPrice(
  product: SaaSProduct
): number | null {
  const paidPlans = product.plans
    .map((plan) => plan.price)
    .filter((price) => price > 0);

  if (!paidPlans.length) {
    return null;
  }

  return Math.min(...paidPlans);
}

export function getHighlightedPlan(
  product: SaaSProduct
): SaaSPlan | undefined {
  return (
    product.plans.find(
      (plan) => plan.highlight
    ) ?? product.plans[0]
  );
}