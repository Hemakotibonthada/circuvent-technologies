/**
 * Comprehensive SEO Metadata Configuration
 * 
 * Centralized metadata, structured data, and SEO utilities
 * for all pages in the Circuvent Technologies website.
 */

import type { Metadata } from "next";

// ============================================================
// BASE CONFIGURATION
// ============================================================

const SITE_NAME = "Circuvent Technologies";
const SITE_URL = "https://circuvent.tech";
const SITE_DESCRIPTION = "Engineering intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code. Zero limits.";
const DEFAULT_OG_IMAGE = "/og-image.png";
const TWITTER_HANDLE = "@circuvent_tech";

// ============================================================
// PAGE-SPECIFIC METADATA
// ============================================================

export interface PageMeta {
  title: string;
  description: string;
  keywords: string[];
  path: string;
  ogImage?: string;
  ogType?: string;
  noIndex?: boolean;
  canonical?: string;
}

export const pageMetadata: Record<string, PageMeta> = {
  home: {
    title: "Engineering What's Next",
    description: "Circuvent Technologies crafts intelligent systems at the intersection of AI, IoT, and Full-Stack Engineering. 53+ projects. 200K+ lines of code.",
    keywords: ["AI", "IoT", "Full Stack", "Technology Company", "Smart Home", "Machine Learning", "React", "Next.js", "Flutter", "ESP32"],
    path: "/",
    ogType: "website",
  },
  projects: {
    title: "Projects Portfolio",
    description: "Explore our 53+ projects spanning AI agents, IoT ecosystems, FinTech platforms, healthcare AI, and enterprise tooling.",
    keywords: ["Projects", "Portfolio", "AI Projects", "IoT Projects", "Open Source", "GitHub"],
    path: "/projects",
  },
  services: {
    title: "Services",
    description: "AI solutions, IoT development, full-stack web, mobile apps, enterprise platforms, and DevOps infrastructure — delivered by experts.",
    keywords: ["Services", "AI Development", "IoT Development", "Web Development", "Mobile Apps", "Enterprise"],
    path: "/services",
  },
  about: {
    title: "About Us",
    description: "The story behind Circuvent Technologies — from a single ESP32 to 53+ projects across 6 technology domains.",
    keywords: ["About", "Company", "Story", "Team", "Culture", "Philosophy"],
    path: "/about",
  },
  team: {
    title: "Our Team",
    description: "Meet the engineers behind Circuvent Technologies. A lean, high-impact team building at the intersection of AI, IoT, and full-stack.",
    keywords: ["Team", "Engineers", "Hiring", "Careers"],
    path: "/team",
  },
  blog: {
    title: "Engineering Blog",
    description: "Deep dives into architecture decisions, engineering best practices, and lessons learned from building 53+ technology projects.",
    keywords: ["Blog", "Engineering", "Architecture", "Technical Writing", "Tutorials"],
    path: "/blog",
  },
  contact: {
    title: "Contact Us",
    description: "Let's discuss your project. Whether you need AI solutions, IoT development, or enterprise platforms — we'd love to help.",
    keywords: ["Contact", "Consultation", "Project Inquiry", "Hire"],
    path: "/contact",
  },
  careers: {
    title: "Careers",
    description: "Join the Circuvent Technologies team. We're hiring AI engineers, IoT developers, full-stack engineers, and more.",
    keywords: ["Careers", "Jobs", "Hiring", "AI Engineer", "Full Stack Developer", "IoT Engineer"],
    path: "/careers",
  },
  privacy: {
    title: "Privacy Policy",
    description: "How Circuvent Technologies collects, uses, and protects your information. Local-first AI means your data stays on your device.",
    keywords: ["Privacy", "Policy", "Data Protection", "GDPR"],
    path: "/privacy",
  },
  openSource: {
    title: "Open Source",
    description: "53+ open source repositories, 200K+ lines of code, all freely available. Transparency is our DNA.",
    keywords: ["Open Source", "GitHub", "Contributing", "MIT License", "Repositories"],
    path: "/open-source",
  },
  stack: {
    title: "Tech Stack",
    description: "Our complete technology arsenal — 40+ technologies mastered across frontend, backend, mobile, AI, IoT, and DevOps.",
    keywords: ["Tech Stack", "Technologies", "React", "Python", "Flutter", "ESP32", "Docker"],
    path: "/stack",
  },
  architecture: {
    title: "Architecture & Decisions",
    description: "Architecture patterns, technology comparisons, and engineering decisions behind our 53+ projects.",
    keywords: ["Architecture", "Design Patterns", "Technology Decisions", "Engineering"],
    path: "/architecture",
  },
  caseStudies: {
    title: "Case Studies",
    description: "Deep dive case studies of our most impactful projects — NEXUS AI OS, SmartHome Ecosystem, and CancerGuard AI.",
    keywords: ["Case Studies", "Projects", "AI", "IoT", "Healthcare"],
    path: "/case-studies",
  },
  roadmap: {
    title: "Roadmap",
    description: "Our journey and future plans — from ESP32 experiments to 100+ project target with NPU-accelerated AI.",
    keywords: ["Roadmap", "Future", "Plans", "Vision", "Timeline"],
    path: "/roadmap",
  },
  docs: {
    title: "Developer Docs",
    description: "Technical documentation for setting up, developing, deploying, and contributing to Circuvent Technologies projects.",
    keywords: ["Documentation", "Developer Guide", "API Reference", "Setup"],
    path: "/docs",
  },
  domains: {
    title: "Technology Domains",
    description: "Explore our 6 core technology domains — AI & Agents, IoT & Smart Home, FinTech, HealthTech, Enterprise, and Education.",
    keywords: ["Domains", "AI", "IoT", "FinTech", "HealthTech", "Enterprise"],
    path: "/domains",
  },
};

