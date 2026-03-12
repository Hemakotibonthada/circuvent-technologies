// ──────────────────────────────────────────────────────────────
// Circuvent Technologies — Public Landing Page
// ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-slate-200/50 dark:border-slate-200 bg-slate dark:border-slate-800/50-950/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-slate-900 dark:text-white">CT</div>
            <span className="text-lg font-bold text-slate-900 dark:text-white">Circuvent</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#modules" className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Modules</a>
            <a href="#tech" className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Tech Stack</a>
            <a href="#contact" className="text-sm text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">Sign In</a>
            <a href="/register" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-slate-900 dark:text-white hover:bg-brand-700 transition-colors">Get Started</a>
          </div>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden pt-32 pb-20">
        <div className="absolute inset-0 bg-gradient-to-b from-brand-600/5 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-brand-600/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/5 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-brand-400">Platform v2.0 — Now with AI Orchestrator</span>
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-tight text-slate-900 dark:text-white md:text-7xl">
            Build the Future with{" "}
            <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
              Circuvent
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            The unified internal platform for AI, IoT, Embedded Systems & Full-Stack Development.
            Manage hardware, software, people, and intelligence — all in one place.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <a href="/login" className="rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-semibold text-slate-900 dark:text-white shadow-lg shadow-brand-600/20 hover:bg-brand-700 transition-all hover:shadow-brand-600/30">
              Open Dashboard
            </a>
            <a href="#modules" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-slate-900/50 px-8 py-3.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-600 hover:text-slate-900 dark:hover:text-white transition-all">
              Explore Modules
            </a>
          </div>

          {/* Stats bar */}
          <div className="mx-auto mt-16 grid max-w-3xl grid-cols-4 gap-8 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50 p-6">
            {[
              ["6", "Microservices"],
              ["46", "Database Tables"],
              ["28+", "Dashboard Pages"],
              ["176+", "Source Files"],
            ].map(([value, label]) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Section ── */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Enterprise-Grade Architecture</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">Built with Domain-Driven Design, microservices, and real-time capabilities for scaling startups.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "🔐", title: "RBAC Security", desc: "Role-based access with JWT, refresh tokens, session management, and per-resource permissions." },
              { icon: "📊", title: "ISO Audit Trail", desc: "Every write operation logged. Compliance reports, security alerts, and full activity history." },
              { icon: "🏗️", title: "DDD Architecture", desc: "Domain entities with state machines, repositories, controllers, validators — enterprise patterns." },
              { icon: "📡", title: "Real-Time WebSockets", desc: "Live IoT telemetry, heartbeat monitoring, GPU metrics, and instant notifications." },
              { icon: "📄", title: "PDF Generation", desc: "India-compliant payslip PDFs, GST invoices, and automated compliance reports." },
              { icon: "🇮🇳", title: "India Tax Engine", desc: "EPF, ESI, TDS (New + Old regime), Professional Tax (7 states), and Gratuity calculators." },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/30 p-6 hover:border-slate-700 transition-colors">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modules Section ── */}
      <section id="modules" className="py-20 border-t border-slate-200 dark:border-slate-800/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">5 Integrated Modules</h2>
            <p className="mt-3 text-slate-400">Single source of truth across hardware, software, people, and AI.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "📋", title: "Project Tracker", desc: "Sprint boards, hardware BOM, R&D tagging, velocity tracking", color: "blue" },
              { icon: "📡", title: "IoT Registry", desc: "Device fleet, heartbeat monitoring, OTA firmware, command dispatch", color: "green" },
              { icon: "👥", title: "HR & Payroll", desc: "India statutory compliance, payslip PDF, leave & expense workflows", color: "purple" },
              { icon: "💼", title: "Client Portal", desc: "CRM pipeline, multi-currency invoicing, GST, aging reports", color: "amber" },
              { icon: "🤖", title: "AI Orchestrator", desc: "GPU pool, training job scheduler, trading bot management", color: "cyan" },
            ].map((m) => (
              <div key={m.title} className={`rounded-xl border border-${m.color}-500/20 bg-${m.color}-500/5 p-6`}>
                <span className="text-3xl">{m.icon}</span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{m.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section id="tech" className="py-20 border-t border-slate-200 dark:border-slate-800/50">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Technology Stack</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              "TypeScript", "Node.js", "Express", "Next.js 14", "React 18",
              "PostgreSQL 17", "Prisma ORM", "Tailwind CSS",
              "WebSocket", "PDFKit", "Zod", "JWT", "Turborepo", "Docker",
            ].map((tech) => (
              <span key={tech} className="rounded-full border border-slate-200 dark:border-slate-700 bg-white shadow-sm dark:bg-slate-900/50 px-5 py-2 text-sm text-slate-600 dark:text-slate-300">{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-20 border-t border-slate-200 dark:border-slate-800/50">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Ready to get started?</h2>
          <p className="mt-4 text-slate-400">Sign in to access the Circuvent Internal Management Platform.</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <a href="/login" className="rounded-xl bg-brand-600 px-8 py-3.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-brand-700 transition-colors">
              Sign In
            </a>
            <a href="/register" className="rounded-xl border border-slate-200 dark:border-slate-700 px-8 py-3.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-slate-600 transition-colors">
              Create Account
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" className="border-t border-slate-200 dark:border-slate-800 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-slate-900 dark:text-white">CT</div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Circuvent Technologies Pvt. Ltd.</p>
                <p className="text-xs text-slate-500">HSR Layout, Bengaluru, Karnataka 560102</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} Circuvent Technologies. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
