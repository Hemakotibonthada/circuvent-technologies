"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Loader2, Mail, Lock, User as UserIcon, ShieldCheck, Zap, Radio, ArrowRight, KeyRound } from "lucide-react";
import { useConsole } from "./ConsoleProvider";
import { usePasskey, usePasskeySupport } from "@/lib/usePasskey";

export default function Login() {
  const { login, loginWithPasskey, register, verifyOtp, resendOtp, forgotPassword, resetPassword } = useConsole();
  const passkeySupported = usePasskeySupport();
  const passkey = usePasskey("/api/account/passkey");
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [step, setStep] = useState<"form" | "otp" | "reset">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Sign in with a passkey.
   *
   * Asks for the console session in the same round trip as the assertion,
   * because the alternative is verifying the passkey and then discovering the
   * bridge is down — which leaves somebody authenticated and still looking at
   * the sign-in form.
   */
  const withPasskey = async () => {
    const addr = email.trim();
    if (!addr) {
      setError("Enter your email first, then use your passkey.");
      return;
    }
    setError(null);
    setInfo(null);

    const r = await passkey.signIn(addr, { console: true });
    if (!r.ok) {
      // A cancelled prompt reports no error; leaving the form untouched is the
      // correct response to someone changing their mind.
      if (r.error) setError(r.error);
      return;
    }

    const session = r.data?.console as { token: string; user: { id: number; email: string; name: string } } | undefined;
    if (!session?.token) {
      setError(String(r.data?.consoleError ?? "Signed in, but the smart-home service could not be reached."));
      return;
    }
    await loginWithPasskey(addr, session);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === "forgot") {
      const r = await forgotPassword(email.trim());
      // Always advances, because the endpoint deliberately does not reveal
      // whether the address has an account. Someone who mistypes their email
      // finds out when no code arrives, not from this screen.
      setInfo(r.message ?? "If that email has an account, a reset code is on its way.");
      setStep("reset");
    } else if (mode === "login") {
      const r = await login(email.trim(), password);
      if (!r.ok) setError(r.error || "Something went wrong");
    } else {
      const r = await register(name.trim(), email.trim(), password);
      if (r.ok && r.pending) {
        setStep("otp");
        if (!r.otpSent) setInfo("Code generated. If no email arrives, contact support.");
      } else if (!r.ok) {
        setError(r.error || "Something went wrong");
      }
    }
    setBusy(false);
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await resetPassword(email.trim(), otp.trim(), password);
    if (!r.ok) setError(r.error || "Could not reset your password.");
    setBusy(false);
  };

  const backToLogin = () => {
    setMode("login");
    setStep("form");
    setOtp("");
    setPassword("");
    setError(null);
    setInfo(null);
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await verifyOtp(email.trim(), otp.trim());
    if (!r.ok) setError(r.error || "Verification failed");
    setBusy(false);
  };

  const resend = async () => {
    setError(null);
    const r = await resendOtp(email.trim());
    setInfo(r.ok ? "A new code has been sent." : null);
    if (!r.ok) setError(r.error || "Could not resend code");
  };

  const title =
    step === "reset"
      ? "Set a new password"
      : step === "otp"
        ? "Verify your email"
        : mode === "login"
          ? "Welcome back"
          : mode === "forgot"
            ? "Reset your password"
            : "Create your account";

  const subtitle =
    step === "reset"
      ? `Enter the code sent to ${email} and choose a new password.`
      : step === "otp"
        ? `Enter the 6-digit code sent to ${email}.`
        : mode === "login"
          ? "Access and control your Circuvent devices."
          : mode === "forgot"
            ? "We'll email you a code to set a new password."
            : "One account controls every Circuvent device you own.";

  return (
    <div className="cvlogin relative min-h-screen overflow-hidden text-slate-100">
      {/* Animated aurora background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="cvlogin-grid absolute inset-0" />
        <div className="cvlogin-orb cvlogin-orb-1" />
        <div className="cvlogin-orb cvlogin-orb-2" />
        <div className="cvlogin-orb cvlogin-orb-3" />
        <div className="cvlogin-vignette absolute inset-0" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Left brand / graphics panel (desktop) */}
        <div className="relative hidden flex-col justify-between p-12 lg:flex">
          <div className="flex items-center gap-3">
            <div
              className="h-[44px] w-[44px] rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20"
              style={{ background: "var(--cv-gradient)" }}
            >
              <Cpu className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="font-extrabold text-xl leading-none">Circuvent</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Device Console</div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-4xl xl:text-5xl font-black leading-[1.05] tracking-tight">
              Command your entire
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg,#22d3ee,#a855f7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                smart home.
              </span>
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-400">
              Devices, energy, security, automations and live telemetry — one self-hosted control plane for everything you own.
            </p>

            <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
              <Feature icon={<Radio className="h-4 w-4" />} label="Real-time" sub="live state" delay={0.15} />
              <Feature icon={<ShieldCheck className="h-4 w-4" />} label="Secure" sub="E2E encrypted" delay={0.25} />
              <Feature icon={<Zap className="h-4 w-4" />} label="Automated" sub="scenes & rules" delay={0.35} />
            </div>
          </motion.div>

          <div className="text-xs text-slate-600">© Circuvent Technologies · self-hosted control plane</div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center p-5 sm:p-8">
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            {/* Mobile brand */}
            <div className="mb-8 flex items-center gap-3 justify-center lg:hidden">
              <div
                className="h-[44px] w-[44px] rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20"
                style={{ background: "var(--cv-gradient)" }}
              >
                <Cpu className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-white font-extrabold text-xl leading-none">Circuvent</div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Device Console</div>
              </div>
            </div>

            <div className="cvlogin-card rounded-2xl border border-white/10 p-6 md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step + mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1 className="text-white text-xl font-bold mb-1">{title}</h1>
                  <p className="text-slate-400 text-sm mb-6">{subtitle}</p>
                </motion.div>
              </AnimatePresence>

              {info && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="text-sm text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2 mb-3"
                >
                  {info}
                </motion.div>
              )}

              {step === "reset" ? (
                <form onSubmit={submitReset} className="space-y-3">
                  <Field icon={<Lock className="h-4 w-4" />}>
                    <input
                      className="cv-input tracking-[0.5em] text-center text-lg"
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </Field>
                  <Field icon={<Lock className="h-4 w-4" />}>
                    <input
                      className="cv-input"
                      placeholder="New password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </Field>
                  {error && <ErrorBox msg={error} />}
                  <SubmitButton busy={busy} label="Set new password" />
                  <p className="text-xs text-slate-500">
                    Resetting your password signs out every device, so an old session
                    cannot keep access.
                  </p>
                </form>
              ) : step === "otp" ? (
                <form onSubmit={submitOtp} className="space-y-3">
                  <Field icon={<Lock className="h-4 w-4" />}>
                    <input
                      className="cv-input tracking-[0.5em] text-center text-lg"
                      placeholder="000000"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </Field>
                  {error && <ErrorBox msg={error} />}
                  <SubmitButton busy={busy} label="Verify & continue" />
                </form>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <AnimatePresence initial={false}>
                    {mode === "register" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: "hidden" }}
                      >
                        <Field icon={<UserIcon className="h-4 w-4" />}>
                          <input
                            className="cv-input"
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            required
                          />
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Field icon={<Mail className="h-4 w-4" />}>
                    <input
                      className="cv-input"
                      placeholder="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </Field>
                  <AnimatePresence initial={false}>
                    {mode !== "forgot" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: "hidden" }}
                      >
                        <Field icon={<Lock className="h-4 w-4" />}>
                          <input
                            className="cv-input"
                            placeholder="Password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            minLength={8}
                            required
                          />
                        </Field>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {mode === "login" && (
                    <div className="text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setInfo(null);
                          setPassword("");
                        }}
                        className="min-h-[44px] px-1 text-xs text-slate-400 hover:text-cyan-300 transition"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}

                  {error && <ErrorBox msg={error} />}
                  <SubmitButton
                    busy={busy}
                    label={mode === "login" ? "Sign in" : mode === "forgot" ? "Send reset code" : "Create account"}
                  />

                  {/*
                    Offered only where it can work. A passkey button that is
                    present and then fails on a browser without WebAuthn, or on
                    an insecure origin, is worse than one that was never there.
                  */}
                  {mode === "login" && passkeySupported && (
                    <>
                      <div className="flex items-center gap-3 py-1">
                        <span className="h-px flex-1 bg-white/10" />
                        <span className="text-[11px] uppercase tracking-wider text-slate-500">or</span>
                        <span className="h-px flex-1 bg-white/10" />
                      </div>
                      <button
                        type="button"
                        onClick={withPasskey}
                        disabled={passkey.busy}
                        className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:bg-white/10 disabled:opacity-60"
                      >
                        {passkey.busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        Use a passkey
                      </button>
                    </>
                  )}
                </form>
              )}

              {step === "reset" ? (
                <div className="mt-6 text-center text-sm text-slate-400">
                  <button
                    onClick={() => {
                      setStep("form");
                      setOtp("");
                      setPassword("");
                      setError(null);
                    }}
                    className="min-h-[44px] px-1 text-cyan-400 font-semibold hover:text-cyan-300 transition"
                  >
                    Send another code
                  </button>
                  <span className="mx-2 text-slate-600">·</span>
                  <button onClick={backToLogin} className="text-slate-400 hover:text-white transition">
                    Back to sign in
                  </button>
                </div>
              ) : step === "otp" ? (
                <div className="mt-6 text-center text-sm text-slate-400">
                  <button onClick={resend} className="min-h-[44px] px-1 text-cyan-400 font-semibold hover:text-cyan-300 transition">
                    Resend code
                  </button>
                  <span className="mx-2 text-slate-600">·</span>
                  <button
                    onClick={() => {
                      setStep("form");
                      setOtp("");
                      setError(null);
                      setInfo(null);
                    }}
                    className="text-slate-400 hover:text-white transition"
                  >
                    Back
                  </button>
                </div>
              ) : mode === "forgot" ? (
                <div className="mt-6 text-center text-sm text-slate-400">
                  <button onClick={backToLogin} className="min-h-[44px] px-1 text-cyan-400 font-semibold hover:text-cyan-300 transition">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <div className="mt-6 text-center text-sm text-slate-400">
                  {mode === "login" ? "New to Circuvent?" : "Already have an account?"}{" "}
                  <button
                    onClick={() => {
                      setMode(mode === "login" ? "register" : "login");
                      setError(null);
                    }}
                    className="min-h-[44px] px-1 text-cyan-400 font-semibold hover:text-cyan-300 transition"
                  >
                    {mode === "login" ? "Create an account" : "Sign in"}
                  </button>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-slate-500 mt-6">
              Self-hosted control plane · end-to-end encrypted device link
            </p>
          </motion.div>
        </div>
      </div>

      <style jsx global>{`
        .cvlogin {
          background: radial-gradient(1200px 800px at 15% -10%, #0d1b34 0%, #070b16 55%, #05070f 100%);
        }
        .cvlogin-grid {
          background-image: linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: radial-gradient(ellipse 90% 70% at 50% 30%, #000 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 30%, #000 30%, transparent 75%);
        }
        .cvlogin-orb {
          position: absolute;
          border-radius: 9999px;
          filter: blur(80px);
          opacity: 0.55;
          will-change: transform;
        }
        .cvlogin-orb-1 {
          width: 460px;
          height: 460px;
          left: -80px;
          top: -60px;
          background: radial-gradient(circle at 30% 30%, #06b6d4, transparent 70%);
          animation: cvfloat1 16s ease-in-out infinite;
        }
        .cvlogin-orb-2 {
          width: 520px;
          height: 520px;
          right: -120px;
          top: 20%;
          background: radial-gradient(circle at 70% 30%, #8b5cf6, transparent 70%);
          animation: cvfloat2 20s ease-in-out infinite;
        }
        .cvlogin-orb-3 {
          width: 380px;
          height: 380px;
          left: 30%;
          bottom: -140px;
          background: radial-gradient(circle at 50% 50%, #2563eb, transparent 70%);
          animation: cvfloat3 18s ease-in-out infinite;
        }
        .cvlogin-vignette {
          background: radial-gradient(ellipse at center, transparent 40%, rgba(3, 5, 12, 0.55) 100%);
        }
        .cvlogin-card {
          background: rgba(15, 22, 41, 0.55);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          box-shadow: 0 24px 80px -20px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        @keyframes cvfloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 30px) scale(1.08); }
        }
        @keyframes cvfloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, 40px) scale(1.1); }
        }
        @keyframes cvfloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.06); }
        }
        .cv-input {
          width: 100%;
          background: transparent;
          color: #fff;
          font-size: 15px;
          outline: none;
          border: none;
        }
        .cv-input::placeholder {
          color: #64748b;
        }
        .cv-input:-webkit-autofill,
        .cv-input:-webkit-autofill:hover,
        .cv-input:-webkit-autofill:focus,
        .cv-input:-webkit-autofill:active {
          /*
           * Chrome paints its own background on an autofilled field and will
           * not let a stylesheet set it, so on this dark glass card the two
           * inputs came back solid white with grey text in them.
           *
           * The usual counter is an inset box-shadow painted over the top --
           * but it has to be an OPAQUE colour to cover anything, and this said
           * "transparent", which paints nothing at all. So the rule was here,
           * looked like the fix, and did nothing.
           *
           * Clipping the background to the glyphs is what actually removes it,
           * and unlike an opaque shadow it keeps the field transparent, so the
           * blurred card still shows through. The 9999s transition stays as a
           * second line for older WebKit, where it is the technique that works.
           */
          -webkit-text-fill-color: #e2e8f0;
          -webkit-background-clip: text;
          background-clip: text;
          caret-color: #e2e8f0;
          transition: background-color 9999s ease-in-out 0s;
        }
        @media (prefers-reduced-motion: reduce) {
          .cvlogin-orb { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function Feature({ icon, label, sub, delay }: { icon: React.ReactNode; label: string; sub: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
    >
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">{icon}</div>
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="text-[11px] text-slate-500">{sub}</div>
    </motion.div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-3 transition focus-within:border-cyan-500/50 focus-within:bg-black/40">
      <span className="text-slate-500">{icon}</span>
      {children}
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
    >
      {msg}
    </motion.div>
  );
}

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <motion.button
      type="submit"
      disabled={busy}
      whileHover={{ scale: busy ? 1 : 1.015 }}
      whileTap={{ scale: busy ? 1 : 0.985 }}
      className="group relative w-full overflow-hidden rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition"
      style={{ background: "var(--cv-gradient)" }}
    >
      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
      {!busy && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </motion.button>
  );
}
