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
  SlidersHorizontal, X, FileText, Printer
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
import { isAttendanceReader } from "@/lib/attendance-readers";

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
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companySearch, setCompanySearch] = useState("");
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);

  const load = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      controlPlane.attendanceSites(),
      controlPlane.attendanceCompanies(),
    ]);

    let list: AttendanceSite[] = [];
    if (sRes.ok) {
      list = sRes.data.sites ?? [];
      setSites(list);
    }

    if (cRes.ok && cRes.data.companies?.length) {
      setCompanies(cRes.data.companies);
    } else {
      // Fallback domain derivation from sites
      const map = new Map<string, AttendanceCompany>();
      for (const s of list) {
        const dom = s.domain || "circuvent.com";
        const cname = s.companyName || "Circuvent Technologies";
        if (!map.has(dom)) {
          map.set(dom, {
            company_name: cname,
            domain: dom,
            org_id: s.orgId || "",
            site_count: 0,
            people_count: 0,
            terminal_count: 0,
            sites: [],
          });
        }
        const c = map.get(dom)!;
        c.site_count++;
        c.people_count += s.people || 0;
        c.terminal_count += s.terminals || 0;
        c.sites.push({
          id: s.id,
          name: s.name,
          kind: s.kind,
          timezone: s.timezone,
          companyName: cname,
          domain: dom,
          people: s.people || 0,
          terminals: s.terminals || 0,
        });
      }
      setCompanies(Array.from(map.values()));
    }

    setSiteId((cur) => {
      if (cur && list.some((s) => s.id === cur)) return cur;
      return list[0]?.id ?? null;
    });
    setLoading(false);
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
    if (site?.domain && site.domain !== selectedDomain) {
      setSelectedDomain(site.domain);
    }
  }, [site?.domain]);

  const currentCompany = useMemo(() => {
    return companies.find((c) => c.domain === selectedDomain) || {
      company_name: site?.companyName || "Circuvent Technologies",
      domain: selectedDomain || "circuvent.com",
      org_id: site?.orgId || "",
      site_count: sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain).length,
      people_count: sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain).reduce((acc, s) => acc + (s.people || 0), 0),
      terminal_count: sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain).reduce((acc, s) => acc + (s.terminals || 0), 0),
      sites: [],
    };
  }, [companies, selectedDomain, site, sites]);

  // Sites belonging to selected company domain
  const domainSites = useMemo(() => {
    const matched = sites.filter((s) => (s.domain || "circuvent.com") === selectedDomain);
    return matched.length ? matched : sites;
  }, [sites, selectedDomain]);

  if (loading) return <Skeleton />;
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
                            <span>{comp.site_count} Site{comp.site_count === 1 ? "" : "s"}</span>
                            <span>·</span>
                            <span>{comp.people_count} Employees</span>
                            <span>·</span>
                            <span>{comp.terminal_count} RFID Reader{comp.terminal_count === 1 ? "" : "s"}</span>
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

      {/* ─── Active Sub-View Panel ─── */}
      {view === "live" && <LiveBoard site={site} />}
      {view === "register" && <Register site={site} />}
      {view === "people" && <People site={site} />}
      {view === "cards" && <Cards site={site} />}
      {view === "terminals" && <Terminals site={site} />}
      {view === "access" && <OfficeAccess site={site} />}
      {view === "schedules" && <Schedules site={site} />}
      {view === "reports" && <Reports site={site} />}
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

