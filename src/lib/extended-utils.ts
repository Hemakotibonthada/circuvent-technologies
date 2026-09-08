/**
 * Utility functions for the Circuvent Technologies website.
 * 
 * Contains formatting, validation, animation, and general-purpose
 * utility functions used across the application.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ============================================================
// CORE UTILITIES
// ============================================================

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// STRING UTILITIES  
// ============================================================

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Convert a string to a URL-friendly slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Capitalize the first letter of each word
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extract initials from a name (up to 2 characters)
 */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a URL-safe hash from a string
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Highlight search terms in text by wrapping in <mark> tags
 */
export function highlightText(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

/**
 * Escape special regex characters
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a random string of specified length
 */
export function randomString(length: number = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");
}

// ============================================================
// NUMBER UTILITIES
// ============================================================

/**
 * Format a number with suffixes (K, M, B)
 */
export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

/**
 * Map a value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/**
 * Round a number to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Calculate reading time for text content
 */
export function calculateReadTime(text: string, wordsPerMinute: number = 200): string {
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  return `${minutes} min read`;
}

// ============================================================
// DATE UTILITIES
// ============================================================

/**
 * Format a date string to a readable format
 */
export function formatDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  }
): string {
  return new Date(dateStr).toLocaleDateString("en-US", options);
}

/**
 * Format a date as relative time (e.g., "2 days ago")
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
  if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  if (diffWeeks > 0) return `${diffWeeks} week${diffWeeks > 1 ? "s" : ""} ago`;
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  return "just now";
}

/**
 * Check if a date is in the past
 */
export function isPast(dateStr: string): boolean {
  return new Date(dateStr).getTime() < Date.now();
}

/**
 * Check if a date is in the future
 */
export function isFuture(dateStr: string): boolean {
  return new Date(dateStr).getTime() > Date.now();
}

/**
 * Get the difference between two dates in days
 */
export function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================
// VALIDATION UTILITIES
// ============================================================

/**
 * Validate an email address
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a phone number (basic)
 */
export function isValidPhone(phone: string): boolean {
  return /^[+]?[\d\s()-]{7,15}$/.test(phone);
}

/**
 * Check if a string is empty or whitespace only
 */
export function isBlank(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Check minimum length
 */
export function hasMinLength(str: string, minLength: number): boolean {
  return str.trim().length >= minLength;
}

// ============================================================
// ARRAY & OBJECT UTILITIES
// ============================================================

/**
 * Group an array by a key function
 */
export function groupBy<T>(
  array: T[],
  keyFn: (item: T) => string
): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keyFn(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Remove duplicates from an array by a key function
 */
export function uniqueBy<T>(array: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  );
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Sort an array by multiple criteria
 */
export function sortBy<T>(
  array: T[],
  ...comparators: ((a: T, b: T) => number)[]
): T[] {
  return [...array].sort((a, b) => {
    for (const comparator of comparators) {
      const result = comparator(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  return keys.reduce(
    (result, key) => {
      if (key in obj) result[key] = obj[key];
      return result;
    },
    {} as Pick<T, K>
  );
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if an object is empty
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

// ============================================================
// COLOR UTILITIES
// ============================================================

/**
 * Generate a consistent color from a string (for avatars, tags, etc.)
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Convert RGB to hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Get a contrasting text color (black or white) for a background
 */
export function getContrastColor(hexColor: string): string {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return "#000000";
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// ============================================================
// DOM & BROWSER UTILITIES
// ============================================================

/**
 * Check if code is running on the client side
 */
export function isClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if code is running on the server side
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}

/**
 * Get the current scroll position
 */
export function getScrollPosition(): { x: number; y: number } {
  if (!isClient()) return { x: 0, y: 0 };
  return {
    x: window.scrollX || document.documentElement.scrollLeft,
    y: window.scrollY || document.documentElement.scrollTop,
  };
}

/**
 * Smooth scroll to an element by ID
 */
export function scrollToElement(elementId: string, offset: number = 0): void {
  if (!isClient()) return;
  const element = document.getElementById(elementId);
  if (element) {
    const top = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "smooth" });
  }
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isClient()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Get URL query parameters as an object
 */
export function getQueryParams(): Record<string, string> {
  if (!isClient()) return {};
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================
// ANIMATION UTILITIES
// ============================================================

/**
 * Easing functions for animations
 */
export const easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => --t * t * t + 1,
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - --t * t * t * t,
  easeInOutQuart: (t: number) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  easeInExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeOutExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t: number) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return Math.pow(2, 20 * t - 10) / 2;
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  spring: (t: number) => {
    return 1 - (Math.cos(t * 4.5 * Math.PI) * Math.exp(-t * 6));
  },
};

/**
 * Staggered animation delay for children
 */
export function stagger(index: number, baseDelay: number = 0.1): number {
  return index * baseDelay;
}

/**
 * Framer Motion animation presets
 */
export const motionPresets = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3 },
  },
  fadeInUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  fadeInDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  fadeInLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  fadeInRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    transition: { duration: 0.3 },
  },
  slideUp: {
    initial: { opacity: 0, y: 40 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 40 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
  popIn: {
    initial: { opacity: 0, scale: 0.5 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.5 },
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
};

// ============================================================
// SEO UTILITIES
// ============================================================

/**
 * Generate Open Graph metadata for a page
 */
export function generateOGMeta(params: {
  title: string;
  description: string;
  path: string;
  type?: string;
  image?: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://app.circuvent.com";
  return {
    title: `${params.title} | Circuvent Technologies`,
    description: params.description,
    openGraph: {
      title: params.title,
      description: params.description,
      url: `${baseUrl}${params.path}`,
      type: params.type || "website",
      siteName: "Circuvent Technologies",
      images: params.image ? [{ url: params.image }] : [],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: params.title,
      description: params.description,
    },
  };
}

/**
 * Generate JSON-LD structured data for a blog post
 */
export function generateBlogPostJsonLd(params: {
  title: string;
  description: string;
  author: string;
  datePublished: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: params.title,
    description: params.description,
    author: {
      "@type": "Person",
      name: params.author,
    },
    datePublished: params.datePublished,
    publisher: {
      "@type": "Organization",
      name: "Circuvent Technologies",
      url: process.env.NEXT_PUBLIC_SITE_URL || "https://app.circuvent.com",
    },
    url: params.url,
  };
}
