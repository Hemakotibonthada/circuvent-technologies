"use client";

// API keys + webhooks manager for the Developer tab.
//
// Everything here is session-authenticated: the control plane refuses these
// endpoints to API keys, so a leaked key cannot mint itself a broader one.

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Trash2, Webhook as WebhookIcon, Send, Copy, Check, TriangleAlert } from "lucide-react";
import { controlPlane, type ApiKey, type ApiScopeInfo, type Webhook } from "@/lib/control-plane";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  IconButton,
  RelativeTime,
  SectionTitle,
  Surface,
  SwitchRow,
  TextInput,
  formatNumber,
} from "../_kit/primitives";

/* ------------------------------------------------------------------ */
/* Secret reveal                                                       */
/* ------------------------------------------------------------------ */

/**
 * The one and only time a key is visible.
 *
 * The server stores a SHA-256 hash, so this genuinely cannot be shown again —
 * the panel has to say so plainly, before the user dismisses it, or the first
 * thing that happens after launch is a support request asking us to look it up.
 */
function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the value is selectable on screen regardless */
    }
  };

  return (
    <Surface>
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#f59e0b" }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>
            Copy this key now — it will not be shown again
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
            We store only a hash of it, so there is no way for us or for you to recover it later. If you
            lose it, revoke this key and create another.
          </p>
          <div
            className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "var(--cv-border)", background: "var(--cv-card-hi)" }}
          >
            <code
              className="min-w-0 flex-1 break-all font-mono text-xs"
              style={{ color: "var(--cv-accent-hi)" }}
            >
              {secret}
            </code>
            <IconButton
              icon={copied ? Check : Copy}
              label={copied ? "Copied" : "Copy key"}
              onClick={copy}
            />
          </div>
          <div className="mt-3">
            <Button variant="secondary" onClick={onDone}>
              I&apos;ve saved it
            </Button>
          </div>
        </div>
      </div>
    </Surface>
  );
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

