"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Loader2, Gift, User, MapPin, Plus, Trash2, Save, Star, Share2, Copy, Check, Ticket, Bell, CheckCheck, KeyRound, Building2 } from "lucide-react";
import { formatINR } from "@/lib/shop-data";
import { PasskeyManager } from "@/components/PasskeyManager";

type Headers = () => Record<string, string>;

const card = { background: "var(--bg-surface)", borderColor: "var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };
const accentBg = { background: "var(--accent-cyan)" };
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60";
const headingStyle = { color: "var(--text-primary)" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export default function AccountExtras({
  authHeaders,
  onWalletChange,
  onProfileChange,
}: {
  authHeaders: Headers;
  onWalletChange?: () => void;
  onProfileChange?: () => void;
}) {
  return (
    <ProfileProvider authHeaders={authHeaders} onProfileChange={onProfileChange}>
      <section className="mt-10 scroll-mt-24">
        <h2 className="mb-4 text-xl font-semibold" style={headingStyle}>
          Manage your account
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <PersonalInfoCard />
          <BusinessCard />
          <NotificationPrefsCard />
          <SecurityCard authHeaders={authHeaders} />
          <div className="lg:col-span-2">
            <AddressBook authHeaders={authHeaders} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold" style={headingStyle}>
          Rewards &amp; offers
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          <LoyaltyCard authHeaders={authHeaders} onWalletChange={onWalletChange} />
          <ReferralCard authHeaders={authHeaders} />
          <GiftCardCard authHeaders={authHeaders} onWalletChange={onWalletChange} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold" style={headingStyle}>
          Notifications
        </h2>
        <NotificationsCard authHeaders={authHeaders} />
      </section>
    </ProfileProvider>
  );
}

// -------------------------------------------------------- profile store ----
interface ProfileData {
  name: string;
  phone?: string;
  gender?: string;
  dob?: string;
  gstin?: string;
  businessName?: string;
  notifyPrefs?: { orderUpdates?: boolean; promotions?: boolean; whatsapp?: boolean };
}

const ProfileContext = createContext<{
  profile: ProfileData | null;
  save: (patch: Partial<ProfileData>) => Promise<boolean>;
} | null>(null);

function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}

function ProfileProvider({
  authHeaders,
  onProfileChange,
  children,
}: {
  authHeaders: Headers;
  onProfileChange?: () => void;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/profile", { headers: authHeaders() });
      if (r.ok) setProfile((await r.json()).account || null);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (patch: Partial<ProfileData>) => {
      try {
        const r = await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(patch),
        });
        const d = await r.json();
        if (d.success) {
          setProfile(d.account || null);
          onProfileChange?.();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [authHeaders, onProfileChange]
  );

  return <ProfileContext.Provider value={{ profile, save }}>{children}</ProfileContext.Provider>;
}

// --------------------------------------------------------- personal info ----
function PersonalInfoCard() {
  const { profile, save } = useProfile();
  const [form, setForm] = useState({ name: "", phone: "", gender: "", dob: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (profile) setForm({ name: profile.name || "", phone: profile.phone || "", gender: profile.gender || "", dob: profile.dob || "" });
  }, [profile]);

  const onSave = async () => {
    setBusy(true);
    setMsg("");
    const ok = await save({ name: form.name, phone: form.phone, gender: form.gender, dob: form.dob });
    setMsg(ok ? "Saved." : "Could not save.");
    setBusy(false);
  };

  return (
    <div id="account-personal" className="scroll-mt-28 rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <User className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Personal information
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Your name and contact details.
      </p>
      {!profile ? (
        <div className="mt-4">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input className={field} style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className={field} style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Gender">
              <input className={field} style={inputStyle} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
            </Field>
            <Field label="Date of birth">
              <input className={field} style={inputStyle} placeholder="YYYY-MM-DD" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={onSave} disabled={busy} className={primaryBtn} style={accentBg}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </button>
            {msg && (
              <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------- business/gst ----
function BusinessCard() {
  const { profile, save } = useProfile();
  const [form, setForm] = useState({ businessName: "", gstin: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (profile) setForm({ businessName: profile.businessName || "", gstin: profile.gstin || "" });
  }, [profile]);

  const onSave = async () => {
    setBusy(true);
    setMsg("");
    const ok = await save({ businessName: form.businessName, gstin: form.gstin });
    setMsg(ok ? "Saved." : "Could not save.");
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <Building2 className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Business &amp; GST
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Add these to get GST invoices on your orders.
      </p>
      {!profile ? (
        <div className="mt-4">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            <Field label="Business name">
              <input className={field} style={inputStyle} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <input className={field} style={inputStyle} placeholder="15-digit GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={onSave} disabled={busy} className={primaryBtn} style={accentBg}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
            </button>
            {msg && (
              <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------- notification preferences ----
type Prefs = { orderUpdates: boolean; promotions: boolean; whatsapp: boolean };
function NotificationPrefsCard() {
  const { profile, save } = useProfile();
  const [prefs, setPrefs] = useState<Prefs>({ orderUpdates: false, promotions: false, whatsapp: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (profile) {
      const np = profile.notifyPrefs || {};
      setPrefs({ orderUpdates: !!np.orderUpdates, promotions: !!np.promotions, whatsapp: !!np.whatsapp });
    }
  }, [profile]);

  const onSave = async () => {
    setBusy(true);
    setMsg("");
    const ok = await save({ notifyPrefs: prefs });
    setMsg(ok ? "Saved." : "Could not save.");
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <Bell className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Notification preferences
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Choose how we keep you posted.
      </p>
      {!profile ? (
        <div className="mt-4">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2.5">
            {([["orderUpdates", "Order updates"], ["promotions", "Promotions & offers"], ["whatsapp", "WhatsApp alerts"]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" className="accent-cyan-500" checked={prefs[k]} onChange={(e) => setPrefs((prev) => ({ ...prev, [k]: e.target.checked }))} /> {label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={onSave} disabled={busy} className={primaryBtn} style={accentBg}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save preferences
            </button>
            {msg && (
              <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
                {msg}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ security ----
function SecurityCard({ authHeaders }: { authHeaders: Headers }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const save = async () => {
    setMsg("");
    setErr("");
    if (next.length < 6) {
      setErr("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setErr("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg("Password updated.");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        setErr(d.message || "Could not change your password.");
      }
    } catch {
      setErr("Network error. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <KeyRound className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Password &amp; security
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Update the password you use to sign in.
      </p>
      <div className="mt-4 space-y-2">
        <input type="password" autoComplete="current-password" className={field} style={inputStyle} placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" autoComplete="new-password" className={field} style={inputStyle} placeholder="New password (min 6 characters)" value={next} onChange={(e) => setNext(e.target.value)} />
        <input type="password" autoComplete="new-password" className={field} style={inputStyle} placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy || !current || !next} className={primaryBtn} style={accentBg}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Update password
        </button>
        {msg && (
          <span className="text-xs" style={{ color: "var(--accent-cyan)" }}>
            {msg}
          </span>
        )}
        {err && <span className="text-xs text-rose-500">{err}</span>}
      </div>

      {/*
        Beneath the password, not instead of it. A passkey is the better way in
        and the password is still the fallback for a device that is not to hand,
        so removing one because the other exists would strand people.
      */}
      <div className="mt-5">
        <PasskeyManager endpoint="/api/account/passkey" authHeaders={authHeaders} tone="themed" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------- loyalty ----
function LoyaltyCard({ authHeaders, onWalletChange }: { authHeaders: Headers; onWalletChange?: () => void }) {
  const [points, setPoints] = useState(0);
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/loyalty", { headers: authHeaders() });
      if (r.ok) setPoints((await r.json()).points || 0);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const doRedeem = async () => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/loyalty", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ points: Number(redeem) || 0 }),
      });
      const d = await r.json();
      if (d.success) {
        setMsg(`Redeemed! Wallet is now ${formatINR(d.wallet)}.`);
        setRedeem("");
        load();
        onWalletChange?.();
      } else setMsg(d.message || "Could not redeem.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <Gift className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Circuvent Rewards
      </h3>
      <p className="mt-2 flex items-baseline gap-1 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
        {points.toLocaleString("en-IN")} <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>points</span>
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Earn 2% back as points on every paid order · 1 point = ₹1.
      </p>
      <div className="mt-4 flex gap-2">
        <input type="number" value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="Min 100 points" className={field} style={inputStyle} />
        <button onClick={doRedeem} disabled={busy || Number(redeem) < 100} className={`${primaryBtn} shrink-0`} style={accentBg}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: "var(--accent-cyan)" }}>
          {msg}
        </p>
      )}
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Redeems to your Circuvent Wallet as store credit.
      </p>
    </div>
  );
}

// ------------------------------------------------------------ referral ----
function ReferralCard({ authHeaders }: { authHeaders: Headers }) {
  const [data, setData] = useState<{ code: string; link: string; referredCount: number; reward: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/referral", { headers: authHeaders() });
        if (r.ok) {
          const d = await r.json();
          setData({ code: d.code, link: d.link, referredCount: d.referredCount, reward: d.reward });
        }
      } catch {
        /* ignore */
      }
    })();
  }, [authHeaders]);

  const copy = () => {
    if (!data) return;
    navigator.clipboard?.writeText(data.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <Share2 className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Refer &amp; earn
      </h3>
      <p className="mt-2 text-2xl font-bold tracking-widest" style={{ color: "var(--text-primary)" }}>
        {data?.code || "—"}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Give {data ? formatINR(data.reward) : "₹200"}, get {data ? formatINR(data.reward) : "₹200"} — credited when your friend&rsquo;s first order is paid.
      </p>
      <div className="mt-4 flex gap-2">
        <input readOnly value={data?.link || ""} className={field} style={inputStyle} />
        <button onClick={copy} className={`${primaryBtn} shrink-0`} style={accentBg}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {data ? `${data.referredCount} friend${data.referredCount === 1 ? "" : "s"} joined with your link.` : "Loading…"}
      </p>
    </div>
  );
}

// ----------------------------------------------------------- gift card ----
function GiftCardCard({ authHeaders, onWalletChange }: { authHeaders: Headers; onWalletChange?: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/giftcards/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await r.json();
      setOk(!!d.success);
      setMsg(d.message || d.error || (d.success ? "Redeemed!" : "Could not redeem."));
      if (d.success) {
        setCode("");
        onWalletChange?.();
      }
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
        <Ticket className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Redeem a gift card
      </h3>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Have a Circuvent gift card? Add its value to your wallet instantly.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="GIFT-XXXXXXXX"
          className={field}
          style={inputStyle}
        />
        <button onClick={redeem} disabled={busy} className={`${primaryBtn} shrink-0`} style={accentBg}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
        </button>
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: ok ? "#10b981" : "#ef4444" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------- notifications ----
interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  at: string;
}
function NotificationsCard({ authHeaders }: { authHeaders: Headers }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/notifications", { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        setItems(d.notifications || []);
        setUnread(d.unread || 0);
      }
    } catch {
      /* ignore */
    }
  }, [authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    await fetch("/api/account/notifications", { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({}) });
    load();
  };
  const clearAll = async () => {
    await fetch("/api/account/notifications", { method: "DELETE", headers: authHeaders() });
    load();
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
          <Bell className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Recent notifications
          {unread > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "#ef4444" }}>
              {unread}
            </span>
          )}
        </h3>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <button onClick={markAll} className="flex items-center gap-1" style={{ color: "var(--accent-cyan)" }}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
            <button onClick={clearAll} style={{ color: "var(--text-muted)" }}>
              Clear
            </button>
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          You&rsquo;re all caught up.
        </p>
      ) : (
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {items.map((n) => (
            <a
              key={n.id}
              href={n.href || "#"}
              className="block rounded-xl border p-3"
              style={{ borderColor: "var(--border-primary)", background: n.read ? "transparent" : "var(--accent-cyan-muted)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {n.title}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {new Date(n.at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                {n.body}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------- addresses ----
interface Addr {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefaultShipping?: boolean;
}
function AddressBook({ authHeaders }: { authHeaders: Headers }) {
  const [list, setList] = useState<Addr[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/account/addresses", { headers: authHeaders() });
      if (r.ok) setList((await r.json()).addresses || []);
    } catch {
      /* ignore */
    }
  }, [authHeaders]);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!f.line1 || !f.pincode) return;
    setBusy(true);
    await fetch("/api/account/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(f),
    });
    setF({ label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" });
    setOpen(false);
    setBusy(false);
    load();
  };
  const del = async (id: string) => {
    await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    load();
  };
  const makeDefault = async (id: string) => {
    await fetch("/api/account/addresses", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ id, isDefaultShipping: true }),
    });
    load();
  };

  return (
    <div className="rounded-2xl border p-6" style={card}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold" style={headingStyle}>
          <MapPin className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> Address book
        </h3>
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {open && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <input className={field} style={inputStyle} placeholder="Label (Home/Work)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="PIN code" value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} />
          <input className={field + " col-span-2"} style={inputStyle} placeholder="Address line 1" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} />
          <input className={field + " col-span-2"} style={inputStyle} placeholder="Address line 2 (optional)" value={f.line2} onChange={(e) => setF({ ...f, line2: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          <input className={field} style={inputStyle} placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
          <button onClick={add} disabled={busy} className={`${primaryBtn} col-span-2`} style={accentBg}>
            {busy ? "Saving…" : "Save address"}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
          No saved addresses yet.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {list.map((a) => (
            <div key={a.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border-primary)" }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {a.label} {a.isDefaultShipping && <span className="ml-1 text-[10px]" style={{ color: "var(--accent-cyan)" }}>• default</span>}
                </span>
                <button onClick={() => del(a.id)} style={{ color: "#ef4444" }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>
                {a.name} · {a.phone}
              </p>
              <p style={{ color: "var(--text-muted)" }}>{[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</p>
              {!a.isDefaultShipping && (
                <button onClick={() => makeDefault(a.id)} className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--accent-cyan)" }}>
                  <Star className="h-3 w-3" /> Set as default
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