// ============================================================
// METADATA GENERATORS
// ============================================================

/**
 * Generate Next.js Metadata object for a page
 */
export function generatePageMetadata(pageKey: string): Metadata {
  const page = pageMetadata[pageKey];
  if (!page) {
    return {
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    };
  }

  return {
    title: `${page.title} | ${SITE_NAME}`,
    description: page.description,
    keywords: page.keywords,
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${SITE_URL}${page.path}`,
      type: (page.ogType as "website" | "article") || "website",
      siteName: SITE_NAME,
      images: [
        {
          url: page.ogImage || DEFAULT_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: page.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      creator: TWITTER_HANDLE,
      images: [page.ogImage || DEFAULT_OG_IMAGE],
    },
    alternates: {
      canonical: page.canonical || `${SITE_URL}${page.path}`,
    },
    robots: page.noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

/**
 * Generate metadata for a blog post
 */
export function generateBlogPostMetadata(post: {
  title: string;
  excerpt: string;
  slug: string;
  author: string;
  date: string;
  tags: string[];
  category: string;
}): Metadata {
  return {
    title: `${post.title} | ${SITE_NAME} Blog`,
    description: post.excerpt,
    keywords: post.tags,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `${SITE_URL}/blog/${post.slug}`,
      type: "article",
      siteName: SITE_NAME,
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      section: post.category,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      creator: TWITTER_HANDLE,
    },
  };
}

/**
 * Generate metadata for a project page
 */
export function generateProjectMetadata(project: {
  name: string;
  tagline: string;
  description: string;
  id: string;
  category: string;
  techStack: string[];
}): Metadata {
  return {
    title: `${project.name} - ${project.tagline} | ${SITE_NAME}`,
    description: project.description.slice(0, 160),
    keywords: [...project.techStack, project.category, project.name],
    openGraph: {
      title: `${project.name} — ${project.tagline}`,
      description: project.description.slice(0, 160),
      url: `${SITE_URL}/projects/${project.id}`,
      type: "website",
      siteName: SITE_NAME,
    },
  };
}

/**
 * Generate metadata for a domain page
 */
export function generateDomainMetadata(domain: {
  name: string;
  tagline: string;
  description: string;
  slug: string;
  technologies: string[];
}): Metadata {
  return {
    title: `${domain.name} - ${domain.tagline} | ${SITE_NAME}`,
    description: domain.description,
    keywords: [...domain.technologies, domain.name, "Circuvent"],
    openGraph: {
      title: `${domain.name} Domain`,
      description: domain.description,
      url: `${SITE_URL}/domains/${domain.slug}`,
      type: "website",
      siteName: SITE_NAME,
    },
  };
}

/**
 * Generate metadata for a career page
 */
export function generateCareerMetadata(role: {
  title: string;
  department: string;
  location: string;
  description: string;
  id: string;
}): Metadata {
  return {
    title: `${role.title} - ${role.department} | Careers at ${SITE_NAME}`,
    description: role.description,
    keywords: [role.title, role.department, "Jobs", "Careers", "Hiring", role.location],
    openGraph: {
      title: `${role.title} at ${SITE_NAME}`,
      description: role.description,
      url: `${SITE_URL}/careers/${role.id}`,
      type: "website",
      siteName: SITE_NAME,
    },
  };
}

// ============================================================
// STRUCTURED DATA (JSON-LD)
// ============================================================

/**
 * Organization structured data
 */
export function getOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: `${SITE_URL}/logo.png`,
    foundingDate: "2023-01-01",
    numberOfEmployees: {
      "@type": "QuantitativeValue",
      value: "1-10",
    },
    areaServed: "Worldwide",
    knowsAbout: [
      "Artificial Intelligence",
      "Internet of Things",
      "Full-Stack Development",
      "Machine Learning",
      "Embedded Systems",
      "MQTT Protocol",
      "React",
      "Next.js",
      "Flutter",
      "Python",
      "ESP32",
    ],
    sameAs: [
      "https://github.com/circuvent-technologies",
      "https://linkedin.com/company/circuvent-technologies",
      "https://twitter.com/circuvent_tech",
    ],
  };
}

/**
 * Website structured data
 */
export function getWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/projects?search={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Blog article structured data
 */
export function getBlogPostJsonLd(post: {
  title: string;
  excerpt: string;
  slug: string;
  author: string;
  date: string;
  readTime: string;
  category: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    datePublished: post.date,
    dateModified: post.date,
    url: `${SITE_URL}/blog/${post.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${SITE_URL}/blog/${post.slug}`,
    },
    articleSection: post.category,
    timeRequired: `PT${post.readTime.replace(/[^0-9]/g, "")}M`,
  };
}

/**
 * Software application structured data
 */
export function getSoftwareJsonLd(project: {
  name: string;
  description: string;
  id: string;
  techStack: string[];
  status: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.name,
    description: project.description,
    url: `${SITE_URL}/projects/${project.id}`,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    applicationSuite: SITE_NAME,
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
  };
}

/**
 * Job posting structured data
 */
export function getJobPostingJsonLd(role: {
  title: string;
  description: string;
  location: string;
  type: string;
  experience: string;
  id: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    description: role.description,
    datePosted: new Date().toISOString(),
    hiringOrganization: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    jobLocation: {
      "@type": "Place",
      address: role.location,
    },
    employmentType: role.type === "Full-time" ? "FULL_TIME" : "CONTRACTOR",
    experienceRequirements: role.experience,
    url: `${SITE_URL}/careers/${role.id}`,
  };
}

/**
 * Breadcrumb structured data
 */
export function getBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

/**
 * FAQ structured data
 */
export function getFAQJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

// ============================================================
// SITEMAP GENERATION HELPERS
// ============================================================

export interface SitemapEntry {
  url: string;
  lastModified: string;
  changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

/**
 * Generate sitemap entries for all static pages
 */
export function getStaticSitemapEntries(): SitemapEntry[] {
  const now = new Date().toISOString();

  return Object.values(pageMetadata)
    .filter((page) => !page.noIndex)
    .map((page) => ({
      url: `${SITE_URL}${page.path}`,
      lastModified: now,
      changeFrequency: page.path === "/" ? "daily" as const : "weekly" as const,
      priority: page.path === "/" ? 1.0 : page.path === "/projects" ? 0.9 : 0.7,
    }));
}

/**
 * Generate sitemap entries for dynamic pages (blogs, projects, etc.)
 */
export function getDynamicSitemapEntries(
  items: { slug: string; date: string; prefix: string; priority: number }[]
): SitemapEntry[] {
  return items.map((item) => ({
    url: `${SITE_URL}${item.prefix}/${item.slug}`,
    lastModified: item.date,
    changeFrequency: "monthly" as const,
    priority: item.priority,
  }));
}

// ============================================================
// ANALYTICS HELPERS
// ============================================================

/**
 * Track a page view (implementation depends on analytics provider)
 */
export function trackPageView(path: string, title: string) {
  if (typeof window === "undefined") return;
  
  // Google Analytics 4
  if (typeof (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag === "function") {
    (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag("event", "page_view", {
      page_path: path,
      page_title: title,
    });
  }
}

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {}
) {
  if (typeof window === "undefined") return;
  
  if (typeof (window as typeof window & { gtag?: (...args: unknown[]) => void }).gtag === "function") {
    (window as typeof window & { gtag: (...args: unknown[]) => void }).gtag("event", eventName, params);
  }
}

/**
 * Track an outbound link click
 */
export function trackOutboundLink(url: string, label: string) {
  trackEvent("outbound_click", { url, label });
}

/**
 * Track a form submission
 */
export function trackFormSubmission(formName: string, success: boolean) {
  trackEvent("form_submit", { form_name: formName, success });
}

/**
 * Track a project card click
 */
export function trackProjectClick(projectId: string, projectName: string) {
  trackEvent("project_click", { project_id: projectId, project_name: projectName });
}

/**
 * Track a blog post read
 */
export function trackBlogRead(slug: string, title: string, readTime: string) {
  trackEvent("blog_read", { slug, title, read_time: readTime });
}
