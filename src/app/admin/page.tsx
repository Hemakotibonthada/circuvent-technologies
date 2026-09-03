"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Eye,
  TrendingUp,
  Activity,
  Siren,
  Radar,
  Globe,
  Database,
  Server,
  RefreshCw,
  Wifi,
  WifiOff,
  BarChart3,
  Clock,
  Zap,
  HardDrive,
  Lock,
  LogIn,
  ShoppingBag,
  Boxes,
  Users2,
  Tag,
  RotateCcw,
  LifeBuoy,
  UserCog,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import OrdersPanel from "./OrdersPanel";
import InventoryPanel from "./InventoryPanel";
import CommerceStats from "./CommerceStats";
import CustomersPanel from "./CustomersPanel";
import CouponsPanel from "./CouponsPanel";
import ReturnsPanel from "./ReturnsPanel";
import SupportPanel from "./SupportPanel";
import StaffPanel from "./StaffPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import TrafficPanel from "./TrafficPanel";
import MonitoringPanel from "./MonitoringPanel";
import ReportsPanel from "./ReportsPanel";
import AlertRulesPanel from "./AlertRulesPanel";
import AuditLogPanel from "./AuditLogPanel";
import MessagesPanel from "./MessagesPanel";
import AdminAlerts from "./AdminAlerts";
import Admin2fa from "./Admin2fa";
import AdminPasskeys from "./AdminPasskeys";
import AdminPassword, { ForcePasswordChange } from "./AdminPassword";
import { FileBarChart, Inbox, Cpu, Mail, Gauge } from "lucide-react";
import DevicesPanel from "./DevicesPanel";
import EmailsPanel from "./EmailsPanel";
import LatencyPanel from "./LatencyPanel";
import IcmPanel from "./IcmPanel";
import AppInsightsPanel from "./AppInsightsPanel";
import AppInstallsPanel from "./AppInstallsPanel";
import { BookOpen, Target, Percent, Building2, ShieldAlert, FlaskConical, Link2, Receipt, Contact2, CreditCard, Handshake, Wrench, Timer, FileUp } from "lucide-react";
import ContentStudioPanel from "./ContentStudioPanel";
import MarketingPanel from "./MarketingPanel";
import PricingPanel from "./PricingPanel";
import VendorPortalPanel from "./VendorPortalPanel";
import FraudPanel from "./FraudPanel";
import FeatureFlagsPanel from "./FeatureFlagsPanel";
import IntegrationsPanel from "./IntegrationsPanel";
import TaxCenterPanel from "./TaxCenterPanel";
import CrmPanel from "./CrmPanel";
import SubscriptionsPanel from "./SubscriptionsPanel";
import AffiliatesPanel from "./AffiliatesPanel";
import WarrantyPanel from "./WarrantyPanel";
import JobsPanel from "./JobsPanel";
import BulkIOPanel from "./BulkIOPanel";
import { Globe2, Truck, Package, MessagesSquare, Smile } from "lucide-react";
import SeoManagerPanel from "./SeoManagerPanel";
import ShippingPanel from "./ShippingPanel";
import BundlesPanel from "./BundlesPanel";
import MacrosPanel from "./MacrosPanel";
import SurveysPanel from "./SurveysPanel";
import { Coins, ShieldQuestion, LineChart, FileSpreadsheet, Settings } from "lucide-react";
import { KeyRound } from "lucide-react";
import { usePasskey, usePasskeySupport } from "@/lib/usePasskey";
import { ViewMenu } from "@/components/ViewSettings";
import CurrencyPanel from "./CurrencyPanel";
import PrivacyPanel from "./PrivacyPanel";
import StaffActivityPanel from "./StaffActivityPanel";
import ForecastingPanel from "./ForecastingPanel";
import ReportBuilderPanel from "./ReportBuilderPanel";
import { openVisitorStream } from "./visitorStream";

interface PageStats {
  page: string;
  activeVisitors: number;
  totalViews: number;
}

interface VisitorSnapshot {
  totalActive: number;
  totalViewsAllTime: number;
  pageStats: PageStats[];
  peakConcurrent: number;
  peakAt: string | null;
  uptimeSince: string;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: string;
  entries: { key: string; hits: number; age: string; ttl: string; size: string }[];
  memoryUsage: string;
}

interface AdminStats {
  visitors: VisitorSnapshot;
  cache: CacheStats;
  server: {
    uptime: string;
    memory: { heapUsed: string; heapTotal: string; rss: string };
    nodeVersion: string;
    platform: string;
  };
  timestamp: string;
}

