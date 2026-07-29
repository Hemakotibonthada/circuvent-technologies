"use client";

// Console profile — the "who am I and what do I have access to" page.
//
// Deliberately calm: plain surfaces, one accent, generous whitespace. Every
// number on it comes from the control plane; nothing is estimated. Where a
// figure genuinely is not available the card says so rather than guessing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  Camera,
  Check,
  ChevronRight,
  Cpu,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Radio,
  Shield,
  ShieldAlert,
  Sliders,
  Sofa,
  Sparkles,
  Trash2,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { controlPlane, type AppEvent, type Device, type Room } from "@/lib/control-plane";
import { useProfilePrefs, type ProfilePrefs } from "@/lib/smarthome-prefs";
import { AVATAR_COLORS, autoColor, firstName, initials } from "../ProfileAvatar";
import { useConsole } from "../ConsoleProvider";
import { useConsoleTheme } from "../theme";

const MAX_PHOTO_BYTES = 400 * 1024;

export default function ProfilePage() {
  const { user, ready, logout, liveStatus, notifyPermission, enableNotifications } = useConsole();
  const { profile, setProfile, loading: prefsLoading, error: prefsError } = useProfilePrefs();
  const theme = useConsoleTheme();

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [scenes, setScenes] = useState<number | null>(null);
  const [automations, setAutomations] = useState<number | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [recent, setRecent] = useState<AppEvent[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    (async () => {
      const [d, r, s, a, u, ev, adm] = await Promise.all([
        controlPlane.devices(),
        controlPlane.rooms(),
        controlPlane.scenes(),
        controlPlane.automations(),
        controlPlane.unreadCount(),
        controlPlane.events(6),
        controlPlane.adminMe(),
      ]);
      if (!alive) return;
      if (d.ok) setDevices(d.data.devices ?? []);
      if (r.ok) setRooms(r.data.rooms ?? []);
      if (s.ok) setScenes((s.data.scenes ?? []).length);
      if (a.ok) setAutomations((a.data.automations ?? []).length);
      if (u.ok) setUnread(u.data.count ?? 0);
      if (ev.ok) setRecent(ev.data.events ?? []);
      if (adm.ok) setIsAdmin(!!adm.data.admin);
    })();
    return () => {
      alive = false;
    };
  }, [ready, user]);

  const name = profile.displayName || user?.name || "";
  const email = user?.email || "";
  const color = profile.avatarColor || autoColor(email);
  const online = devices?.filter((d) => d.online).length ?? null;

  if (!ready) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!user) {
    return <p className="py-24 text-center text-sm text-slate-400">Sign in to view your profile.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <h1 className="text-[28px] font-bold leading-tight text-white sm:text-[34px]">
        Welcome back, {firstName(name, email)}
      </h1>

      {/* Identity ------------------------------------------------------- */}
      <section className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center">
        <Avatar name={name} email={email} photo={profile.photo} color={color} onEdit={() => setEditing((v) => !v)} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-white">{name || email}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{email}</span>
          </p>
          {profile.headline && <p className="mt-1 text-sm text-slate-400">{profile.headline}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={isAdmin ? "accent" : "plain"}>{isAdmin ? "Administrator" : "Home member"}</Badge>
            <Badge tone={liveStatus === "live" ? "good" : "warn"}>
              {liveStatus === "live" ? "Live updates on" : "Live updates reconnecting"}
            </Badge>
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-sm font-semibold text-cyan-400 underline-offset-4 hover:underline"
            >
              {editing ? "Close" : "Edit profile"}
            </button>
          </div>
        </div>
      </section>

      {editing && (
        <ProfileEditor
          profile={profile}
          fallbackName={user.name}
          color={color}
          saving={prefsLoading}
          error={prefsError}
          onChange={setProfile}
          onDone={() => setEditing(false)}
        />
      )}

      {/* Keep track ------------------------------------------------------ */}
      <Section title="Keep track">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Cpu}
            label="Devices"
            value={devices === null ? null : String(devices.length)}
            hint={online === null ? "" : `${online} online`}
            href="/smarthome"
          />
          <Stat
            icon={Sofa}
            label="Rooms"
            value={rooms === null ? null : String(rooms.length)}
            hint="Across your home"
            href="/smarthome/rooms"
          />
          <Stat
            icon={Zap}
            label="Automations"
            value={automations === null ? null : String(automations)}
            hint={scenes === null ? "" : `${scenes} scenes`}
            href="/smarthome/automations"
          />
          <Stat
            icon={Bell}
            label="Unread alerts"
            value={unread === null ? null : String(unread)}
            hint={unread === 0 ? "All caught up" : "Needs a look"}
            href="/smarthome/notifications"
          />
        </div>
      </Section>

      {/* Security -------------------------------------------------------- */}
      <Section title="Manage access and security">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={notifyPermission === "granted" ? BellRing : Bell}
            title="Alert delivery"
            body={
              notifyPermission === "granted"
                ? "This browser will show alerts for dry-run, overflow and SOS events."
                : notifyPermission === "unsupported"
                  ? "This browser cannot show desktop alerts. Alerts still appear in the console."
                  : "Turn on desktop alerts so safety events reach you when the tab is in the background."
            }
            action={
              notifyPermission === "granted" || notifyPermission === "unsupported"
                ? undefined
                : { label: "Enable alerts", onClick: enableNotifications }
            }
            status={notifyPermission === "granted" ? "on" : undefined}
          />
          <ActionCard
            icon={Lock}
            title="Kiosk PIN lock"
            body="Require a PIN before a wall-mounted tablet can change anything."
            href="/smarthome/kiosk"
          />
          <ActionCard
            icon={ShieldAlert}
            title="Security & safety"
            body="Arm away mode, review camera access and check safety sensors."
            href="/smarthome/security"
          />
          <ActionCard
            icon={Radio}
            title="Connection"
            body={
              liveStatus === "live"
                ? "Streaming device state over a live connection."
                : "Reconnecting to the live stream. Controls still work over the API."
            }
            href="/smarthome/diagnostics"
            status={liveStatus === "live" ? "on" : "warn"}
          />
          <ActionCard
            icon={KeyRound}
            title="Gate passes"
            body="Issue time-limited codes for guests and revoke them at any time."
            href="/smarthome/security"
          />
          {isAdmin && (
            <ActionCard
              icon={Shield}
              title="Admin console"
              body="Fleet, provisioning, OTA and platform health for every account."
              href="/smarthome/admin"
            />
          )}
        </div>
      </Section>

      {/* Personalisation ------------------------------------------------- */}
      <Section title="Make it yours">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            icon={Sliders}
            title="Console theme"
            body={`${theme.mode} · ${theme.scheme} · ${theme.accent.label}. Change the look, colour and light mode.`}
            href="/smarthome/settings"
          />
          <ActionCard
            icon={Sparkles}
            title="Dashboard widgets"
            body="Choose which cards appear on your home dashboard and reorder them."
            href="/smarthome"
          />
          <ActionCard
            icon={Gauge}
            title="Response times"
            body="See how quickly your devices confirm commands and spot slow ones."
            href="/smarthome/admin/latency"
          />
        </div>
      </Section>

      {/* Recent activity -------------------------------------------------- */}
      <Section title="Recent activity">
        <div className="cv-card overflow-hidden rounded-2xl">
          {recent === null ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          ) : recent.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">Nothing has happened on your account yet.</p>
          ) : (
            <ul>
              {recent.map((e, i) => (
                <li key={e.id} className={`flex items-start gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-white/10" : ""}`}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{e.title}</span>
                    {e.body && <span className="block truncate text-xs text-slate-400">{e.body}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-slate-500">{when(e.ts)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/smarthome/timeline"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-cyan-400 hover:underline"
        >
          Full timeline <ChevronRight className="h-4 w-4" />
        </Link>
      </Section>

      {/* Session --------------------------------------------------------- */}
      <Section title="Session">
        <div className="cv-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
          <div>
            <p className="text-sm font-semibold text-white">Signed in on this device</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Account #{user.id} · signing out clears the token stored in this browser only.
            </p>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </Section>
    </div>
  );
}

// -------------------------------------------------------------- pieces ------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "accent" | "good" | "warn" | "plain" }) {
  const cls =
    tone === "accent"
      ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-300"
      : tone === "good"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : tone === "warn"
          ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
          : "border-white/15 bg-white/5 text-slate-300";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

function Avatar({
  name,
  email,
  photo,
  color,
  onEdit,
}: {
  name: string;
  email: string;
  photo: string;
  color: string;
  onEdit: () => void;
}) {
  return (
    <div className="relative h-28 w-28 shrink-0">
      {photo ? (
        // Data URL from the user's own file picker: next/image cannot optimise
        // these without a remote pattern, so a plain img is the correct element.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-28 w-28 rounded-full object-cover" />
      ) : (
        <div
          className="grid h-28 w-28 place-items-center rounded-full text-3xl font-bold text-white"
          style={{ background: color }}
          aria-hidden
        >
          {initials(name, email)}
        </div>
      )}
      <button
        onClick={onEdit}
        aria-label="Edit profile picture"
        className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-white/70 text-white shadow-lg transition hover:brightness-110"
        style={{ background: "var(--cv-gradient)" }}
      >
        <Camera className="h-4 w-4" />
      </button>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  hint: string;
  href: string;
}) {
  return (
    <Link href={href} className="cv-card block rounded-2xl p-4 transition hover:brightness-110">
      <span className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </span>
      <span className="mt-2 block text-2xl font-bold text-white">
        {value === null ? <span className="text-base font-medium text-slate-500">Loading…</span> : value}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </Link>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  href,
  action,
  status,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  action?: { label: string; onClick: () => void };
  status?: "on" | "warn";
}) {
  const inner = (
    <>
      <span className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-cyan-400">
          <Icon className="h-5 w-5" />
        </span>
        {status === "on" && <Check className="h-4 w-4 text-emerald-400" />}
        {status === "warn" && <WifiOff className="h-4 w-4 text-amber-400" />}
      </span>
      <span className="mt-3 block font-semibold text-white">{title}</span>
      <span className="mt-1 block text-sm leading-relaxed text-slate-400">{body}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="cv-card block rounded-2xl p-5 transition hover:brightness-110">
        {inner}
      </Link>
    );
  }
  return (
    <div className="cv-card rounded-2xl p-5">
      {inner}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--cv-gradient)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ProfileEditor({
  profile,
  fallbackName,
  color,
  saving,
  error,
  onChange,
  onDone,
}: {
  profile: ProfilePrefs;
  fallbackName: string;
  color: string;
  saving: boolean;
  error: string;
  onChange: (patch: Partial<ProfilePrefs>) => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");

  const zones = useMemo(() => {
    const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    try {
      return supported ? supported("timeZone") : [];
    } catch {
      return [];
    }
  }, []);

  const pickPhoto = useCallback(
    (file: File) => {
      setPhotoError("");
      if (!file.type.startsWith("image/")) {
        setPhotoError("That file is not an image.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        // Preferences round-trip as JSON, so an oversized data URL would bloat
        // every save. Reject it rather than silently truncating.
        if (url.length > MAX_PHOTO_BYTES) {
          setPhotoError("Please choose an image under 300 KB.");
          return;
        }
        onChange({ photo: url });
      };
      reader.onerror = () => setPhotoError("Could not read that file.");
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  return (
    <div className="cv-card mt-6 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">Edit profile</h2>
        <button
          onClick={onDone}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-200"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Your email and account name are managed by the control plane. These settings change how you appear in this
        console and sync to every browser you sign in from.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <input
            className="cv-input"
            defaultValue={profile.displayName}
            placeholder={fallbackName}
            maxLength={60}
            onBlur={(e) => onChange({ displayName: e.target.value.trim() })}
          />
        </Field>
        <Field label="Headline" hint="Shown under your name">
          <input
            className="cv-input"
            defaultValue={profile.headline}
            placeholder="e.g. Ground floor, Block B"
            maxLength={80}
            onBlur={(e) => onChange({ headline: e.target.value.trim() })}
          />
        </Field>
        <Field label="Phone" icon={Phone}>
          <input
            className="cv-input"
            type="tel"
            defaultValue={profile.phone}
            placeholder="+91 …"
            maxLength={24}
            onBlur={(e) => onChange({ phone: e.target.value.trim() })}
          />
        </Field>
        <Field label="Time zone" icon={MapPin} hint="Used when showing timestamps">
          {zones.length ? (
            <select className="cv-input" value={profile.timeZone} onChange={(e) => onChange({ timeZone: e.target.value })}>
              <option value="">Follow this browser</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="cv-input"
              defaultValue={profile.timeZone}
              placeholder="Asia/Kolkata"
              onBlur={(e) => onChange({ timeZone: e.target.value.trim() })}
            />
          )}
        </Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Picture</div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
          >
            <Camera className="h-4 w-4" /> Upload photo
          </button>
          {profile.photo && (
            <button
              onClick={() => onChange({ photo: "" })}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-200"
            >
              <Trash2 className="h-4 w-4" /> Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickPhoto(f);
              e.target.value = "";
            }}
          />
        </div>
        {photoError && <p className="mt-2 text-xs text-red-300">{photoError}</p>}

        {!profile.photo && (
          <>
            <div className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Initials colour</div>
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onChange({ avatarColor: c })}
                  aria-label={`Use ${c}`}
                  className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-white" : "border-white/20"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {saving && <p className="mt-4 text-xs text-slate-500">Syncing…</p>}
      {error && <p className="mt-4 text-xs text-amber-300">{error}</p>}
    </div>
  );
}

function Field({
  label,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function when(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}