function KeyCard({ k, onRevoke }: { k: ApiKey; onRevoke: (id: number) => void }) {
  const expired = !!k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now();
  const dead = !!k.revokedAt || expired;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: "var(--cv-border)",
        background: "var(--cv-card)",
        opacity: dead ? 0.55 : 1,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0" style={{ color: "var(--cv-accent)" }} />
        <span className="font-bold" style={{ color: "var(--cv-text)" }}>
          {k.name}
        </span>
        <Badge tone={k.env === "live" ? "ok" : "info"}>{k.env}</Badge>
        {k.revokedAt && <Badge tone="critical">Revoked</Badge>}
        {!k.revokedAt && expired && <Badge tone="warning">Expired</Badge>}
        {!dead && (
          <div className="ml-auto">
            <IconButton icon={Trash2} label="Revoke key" onClick={() => onRevoke(k.id)} danger />
          </div>
        )}
      </div>

      <code
        className="mt-2 block font-mono text-xs"
        style={{ color: "var(--cv-muted)" }}
      >
        {k.prefix}…
      </code>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {k.scopes.map((s) => (
          <span
            key={s}
            className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
          >
            {s}
          </span>
        ))}
      </div>

      {k.allowedOrigins.length > 0 && (
        <div className="mt-2 text-[11px]" style={{ color: "var(--cv-muted)" }}>
          Browser origins: {k.allowedOrigins.join(", ")}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
        <span>
          {k.lastUsedAt ? <RelativeTime iso={k.lastUsedAt} prefix="Last used " /> : "Never used"}
        </span>
        <span>{formatNumber(k.requestCount)} requests</span>
        <RelativeTime iso={k.createdAt} prefix="Created " />
        {k.expiresAt && !expired && <RelativeTime iso={k.expiresAt} prefix="Expires " />}
      </div>
    </div>
  );
}

function CreateKeyForm({
  scopes,
  onCreated,
  onCancel,
}: {
  scopes: ApiScopeInfo[];
  onCreated: (secret: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"live" | "test">("live");
  const [picked, setPicked] = useState<string[]>(["devices:read"]);
  const [origins, setOrigins] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (s: string) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("Give the key a name so you can recognise it later.");
    if (!picked.length) return setError("Select at least one scope.");
    setBusy(true);
    const days = expiry.trim() ? Number(expiry) : null;
    const r = await controlPlane.createApiKey({
      name: name.trim(),
      env,
      scopes: picked,
      allowedOrigins: origins
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      expiresInDays: days && Number.isFinite(days) ? days : null,
    });
    setBusy(false);
    if (!r.ok) {
      setError((r.data as { error?: string })?.error ?? "Could not create the key.");
      return;
    }
    onCreated(r.data.secret);
  };

  return (
    <Surface>
      <div className="space-y-4">
        <Field label="Name" hint="Shown in this list and in audit logs.">
          <TextInput value={name} onChange={setName} placeholder="Grafana dashboard" />
        </Field>

        <Field label="Environment" hint="Both are real keys against real devices — this is a label to help you tell them apart.">
          <div className="flex gap-2">
            {(["live", "test"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEnv(e)}
                className="min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition"
                style={{
                  borderColor: env === e ? "var(--cv-accent)" : "var(--cv-border)",
                  background: env === e ? "var(--cv-card-hi)" : "transparent",
                  color: env === e ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Scopes" hint="Grant the least this integration needs. You can narrow a key later without recreating it.">
          <div className="space-y-1.5">
            {scopes.map((s) => (
              <label
                key={s.scope}
                className="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: picked.includes(s.scope) ? "var(--cv-accent)" : "var(--cv-border)",
                  background: picked.includes(s.scope) ? "var(--cv-card-hi)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={picked.includes(s.scope)}
                  onChange={() => toggle(s.scope)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
                />
                <span className="min-w-0">
                  <code className="font-mono text-xs font-bold" style={{ color: "var(--cv-text)" }}>
                    {s.scope}
                  </code>
                  <span className="block text-[12px]" style={{ color: "var(--cv-muted)" }}>
                    {s.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Browser origins (optional)"
          hint="Leave empty for a server-side key. Adding an origin lets the key be called from that website — and only that website. See the docs for exactly what that does and does not protect."
        >
          <TextInput
            value={origins}
            onChange={setOrigins}
            placeholder="https://dashboard.example.com"
          />
        </Field>

        <Field label="Expires in (days, optional)" hint="Leave empty for a key that never expires.">
          <TextInput value={expiry} onChange={setExpiry} placeholder="90" />
        </Field>

        {error && <Callout tone="critical">{error}</Callout>}

        <div className="flex gap-2">
          <Button onClick={submit} busy={busy} icon={Plus}>
            Create key
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Surface>
  );
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

function WebhookCard({
  w,
  events,
  onToggle,
  onTest,
  onDelete,
}: {
  w: Webhook;
  events: string[];
  onToggle: (id: number, enabled: boolean) => void;
  onTest: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--cv-border)", background: "var(--cv-card)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <WebhookIcon className="h-4 w-4 shrink-0" style={{ color: "var(--cv-accent)" }} />
        <code className="min-w-0 flex-1 break-all font-mono text-xs" style={{ color: "var(--cv-text)" }}>
          {w.url}
        </code>
        <IconButton icon={Send} label="Send test delivery" onClick={() => onTest(w.id)} />
        <IconButton icon={Trash2} label="Delete webhook" onClick={() => onDelete(w.id)} danger />
      </div>

      <div className="mt-3">
        <SwitchRow
          label="Enabled"
          checked={w.enabled}
          onChange={(v) => onToggle(w.id, v)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(w.events.length ? w.events : events).map((e) => (
          <span
            key={e}
            className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold"
            style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
          >
            {e}
          </span>
        ))}
        {!w.events.length && (
          <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            (all events)
          </span>
        )}
      </div>

      {w.secret && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold" style={{ color: "var(--cv-muted)" }}>
            Signing secret — your receiver needs this to verify deliveries
          </div>
          <code
            className="block break-all rounded-lg border px-2 py-1.5 font-mono text-[11px]"
            style={{ borderColor: "var(--cv-border)", background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
          >
            {w.secret}
          </code>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--cv-muted)" }}>
        {w.lastAt ? <RelativeTime iso={w.lastAt} prefix="Last delivery " /> : <span>No deliveries yet</span>}
        {w.lastStatus != null && <span>HTTP {w.lastStatus}</span>}
        {w.failures > 0 && <span style={{ color: "#f59e0b" }}>{w.failures} consecutive failures</span>}
        {w.lastError && <span style={{ color: "#ef4444" }}>{w.lastError}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function ApiKeysPanel() {
  const [scopes, setScopes] = useState<ApiScopeInfo[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookBusy, setHookBusy] = useState(false);
  const [hookError, setHookError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [meta, k, w] = await Promise.all([
      controlPlane.devScopes(),
      controlPlane.apiKeys(),
      controlPlane.webhooks(),
    ]);
    if (meta.ok) {
      setScopes(meta.data.scopes ?? []);
      setEvents(meta.data.webhookEvents ?? []);
    }
    if (k.ok) setKeys(k.data.keys ?? []);
    if (w.ok) setHooks(w.data.webhooks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: number) => {
    // Revoking is immediate and irreversible on the server, so confirm first.
    if (!window.confirm("Revoke this key? Any integration using it will stop working immediately.")) return;
    const r = await controlPlane.revokeApiKey(id);
    if (r.ok) void load();
  };

  const addHook = async () => {
    setHookError("");
    if (!hookUrl.trim()) return setHookError("Enter the https URL to deliver to.");
    setHookBusy(true);
    const r = await controlPlane.createWebhook({ url: hookUrl.trim() });
    setHookBusy(false);
    if (!r.ok) {
      setHookError((r.data as { error?: string })?.error ?? "Could not add the webhook.");
      return;
    }
    setHookUrl("");
    void load();
  };

  const testHook = async (id: number) => {
    setToast("Sending…");
    const r = await controlPlane.testWebhook(id);
    setToast(
      r.ok && r.data.delivered
        ? `Delivered — HTTP ${r.data.status} in ${r.data.ms} ms`
        : `Failed — ${(r.data as { error?: string })?.error ?? `HTTP ${(r.data as { status?: number })?.status ?? "?"}`}`
    );
    setTimeout(() => setToast(""), 5000);
    void load();
  };

  const toggleHook = async (id: number, enabled: boolean) => {
    const r = await controlPlane.updateWebhook(id, { enabled });
    if (r.ok) void load();
  };

  const deleteHook = async (id: number) => {
    if (!window.confirm("Delete this webhook? Deliveries will stop immediately.")) return;
    const r = await controlPlane.deleteWebhook(id);
    if (r.ok) void load();
  };

  const liveKeys = keys.filter((k) => !k.revokedAt);
  const deadKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="space-y-6">
      <SectionTitle
        right={
          !creating && (
            <Button icon={Plus} onClick={() => setCreating(true)}>
              New key
            </Button>
          )
        }
      >
        API keys
      </SectionTitle>

      <Callout tone="info" title="Building an integration?">
        API keys let your own dashboard read devices and send commands without a Circuvent login.
        The full reference, quickstart and copy-paste examples are at{" "}
        <a href="/developer" className="font-semibold underline" style={{ color: "var(--cv-accent-hi)" }}>
          circuvent.com/developer
        </a>
        .
      </Callout>

      {secret && <SecretReveal secret={secret} onDone={() => setSecret(null)} />}

      {creating && (
        <CreateKeyForm
          scopes={scopes}
          onCancel={() => setCreating(false)}
          onCreated={(s) => {
            setCreating(false);
            setSecret(s);
            void load();
          }}
        />
      )}

      {loading ? (
        <div className="text-sm" style={{ color: "var(--cv-muted)" }}>
          Loading…
        </div>
      ) : !keys.length ? (
        <EmptyState
          title="No API keys yet"
          body="Create one to call the Circuvent API from your own server or dashboard."
        />
      ) : (
        <div className="space-y-3">
          {liveKeys.map((k) => (
            <KeyCard key={k.id} k={k} onRevoke={revoke} />
          ))}
          {deadKeys.length > 0 && (
            <>
              <div className="pt-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cv-muted)" }}>
                Revoked
              </div>
              {deadKeys.map((k) => (
                <KeyCard key={k.id} k={k} onRevoke={revoke} />
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Webhooks ──────────────────────────────────── */}
      <SectionTitle>Webhooks</SectionTitle>
      <Callout tone="info">
        We POST to your URL whenever a device changes state, so you do not have to poll. Every
        delivery is signed — verify the <code className="font-mono">X-Circuvent-Signature</code>{" "}
        header before trusting the body.
      </Callout>

      <Surface>
        <Field label="Delivery URL" hint="Must be https and publicly reachable.">
          <TextInput value={hookUrl} onChange={setHookUrl} placeholder="https://example.com/hooks/circuvent" />
        </Field>
        {hookError && (
          <div className="mt-2">
            <Callout tone="critical">{hookError}</Callout>
          </div>
        )}
        <div className="mt-3">
          <Button icon={Plus} onClick={addHook} busy={hookBusy}>
            Add webhook
          </Button>
        </div>
      </Surface>

      {toast && <Callout tone={toast.startsWith("Delivered") ? "ok" : "warning"}>{toast}</Callout>}

      {hooks.length === 0 ? (
        <EmptyState title="No webhooks" body="Add one above to receive device events as they happen." />
      ) : (
        <div className="space-y-3">
          {hooks.map((w) => (
            <WebhookCard
              key={w.id}
              w={w}
              events={events}
              onToggle={toggleHook}
              onTest={testHook}
              onDelete={deleteHook}
            />
          ))}
        </div>
      )}
    </div>
  );
}