// Friendly page names
const pageNames: Record<string, string> = {
  "/": "Home",
  "/about": "About",
  "/projects": "Projects",
  "/blog": "Blog",
  "/contact": "Contact",
  "/services": "Services",
  "/team": "Team",
  "/stack": "Tech Stack",
  "/careers": "Careers",
  "/roadmap": "Roadmap",
  "/open-source": "Open Source",
  "/domains": "Domains",
  "/architecture": "Architecture",
  "/case-studies": "Case Studies",
  "/docs": "Documentation",
  "/privacy": "Privacy",
  "/admin": "Admin",
};

function getPageName(path: string): string {
  if (pageNames[path]) return pageNames[path];
  // Handle dynamic routes like /blog/some-slug
  const base = "/" + path.split("/").filter(Boolean)[0];
  const slug = path.split("/").filter(Boolean).slice(1).join("/");
  const baseName = pageNames[base] ?? base;
  return slug ? `${baseName}: ${slug}` : baseName;
}

// Which areas each staff role can see (mirrors src/lib/admin-auth.ts).
const ROLE_AREAS: Record<string, string[]> = {
  superadmin: ["overview", "analytics", "monitoring", "latency", "icm", "insights", "reports", "orders", "inventory", "customers", "coupons", "returns", "support", "messages", "staff", "devices", "users", "emails", "cms", "marketing", "pricing", "vendors", "fraud", "flags", "integrations", "tax", "crm", "subscriptions", "affiliates", "warranty", "jobs", "bulk", "seo", "shipping", "bundles", "macros", "surveys", "currency", "privacy", "forecasting", "reportbuilder"],
  manager: ["overview", "analytics", "monitoring", "latency", "icm", "insights", "reports", "orders", "inventory", "customers", "coupons", "returns", "support", "messages", "devices", "users", "cms", "marketing", "pricing", "vendors", "fraud", "crm", "subscriptions", "affiliates", "warranty", "seo", "shipping", "bundles", "macros", "surveys", "currency", "privacy", "forecasting", "reportbuilder"],
  inventory: ["inventory", "vendors", "pricing", "shipping", "bundles", "forecasting"],
  orders: ["orders", "returns", "customers", "fraud", "warranty", "shipping"],
  support: ["support", "messages", "returns", "customers", "warranty", "macros", "surveys", "privacy", "icm"],
};

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  manager: "Manager",
  inventory: "Inventory Staff",
  orders: "Orders Staff",
  support: "Support Staff",
};

/*
 * What went wrong when single sign-on comes back unhappy.
 *
 * Written out here because the redirect can only carry a short code, and
 * "sso_error=not-staff" in the address bar tells the person nothing. The
 * distinction that matters most is the last one: signing in worked perfectly
 * and the account simply has no role in this console, which is a different
 * problem from a broken password and needs a different person to fix it.
 */
const SSO_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  state: "That sign-in could not be verified. Please try again.",
  exchange: "Could not complete sign-in with the identity service.",
  userinfo: "Could not read your account details. Please try again.",
  unverified: "Your Circuvent email address has not been verified.",
  "not-staff":
    "Your Circuvent account signed in, but it has no role in this console. Ask an administrator to add you.",
  provider: "The identity service refused the sign-in.",
};

