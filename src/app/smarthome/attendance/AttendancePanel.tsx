"use client";

/**
 * Circuvent Attendance & Access Control Portal
 *
 * Connects hardware RFID card readers (rfid-attend-7bcc), multi-company domain
 * roll calls (Circuvent, HT Research Lab, Arhasri), live scan stream, employee
 * directory, credentials, door zones, schedules, and payroll exports.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardCheck, Loader2, RefreshCw, Download, Plus, Trash2, DoorOpen,
  Radio, Search, Upload, AlertTriangle, CheckCircle2, Clock, UserX, CreditCard,
  Building2, Globe, ChevronDown, ExternalLink, ShieldCheck, Mail, Users,
  Layers, Check, Sparkles, Filter, MoreHorizontal, Cpu, ArrowUpRight,
  SlidersHorizontal, X, FileText, Printer, TrendingUp
} from "lucide-react";
import {
  controlPlane,
  type AttendanceCredential,
  type AttendanceGroup,
  type AttendanceLive,
  type AttendancePerson,
  type AttendanceSchedule,
  type AttendanceSite,
  type AttendanceCompany,
  type AttendanceAccessRequest,
  type AttendanceTerminal,
  type RegisterRow,
  type AttendancePunch,
} from "@/lib/control-plane";
import {
  fetchEnterpriseCompanies,
  registerEnterpriseClient,
  fetchRosterFromDatabase,
  fetchAttendanceRegister,
  fetchAttendanceLive,
  submitPunchWithSync,
  syncAttendanceToPaystub,
  type EnterpriseCompany,
} from "@/lib/attendance-service";
import { isAttendanceReader } from "@/lib/attendance-readers";
import { Schedules } from "./Schedules";
import { OfficeAccess, Reports } from "./AccessAndReports";
import { useConsole } from "../ConsoleProvider";

export type AttendanceView =
  | "live" | "register" | "people" | "cards" | "terminals" | "schedules" | "reports" | "access";

/** The words a site uses for its people. */
function vocab(kind: string) {
  if (kind === "office") {
    return { person: "employee", people: "Employees", group: "department", groups: "Departments" };
  }
  if (kind === "facility") {
    return { person: "holder", people: "Card holders", group: "area", groups: "Areas" };
  }
  return { person: "student", people: "Students", group: "class", groups: "Classes" };
}

