"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  UserPlus,
  Shield,
  Trash2,
  KeyRound,
  Power,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

interface Staff {
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  lastLoginAt?: string;
}
interface RoleOpt {
  id: string;
  label: string;
}

const ROLE_BADGE: Record<string, string> = {
  superadmin: "#8b5cf6",
  manager: "#06b6d4",
  inventory: "#10b981",
  orders: "#f59e0b",
  support: "#ec4899",
};

export default function StaffPanel() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<RoleOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("inventory");

  const token = () => (typeof window !== "undefined" ? sessionStorage.getItem("admin-token") : null);

  const load = useCallback(async () => {
    const t = token();
    if (!t) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/staff", { headers: { "x-admin-token": t } });
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
        setRoles(data.roles || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token() || "" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (res.ok) {
        flash("ok", `${email} added as ${role}`);
        setName("");
        setEmail("");
        setPassword("");
        setRole("inventory");
        load();
      } else {
        flash("err", data.error || "Failed to create staff");
      }
    } finally {
      setBusy(false);
    }
  };

  const patch = async (targetEmail: string, body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": token() || "" },
      body: JSON.stringify({ email: targetEmail, ...body }),
    });
    const data = await res.json();
    if (res.ok) load();
    else flash("err", data.error || "Update failed");
  };

  const changeRole = (targetEmail: string, newRole: string) => patch(targetEmail, { role: newRole });
  const toggleActive = (s: Staff) => patch(s.email, { active: !s.active });

  const resetPassword = async (targetEmail: string) => {
    const np = prompt(`New password for ${targetEmail} (min 6 chars):`);
    if (!np) return;
    await patch(targetEmail, { password: np });
    flash("ok", `Password updated for ${targetEmail}`);
  };

  const remove = async (targetEmail: string) => {
    if (!confirm(`Remove staff account ${targetEmail}?`)) return;
    const res = await fetch(`/api/admin/staff?email=${encodeURIComponent(targetEmail)}`, {
      method: "DELETE",
      headers: { "x-admin-token": token() || "" },
    });
    const data = await res.json();
    if (res.ok) {
      flash("ok", `${targetEmail} removed`);
      load();
    } else flash("err", data.error || "Delete failed");
  };

  const inventoryUrl =
    typeof window !== "undefined" ? `${window.location.origin}/admin` : "/admin";

  const copyInv = () => {
    navigator.clipboard?.writeText(inventoryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Inventory-access helper */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Give inventory-only access
          </h3>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--text-tertiary)" }}>
          Create a staff member below with the <b>Inventory Staff</b> role. They sign in at the
          portal URL and will see <b>only the Inventory tab</b> — no orders, customers, or settings.
        </p>
        <div className="flex items-center gap-2">
          <code
            className="px-3 py-2 rounded-lg text-sm flex-1"
            style={{ background: "var(--bg-glass)", color: "var(--accent-cyan)", border: "1px solid var(--border-primary)" }}
          >
            {inventoryUrl}
          </code>
          <button
            onClick={copyInv}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Create form */}
      <form
        onSubmit={create}
        className="rounded-2xl p-5 space-y-4"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Add staff / make an admin
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@circuvent.com"
            type="email"
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password (min 6)"
            type="text"
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Create staff
        </button>
        {msg && (
          <p className={`text-sm ${msg.type === "ok" ? "text-emerald-500" : "text-red-400"}`}>{msg.text}</p>
        )}
      </form>

      {/* Staff list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
      >
        <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border-primary)" }}>
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Staff & roles ({staff.length})
          </h3>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-primary)" }}>
            {staff.map((s) => (
              <motion.div
                key={s.email}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-5 py-3 flex flex-wrap items-center gap-3"
              >
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {s.name}
                    </span>
                    {!s.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                        disabled
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {s.email}
                    {s.lastLoginAt ? ` · last login ${new Date(s.lastLoginAt).toLocaleDateString()}` : " · never signed in"}
                  </div>
                </div>
                <select
                  value={s.role}
                  onChange={(e) => changeRole(s.email, e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{
                    background: "var(--bg-glass)",
                    border: `1px solid ${ROLE_BADGE[s.role] || "var(--border-primary)"}`,
                    color: ROLE_BADGE[s.role] || "var(--text-secondary)",
                  }}
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id} style={{ color: "#000" }}>
                      {r.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => resetPassword(s.email)}
                  title="Reset password"
                  className="p-2 rounded-lg"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  onClick={() => toggleActive(s)}
                  title={s.active ? "Disable" : "Enable"}
                  className="p-2 rounded-lg"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: s.active ? "#f59e0b" : "#10b981" }}
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  onClick={() => remove(s.email)}
                  title="Remove"
                  className="p-2 rounded-lg"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "#ef4444" }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