// Every tab, grouped into a category so the nav reads as sections instead of
// one long wall of buttons. Categories with zero visible tabs (per role) are
// hidden automatically.
type IconType = React.ComponentType<{ className?: string }>;
const TAB_META: Record<string, { label: string; icon: IconType; category: string }> = {
  overview: { label: "Overview", icon: BarChart3, category: "overview" },
  analytics: { label: "Analytics", icon: TrendingUp, category: "overview" },
  reports: { label: "Reports", icon: FileBarChart, category: "overview" },
  monitoring: { label: "Monitoring", icon: Activity, category: "overview" },
  latency: { label: "Latency", icon: Gauge, category: "overview" },
  /*
   * Reliability is its own category rather than another two entries under
   * Overview. An engineer responding to a page needs the incident queue and
   * the telemetry next to each other and nothing else in the way, and burying
   * them among revenue charts is how a Sev1 gets found late.
   */
  icm: { label: "Incidents (ICM)", icon: Siren, category: "reliability" },
  insights: { label: "App Insights", icon: Radar, category: "reliability" },

  orders: { label: "Orders", icon: ShoppingBag, category: "commerce" },
  inventory: { label: "Inventory", icon: Boxes, category: "commerce" },
  returns: { label: "Returns", icon: RotateCcw, category: "commerce" },
  shipping: { label: "Shipping", icon: Truck, category: "commerce" },
  bundles: { label: "Bundles", icon: Package, category: "commerce" },
  pricing: { label: "Pricing", icon: Percent, category: "commerce" },
  forecasting: { label: "Forecasting", icon: LineChart, category: "commerce" },
  vendors: { label: "Vendor Portal", icon: Building2, category: "commerce" },

  customers: { label: "Customers", icon: Users2, category: "customers" },
  crm: { label: "CRM", icon: Contact2, category: "customers" },
  support: { label: "Support", icon: LifeBuoy, category: "customers" },
  messages: { label: "Messages", icon: Inbox, category: "customers" },
  warranty: { label: "Warranty & RMA", icon: Wrench, category: "customers" },
  macros: { label: "Macros", icon: MessagesSquare, category: "customers" },

  marketing: { label: "Marketing", icon: Target, category: "marketing" },
  coupons: { label: "Coupons", icon: Tag, category: "marketing" },
  subscriptions: { label: "Subscriptions", icon: CreditCard, category: "marketing" },
  affiliates: { label: "Affiliates", icon: Handshake, category: "marketing" },
  surveys: { label: "Feedback (NPS)", icon: Smile, category: "marketing" },
  seo: { label: "SEO & Redirects", icon: Globe2, category: "marketing" },

  tax: { label: "Tax & GST", icon: Receipt, category: "finance" },
  currency: { label: "Currency", icon: Coins, category: "finance" },
  privacy: { label: "Privacy Requests", icon: ShieldQuestion, category: "finance" },
  fraud: { label: "Fraud & Risk", icon: ShieldAlert, category: "finance" },

  cms: { label: "Content Studio", icon: BookOpen, category: "content" },
  devices: { label: "Devices", icon: Cpu, category: "content" },
  // Account holders on the IoT control plane — distinct from `staff` (people
  // who run the shop) and `customers` (people who bought something). This
  // already existed as a sub-tab inside Devices, which meant the only way to
  // find the person attached to a device was to know it was hidden there.
  users: { label: "Users", icon: Users, category: "content" },

  staff: { label: "Staff", icon: UserCog, category: "platform" },
  emails: { label: "Emails", icon: Mail, category: "platform" },
  jobs: { label: "Ops & Jobs", icon: Timer, category: "platform" },
  bulk: { label: "Bulk Import/Export", icon: FileUp, category: "platform" },
  flags: { label: "Feature Flags", icon: FlaskConical, category: "platform" },
  integrations: { label: "Integrations", icon: Link2, category: "platform" },
  reportbuilder: { label: "Report Builder", icon: FileSpreadsheet, category: "platform" },
};

