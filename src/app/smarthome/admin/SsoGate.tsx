"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, LoaderCircle, AlertTriangle } from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// SIGN-IN GATE FOR THE CONTROL PLANE
// ═══════════════════════════════════════════════════════════════
// This console had no gate at all. `AdminShell` asks the control plane whether
// the caller is an operator, but it does that to colour a badge -- the whole
// interface renders either way, to anybody who visits, with "No access" in the
// corner. Every panel then 401s, which is why nothing leaked; but a fleet,
// OTA and provisioning console rendering to the public internet is not a state
// worth keeping, and an operator had no way to sign in even if they were one.
//
// The handshake reused here is the one the shop's admin console already runs
// against auth.circuvent.com: PKCE, state and verifier sealed in an httpOnly
// cookie, and a short-lived signed code swapped for the console's bearer token
// so the token never appears in a URL.
//
// Nothing host-specific was needed to make it work here. `/api/...` is served
// from the root on every hostname, and the sign-in route derives its redirect
// URI from the request origin -- so on home.circuvent.com the round trip goes
// to home.circuvent.com, and the callback's `/admin` lands on this console
// because that is what `/admin` means on this host. The one thing missing was
// the address being registered on the identity service, which refuses a
// redirect URI it has not been told about.
//
// The token lives in sessionStorage rather than a cookie, deliberately, and
// that is not changed here: a cookie would make all 148 admin API routes
// automatically credentialed and therefore open to cross-site request forgery.

const SSO_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  state: "That sign-in could not be verified. Please try again.",
  exchange: "Could not complete sign-in with the identity service.",
  userinfo: "Could not read your account details. Please try again.",
  unverified: "Your Circuvent email address has not been verified.",
  "not-staff":
    "Your Circuvent account signed in, but it has no role in this console. Ask an administrator to add you.",
  provider: "The identity service refused the sign-in.",
};

type Phase = "checking" | "in" | "out";

export default function SsoGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState<string>("");

  useEffect(() => {
    let alive = true;

    const url = new URL(window.location.href);
    const handoff = url.searchParams.get("sso");
    const ssoError = url.searchParams.get("sso_error");

    /*
     * The code is removed from the address bar once it has been read. It is
     * single-use and expires in ninety seconds, but leaving it in history and
     * in the referrer of the next request is a credential-shaped thing sitting
     * where it does not need to be.
     */
    const scrub = () => {
      url.searchParams.delete("sso");
      url.searchParams.delete("sso_error");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    if (ssoError) {
      setError(SSO_ERRORS[ssoError] ?? "Single sign-on did not complete. Please try again.");
      scrub();
    }

    if (handoff) {
      fetch("/api/admin/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: handoff }),
      })
        .then(async (res) => {
          const d = (await res.json().catch(() => ({}))) as {
            token?: string;
            email?: string;
            error?: string;
          };
          if (!alive) return;
          if (res.ok && d.token) {
            sessionStorage.setItem("admin-token", d.token);
            setWho(d.email ?? "");
            setPhase("in");
          } else {
            setError(d.error || "Single sign-on did not complete. Please try again.");
            setPhase("out");
          }
        })
        .catch(() => {
          if (alive) {
            setError("Single sign-on did not complete. Please try again.");
            setPhase("out");
          }
        })
        .finally(() => alive && scrub());
      return () => {
        alive = false;
      };
    }

    /*
     * An existing token is re-checked against the server rather than trusted
     * for being present. A role can be withdrawn while a tab sits open, and
     * the account state should decide, not what the browser happens to hold.
     */
    const token = sessionStorage.getItem("admin-token");
    if (!token) {
      setPhase("out");
      return () => {
        alive = false;
      };
    }

    fetch("/api/admin/auth", { headers: { "x-admin-token": token } })
      .then(async (res) => {
        if (!alive) return;
        if (res.ok) {
          const d = (await res.json().catch(() => ({}))) as { email?: string };
          setWho(d.email ?? "");
          setPhase("in");
        } else {
          sessionStorage.removeItem("admin-token");
          setPhase("out");
        }
      })
      .catch(() => {
        // A network failure is not proof the token is bad, so it is kept --
        // but the console is not opened on an unverified credential either.
        if (alive) setPhase("out");
      });

    return () => {
      alive = false;
    };
  }, []);

  if (phase === "in") return <>{children}</>;

  /*
   * Colours are stated explicitly, not inherited.
   *
   * This card hardcodes a dark surface (#0b1020) because the sign-in screen is
   * dark whatever the console theme is. Text colour, though, was left to
   * cascade — and the app's theme follows the operating system, so on a
   * machine in light mode `body` resolves to `--text-primary: #0c1222`. That
   * is near-black on near-black: the heading disappeared into the card.
   *
   * A component that fixes its own background has to fix its own foreground.
   * Anything less depends on ambient state it has already opted out of.
   */
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b1020] px-6 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#2585C6]/15 text-[#5cb3e8]">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-50">IoT Control Plane</h1>
            <p className="text-xs text-slate-300">Circuvent staff access</p>
          </div>
        </div>

        {phase === "checking" ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-200">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Checking your access…
          </p>
        ) : (
          <>
            <p className="mt-6 text-sm text-slate-200">
              This console manages device provisioning, firmware rollouts and
              fleet security. Sign in with your Circuvent account to continue.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            {/*
              A link, not a fetch. The handshake is a full-page navigation to
              another origin; starting it with fetch would be blocked and would
              leave somebody looking at a button that does nothing.
            */}
            <a
              href="/api/admin/auth/sso/start"
              className="mt-6 flex w-full items-center justify-center rounded-lg bg-[#2585C6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e6da3]"
            >
              Sign in with Circuvent
            </a>

            {who && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Last signed in as {who}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