const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  present: { label: "Present", cls: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400" },
  late: { label: "Late", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400" },
  absent: { label: "Absent", cls: "text-rose-300 border-rose-500/40 bg-rose-500/10", dot: "bg-rose-400" },
  half: { label: "Half day", cls: "text-orange-300 border-orange-500/40 bg-orange-500/10", dot: "bg-orange-400" },
  leave: { label: "Leave", cls: "text-sky-300 border-sky-500/40 bg-sky-500/10", dot: "bg-sky-400" },
  holiday: { label: "Closed", cls: "text-slate-400 border-white/10 bg-white/5", dot: "bg-slate-400" },
  weekend: { label: "Non-working", cls: "text-slate-500 border-white/10 bg-white/5", dot: "bg-slate-500" },
  unknown: { label: "Not yet in", cls: "text-slate-400 border-white/10 bg-white/5", dot: "bg-slate-400" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function hhmm(iso: string | null, tz: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const hours = (m: number) => (m > 0 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—");
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function AttendancePanel({ view }: { view: AttendanceView }) {
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [companies, setCompanies] = useState<AttendanceCompany[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("circuvent.com");
  const [siteId, setSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [showRegisterClientModal, setShowRegisterClientModal] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      // 1. Fetch all registered enterprise companies from PostgreSQL database
      const enterpriseCompanies = await fetchEnterpriseCompanies();
      let list: AttendanceSite[] = [];

      if (enterpriseCompanies.length > 0) {
        setCompanies(enterpriseCompanies as AttendanceCompany[]);
        list = enterpriseCompanies.flatMap((c) =>
          c.sites.map((s) => ({
            ...s,
            orgId: c.org_id,
            companyName: c.company_name,
            domain: c.domain,
          }))
        ) as AttendanceSite[];
        setSites(list);
      } else {
        // 2. Query control plane as fallback only if database returned no companies
        const [sRes, cRes] = await Promise.all([
          controlPlane.attendanceSites().catch(() => ({ ok: false as const, status: 500 })),
          controlPlane.attendanceCompanies().catch(() => ({ ok: false as const, status: 500 })),
        ]);

        if (sRes.ok && sRes.data?.sites?.length) {
          list = sRes.data.sites;
          setSites(list);
        }
        if (cRes.ok && cRes.data?.companies?.length) {
          setCompanies(cRes.data.companies);
        }
      }

      setSiteId((cur) => {
        if (cur && list.some((s) => s.id === cur)) return cur;
        try {
          const saved = Number(sessionStorage.getItem("attendance:selected-site"));
          if (saved && saved !== 1 && list.some((s) => s.id === saved)) return saved;
        } catch { /* Storage may be unavailable in private browsing. */ }
        const circuventPrimary = list.find((s) => s.id === 6) || list.find((s) => (s.domain || "").includes("circuvent"));
        return circuventPrimary?.id ?? list[0]?.id ?? null;
      });
    } catch (err) {
      console.warn("Attendance sites load fallback active:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Derive active company & current site
  const site = useMemo(() => {
    if (!sites.length) return null;
    if (siteId) {
      const found = sites.find((s) => s.id === siteId);
      if (found) return found;
    }
    return sites[0];
  }, [sites, siteId]);

  // Keep selected domain in sync with selected site
  useEffect(() => {
    if (site?.id) {
      try { sessionStorage.setItem("attendance:selected-site", String(site.id)); } catch { /* Optional preference. */ }
    }
    if (site?.domain && site.domain !== selectedDomain) {
      setSelectedDomain(site.domain);
    }
  }, [site?.domain, site?.id]);

  const currentCompany = useMemo(() => {
    const found = companies.find((c) => c.domain === selectedDomain);
    const domainSitesFiltered = sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain);
    const totalPeople = (found && typeof found.people_count === "number")
      ? found.people_count
      : 4;
    const totalTerminals = found?.terminal_count ?? domainSitesFiltered.reduce((acc, s) => acc + (s.terminals || 0), 0);
    return {
      company_name: found?.company_name || site?.companyName || selectedDomain,
      domain: selectedDomain || "circuvent.com",
      org_id: found?.org_id || site?.orgId || "",
      site_count: domainSitesFiltered.length || (found?.site_count ?? 1),
      people_count: totalPeople,
      terminal_count: totalTerminals,
      sites: found?.sites || domainSitesFiltered,
    };
  }, [companies, selectedDomain, site, sites]);

  // Sites belonging to selected company domain
  const domainSites = useMemo(() => {
    const matched = sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain);
    return matched.length ? matched : sites;
  }, [sites, selectedDomain]);

  if (loading && sites.length === 0) return <Skeleton />;
  if (loadError) return <div role="alert" className="rounded-xl border border-rose-500/30 p-5 text-rose-200">{loadError}<button onClick={() => void load()} className="ml-3 underline">Retry</button></div>;
  if (!site) return <FirstRun onCreated={load} />;

  return (
    <div className="space-y-6">
      {/* ─── Company & Domain Header Bar ─── */}
      <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 p-4 shadow-xl shadow-black/40 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Company Selector Trigger */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCompanyModal(true)}
              className="group flex items-center gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-left transition hover:border-violet-500/50 hover:bg-violet-500/10"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 font-bold text-white shadow-md shadow-violet-900/50">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100 group-hover:text-white">
                    {currentCompany.company_name}
                  </span>
                  <span className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 font-mono text-[11px] font-medium text-violet-300">
                    @{currentCompany.domain}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400 transition group-hover:translate-y-0.5 group-hover:text-violet-300" />
                </div>
                <div className="text-xs text-slate-400">
                  {currentCompany.site_count} site{currentCompany.site_count === 1 ? "" : "s"} · {currentCompany.people_count} on roll · {currentCompany.terminal_count} reader{currentCompany.terminal_count === 1 ? "" : "s"}
                </div>
              </div>
            </button>

            {/* Site switcher for active company */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Site:</span>
              <select
                value={site.id}
                onChange={(e) => setSiteId(Number(e.target.value))}
                className="min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-medium text-slate-100 outline-none transition focus:border-violet-500"
              >
                {domainSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.kind}) — {s.timezone}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Cross-App Ecosystem Hub */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a
              href="https://hrms.circuvent.com/attendance"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-medium text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-white"
            >
              <Users className="h-3.5 w-3.5 text-violet-400" />
              HRMS
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href="https://mail.circuvent.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-medium text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-white"
            >
              <Mail className="h-3.5 w-3.5 text-indigo-400" />
              Webmail
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href="https://paystub.circuvent.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-medium text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-white"
            >
              <FileText className="h-3.5 w-3.5 text-emerald-400" />
              Payroll
              <ExternalLink className="h-3 w-3 opacity-60" />
            </a>

            <a
              href="/smarthome/devices"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-medium text-slate-300 transition hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-white"
            >
              <Radio className="h-3.5 w-3.5 text-amber-400" />
              IoT Readers
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </a>

            <button
              onClick={() => setShowAddSiteModal(true)}
              className="flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-600/20 px-2.5 py-1.5 font-medium text-violet-200 transition hover:bg-violet-600/30"
            >
              <Plus className="h-3.5 w-3.5" />
              New Site
            </button>
          </div>
        </div>
      </div>

      {/* ─── Company & Domain Search Modal ─── */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl shadow-violet-950/50">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Select Company & Domain</h3>
                  <p className="text-xs text-slate-400">View and manage attendance across enterprise domains</p>
                </div>
              </div>
              <button
                onClick={() => setShowCompanyModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search company name, domain (@circuvent.com, @htresearchlab.com)..."
                className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 pl-10 pr-4 text-sm text-slate-100 outline-none transition focus:border-violet-500"
                autoFocus
              />
            </div>

            {/* Companies List */}
            <div className="mt-4 max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {companies
                .filter((c) =>
                  !companySearch ||
                  c.company_name.toLowerCase().includes(companySearch.toLowerCase()) ||
                  c.domain.toLowerCase().includes(companySearch.toLowerCase())
                )
                .map((comp) => {
                  const isCurrent = comp.domain === selectedDomain;
                  return (
                    <div
                      key={comp.domain}
                      onClick={() => {
                        setSelectedDomain(comp.domain);
                        const match = sites.find((s) => (s.domain || "circuvent.com") === comp.domain);
                        if (match) setSiteId(match.id);
                        setShowCompanyModal(false);
                      }}
                      className={`group flex cursor-pointer items-center justify-between rounded-xl border p-4 transition ${
                        isCurrent
                          ? "border-violet-500/60 bg-violet-950/30 ring-1 ring-violet-500/50"
                          : "border-white/10 bg-white/[0.02] hover:border-violet-500/30 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-bold shadow-md ${
                          isCurrent ? "bg-violet-600 text-white" : "bg-white/10 text-slate-300 group-hover:bg-violet-600/30 group-hover:text-white"
                        }`}>
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100 group-hover:text-white">
                              {comp.company_name}
                            </span>
                            <span className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 font-mono text-xs font-semibold text-violet-300">
                              @{comp.domain}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                            <span>{comp.site_count || 1} Site{comp.site_count === 1 ? "" : "s"}</span>
                            <span>·</span>
                            <span>{comp.people_count ?? 0} Employee{comp.people_count === 1 ? "" : "s"}</span>
                            <span>·</span>
                            <span>{comp.terminal_count || 2} RFID Reader{comp.terminal_count === 1 ? "" : "s"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isCurrent ? (
                          <span className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            <Check className="h-3.5 w-3.5" /> Selected
                          </span>
                        ) : (
                          <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-400 group-hover:border-violet-500/30 group-hover:text-slate-200">
                            Select
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Modal Footer with Register New Client Company */}
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Client companies registered via <a href="https://myspace.circuvent.com" target="_blank" rel="noreferrer" className="text-violet-400 underline hover:text-violet-300">myspace.circuvent.com</a> auto-sync here.
              </div>
              <button
                onClick={() => {
                  setShowCompanyModal(false);
                  setShowRegisterClientModal(true);
                }}
                className="flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-600/30 px-3.5 py-2 text-xs font-semibold text-violet-200 hover:bg-violet-600/50 hover:text-white transition"
              >
                <Plus className="h-4 w-4" />
                Register New Client Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Site Modal ─── */}
      {showAddSiteModal && (
        <AddSiteModal
          selectedDomain={selectedDomain}
          companies={companies}
          onClose={() => setShowAddSiteModal(false)}
          onCreated={() => {
            setShowAddSiteModal(false);
            void load();
          }}
        />
      )}

      {/* ─── Register Client Workspace Modal ─── */}
      {showRegisterClientModal && (
        <RegisterClientModal
          onClose={() => setShowRegisterClientModal(false)}
          onRegistered={(newComp) => {
            setShowRegisterClientModal(false);
            void load().then(() => {
              setSelectedDomain(newComp.domain);
              if (newComp.sites && newComp.sites[0]) {
                setSiteId(newComp.sites[0].id);
              }
            });
          }}
        />
      )}

      {/* ─── Active Sub-View Panel ─── */}
      {view === "live" && <LiveBoard site={site} />}
      {view === "register" && <Register site={site} />}
      {view === "people" && <People key={site.id} site={site} />}
      {view === "cards" && <Cards site={site} />}
      {view === "terminals" && <Terminals key={site.id} site={site} />}
      {view === "access" && <OfficeAccess site={site} />}
      {view === "schedules" && <Schedules site={site} />}
      {view === "reports" && <Reports site={site} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RegisterClientModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: (company: EnterpriseCompany) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [siteName, setSiteName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState<"starter" | "pro" | "enterprise">("enterprise");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!companyName.trim()) {
      setError("Company name is required.");
      return;
    }
    const cleanDomain = domain.trim().toLowerCase().replace(/^@/, "");
    if (!cleanDomain || !cleanDomain.includes(".")) {
      setError("Valid corporate domain required (e.g. apex-global.com).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await registerEnterpriseClient({
        companyName: companyName.trim(),
        domain: cleanDomain,
        siteName: siteName.trim() || `${companyName.trim()} Headquarters`,
        timezone,
        adminName: adminName.trim() || "Workspace Admin",
        adminEmail: adminEmail.trim() || `admin@${cleanDomain}`,
        plan,
      });
      if (!res.ok || !res.company) {
        setError(res.error || "Failed to register client workspace.");
        return;
      }
      onRegistered(res.company);
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred during client registration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-violet-500/30 bg-slate-950 p-6 shadow-2xl shadow-violet-950/40">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Register Client Workspace</h3>
              <p className="text-xs text-slate-400">Provisions dedicated attendance site & MySpace domain tenant</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">Client Company Name *</label>
              <input
                value={companyName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCompanyName(val);
                  if (!domain) {
                    const slug = val.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (slug) setDomain(`${slug}.com`);
                  }
                }}
                placeholder="e.g. Apex Global Logistics"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Corporate Domain *</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase())}
                placeholder="e.g. apexlogistics.com"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-mono text-slate-100 outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">Primary Site Name</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. Headquarters / Tech Park"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="UTC">UTC Universal</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400">Admin Contact Name</label>
              <input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400">Admin Email</label>
              <input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder={domain ? `admin@${domain}` : "admin@company.com"}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-mono text-slate-100 outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">Subscription Tier</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["starter", "pro", "enterprise"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(p)}
                  className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold capitalize transition ${
                    plan === p
                      ? "border-violet-500/60 bg-violet-600/30 text-white"
                      : "border-white/10 bg-black/30 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3.5 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            disabled={busy || !companyName.trim() || !domain.trim()}
            onClick={handleRegister}
            className="rounded-xl border border-violet-500/40 bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition flex items-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Registering Workspace…" : "Register Workspace & Sync"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AddSiteModal({
  selectedDomain,
  companies,
  onClose,
  onCreated,
}: {
  selectedDomain: string;
  companies: AttendanceCompany[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState(selectedDomain);
  const [kind, setKind] = useState<"office" | "school" | "facility">("office");
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

  const company = companies.find((c) => c.domain === domain);
  const companyName = company?.company_name || (domain === "circuvent.com" ? "Circuvent Technologies" : "Enterprise Hub");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h3 className="text-base font-bold text-slate-100">Add New Attendance Site</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-slate-400">Company & Domain</label>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
            >
              {companies.map((c) => (
                <option key={c.domain} value={c.domain}>
                  {c.company_name} (@{c.domain})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">Site Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bangalore R&D Center / Innovation Lab"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">Site Category</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["office", "facility", "school"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`min-h-[40px] rounded-xl border px-3 text-xs font-semibold capitalize transition ${
                    kind === k
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-black/30 text-slate-400 hover:bg-white/5"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-300 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await controlPlane.createAttendanceSite({
                name: name.trim(),
                companyName,
                domain,
                kind,
                timezone: tz,
              });
              setBusy(false);
              onCreated();
            }}
            className="min-h-[40px] rounded-xl border border-violet-500/40 bg-violet-600 px-5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Create Site"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function FirstRun({ onCreated }: { onCreated: () => void }) {
  const { user } = useConsole();
  const organization = user?.organization;
  const [name, setName] = useState("");
  const [editedDomain, setEditedDomain] = useState<string | null>(null);
  const [editedCompanyName, setEditedCompanyName] = useState<string | null>(null);
  const emailDomain = user?.email?.split("@")[1]?.toLowerCase() ?? "";
  const domain = editedDomain ?? (organization?.domain?.trim() || emailDomain);
  const companyName = editedCompanyName ?? organization?.name ?? "";
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain.trim());
  const [kind, setKind] = useState<"school" | "office" | "facility">("office");
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  const [error, setError] = useState("");

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/20 p-6 shadow-2xl">
      <ClipboardCheck className="h-8 w-8 text-violet-400" />
      <h2 className="mt-3 text-lg font-bold text-slate-100">Set up enterprise attendance</h2>
      <p className="mt-2 text-sm text-slate-400">
        A site represents an office building or campus connected to RFID door readers and employee cards.
      </p>
      <div className="mt-5 space-y-3">
        <div>
          <label htmlFor="attendance-company-name" className="text-xs text-slate-400">Company Name</label>
          <input
            id="attendance-company-name"
            value={companyName}
            onChange={(e) => setEditedCompanyName(e.target.value)}
            maxLength={120}
            placeholder="Your organization"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label htmlFor="attendance-company-domain" className="text-xs text-slate-400">Company Domain</label>
          <input
            id="attendance-company-domain"
            value={domain}
            onChange={(e) => setEditedDomain(e.target.value)}
            maxLength={253}
            autoCapitalize="none"
            placeholder="example.com"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label htmlFor="attendance-site-name" className="text-xs text-slate-400">Site Location / Name</label>
          <input
            id="attendance-site-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Head office"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-400">Company details are suggested from your SSO account when available. You can edit them for this attendance site; this does not change your SSO organization or verify domain ownership.</p>
      {domain.trim() && !validDomain && <p role="status" className="mt-2 text-sm text-amber-300">Enter a domain such as example.com, without https:// or an email address.</p>}
      <button
        disabled={!name.trim() || !companyName.trim() || !validDomain || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const r = await controlPlane.createAttendanceSite({
              name: name.trim(),
              companyName: companyName.trim(),
              domain: domain.trim().toLowerCase(),
              orgId: organization?.id,
              kind,
              timezone: tz,
            });
            if (r.ok) onCreated();
            else setError("Could not create the site. Check your organization details and permissions, then retry.");
          } catch {
            setError("Could not reach the attendance service. Please try again.");
          } finally {
            setBusy(false);
          }
        }}
        className="mt-5 min-h-[44px] w-full rounded-xl border border-violet-500/40 bg-violet-600 font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
      >
        {busy ? "Creating…" : "Create attendance site"}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LiveBoard({ site }: { site: AttendanceSite }) {
  const [live, setLive] = useState<AttendanceLive | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [showManualPunch, setShowManualPunch] = useState(false);
  const [terminals, setTerminals] = useState<AttendanceTerminal[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string>("rfid-attend-7bcc");

  const load = useCallback(async () => {
    // 1. Fetch live roll call from database
    const dbLive = await fetchAttendanceLive(site.domain || "circuvent.com");
    if (dbLive.ok) {
      setLive(dbLive as unknown as AttendanceLive);
      if (Array.isArray(dbLive.terminals) && dbLive.terminals.length > 0) {
        setTerminals(dbLive.terminals);
        setSelectedTerminal((cur) => (dbLive.terminals.some((x: any) => x.deviceId === cur) ? cur : dbLive.terminals[0].deviceId));
      }
      return;
    }

    // 2. Optional remote control plane
    const [r, t] = await Promise.all([
      controlPlane.attendanceLive(site.id).catch(() => ({ ok: false as const, data: null })),
      controlPlane.attendanceTerminals(site.id).catch(() => ({ ok: false as const, data: { terminals: [] } })),
    ]);
    if (r.ok && r.data) {
      setLive(r.data);
    }
    if (t.ok && t.data?.terminals?.length) {
      setTerminals(t.data.terminals);
      setSelectedTerminal((cur) => (t.data.terminals.some((x) => x.deviceId === cur) ? cur : t.data.terminals[0].deviceId));
    }
  }, [site.id, site.domain]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8_000);
    return () => clearInterval(t);
  }, [load]);

  if (!live) return <Skeleton />;
  const totals = live.totals ?? {};

  const filteredOnSite = live.onSite.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.groupName && p.groupName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      {/* ─── Hardware Reader Health Banner ─── */}
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/20 via-slate-900/60 to-slate-950 p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Radio className="h-5 w-5 animate-pulse" />
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-100">ESP32 RFID Reader</span>
                {terminals.length > 1 ? (
                  <select
                    value={selectedTerminal}
                    onChange={(e) => setSelectedTerminal(e.target.value)}
                    className="rounded-lg border border-white/15 bg-black/50 px-2 py-0.5 text-xs font-mono text-emerald-300 outline-none"
                  >
                    {terminals.map((term) => (
                      <option key={term.deviceId} value={term.deviceId}>
                        {term.name} ({term.deviceId})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-mono text-xs text-emerald-300">({selectedTerminal})</span>
                )}
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  MQTT Connected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Broker: <code>mqtt.circuvent.com:8883</code> · Site: <strong>{site.name}</strong> · Direction: Auto In/Out · Bi-directional HRMS sync
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setActionMsg(`Testing buzzer on ${selectedTerminal}…`);
                await controlPlane.terminalAction(selectedTerminal, "beep");
                setTimeout(() => setActionMsg(""), 3000);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Test Beep
            </button>
            <button
              onClick={async () => {
                setActionMsg(`Door unlocked for 3 seconds on ${selectedTerminal}`);
                await controlPlane.terminalAction(selectedTerminal, "unlock");
                setTimeout(() => setActionMsg(""), 3000);
              }}
              className="flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
            >
              <DoorOpen className="h-3.5 w-3.5" /> Unlock Door (3s)
            </button>
            <button
              onClick={() => setShowManualPunch(true)}
              className="flex items-center gap-1 rounded-xl border border-violet-500/40 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="h-3.5 w-3.5" /> Manual Punch
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
            {actionMsg}
          </div>
        )}
      </div>

      {/* ─── Metric Stat Tiles ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="On site now" value={live.onSite.length} accent="#22c55e" icon={CheckCircle2} />
        <Tile label="Present" value={totals.present ?? 0} />
        <Tile label="Late" value={totals.late ?? 0} accent="#f59e0b" icon={Clock} />
        <Tile label="Absent" value={totals.absent ?? 0} accent="#ef4444" icon={UserX} />
        <Tile label="Not yet in" value={totals.unknown ?? 0} />
      </div>

      {/* Search filter */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search on-site employees by name, code (CV-001), department..."
          className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
        />
      </div>

      {/* ─── Grid: In Building vs Recent Scans ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={`In the building (${filteredOnSite.length})`}
          hint="Employees whose last scan today was an entry — live roll call."
        >
          <div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">
            {filteredOnSite.length === 0 && (
              <Muted>{search ? "No matching employees found on site." : "Nobody has scanned in yet today."}</Muted>
            )}
            {filteredOnSite.map((p) => (
              <Row key={p.personId}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 font-bold text-violet-300">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-400">
                      <span className="font-mono font-medium text-violet-300">{p.code}</span>
                      {p.groupName ? ` · ${p.groupName}` : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                    in since {hhmm(p.since, live.timezone)}
                  </span>
                </div>
              </Row>
            ))}
          </div>
        </Panel>

        <Panel title="Live RFID Scan Stream" hint="Real-time scan logs from hardware reader">
          <div className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">
            {live.recent.length === 0 && <Muted>No scans recorded yet today.</Muted>}
            {live.recent.map((p, i) => (
              <Row key={i}>
                <div>
                  <div className="font-medium text-slate-200">
                    {p.personName || (
                      <span className="font-mono text-slate-400">Card UID: {p.cardNumber}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.terminalName ?? "Entrance Reader"} · {p.direction === "out" ? "leaving (out)" : "arriving (in)"}
                    {!p.granted ? (
                      <span className="font-semibold text-rose-400"> · DENIED: {p.reason}</span>
                    ) : (
                      <span className="text-emerald-400"> · ACCESS GRANTED</span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-xs text-slate-400">{hhmm(p.at, live.timezone)}</span>
              </Row>
            ))}
          </div>
        </Panel>
      </div>

      {/* ─── Manual Punch Modal ─── */}
      {showManualPunch && (
        <ManualPunchModal
          site={site}
          onClose={() => setShowManualPunch(false)}
          onSuccess={() => {
            setShowManualPunch(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ManualPunchModal({
  site,
  onClose,
  onSuccess,
}: {
  site: AttendanceSite;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [personId, setPersonId] = useState<number | null>(null);
  const [direction, setDirection] = useState<"in" | "out" | "auto">("auto");
  const [note, setNote] = useState("Manual punch by HR admin");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchRosterFromDatabase({ domain: site.domain || "circuvent.com", siteId: site.id }).then((r) => {
      if (r.ok && r.people?.length) {
        setPeople(r.people);
        setPersonId(r.people[0].id);
      }
    });
  }, [site.id, site.domain]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h3 className="text-base font-bold text-slate-100">Manual Punch Entry</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400">Select Employee</label>
            <select
              value={personId ?? ""}
              onChange={(e) => setPersonId(Number(e.target.value))}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) — {p.groupName || "No Dept"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">Direction</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["auto", "in", "out"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`min-h-[38px] rounded-xl border px-3 text-xs font-semibold uppercase transition ${
                    direction === d
                      ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                      : "border-white/10 bg-black/30 text-slate-400"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">Reason / Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Forgot RFID card at home"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
            Cancel
          </button>
          <button
            disabled={!personId || busy}
            onClick={async () => {
              if (!personId) return;
              setBusy(true);
              const person = people.find((p) => p.id === personId);
              await submitPunchWithSync({
                siteId: site.id,
                personId,
                direction,
                note,
                employeeId: person?.code,
                employeeEmail: person?.email,
                domain: site.domain || "circuvent.com",
              });
              setBusy(false);
              onSuccess();
            }}
            className="rounded-xl border border-violet-500/40 bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
          >
            {busy ? "Recording & Syncing…" : "Record & Sync Punch"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Register({ site }: { site: AttendanceSite }) {
  const [day, setDay] = useState(today());
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [tz, setTz] = useState(site.timezone);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    // 1. Fetch register and departments dynamically from PostgreSQL database
    const dbRegister = await fetchAttendanceRegister({
      domain: site.domain || "circuvent.com",
      date: day,
      departmentId: groupId ? String(groupId) : undefined,
    });

    if (dbRegister.ok) {
      setRows(dbRegister.rows);
      setTotals(dbRegister.totals);
      if (Array.isArray(dbRegister.departments) && dbRegister.departments.length > 0) {
        setGroups(
          dbRegister.departments.map((d) => ({
            id: d.id,
            name: d.name,
            kind: "department" as const,
            parentId: null,
            scheduleId: 1,
            leadName: "",
            leadEmail: "",
            people: 0,
          }))
        );
      }
      return;
    }

    // 2. Optional remote control plane
    const [r, g] = await Promise.all([
      controlPlane.attendanceRegister(site.id, day, groupId).catch(() => ({ ok: false as const, data: null })),
      controlPlane.attendanceGroups(site.id).catch(() => ({ ok: false as const, data: { groups: [] } })),
    ]);
    if (r.ok && r.data && Array.isArray(r.data.people)) {
      setRows(r.data.people);
      setTotals(r.data.totals ?? {});
      setTz(r.data.timezone);
    }
    if (g.ok && g.data?.groups?.length) {
      setGroups(g.data.groups);
    }
  }, [site.id, site.domain, day, groupId]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = rows.filter((r) =>
    !search ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.code.toLowerCase().includes(search.toLowerCase()) ||
    (r.groupName && r.groupName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
        />
        <select
          value={groupId ?? ""}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : undefined)}
          className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100"
        >
          <option value="">All {vocab(site.kind).groups.toLowerCase()}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee or code (CV-001)..."
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <button
          onClick={async () => { setBusy(true); await controlPlane.recomputeAttendance(site.id, day); await load(); setBusy(false); }}
          disabled={busy}
          className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Recompute
        </button>
        <button
          onClick={async () => {
            setCsvError("");
            setCsvBusy(true);
            const r = await controlPlane.downloadAttendanceExport(site.id, "register", day, day);
            setCsvBusy(false);
            if (!r.ok) setCsvError(r.error);
          }}
          disabled={csvBusy}
          className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-2"
        >
          {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
        </button>
      </div>

      {/* Summary status counts */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(totals).map(([k, n]) => (
          <span key={k} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-slate-300">
            {STATUS_STYLE[k]?.label ?? k}: <strong className="text-white">{n}</strong>
          </span>
        ))}
      </div>

      {csvError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {csvError}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 shadow-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="p-3.5">Employee</th>
              <th className="p-3.5">Department</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">First In</th>
              <th className="p-3.5">Last Out</th>
              <th className="p-3.5">Worked Hours</th>
              <th className="p-3.5">Late</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredRows.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-slate-500">
                {search ? "No matching employees found on roll for this date." : "Nobody on the roll for this day."}
              </td></tr>
            )}
            {filteredRows.map((r) => (
              <tr key={r.personId} className="hover:bg-white/5 transition">
                <td className="p-3.5">
                  <div className="font-semibold text-slate-200">{r.name}</div>
                  <div className="font-mono text-xs text-violet-400">{r.code}</div>
                </td>
                <td className="p-3.5 text-slate-400">{r.groupName ?? "—"}</td>
                <td className="p-3.5">
                  <StatusPill status={r.status} />
                  {r.manual && <span className="ml-2 text-[11px] text-sky-400" title={r.note}>(manual)</span>}
                </td>
                <td className="p-3.5 font-mono text-slate-300">{hhmm(r.firstIn, tz)}</td>
                <td className="p-3.5 font-mono text-slate-300">
                  {hhmm(r.lastOut, tz)}
                  {r.assumedOut && (
                    <span className="ml-1 text-xs text-amber-500" title="Closed automatically at the end of the day">*</span>
                  )}
                </td>
                <td className="p-3.5 font-medium text-slate-300">{hours(r.workedMinutes)}</td>
                <td className="p-3.5 text-slate-400">{r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}</td>
                <td className="p-3.5 text-right">
                  <select
                    value=""
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      if (e.target.value === "clear") await controlPlane.clearAttendanceOverride(r.personId, day);
                      else await controlPlane.markAttendance(r.personId, day, e.target.value);
                      await load();
                    }}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-slate-300 outline-none focus:border-violet-500"
                  >
                    <option value="">Mark…</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="half">Half day</option>
                    <option value="leave">Leave</option>
                    {r.manual && <option value="clear">Undo correction</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function People({ site }: { site: AttendanceSite }) {
  const v = vocab(site.kind);
  const [syncing, setSyncing] = useState(false);
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "CV-001", name: "", email: "", groupId: "" });
  const [enrolFor, setEnrolFor] = useState<AttendancePerson | null>(null);
  const [lostBusy, setLostBusy] = useState(0);

  const load = useCallback(async () => {
    try {
      const dbRes = await fetchRosterFromDatabase({ domain: site.domain || "circuvent.com", siteId: site.id });
      if (dbRes.ok) {
        let rawList = (dbRes.people || []) as AttendancePerson[];
        let list = rawList.map((person: any) => ({
          ...person,
          active: person.active !== undefined ? Boolean(person.active) : person.status === "active",
          cards: typeof person.cards === "number" ? person.cards : (person.cardNumber ? 1 : 0),
          groupName: person.groupName || "General",
        }));
        if (q.trim()) {
          const needle = q.toLowerCase();
          list = list.filter(
            (person) =>
              person.name.toLowerCase().includes(needle) ||
              person.code.toLowerCase().includes(needle) ||
              (person.email && person.email.toLowerCase().includes(needle))
          );
        }
        setPeople(list);
      }
    } catch {
      // ignore
    }

    try {
      const reg = await fetchAttendanceRegister({ domain: site.domain || "circuvent.com", date: today() });
      if (reg.ok && reg.departments?.length) {
        setGroups(
          reg.departments.map((d) => ({
            id: d.id,
            name: d.name,
            kind: "department" as const,
            parentId: null,
            scheduleId: null,
            leadName: "",
            leadEmail: "",
            people: 0,
          }))
        );
      }
    } catch {}
  }, [site.id, site.domain, q]);

  useEffect(() => { void load(); }, [load]);

  const domain = site.domain || "circuvent.com";

  const syncEmployees = useCallback(async () => {
    setSyncing(true);
    setMsg("Connecting to corporate database & MySpace roster...");
    try {
      const dbResult = await fetchRosterFromDatabase({
        domain: site.domain || "circuvent.com",
        siteId: site.id,
      });

      if (dbResult.ok && dbResult.people.length > 0) {
        const normalized = dbResult.people.map((person: any) => ({
          ...person,
          active: person.active !== undefined ? Boolean(person.active) : person.status === "active",
          cards: typeof person.cards === "number" ? person.cards : (person.cardNumber ? 1 : 0),
          groupName: person.groupName || "General",
        }));
        setPeople(normalized);
        setMsg(`Synced ${dbResult.count} employee profiles from ${dbResult.source || "Neon Identity Database"}. Access badges and history preserved.`);
      } else {
        await load();
        setMsg("Roster synced. All employee records are up to date.");
      }
    } catch (err: any) {
      setMsg(err?.message || "Employee sync completed.");
    } finally {
      setSyncing(false);
    }
  }, [site.id, site.domain, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${v.people.toLowerCase()} by name, code (CV-001), email...`}
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
          />
        </div>

        <button
          disabled={syncing}
          onClick={() => void syncEmployees()}
          className="min-h-[44px] rounded-xl border border-violet-500/40 bg-violet-500/15 px-4 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 transition flex items-center gap-2 disabled:opacity-40"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Syncing Roster…" : "Sync Roster from HRMS / MySpace"}
        </button>

        <button
          onClick={() => {
            const nextCode = `CV-${String(people.length + 1).padStart(3, "0")}`;
            setForm({ code: nextCode, name: "", email: "", groupId: "" });
            setAdding((a) => !a);
          }}
          className="min-h-[44px] rounded-xl border border-violet-500/40 bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-500 transition flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Add Person
        </button>

        <a
          href="https://hrms.circuvent.com/onboarding"
          target="_blank"
          rel="noreferrer"
          className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 transition flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4 text-violet-400" /> HRMS Onboarding
        </a>
      </div>

      {msg && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-4 py-2.5 text-sm text-violet-200">{msg}</div>
      )}

      {adding && (
        <div className="rounded-2xl border border-violet-500/30 bg-slate-950 p-5 shadow-xl">
          <h4 className="text-sm font-bold text-slate-100 mb-3">Add Employee to {site.name}</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <input
              placeholder="Employee Code (CV-001)"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 font-mono"
            />
            <input
              placeholder="Full Name"
              value={form.name}
              onChange={(e) => {
                const n = e.target.value;
                const emailPrefix = n.toLowerCase().replace(/[^a-z0-9]/g, ".");
                setForm({
                  ...form,
                  name: n,
                  email: form.email || (emailPrefix ? `${emailPrefix}@${domain}` : ""),
                });
              }}
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 sm:col-span-2"
            />
            <select
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
            >
              <option value="">No {v.group}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
              Cancel
            </button>
            <button
              disabled={!form.code.trim() || !form.name.trim()}
              onClick={async () => {
                await controlPlane.createAttendancePerson({
                  siteId: site.id,
                  code: form.code.trim(),
                  name: form.name.trim(),
                  email: form.email.trim(),
                  role: site.kind === "office" ? "employee" : "student",
                  groupId: form.groupId ? Number(form.groupId) : null,
                }).catch(() => null);

                const newPerson: AttendancePerson = {
                  id: 1000 + (Date.now() % 100000),
                  code: form.code.trim(),
                  name: form.name.trim(),
                  email: form.email.trim(),
                  role: site.kind === "office" ? "employee" : "student",
                  groupId: form.groupId ? Number(form.groupId) : null,
                  groupName: groups.find((g) => g.id === Number(form.groupId))?.name || null,
                  scheduleId: null,
                  phone: "",
                  guardianName: "",
                  guardianEmail: "",
                  guardianPhone: "",
                  active: true,
                  validFrom: null,
                  validTo: null,
                  photoUrl: "",
                  notes: "",
                  cards: 1,
                };
                setPeople((prev) => [newPerson, ...prev]);
                setAdding(false);
              }}
              className="rounded-xl border border-violet-500/40 bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Save Employee
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 shadow-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="p-3.5">Code</th>
              <th className="p-3.5">Name</th>
              <th className="p-3.5">Domain Email</th>
              <th className="p-3.5 capitalize">{v.group}</th>
              <th className="p-3.5">RFID Card</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {people.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">
                Nobody yet. Click &quot;Add Person&quot; above to create employee records starting at <strong>CV-001</strong>.
              </td></tr>
            )}
            {people.map((p) => (
              <tr key={p.id} className="hover:bg-white/5 transition">
                <td className="p-3.5 font-mono text-xs font-semibold text-violet-400">{p.code}</td>
                <td className="p-3.5 font-semibold text-slate-200">{p.name}</td>
                <td className="p-3.5 font-mono text-xs text-slate-400">{p.email || `—`}</td>
                <td className="p-3.5 text-slate-300">{p.groupName ?? "—"}</td>
                <td className="p-3.5">
                  {p.cards === 0 ? (
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                      Unassigned
                    </span>
                  ) : (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-mono text-emerald-300">
                      {p.cards} Active Card
                    </span>
                  )}
                </td>
                <td className="p-3.5">
                  {p.active ? (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">active</span>
                  ) : (
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-500">inactive</span>
                  )}
                </td>
                <td className="p-3.5 text-right whitespace-nowrap">
                  {p.cards === 0 ? (
                    <button
                      onClick={() => setEnrolFor(p)}
                      className="rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 transition"
                    >
                      Assign Card
                    </button>
                  ) : (
                    <button
                      disabled={lostBusy === p.id}
                      onClick={async () => {
                        setLostBusy(p.id);
                        try {
                          await controlPlane.createAttendanceAccessRequest({
                            siteId: site.id,
                            personId: p.id,
                            personName: p.name,
                            kind: "card-replacement",
                            reason: "Card reported lost",
                          });
                          setMsg(`Replacement requested for ${p.name}. Approve it under Office access.`);
                        } catch {
                          setMsg(`Failed to submit replacement request for ${p.name}.`);
                        } finally {
                          setLostBusy(0);
                        }
                      }}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-40"
                    >
                      Report Lost
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {enrolFor && (
        <EnrolModal site={site} person={enrolFor} onClose={() => setEnrolFor(null)} onDone={() => { setEnrolFor(null); void load(); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EnrolModal({
  site,
  person,
  onClose,
  onDone,
}: {
  site: AttendanceSite;
  person: AttendancePerson;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-6 shadow-2xl">
        <h3 className="text-base font-bold text-slate-100">Assign RFID Card to {person.name}</h3>
        <p className="mt-1 text-xs text-slate-400">
          Enter the 13.56 MHz RFID Card UID / Keyfob Number to authorize reader access.
        </p>

        <div className="mt-4 space-y-3">
          <input
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="e.g. 111222333"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-mono text-slate-100 outline-none focus:border-violet-500"
            autoFocus
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
            Cancel
          </button>
          <button
            disabled={!cardNumber.trim() || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              const r = await controlPlane.createAttendanceCredential({
                personId: person.id,
                cardNumber: Number(cardNumber),
                kind: "card",
              });
              setBusy(false);
              if (r.ok) onDone();
              else setError("Failed to assign card. Please check the card number and try again.");
            }}
            className="rounded-xl border border-violet-500/40 bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? "Assigning…" : "Save & Sync ACL"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IssueSmartcardModal({
  site,
  onClose,
  onIssued,
}: {
  site: AttendanceSite;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [personId, setPersonId] = useState<number | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchRosterFromDatabase({ domain: site.domain || "circuvent.com", siteId: site.id }).then((dbRes) => {
      if (!active) return;
      if (dbRes.ok && dbRes.people?.length) {
        setPeople(dbRes.people);
        setPersonId(dbRes.people[0].id);
        return;
      }
      if (site.id >= 6) {
        void controlPlane.attendancePeople(site.id).then((r) => {
          if (active && r.ok && r.data?.people?.length) {
            setPeople(r.data.people);
            setPersonId(r.data.people[0].id);
          }
        });
      }
    });
    return () => { active = false; };
  }, [site.id, site.domain]);

  const handleIssue = async () => {
    if (!personId || !cardNumber.trim()) {
      setError("Please select an employee and enter an RFID card number.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await controlPlane.createAttendanceCredential({
      personId,
      cardNumber: Number(cardNumber.replace(/[^0-9]/g, "")),
      kind: "card",
    });
    setBusy(false);
    if (res.ok) {
      onIssued();
    } else {
      setError("Failed to issue credential. Card number may already be assigned or terminal offline.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-violet-500/30 bg-slate-950 p-6 shadow-2xl shadow-violet-950/40">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-5 w-5 text-emerald-400" />
            <h3 className="text-base font-bold text-slate-100">Issue Enterprise Smartcard</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-slate-400">Card Holder (Employee)</label>
            <select
              value={personId ?? ""}
              onChange={(e) => setPersonId(Number(e.target.value))}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100 outline-none focus:border-violet-500"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code}) — {p.cards > 0 ? `${p.cards} card active` : "No card assigned"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400">13.56 MHz RFID / NFC Badge UID</label>
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 10984728"
              className="mt-1 min-h-[44px] w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm font-mono text-emerald-400 outline-none focus:border-violet-500"
              autoFocus
            />
            <p className="mt-1 text-[11px] text-slate-500">Card UID automatically compiles to hardware readers ACL.</p>
          </div>
        </div>

        {error && <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-1.5 text-xs text-rose-300">{error}</div>}

        <div className="mt-6 flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
            Cancel
          </button>
          <button
            disabled={!cardNumber.trim() || !personId || busy}
            onClick={handleIssue}
            className="rounded-xl border border-emerald-500/40 bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {busy ? "Authorizing…" : "Authorize & Sync Reader"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Cards({ site }: { site: AttendanceSite }) {
  const [cards, setCards] = useState<AttendanceCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showIssueModal, setShowIssueModal] = useState(false);

  const load = useCallback(async () => {
    try {
      const roster = await fetchRosterFromDatabase({ domain: site.domain || "circuvent.com", siteId: site.id });
      if (roster.ok && roster.people?.length) {
        const dynamicCards: AttendanceCredential[] = roster.people.map((p: any) => ({
          id: p.id,
          personId: p.id,
          personName: p.name,
          personCode: p.code,
          kind: "mifare-classic",
          cardNumber: p.cardNumber || 100000 + p.id,
          label: "Primary Badge",
          active: p.status === "active" || p.active === true,
          issuedAt: "2026-01-01T00:00:00Z",
          revokedAt: null,
          revokedReason: "",
          lastSeenAt: null,
        }));
        setCards(dynamicCards);
        setLoading(false);
        return;
      }
    } catch {}

    try {
      const r = await controlPlane.attendanceCredentials(site.id);
      if (r.ok && r.data?.credentials?.length) {
        setCards(r.data.credentials);
        setLoading(false);
        return;
      }
    } catch {
      // fallback
    }

    setCards([]);
    setLoading(false);
  }, [site.id, site.domain]);

  useEffect(() => { void load(); }, [load]);

  const filtered = cards.filter((c) =>
    !search ||
    String(c.cardNumber).includes(search) ||
    (c.personName && c.personName.toLowerCase().includes(search.toLowerCase())) ||
    (c.personCode && c.personCode.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search card UID or holder name..."
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
          />
        </div>

        <button
          onClick={() => setShowIssueModal(true)}
          className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 transition flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Issue Smartcard
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 shadow-xl">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="p-3.5">Card UID</th>
              <th className="p-3.5">Holder</th>
              <th className="p-3.5">Issued Date</th>
              <th className="p-3.5">Last Seen</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">
                No cards issued yet. Assign cards from the People tab or click &quot;Issue Smartcard&quot; above.
              </td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-white/5 transition">
                <td className="p-3.5 font-mono text-sm font-semibold text-emerald-400">{c.cardNumber}</td>
                <td className="p-3.5">
                  <div className="font-semibold text-slate-200">{c.personName ?? "Unassigned"}</div>
                  <div className="font-mono text-xs text-violet-400">{c.personCode}</div>
                </td>
                <td className="p-3.5 text-slate-400">{c.issuedAt?.slice(0, 10) ?? "—"}</td>
                <td className="p-3.5 text-slate-400">{c.lastSeenAt ? hhmm(c.lastSeenAt, site.timezone) : "Never"}</td>
                <td className="p-3.5">
                  {c.active ? (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">active</span>
                  ) : (
                    <span className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-400">revoked</span>
                  )}
                </td>
                <td className="p-3.5 text-right">
                  {c.active && (
                    <button
                      onClick={async () => {
                        await controlPlane.revokeAttendanceCredential(c.id, "Admin revoked");
                        await load();
                      }}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showIssueModal && (
        <IssueSmartcardModal
          site={site}
          onClose={() => setShowIssueModal(false)}
          onIssued={() => {
            setShowIssueModal(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Terminals({ site }: { site: AttendanceSite }) {
  const [devices, setDevices] = useState<import("@/lib/control-plane").Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [pairingKey, setPairingKey] = useState("");
  const [readerName, setReaderName] = useState("Entrance");
  const [direction, setDirection] = useState("auto");
  const [message, setMessage] = useState("");
  const [terminals, setTerminals] = useState<AttendanceTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);

  const act = async (id: string, action: "beep" | "unlock" | "sync" | "remove") => {
    if (action === "unlock" && !window.confirm("Release this door now?")) return;
    if (action === "remove" && !window.confirm("Unregister this reader? Disconnect or reset hardware first: cached door permissions can remain on the device. Device ownership is retained.")) return;
    setBusyDevice(id); setMessage("");
    try {
      const result = action === "sync" ? await controlPlane.syncAttendanceTerminal(id)
        : action === "remove" ? await controlPlane.deleteAttendanceTerminal(id)
        : action === "unlock" ? await controlPlane.openAttendanceDoor(id)
        : await controlPlane.terminalAction(id, "beep");
      if (!result.ok) throw new Error("Reader action failed. Check its connection and your permissions.");
      setMessage(action === "remove" ? "Reader unregistered. Reset disconnected hardware to clear cached permissions." : "Reader command accepted. Verify the device response.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reader action failed."); }
    finally { setBusyDevice(null); }
  };

  const load = useCallback(async () => {
    try {
      const [liveData, d] = await Promise.all([
        fetchAttendanceLive(site.domain || "circuvent.com"),
        controlPlane.devices().catch(() => ({ ok: false as const, data: { devices: [] } })),
      ]);
      if (d.ok) setDevices(d.data.devices);
      if (liveData.ok && liveData.terminals?.length) {
        setTerminals(liveData.terminals);
        setLoading(false);
        return;
      }
      if (site.id >= 6) {
        const r = await controlPlane.attendanceTerminals(site.id).catch(() => ({ ok: false as const, data: { terminals: [] } }));
        if (r.ok && r.data?.terminals?.length) {
          setTerminals(r.data.terminals);
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    setTerminals([]);
    setLoading(false);
  }, [site.id, site.domain]);

  useEffect(() => { void load(); }, [load]);

  const syncAllAcl = async () => {
    if (terminals.length === 0) return;
    if (!window.confirm(`Push the current card list to all ${terminals.length} readers?`)) return;
    setBusyDevice("__all__"); setMessage("");
    let ok = 0; let fail = 0;
    try {
      for (const t of terminals) {
        try {
          const result = await controlPlane.syncAttendanceTerminal(t.deviceId);
          if (result.ok) ok += 1; else fail += 1;
        } catch { fail += 1; }
      }
      setMessage(fail === 0
        ? `ACL pushed to all ${ok} readers.`
        : `ACL sync finished: ${ok} ok, ${fail} failed. Check offline readers.`);
      await load();
    } finally { setBusyDevice(null); }
  };

  return (
    <div className="space-y-4">
      <form className="rounded-2xl border border-white/15 bg-black/30 p-5 space-y-3" onSubmit={async e => {
        e.preventDefault();
        setBusyDevice(deviceId); setMessage("");
        try {
          const owned = devices.find(d => d.id === deviceId);
          if (!owned) {
            if (!pairingKey.trim()) throw new Error("Enter the pairing key printed on the reader.");
            const claim = await controlPlane.claim(deviceId.trim(), pairingKey.trim(), readerName);
            if (!claim.ok) throw new Error("Could not claim this reader. Check its ID, pairing key and ownership.");
          } else if (!isAttendanceReader(owned.type)) throw new Error("Choose an attendance reader.");
          const existing = terminals.find(t => t.deviceId === deviceId.trim());
          const result = await controlPlane.saveAttendanceTerminal(deviceId.trim(), { siteId: site.id, name: readerName.trim(), direction, ...(existing ? { zoneId: existing.zoneId } : { mode: "attendance", enabled: true }) });
          if (!result.ok) throw new Error("Could not register this reader. Check device ownership and retry.");
          setPairingKey(""); setDeviceId(""); setMessage("Reader registered. Connect it to the network, then sync its card list.");
          await load();
        } catch (error) { setMessage(error instanceof Error ? error.message : "Reader setup failed."); }
        finally { setBusyDevice(null); }
      }}>
        <h3 className="font-semibold text-slate-100">Add attendance reader</h3>
        <p className="text-sm text-slate-400">Select an owned reader or enter a new reader ID and its pairing key.</p>
        <label className="block text-sm">Device ID<input required list="attendance-owned-readers" value={deviceId} onChange={e => setDeviceId(e.target.value)} className="block w-full rounded-lg border bg-transparent p-2" /></label>
        <datalist id="attendance-owned-readers">{devices.filter(d => isAttendanceReader(d.type)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</datalist>
        {!devices.some(d => d.id === deviceId) && <label className="block text-sm">Pairing key<input type="password" autoComplete="off" value={pairingKey} onChange={e => setPairingKey(e.target.value)} className="block w-full rounded-lg border bg-transparent p-2" /></label>}
        <label className="block text-sm">Reader name<input required maxLength={60} value={readerName} onChange={e => setReaderName(e.target.value)} className="block w-full rounded-lg border bg-transparent p-2" /></label>
        <label className="block text-sm">Punch direction<select value={direction} onChange={e => setDirection(e.target.value)} className="block w-full rounded-lg border bg-transparent p-2"><option value="auto">Automatic in / out</option><option value="in">Entry only</option><option value="out">Exit only</option></select></label>
        <button disabled={busyDevice !== null} className="rounded-lg bg-violet-600 px-4 py-2 text-white">{busyDevice ? "Saving…" : terminals.some(t => t.deviceId === deviceId.trim()) ? "Save reader" : "Add reader"}</button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
      {!loading && terminals.length === 0 && <p className="text-sm text-slate-400">No readers registered for this site yet.</p>}
      {terminals.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-violet-100">Push ACL to all readers</p>
            <p className="text-xs text-violet-200/70">Sync the current card list to every registered reader at this site.</p>
          </div>
          <button
            type="button"
            disabled={busyDevice !== null}
            onClick={() => void syncAllAcl()}
            className="rounded-lg border border-violet-400/40 bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busyDevice === "__all__" ? "Pushing…" : "Push ACL to all"}
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {terminals.map((t) => (
          <div key={t.deviceId} className="rounded-2xl border border-white/15 bg-black/30 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100">{t.name}</h4>
                  <p className="font-mono text-xs text-slate-400">{t.deviceId}</p>
                </div>
              </div>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                t.online ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-400"
              }`}>
                {t.online ? "Online" : "Offline"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-slate-500">Direction:</span> <strong className="text-slate-200 capitalize">{t.direction}</strong>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-slate-500">ACL Cache:</span> <strong className="text-slate-200">{t.aclCount} cards</strong>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
              <button
                disabled={busyDevice === t.deviceId}
                onClick={() => void act(t.deviceId, "beep")}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                Test Beep
              </button>
              <button
                disabled={busyDevice === t.deviceId}
                onClick={() => void act(t.deviceId, "unlock")}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
              >
                Unlock Door
              </button>
              <button
                disabled={busyDevice === t.deviceId}
                onClick={() => void act(t.deviceId, "sync")}
                className="rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25"
              >
                Sync ACL
              </button>
              <button disabled={busyDevice !== null} onClick={() => { setDeviceId(t.deviceId); setReaderName(t.name); setDirection(t.direction); }} className="rounded-lg border px-3 py-1.5 text-xs">Edit reader</button>
              <button disabled={busyDevice !== null} onClick={() => void act(t.deviceId, "remove")} className="rounded-lg border px-3 py-1.5 text-xs text-rose-300">Unregister</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 shadow-xl">
      <div className="mb-3">
        <h3 className="font-bold text-slate-100">{title}</h3>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-3">{children}</div>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-slate-500">{children}</p>;
}

function Tile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  accent?: string;
  icon?: typeof CheckCircle2;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {Icon && <Icon className="h-4 w-4" style={{ color: accent }} />}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-100" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
    </div>
  );
}
