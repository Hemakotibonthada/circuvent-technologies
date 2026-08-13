"use client";

/**
 * Household — who else can use this home, and which home you are looking at.
 *
 * Two things live on one screen because they are two halves of one idea: the
 * people you have let into your home, and the homes other people have let you
 * into. Splitting them across two tabs would mean somebody who had been
 * invited somewhere had no obvious place to go and look.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, DoorOpen, Home, Loader2, Trash2, UserPlus, X } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  LoadingState,
  SectionTitle,
  SelectInput,
  Surface,
  TextInput,
  formatRelative,
} from "../_kit/primitives";
import { useToast } from "../_kit/overlays";
import {
  controlPlane,
  getActiveHome,
  setActiveHome,
  type HomeInvite,
  type HomeMember,
  type HomeRole,
  type HomeRoleInfo,
  type HomeSummary,
} from "@/lib/control-plane";

type GrantableRole = Exclude<HomeRole, "owner">;

function roleTone(role: HomeRole): "ok" | "info" | "warning" {
  if (role === "owner" || role === "adult") return "ok";
  if (role === "limited") return "info";
  return "warning";
}

export default function HouseholdPanel() {
  const toast = useToast();

  const [homes, setHomes] = useState<HomeSummary[]>([]);
  const [members, setMembers] = useState<HomeMember[]>([]);
  const [owner, setOwner] = useState<HomeMember | null>(null);
  const [you, setYou] = useState<{ id: number; role: HomeRole } | null>(null);
  const [invites, setInvites] = useState<HomeInvite[]>([]);
  const [roleInfo, setRoleInfo] = useState<HomeRoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  const [inviteRole, setInviteRole] = useState<GrantableRole>("limited");
  const [inviteEmail, setInviteEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);

  /* Whether this screen is looking at a home you own. Everything that changes
     the household is hidden otherwise — a member has no business seeing an
     invite form that would only refuse them. */
  const isOwner = you !== null && owner !== null && you.id === owner.id;

  const load = useCallback(async () => {
    const [h, m, r] = await Promise.all([
      controlPlane.homes(),
      controlPlane.homeMembers(),
      controlPlane.homeRoles(),
    ]);
    if (h.ok) setHomes(h.data.homes ?? []);
    if (m.ok) {
      setMembers(m.data.members ?? []);
      setOwner(m.data.owner ?? null);
      setYou(m.data.you ?? null);
    }
    if (r.ok) setRoleInfo(r.data.roles ?? []);

    /* Invites are owner-only and answer 403 otherwise. Asked for regardless
       and ignored on refusal, rather than branching before we know who we
       are — one round trip either way, and no flash of the wrong screen. */
    const i = await controlPlane.homeInvites();
    setInvites(i.ok ? (i.data.invites ?? []) : []);

    setActive(getActiveHome());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTo = (homeId: number | null) => {
    setActiveHome(homeId);
    /*
     * A full reload, not a re-render.
     *
     * Every panel in the console holds its own fetched state, and the home is
     * a header on requests rather than a prop. Re-rendering would leave a
     * dozen caches showing the previous household's devices next to the new
     * one's name, which is exactly the confusion this feature must not create.
     */
    window.location.reload();
  };

  const invite = async () => {
    setBusy(true);
    const r = await controlPlane.inviteToHome({
      role: inviteRole,
      email: inviteEmail.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      toast.err("Could not create the invitation", (r.data as { error?: string })?.error ?? "");
      return;
    }
    setIssued({ code: r.data.code, expiresAt: r.data.expiresAt });
    setInviteEmail("");
    void load();
  };

  const join = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    const r = await controlPlane.joinHome(code);
    setBusy(false);
    if (!r.ok) {
      toast.err("Could not join", (r.data as { error?: string })?.error ?? "");
      return;
    }
    setJoinCode("");
    toast.ok("You have joined the home", "Switch to it from the list above.");
    void load();
  };

  const changeRole = async (id: number, role: GrantableRole) => {
    const r = await controlPlane.setMemberRole(id, role);
    if (!r.ok) {
      toast.err("Could not change access", (r.data as { error?: string })?.error ?? "");
      return;
    }
    setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role } : m)));
    toast.ok("Access changed", "It takes effect on their next action.");
  };

  const remove = async (m: HomeMember) => {
    const r = await controlPlane.removeMember(m.id);
    if (!r.ok) {
      toast.err("Could not remove them", (r.data as { error?: string })?.error ?? "");
      return;
    }
    setMembers((ms) => ms.filter((x) => x.id !== m.id));
    toast.ok(`${m.name || m.email} was removed`, "Their access ended immediately.");
  };

  const leave = async (home: HomeSummary) => {
    if (!you) return;
    /* Leaving is the same delete as being removed — it is the same row. */
    const wasActive = getActiveHome() === home.homeId;
    if (wasActive) setActiveHome(null);
    const r = await controlPlane.removeMember(you.id);
    if (!r.ok) {
      if (wasActive) setActiveHome(home.homeId);
      toast.err("Could not leave", (r.data as { error?: string })?.error ?? "");
      return;
    }
    window.location.reload();
  };

  const revoke = async (code: string) => {
    const r = await controlPlane.revokeHomeInvite(code);
    if (!r.ok) {
      toast.err("Could not withdraw it", (r.data as { error?: string })?.error ?? "");
      return;
    }
    setInvites((xs) => xs.map((i) => (i.code === code ? { ...i, status: "revoked" } : i)));
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.err("Could not copy", "Select the code and copy it by hand.");
    }
  };

  if (loading) return <LoadingState label="Loading your household" />;

  const shared = homes.filter((h) => h.role !== "owner");
  const openInvites = invites.filter((i) => i.status === "open");

  return (
    <div className="space-y-6 pt-1">
      {/* ── Which home ─────────────────────────────────── */}
      {shared.length > 0 && (
        <>
          <SectionTitle>Which home you are looking at</SectionTitle>
          <Surface>
            <div className="space-y-2">
              {homes.map((h) => {
                const isActive = h.role === "owner" ? active === null : active === h.homeId;
                return (
                  <div
                    key={h.homeId}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: isActive ? "var(--cv-input-bg)" : "transparent" }}
                  >
                    <Home className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {h.role === "owner" ? "My home" : h.ownerName}
                      </div>
                      <div className="truncate text-xs" style={{ color: "var(--cv-muted)" }}>
                        {h.ownerEmail}
                      </div>
                    </div>
                    <Badge tone={roleTone(h.role)}>{h.role}</Badge>
                    {isActive ? (
                      <Badge tone="ok">
                        <Check className="mr-1 inline h-3 w-3" />
                        Viewing
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => switchTo(h.role === "owner" ? null : h.homeId)}
                      >
                        Switch
                      </Button>
                    )}
                    {h.role !== "owner" && (
                      <Button variant="ghost" onClick={() => void leave(h)} title="Leave this home">
                        <DoorOpen className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Surface>
        </>
      )}

      {/* ── People ─────────────────────────────────────── */}
      <SectionTitle>
        {isOwner ? "People in your home" : `People in ${owner?.name || "this home"}`}
      </SectionTitle>

      {!isOwner && you && (
        <Callout tone="info" title={`You are ${you.role} in this home`}>
          {roleInfo.find((r) => r.role === you.role)?.description ??
            "Only the home owner can invite or remove people."}
        </Callout>
      )}

      <Surface>
        <div className="space-y-1">
          {owner && (
            <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {owner.name || owner.email}
                  {you?.id === owner.id && (
                    <span style={{ color: "var(--cv-muted)" }}> — you</span>
                  )}
                </div>
                <div className="truncate text-xs" style={{ color: "var(--cv-muted)" }}>
                  {owner.email}
                </div>
              </div>
              <Badge tone="ok">owner</Badge>
            </div>
          )}

          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name || m.email}
                  {you?.id === m.id && <span style={{ color: "var(--cv-muted)" }}> — you</span>}
                </div>
                <div className="truncate text-xs" style={{ color: "var(--cv-muted)" }}>
                  {m.email}
                  {m.since && ` · joined ${formatRelative(m.since)}`}
                </div>
              </div>
              {isOwner ? (
                <>
                  <SelectInput
                    value={m.role as GrantableRole}
                    onChange={(v) => void changeRole(m.id, v)}
                    options={roleInfo.map((r) => ({ value: r.role, label: r.label }))}
                  />
                  <Button variant="ghost" onClick={() => void remove(m)} title="Remove from home">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Badge tone={roleTone(m.role)}>{m.role}</Badge>
              )}
            </div>
          ))}

          {members.length === 0 && (
            <EmptyState
              icon={UserPlus}
              title="Nobody else yet"
              body={
                isOwner
                  ? "Invite the people who live here so they stop needing your password."
                  : "You are the only person the owner has invited."
              }
            />
          )}
        </div>
      </Surface>

      {/* ── Invite ─────────────────────────────────────── */}
      {isOwner && (
        <>
          <SectionTitle>Invite somebody</SectionTitle>
          <Surface>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Level of access">
                  <SelectInput
                    value={inviteRole}
                    onChange={setInviteRole}
                    options={roleInfo.map((r) => ({ value: r.role, label: r.label }))}
                  />
                </Field>
                <Field label="Their email (optional)" hint="Set it and only that address can use the code.">
                  <TextInput
                    value={inviteEmail}
                    onChange={setInviteEmail}
                    placeholder="them@example.com"
                  />
                </Field>
              </div>

              <p className="text-xs" style={{ color: "var(--cv-muted)" }}>
                {roleInfo.find((r) => r.role === inviteRole)?.description}
              </p>

              <Button onClick={() => void invite()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Create an invitation
              </Button>

              {issued && (
                <Callout tone="ok" title="Give them this code">
                  <div className="mt-2 flex items-center gap-2">
                    <code className="rounded-lg px-3 py-2 text-lg font-semibold tracking-[0.25em]" style={{ background: "var(--cv-input-bg)" }}>
                      {issued.code}
                    </code>
                    <Button variant="ghost" onClick={() => void copy(issued.code)}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs">
                    It works once, and stops working {formatRelative(issued.expiresAt)}. They enter
                    it under Settings → Household in their own account.
                  </p>
                </Callout>
              )}
            </div>
          </Surface>

          {openInvites.length > 0 && (
            <Surface>
              <div className="space-y-1">
                {openInvites.map((i) => (
                  <div key={i.code} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <code className="text-sm font-semibold tracking-widest">{i.code}</code>
                    <div className="min-w-0 flex-1 text-xs" style={{ color: "var(--cv-muted)" }}>
                      {i.role}
                      {i.email && ` · for ${i.email}`} · expires {formatRelative(i.expiresAt)}
                    </div>
                    <Button variant="ghost" onClick={() => void revoke(i.code)} title="Withdraw">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Surface>
          )}
        </>
      )}

      {/* ── Join ───────────────────────────────────────── */}
      <SectionTitle>Join somebody else&apos;s home</SectionTitle>
      <Surface>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field label="Invitation code">
              <TextInput
                value={joinCode}
                onChange={(v) => setJoinCode(v.toUpperCase())}
                placeholder="ABCD2345"
              />
            </Field>
          </div>
          <Button onClick={() => void join()} disabled={busy || !joinCode.trim()}>
            Join
          </Button>
        </div>
      </Surface>
    </div>
  );
}