function FirstRun({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("circuvent.com");
  const [companyName, setCompanyName] = useState("Circuvent Technologies");
  const [kind, setKind] = useState<"school" | "office" | "facility">("office");
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/20 p-6 shadow-2xl">
      <ClipboardCheck className="h-8 w-8 text-violet-400" />
      <h2 className="mt-3 text-lg font-bold text-slate-100">Set up enterprise attendance</h2>
      <p className="mt-2 text-sm text-slate-400">
        A site represents an office building or campus connected to RFID door readers and employee cards.
      </p>
      <div className="mt-5 space-y-3">
        <div>
          <label className="text-xs text-slate-400">Company Name</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Circuvent Technologies"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Company Domain</label>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="circuvent.com"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Site Location / Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Circuvent HQ"
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
      </div>
      <button
        disabled={!name.trim() || busy}
        onClick={async () => {
          setBusy(true);
          const r = await controlPlane.createAttendanceSite({
            name: name.trim(),
            companyName: companyName.trim() || "Circuvent Technologies",
            domain: domain.trim() || "circuvent.com",
            kind,
            timezone: tz,
          });
          setBusy(false);
          if (r.ok) onCreated();
        }}
        className="mt-5 min-h-[44px] w-full rounded-xl border border-violet-500/40 bg-violet-600 font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
      >
        {busy ? "Creating…" : "Initialize Site"}
      </button>
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

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceLive(site.id);
    if (r.ok) setLive(r.data);
  }, [site.id]);

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
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-100">ESP32 RFID Reader (rfid-attend-7bcc)</span>
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.2 text-[11px] font-semibold text-emerald-300">
                  MQTT Connected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Broker: <code>mqtt.circuvent.com:8883</code> · Site: <strong>{site.name}</strong> · Direction: Auto In/Out
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={async () => {
                setActionMsg("Testing buzzer on rfid-attend-7bcc…");
                await controlPlane.terminalAction("rfid-attend-7bcc", "beep");
                setTimeout(() => setActionMsg(""), 3000);
              }}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              Test Beep
            </button>
            <button
              onClick={async () => {
                setActionMsg("Door unlocked for 3 seconds");
                await controlPlane.terminalAction("rfid-attend-7bcc", "unlock");
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
    void controlPlane.attendancePeople(site.id).then((r) => {
      if (r.ok && r.data.people?.length) {
        setPeople(r.data.people);
        setPersonId(r.data.people[0].id);
      }
    });
  }, [site.id]);

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
              await controlPlane.manualPunch({
                siteId: site.id,
                personId,
                direction,
                note,
              });
              setBusy(false);
              onSuccess();
            }}
            className="rounded-xl border border-violet-500/40 bg-violet-600 px-5 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {busy ? "Recording…" : "Record Punch"}
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
    const [r, g] = await Promise.all([
      controlPlane.attendanceRegister(site.id, day, groupId),
      controlPlane.attendanceGroups(site.id),
    ]);
    if (r.ok) { setRows(r.data.people ?? []); setTotals(r.data.totals ?? {}); setTz(r.data.timezone); }
    if (g.ok) setGroups(g.data.groups ?? []);
  }, [site.id, day, groupId]);

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
    const [p, g] = await Promise.all([
      controlPlane.attendancePeople(site.id, { q }),
      controlPlane.attendanceGroups(site.id),
    ]);
    if (p.ok) setPeople(p.data.people ?? []);
    if (g.ok) setGroups(g.data.groups ?? []);
  }, [site.id, q]);

  useEffect(() => { void load(); }, [load]);

  const domain = site.domain || "circuvent.com";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${v.people.toLowerCase()} by name, code (CV-001), email...`}
            className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
          />
        </div>
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
          <Sparkles className="h-4 w-4 text-violet-400" /> Sync from HRMS
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
                });
                setAdding(false);
                await load();
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
                        await controlPlane.createAttendanceAccessRequest({
                          siteId: site.id, personId: p.id, kind: "card-replacement",
                          reason: "Card reported lost",
                        });
                        setLostBusy(0);
                        setMsg(`Replacement requested for ${p.name}. Approve it under Office access.`);
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

function Cards({ site }: { site: AttendanceSite }) {
  const [cards, setCards] = useState<AttendanceCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceCredentials(site.id);
    if (r.ok) setCards(r.data.credentials ?? []);
    setLoading(false);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = cards.filter((c) =>
    !search ||
    String(c.cardNumber).includes(search) ||
    (c.personName && c.personName.toLowerCase().includes(search.toLowerCase())) ||
    (c.personCode && c.personCode.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search card UID or holder name..."
          className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-violet-500"
        />
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
                No cards issued yet. Assign cards from the People tab.
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
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Terminals({ site }: { site: AttendanceSite }) {
  const [terminals, setTerminals] = useState<AttendanceTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyDevice, setBusyDevice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceTerminals(site.id);
    if (r.ok) setTerminals(r.data.terminals ?? []);
    setLoading(false);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
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
                onClick={async () => {
                  setBusyDevice(t.deviceId);
                  await controlPlane.terminalAction(t.deviceId, "beep");
                  setBusyDevice(null);
                }}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
              >
                Test Beep
              </button>
              <button
                disabled={busyDevice === t.deviceId}
                onClick={async () => {
                  setBusyDevice(t.deviceId);
                  await controlPlane.terminalAction(t.deviceId, "unlock");
                  setBusyDevice(null);
                }}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
              >
                Unlock Door
              </button>
              <button
                disabled={busyDevice === t.deviceId}
                onClick={async () => {
                  setBusyDevice(t.deviceId);
                  await controlPlane.syncAttendanceTerminal(t.deviceId);
                  setBusyDevice(null);
                  await load();
                }}
                className="rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/25"
              >
                Sync ACL
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OfficeAccess({ site }: { site: AttendanceSite }) {
  const [requests, setRequests] = useState<AttendanceAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceAccessRequests(site.id);
    if (r.ok) setRequests(r.data.requests ?? []);
    setLoading(false);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Panel title="Office Access Requests" hint="Pending card replacements and visitor passes">
        <div className="divide-y divide-white/5">
          {requests.length === 0 && <Muted>No pending access requests.</Muted>}
          {requests.map((req) => (
            <Row key={req.id}>
              <div>
                <div className="font-semibold text-slate-200">{req.personName}</div>
                <div className="text-xs text-slate-400">{req.kind} — {req.reason}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await controlPlane.decideAttendanceAccessRequest(req.id, { decision: "approved" });
                    await load();
                  }}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200"
                >
                  Approve
                </button>
              </div>
            </Row>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Schedules({ site }: { site: AttendanceSite }) {
  const [schedules, setSchedules] = useState<AttendanceSchedule[]>([]);

  useEffect(() => {
    void controlPlane.attendanceSchedules(site.id).then((r) => {
      if (r.ok) setSchedules(r.data.schedules ?? []);
    });
  }, [site.id]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/15 bg-black/30 p-5 shadow-xl">
          <h4 className="font-bold text-slate-100">Standard Work Shift</h4>
          <p className="text-xs text-slate-400 mt-1">General enterprise timing</p>
          <div className="mt-4 space-y-2 font-mono text-xs text-slate-300">
            <div className="flex justify-between"><span>Work Hours:</span><strong>09:30 – 18:30</strong></div>
            <div className="flex justify-between"><span>Grace Period:</span><strong>{site.graceMinutes} mins</strong></div>
            <div className="flex justify-between"><span>Half-Day Cutoff:</span><strong>{site.halfDayAfterMinutes} mins</strong></div>
            <div className="flex justify-between"><span>Absent Cutoff:</span><strong>{site.absentAfterMinutes} mins</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Reports({ site }: { site: AttendanceSite }) {
  const [range, setRange] = useState({ from: daysAgo(30), to: today() });
  const [downloading, setDownloading] = useState(false);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/15 bg-black/30 p-6 shadow-xl">
        <h4 className="text-base font-bold text-slate-100">Export Monthly Attendance for Payroll</h4>
        <p className="text-xs text-slate-400 mt-1">
          Generate comprehensive timesheet summaries for <strong>https://paystub.circuvent.com</strong>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div>
            <label className="text-xs text-slate-400">From</label>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="mt-1 block min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">To</label>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="mt-1 block min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
            />
          </div>
          <div className="self-end">
            <button
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                await controlPlane.downloadAttendanceExport(site.id, "summary", range.from, range.to);
                setDownloading(false);
              }}
              className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition flex items-center gap-2"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export Timesheet (CSV)
            </button>
          </div>
        </div>
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
