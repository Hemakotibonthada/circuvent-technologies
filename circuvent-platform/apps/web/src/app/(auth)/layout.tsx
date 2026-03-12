// ──────────────────────────────────────────────────────────────
// Auth Layout — shared layout for login, register, forgot
// password pages. Centered card with branding sidebar.
// ──────────────────────────────────────────────────────────────

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-slate-900 dark:text-white">CT</div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">Circuvent</span>
          </div>
        </div>

        <div className="space-y-8">
          <h2 className="text-4xl font-bold leading-tight text-slate-900 dark:text-white">
            One Platform.<br />
            <span className="text-brand-600 dark:text-brand-400">Infinite Possibilities.</span>
          </h2>
          <p className="max-w-md text-slate-400">
            Manage your entire tech startup from a single dashboard — projects, IoT devices, HR compliance, client invoicing, and AI workloads.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: "📊", label: "Project Sprints" },
              { icon: "📡", label: "IoT Monitoring" },
              { icon: "👥", label: "HR & Payroll" },
              { icon: "💼", label: "Client CRM" },
              { icon: "🤖", label: "AI Training" },
              { icon: "🔒", label: "Audit Trail" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-white/5 px-3 py-2">
                <span>{item.icon}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Circuvent Technologies Pvt. Ltd.
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full items-center justify-center bg-white px-6 dark:bg-slate-950 lg:w-1/2 transition-colors">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-2xl font-bold text-slate-900 dark:text-white shadow-lg">CT</div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Circuvent Platform</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