const CATEGORY_META: { id: string; label: string; icon: IconType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "reliability", label: "Reliability", icon: Siren },
  { id: "commerce", label: "Orders & Inventory", icon: ShoppingBag },
  { id: "customers", label: "Customers & Support", icon: Users2 },
  { id: "marketing", label: "Marketing & Growth", icon: Target },
  { id: "finance", label: "Finance & Compliance", icon: Receipt },
  { id: "content", label: "Content & Devices", icon: BookOpen },
  { id: "platform", label: "Platform & Admin", icon: Settings },
];

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passkeySupported = usePasskeySupport();
  const passkey = usePasskey("/api/admin/passkey");
  const [authError, setAuthError] = useState("");
  const [twoFA, setTwoFA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<"email" | "totp">("email");
  const [otp, setOtp] = useState("");
  const [role, setRole] = useState<string>("superadmin");
  const [adminName, setAdminName] = useState<string>("");
  // The signed-in identity, kept separate from the `email` login field: after a
  // page reload the form state is empty but the session is still valid.
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [mustChangePw, setMustChangePw] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sseConnected, setSSEConnected] = useState(false);
  const [liveVisitors, setLiveVisitors] = useState<VisitorSnapshot | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tab, setTab] = useState<
    "overview" | "analytics" | "monitoring" | "latency" | "reports" | "orders" | "inventory" | "customers" | "coupons" | "returns" | "support" | "messages" | "staff" | "devices" | "users" | "emails"
    | "cms" | "marketing" | "pricing" | "vendors" | "fraud" | "flags" | "integrations" | "tax" | "crm" | "subscriptions" | "affiliates" | "warranty" | "jobs" | "bulk"
    | "seo" | "shipping" | "bundles" | "macros" | "surveys"
    | "currency" | "privacy" | "forecasting" | "reportbuilder"
    | "icm" | "insights"
  >("overview");

  const canSee = useCallback(
    (area: string) => (ROLE_AREAS[role] ?? []).includes(area),
    [role]
  );

  const [activeCategory, setActiveCategory] = useState<string>("overview");

  // Keep the category pill row in sync whenever the active tab changes for any
  // reason (clicking a tab directly, an admin-alert deep link, a role reset).
  useEffect(() => {
    const cat = TAB_META[tab]?.category;
    if (cat) setActiveCategory((prev) => (prev === cat ? prev : cat));
  }, [tab]);

  // Keep ?tab= in the address bar so Reliability deep links and shares work
  // (icm.circuvent.com / insights.circuvent.com remain the dedicated hosts).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("tab");
    if (tab === "overview") {
      if (!current) return;
      url.searchParams.delete("tab");
    } else if (current === tab) {
      return;
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [tab]);

  const visibleTabIds = Object.keys(TAB_META).filter((id) => canSee(id));

  const selectCategory = (categoryId: string) => {
    setActiveCategory(categoryId);
    const tabsInCategory = visibleTabIds.filter((id) => TAB_META[id].category === categoryId);
    if (tabsInCategory.length && !tabsInCategory.includes(tab)) {
      setTab(tabsInCategory[0] as typeof tab);
    }
  };

  // Check existing session
  useEffect(() => {
    /*
     * A sign-in that came back from auth.circuvent.com arrives as ?sso=<code>.
     * Redeemed before the stored-token check, because the point of arriving
     * this way is that there is no stored token yet. The code is swapped for
     * the console's ordinary bearer token and the query string is scrubbed, so
     * the address bar does not keep a credential-shaped thing in history.
     */
    const url = new URL(window.location.href);
    const handoff = url.searchParams.get("sso");
    const ssoError = url.searchParams.get("sso_error");
    const tabParam = url.searchParams.get("tab");

    const scrub = () => {
      url.searchParams.delete("sso");
      url.searchParams.delete("sso_error");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    if (ssoError) {
      setAuthError(SSO_ERRORS[ssoError] ?? "Single sign-on did not complete. Please try again.");
      scrub();
    }

    if (tabParam && TAB_META[tabParam]) {
      setTab(tabParam as typeof tab);
      if (TAB_META[tabParam].category) setActiveCategory(TAB_META[tabParam].category);
    }

    if (handoff) {
      fetch("/api/admin/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: handoff }),
      })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.token) {
            sessionStorage.setItem("admin-token", d.token);
            setRole(d.role || "superadmin");
            setAdminName(d.name || "");
            setAdminEmail(d.email || "");
            setMustChangePw(!!d.mustChangePassword);
            setAuthenticated(true);
          } else {
            setAuthError(d.error || "Single sign-on did not complete. Please try again.");
          }
        })
        .catch(() => setAuthError("Single sign-on did not complete. Please try again."))
        .finally(() => {
          scrub();
          setChecking(false);
        });
      return;
    }

    const token = sessionStorage.getItem("admin-token");
    if (token) {
      fetch("/api/admin/auth", { headers: { "x-admin-token": token } })
        .then(async (res) => {
          if (res.ok) {
            const d = await res.json();
            setRole(d.role || "superadmin");
            setAdminName(d.name || "");
            setAdminEmail(d.email || "");
            setMustChangePw(!!d.mustChangePassword);
            setAuthenticated(true);
          }
          setChecking(false);
        })
        .catch(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.twoFactor) {
          setTwoFA(true);
          setTwoFAMethod(d.method === "totp" ? "totp" : "email");
          setOtp("");
          return;
        }
        sessionStorage.setItem("admin-token", d.token);
        setRole(d.role || "superadmin");
        setAdminName(d.name || "");
        setAdminEmail(d.email || email.trim().toLowerCase());
        setMustChangePw(!!d.mustChangePassword);
        setAuthenticated(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setAuthError(d.error || "Invalid email or password");
      }
    } catch {
      setAuthError("Connection error");
    }
  };

  /*
   * Sign in with a passkey.
   *
   * Sets the same session the password path does — the response carries a token
   * minted the same way, so nothing downstream needs to know which route got
   * somebody here. There is no 2FA step because there is nothing left to prove:
   * the ceremony already required the device and a biometric or PIN on it.
   */
  const loginWithPasskey = async () => {
    const addr = email.trim();
    if (!addr) {
      setAuthError("Enter your email first, then use your passkey.");
      return;
    }
    setAuthError("");

    const r = await passkey.signIn(addr);
    if (!r.ok) {
      // A cancelled prompt reports nothing; leaving the form alone is the right
      // response to somebody changing their mind.
      if (r.error) setAuthError(r.error);
      return;
    }

    const d = r.data as { token?: string; admin?: { email: string; name: string; role: string } };
    if (!d?.token || !d.admin) {
      setAuthError("Could not complete that sign-in.");
      return;
    }
    sessionStorage.setItem("admin-token", d.token);
    setRole(d.admin.role || "superadmin");
    setAdminName(d.admin.name || "");
    setAdminEmail(d.admin.email);
    setAuthenticated(true);
  };

  const verify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        sessionStorage.setItem("admin-token", d.token);
        setRole(d.role || "superadmin");
        setAdminName(d.name || "");
        setAdminEmail(d.email || email.trim().toLowerCase());
        setMustChangePw(!!d.mustChangePassword);
        setTwoFA(false);
        setAuthenticated(true);
      } else {
        setAuthError(d.error || "Invalid code");
      }
    } catch {
      setAuthError("Connection error");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin-token");
    setAuthenticated(false);
    setMustChangePw(false);
    setPassword("");
  };

  // Fetch full admin stats (with auth token)
  const fetchStats = useCallback(async () => {
    const token = sessionStorage.getItem("admin-token");
    if (!token) return;
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-token": token },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setLastRefresh(new Date());
      }
    } catch {
      // silently retry next interval
    }
  }, []);

  // Initial fetch + polling every 10s (only when authenticated + allowed)
  useEffect(() => {
    if (!authenticated || !canSee("overview")) return;
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats, authenticated, canSee]);

  // SSE for real-time visitor updates (only when authenticated + allowed).
  // Serverless functions cap execution time, so a long-lived SSE stream is
  // periodically terminated — we auto-reconnect so "Live" recovers on its own
  // instead of getting stuck on "Disconnected" until a manual refresh.
  useEffect(() => {
    if (!authenticated || !canSee("overview")) return;
    const stream = openVisitorStream({
      onOpen: () => setSSEConnected(true),
      onClosed: () => setSSEConnected(false),
      onData: (p) => setLiveVisitors(p as VisitorSnapshot),
    });
    return () => stream.close();
  }, [authenticated, canSee]);

  const visitors = liveVisitors ?? stats?.visitors;

  // Reset to a permitted tab when the role can't see the current one.
  useEffect(() => {
    const visible = ROLE_AREAS[role] ?? [];
    if (visible.length && !visible.includes(tab)) {
      setTab(visible[0] as typeof tab);
    }
  }, [role, tab]);

  // Loading state
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full" style={{ borderColor: "var(--accent-cyan)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Login gate
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl p-8"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="flex items-center justify-center mb-6">
            <img src="/logo-mark-160.png" alt="Circuvent" width={52} height={52} />
          </div>
          <h1 className="text-xl font-bold text-center mb-1" style={{ color: "var(--text-primary)" }}>
            Circuvent Control Center
          </h1>
          <p className="text-sm text-center mb-6" style={{ color: "var(--text-tertiary)" }}>
            {twoFA ? (twoFAMethod === "totp" ? "Enter the 6-digit code from your authenticator app" : "Enter the 6-digit code we emailed you") : "Sign in with your staff email and password"}
          </p>
          {twoFA ? (
            <form onSubmit={verify2fa} className="space-y-4">
              <input
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-center text-2xl font-bold tracking-[0.5em] outline-none transition-all"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
              />
              {authError && <p className="text-sm text-red-400 text-center">{authError}</p>}
              <button
                type="submit"
                disabled={otp.length < 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
              >
                <LogIn className="w-4 h-4" /> Verify &amp; sign in
              </button>
              <button
                type="button"
                onClick={() => { setTwoFA(false); setOtp(""); setAuthError(""); }}
                className="w-full text-center text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoFocus
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            />
            {authError && (
              <p className="text-sm text-red-400 text-center">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
              style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>

            {/*
              Only where it can work. A passkey button that is present and then
              fails on a browser without WebAuthn, or on an insecure origin, is
              worse than one that was never offered.
            */}
            {passkeySupported && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    or
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                </div>
                <button
                  type="button"
                  onClick={loginWithPasskey}
                  disabled={passkey.busy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    color: "var(--text-primary)",
                  }}
                >
                  <KeyRound className="w-4 h-4" />
                  {passkey.busy ? "Waiting for your device…" : "Use a passkey"}
                </button>
              </>
            )}

            {/*
              Sign in with the Circuvent account instead of a console-local
              password. Offered unconditionally: unlike a passkey there is
              nothing about the browser that can stop it working, and if the
              deployment has not been configured the start route says so
              plainly rather than failing somewhere in the middle.

              The divider only appears when the passkey block has not already
              drawn one. Both blocks owning a rule produced two "OR"s stacked
              on top of each other, which reads as a missing option between
              them.
            */}
            {!passkeySupported && (
              <div className="flex items-center gap-3 pt-1">
                <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  or
                </span>
                <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
              </div>
            )}
            <a
              href="/api/admin/auth/sso/start"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
            >
              <ShieldCheck className="w-4 h-4" />
              Sign in with Circuvent
            </a>
            <p className="text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              Uses your Circuvent account and its two-step verification. You
              still need a staff role here.
            </p>
          </form>
          )}
        </motion.div>
      </div>
    );
  }

  // Expired credential: the console is withheld until it is rotated. Every
  // panel below fetches with the same token, so letting it render would be a
  // policy that only asks nicely.
  if (mustChangePw) {
    return (
      <ForcePasswordChange
        email={adminEmail}
        name={adminName}
        onDone={() => setMustChangePw(false)}
        onSignOut={handleLogout}
      />
    );
  }

  return (
    /*
     * The site nav is `fixed` at 72px, so the shell reserves exactly that and
     * the command bar sticks directly beneath it. This page previously spent
     * `py-24` plus a 10-unit header margin plus two wrapping pill rows before
     * the first number — roughly 280px of chrome, which is why it was being
     * read at 50% browser zoom. The rows below are the same controls at
     * toolbar height, and they scroll sideways instead of wrapping.
     */
    /*
     * No top padding, and the header sticks to 0.
     *
     * Both numbers used to be 72px, reserving room for the marketing nav that
     * SiteChrome rendered above this page. That nav is no longer drawn on
     * /admin — an operations console does not want a Shop link, and two
     * stacked toolbars cost ~120px before any data — so the offset now
     * reserves space for nothing and would leave a gap above a header that
     * sticks 72px down the screen.
     */
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "var(--bg-overlay)",
          borderBottom: "1px solid var(--border-primary)",
        }}
      >
        <div className="cv-app-width px-3 sm:px-5 lg:px-6">
          {/* ── Identity + actions ─────────────────────────── */}
          <div className="flex items-center gap-2.5 py-2">
            <img
              src="/logo-mark-160.png"
              alt="Circuvent"
              width={30}
              height={30}
              className="shrink-0 rounded-lg"
            />
            <div className="min-w-0">
              <h1
                className="truncate text-[15px] font-bold leading-tight sm:text-[17px]"
                style={{ color: "var(--text-primary)" }}
              >
                Admin Dashboard
              </h1>
              <p
                className="hidden truncate text-[11px] leading-tight lg:block"
                style={{ color: "var(--text-tertiary)" }}
              >
                Real-time website analytics and server monitoring
              </p>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <AdminAlerts onGoto={(t) => setTab(t as typeof tab)} />
              {/* Account security state. One group, so it reads as one
                  subject rather than three unrelated buttons. */}
              <div className="hidden items-center gap-1 md:flex">
                <Admin2fa />
                <AdminPasskeys />
                <AdminPassword email={adminEmail} name={adminName} />
              </div>
              {canSee("overview") && (
                <>
                  <span
                    className="hidden items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold sm:inline-flex"
                    title={sseConnected ? "Live updates connected" : "Live updates disconnected"}
                    style={{
                      height: "var(--cv-control-h)",
                      color: sseConnected ? "#059669" : "#dc2626",
                      background: sseConnected ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)",
                    }}
                  >
                    {sseConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    <span className="hidden lg:inline">{sseConnected ? "Live" : "Offline"}</span>
                  </span>
                  <button
                    onClick={fetchStats}
                    title="Refresh statistics"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-all hover:brightness-105"
                    style={{
                      height: "var(--cv-control-h)",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="hidden lg:inline">Refresh</span>
                  </button>
                </>
              )}
              {/* Density, scale and width, on the screen they affect. */}
              <ViewMenu />
              <div className="hidden min-w-0 flex-col items-end leading-none sm:flex">
                <span
                  className="max-w-[9rem] truncate text-[12.5px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {adminName || "Staff"}
                </span>
                <span
                  className="mt-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: "rgba(139,92,246,0.15)", color: "#7c3aed" }}
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-all hover:brightness-105"
                style={{
                  height: "var(--cv-control-h)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Logout</span>
              </button>
            </div>
          </div>

          {/* ── Category rail ──────────────────────────────── */}
          <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1.5">
            {CATEGORY_META.filter((c) => visibleTabIds.some((id) => TAB_META[id].category === c.id)).map((c) => {
              const CatIcon = c.icon;
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => selectCategory(c.id)}
                  aria-pressed={active}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-all"
                  style={
                    active
                      ? {
                          height: "var(--cv-control-h)",
                          background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
                          color: "#fff",
                          border: "1px solid transparent",
                        }
                      : {
                          height: "var(--cv-control-h)",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-primary)",
                          color: "var(--text-secondary)",
                        }
                  }
                >
                  <CatIcon className="h-3.5 w-3.5 shrink-0" /> {c.label}
                </button>
              );
            })}
          </div>

          {/* ── Tabs within the selected category ──────────── */}
          <div
            className="no-scrollbar mb-2 flex gap-0.5 overflow-x-auto rounded-lg p-0.5"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              width: "fit-content",
              maxWidth: "100%",
            }}
          >
            {visibleTabIds
              .filter((id) => TAB_META[id].category === activeCategory)
              .map((id) => {
                const meta = TAB_META[id];
                const Icon = meta.icon;
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id as typeof tab)}
                    aria-pressed={active}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors"
                    style={
                      active
                        ? {
                            height: "calc(var(--cv-control-h) - 0.25rem)",
                            background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
                            color: "#fff",
                          }
                        : {
                            height: "calc(var(--cv-control-h) - 0.25rem)",
                            color: "var(--text-tertiary)",
                          }
                    }
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" /> {meta.label}
                  </button>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── Panels ───────────────────────────────────────── */}
      <div className="cv-app-width cv-dense px-3 pb-10 pt-4 sm:px-5 lg:px-6">

        {tab === "orders" && <OrdersPanel />}
        {tab === "analytics" && (
          <>
            <TrafficPanel />
            <AnalyticsPanel />
          </>
        )}
        {tab === "emails" && <EmailsPanel />}
        {tab === "latency" && <LatencyPanel />}
        {tab === "icm" && <IcmPanel />}
        {tab === "insights" && <AppInsightsPanel />}
        {tab === "monitoring" && (
          <>
            <MonitoringPanel />
            <AlertRulesPanel />
            <AuditLogPanel />
          </>
        )}
        {tab === "reports" && <ReportsPanel />}
        {tab === "messages" && <MessagesPanel />}
        {tab === "inventory" && <InventoryPanel />}
        {tab === "customers" && <CustomersPanel />}
        {tab === "coupons" && <CouponsPanel />}
        {tab === "returns" && <ReturnsPanel />}
        {tab === "support" && <SupportPanel />}
        {tab === "staff" && (
          <>
            <StaffPanel />
            <StaffActivityPanel />
          </>
        )}
        {tab === "devices" && <DevicesPanel />}
        {tab === "users" && (
          <>
            <DevicesPanel initialSub="users" />
            {/* The installs sit under the account list because that is the
                question they answer: what is this person actually on. */}
            <AppInstallsPanel />
          </>
        )}
        {tab === "cms" && <ContentStudioPanel />}
        {tab === "marketing" && <MarketingPanel />}
        {tab === "pricing" && <PricingPanel />}
        {tab === "vendors" && <VendorPortalPanel />}
        {tab === "fraud" && <FraudPanel />}
        {tab === "flags" && <FeatureFlagsPanel />}
        {tab === "integrations" && <IntegrationsPanel />}
        {tab === "tax" && <TaxCenterPanel />}
        {tab === "crm" && <CrmPanel />}
        {tab === "subscriptions" && <SubscriptionsPanel />}
        {tab === "affiliates" && <AffiliatesPanel />}
        {tab === "warranty" && <WarrantyPanel />}
        {tab === "jobs" && <JobsPanel />}
        {tab === "bulk" && <BulkIOPanel />}
        {tab === "seo" && <SeoManagerPanel />}
        {tab === "shipping" && <ShippingPanel />}
        {tab === "bundles" && <BundlesPanel />}
        {tab === "macros" && <MacrosPanel />}
        {tab === "surveys" && <SurveysPanel />}
        {tab === "currency" && <CurrencyPanel />}
        {tab === "privacy" && <PrivacyPanel />}
        {tab === "forecasting" && <ForecastingPanel />}
        {tab === "reportbuilder" && <ReportBuilderPanel />}

        {tab === "overview" && (
        <>
        <CommerceStats />
        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Users className="w-5 h-5" />}
            label="Active Visitors"
            value={visitors?.totalActive ?? 0}
            color="#06b6d4"
            pulse
          />
          <StatCard
            icon={<Eye className="w-5 h-5" />}
            label="Total Page Views"
            value={visitors?.totalViewsAllTime ?? 0}
            color="#8b5cf6"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Peak Concurrent"
            value={visitors?.peakConcurrent ?? 0}
            subtitle={visitors?.peakAt ? `at ${new Date(visitors.peakAt).toLocaleTimeString()}` : undefined}
            color="#10b981"
          />
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            label="Pages Tracked"
            value={visitors?.pageStats?.length ?? 0}
            color="#f59e0b"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Visitors by Page */}
          <div className="lg:col-span-2">
            <Panel title="Live Visitors by Page" icon={<Globe className="w-4 h-4" />}>
              {visitors?.pageStats && visitors.pageStats.length > 0 ? (
                <div className="space-y-2">
                  {visitors.pageStats.map((ps) => (
                    <PageRow key={ps.page} stats={ps} maxVisitors={visitors.pageStats[0]?.activeVisitors ?? 1} />
                  ))}
                </div>
              ) : (
                <p className="text-sm py-8 text-center" style={{ color: "var(--text-tertiary)" }}>
                  No active visitors right now
                </p>
              )}
            </Panel>
          </div>

          {/* Server Info */}
          <div>
            <Panel title="Server Status" icon={<Server className="w-4 h-4" />}>
              {stats?.server ? (
                <div className="space-y-3">
                  <InfoRow icon={<Clock className="w-3.5 h-3.5" />} label="Uptime" value={formatUptime(stats.server.uptime)} />
                  <InfoRow icon={<HardDrive className="w-3.5 h-3.5" />} label="Heap Used" value={stats.server.memory.heapUsed} />
                  <InfoRow icon={<HardDrive className="w-3.5 h-3.5" />} label="Heap Total" value={stats.server.memory.heapTotal} />
                  <InfoRow icon={<Zap className="w-3.5 h-3.5" />} label="RSS" value={stats.server.memory.rss} />
                  <InfoRow icon={<Server className="w-3.5 h-3.5" />} label="Node" value={stats.server.nodeVersion} />
                  <InfoRow icon={<Globe className="w-3.5 h-3.5" />} label="Platform" value={stats.server.platform} />
                </div>
              ) : (
                <p className="text-sm text-center py-4" style={{ color: "var(--text-tertiary)" }}>Loading...</p>
              )}
            </Panel>
          </div>
        </div>

        {/* Cache Stats */}
        <div className="mt-6">
          <Panel title="Cache Performance" icon={<Database className="w-4 h-4" />}>
            {stats?.cache ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                  <MiniStat label="Entries" value={stats.cache.totalEntries} />
                  <MiniStat label="Hits" value={stats.cache.totalHits} />
                  <MiniStat label="Misses" value={stats.cache.totalMisses} />
                  <MiniStat label="Hit Rate" value={stats.cache.hitRate} />
                  <MiniStat label="Memory" value={stats.cache.memoryUsage} />
                </div>
                {stats.cache.entries.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ color: "var(--text-tertiary)" }}>
                          <th className="text-left py-2 px-3 font-medium">Key</th>
                          <th className="text-right py-2 px-3 font-medium">Hits</th>
                          <th className="text-right py-2 px-3 font-medium">Age</th>
                          <th className="text-right py-2 px-3 font-medium">TTL</th>
                          <th className="text-right py-2 px-3 font-medium">Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.cache.entries.map((entry) => (
                          <tr
                            key={entry.key}
                            className="border-t"
                            style={{ borderColor: "var(--border-primary)" }}
                          >
                            <td className="py-2 px-3 font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                              {entry.key}
                            </td>
                            <td className="py-2 px-3 text-right" style={{ color: "var(--accent-cyan)" }}>
                              {entry.hits}
                            </td>
                            <td className="py-2 px-3 text-right" style={{ color: "var(--text-secondary)" }}>
                              {entry.age}
                            </td>
                            <td className="py-2 px-3 text-right" style={{ color: "var(--text-secondary)" }}>
                              {entry.ttl}
                            </td>
                            <td className="py-2 px-3 text-right" style={{ color: "var(--text-secondary)" }}>
                              {entry.size}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-tertiary)" }}>Loading...</p>
            )}
          </Panel>
        </div>

        {/* Footer */}
        <p className="text-xs text-center mt-8" style={{ color: "var(--text-tertiary)" }}>
          Last refreshed: {lastRefresh.toLocaleTimeString()} · Auto-refreshes every 10s · SSE for live visitor counts
        </p>
        </>
        )}
      </div>
    </div>
  );
}

// ---- Sub-Components ----

function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtitle?: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold" style={{ color }}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </span>
            {pulse && typeof value === "number" && value > 0 && (
              <span className="relative flex h-2.5 w-2.5 ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: color }} />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: color }} />
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{subtitle}</p>
          )}
        </div>
        <div className="p-2 rounded-xl" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: "var(--accent-cyan)" }}>{icon}</span>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function PageRow({ stats, maxVisitors }: { stats: PageStats; maxVisitors: number }) {
  const pct = maxVisitors > 0 ? (stats.activeVisitors / maxVisitors) * 100 : 0;
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
      style={{ background: "var(--bg-glass)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {getPageName(stats.page)}
          </span>
          <span className="text-xs font-mono shrink-0 ml-2" style={{ color: "var(--accent-cyan)" }}>
            {stats.activeVisitors} live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-primary)" }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #06b6d4, #8b5cf6)" }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-xs shrink-0" style={{ color: "var(--text-tertiary)" }}>
            {stats.totalViews} views
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="text-center p-3 rounded-xl" style={{ background: "var(--bg-glass)" }}>
      <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</p>
    </div>
  );
}

function formatUptime(raw: string): string {
  const seconds = parseInt(raw);
  if (isNaN(seconds)) return raw;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

