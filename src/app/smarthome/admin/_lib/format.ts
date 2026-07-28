// Formatting helpers shared across the admin dashboard.

export function relativeTime(ts?: string | number | null): string {
  if (ts === null || ts === undefined) return "never";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const s = Math.floor(abs / 1000);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (s < 45) return diff >= 0 ? "just now" : "soon";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${suffix}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${suffix}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ${suffix}`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ${suffix}`;
  return `${Math.floor(mo / 12)}y ${suffix}`;
}

export function fmtDate(ts?: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(ts?: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function num(n: number, dp = 0): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function abbrNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

export function bytes(n: number): string {
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function pct(n: number, dp = 0): string {
  return `${n.toFixed(dp)}%`;
}

export function money(n: number, currency = "USD"): string {
  return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: n < 100 ? 2 : 0 });
}

export function duration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function uptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
