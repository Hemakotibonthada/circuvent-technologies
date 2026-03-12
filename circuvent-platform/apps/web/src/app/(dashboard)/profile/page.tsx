"use client";

import React, { useState } from "react";
import { useAuth, useApi } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";

export default function ProfilePage() {
  const { user, token, logout } = useAuth();
  const { data: sessions } = useApi<any[]>("/auth/me");
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [message, setMessage] = useState("");

  if (!user) return null;

  const handleLogoutAll = async () => {
    await api.post("/auth/logout", {}, token || undefined);
    logout();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your account settings and security</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-6">
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-slate-900 dark:text-white">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.firstName} {user.lastName}</h2>
            <p className="text-sm text-slate-400">{user.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                user.role === "ADMIN" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                user.role === "ENGINEER" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                "bg-green-500/10 text-green-400 border border-green-500/20"
              }`}>{user.role}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span className="text-xs text-slate-500">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Account Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Account Information</h3>
          <dl className="space-y-3">
            {[
              ["User ID", user.id],
              ["Email", user.email],
              ["First Name", user.firstName],
              ["Last Name", user.lastName],
              ["Role", user.role],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-slate-200/50 dark:border-slate-800/50 pb-2">
                <dt className="text-sm text-slate-400">{label}</dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-white">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Security</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div>
                <p className="text-sm text-slate-900 dark:text-white">Password</p>
                <p className="text-xs text-slate-500">Last changed: Unknown</p>
              </div>
              <button
                onClick={() => setChangingPassword(!changingPassword)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:border-slate-600 transition-colors"
              >
                Change
              </button>
            </div>

            {changingPassword && (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-white p- dark:bg-slate-800/304">
                <input type="password" placeholder="Current password" value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
                <input type="password" placeholder="New password" value={pwForm.newPw} onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
                <input type="password" placeholder="Confirm new password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none" />
                <div className="flex gap-2">
                  <button className="rounded-lg bg-brand-600 px-4 py-2 text-xs text-slate-900 dark:text-white hover:bg-brand-700">Update Password</button>
                  <button onClick={() => setChangingPassword(false)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs text-slate-600 dark:text-slate-300">Cancel</button>
                </div>
                {message && <p className="text-xs text-green-400">{message}</p>}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div>
                <p className="text-sm text-slate-900 dark:text-white">Two-Factor Auth</p>
                <p className="text-xs text-slate-500">Not configured</p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs text-amber-400 border border-amber-500/20">Recommended</span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
              <div>
                <p className="text-sm text-slate-900 dark:text-white">Active Sessions</p>
                <p className="text-xs text-slate-500">1 active session</p>
              </div>
              <button onClick={handleLogoutAll} className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                Logout All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Permissions</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { module: "Projects", access: user.role !== "CLIENT" },
            { module: "IoT Devices", access: user.role !== "CLIENT" },
            { module: "HR & Payroll", access: user.role === "ADMIN" },
            { module: "Client Portal", access: true },
            { module: "AI Orchestrator", access: user.role !== "CLIENT" },
            { module: "Audit Logs", access: user.role === "ADMIN" },
            { module: "User Management", access: user.role === "ADMIN" },
            { module: "Statutory Config", access: user.role === "ADMIN" },
          ].map((perm) => (
            <div key={perm.module} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/50">
              <span className="text-xs text-slate-600 dark:text-slate-300">{perm.module}</span>
              <span className={`h-2 w-2 rounded-full ${perm.access ? "bg-green-500" : "bg-red-500"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-sm text-slate-400 mb-4">These actions are irreversible. Please be careful.</p>
        <div className="flex gap-3">
          <button onClick={logout} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
