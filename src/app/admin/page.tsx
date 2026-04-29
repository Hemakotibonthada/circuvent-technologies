"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Eye,
  TrendingUp,
  Activity,
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
} from "lucide-react";

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

export default function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sseConnected, setSSEConnected] = useState(false);
  const [liveVisitors, setLiveVisitors] = useState<VisitorSnapshot | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Check existing session
  useEffect(() => {
    const token = sessionStorage.getItem("admin-token");
    if (token) {
      fetch("/api/admin/auth", { headers: { "x-admin-token": token } })
        .then((res) => {
          if (res.ok) setAuthenticated(true);
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
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        sessionStorage.setItem("admin-token", token);
        setAuthenticated(true);
      } else {
        setAuthError("Invalid password");
      }
    } catch {
      setAuthError("Connection error");
    }
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

  // Initial fetch + polling every 10s (only when authenticated)
  useEffect(() => {
    if (!authenticated) return;
    fetchStats();
    const interval = setInterval(fetchStats, 10_000);
    return () => clearInterval(interval);
  }, [fetchStats, authenticated]);

  // SSE for real-time visitor updates (only when authenticated)
  useEffect(() => {
    if (!authenticated) return;
    const evtSource = new EventSource("/api/visitors/stream");

    evtSource.onopen = () => setSSEConnected(true);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as VisitorSnapshot;
        setLiveVisitors(data);
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      setSSEConnected(false);
      evtSource.close();
      // Reconnect after 5s
      setTimeout(() => {
        setSSEConnected(false);
      }, 5000);
    };

    return () => evtSource.close();
  }, [authenticated]);

  const visitors = liveVisitors ?? stats?.visitors;

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
            <div className="p-3 rounded-xl" style={{ background: "rgba(6,182,212,0.1)" }}>
              <Lock className="w-6 h-6" style={{ color: "var(--accent-cyan)" }} />
            </div>
          </div>
          <h1 className="text-xl font-bold text-center mb-1" style={{ color: "var(--text-primary)" }}>
            Admin Access
          </h1>
          <p className="text-sm text-center mb-6" style={{ color: "var(--text-tertiary)" }}>
            Enter the admin password to continue
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
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
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1
              className="text-3xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Admin Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
              Real-time website analytics and server monitoring
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* SSE Status */}
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              {sseConnected ? (
                <><Wifi className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-500">Live</span></>
              ) : (
                <><WifiOff className="w-4 h-4 text-red-400" /> <span className="text-red-400">Disconnected</span></>
              )}
            </div>
            <button
              onClick={fetchStats}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-secondary)",
              }}
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

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
