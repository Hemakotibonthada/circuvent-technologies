"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, CheckCircle, ArrowRight, Loader2 } from "lucide-react";

interface NewsletterProps {
  title?: string;
  description?: string;
  className?: string;
  variant?: "inline" | "card";
}

/**
 * Marketing consent, asked as its own question.
 *
 * Deliberately starts unticked and is never bundled with anything else, so
 * consent is a separate affirmative act rather than a condition of using the
 * site. Do not precheck it.
 */
function ConsentCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 text-left cursor-pointer"
    >
      <input
        id={id}
        name="newsletter-consent"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer rounded"
        style={{ accentColor: "var(--accent-cyan)" }}
      />
      <span
        className="text-xs leading-relaxed"
        style={{ color: "var(--text-tertiary)" }}
      >
        Yes, email me occasional engineering insights and project updates. I can
        unsubscribe at any time.
      </span>
    </label>
  );
}

export default function Newsletter({
  title = "Stay in the Loop",
  description = "Get engineering insights, project updates, and open source news delivered to your inbox.",
  className,
  variant = "card",
}: NewsletterProps) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      setStatus("error");
      return;
    }

    if (!consent) {
      setErrorMessage(
        "Please tick the box to confirm you'd like to receive these emails."
      );
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          consent,
          source:
            typeof window !== "undefined"
              ? window.location.pathname
              : "circuvent.com",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrorMessage(result.error || "Failed to subscribe. Please try again.");
        setStatus("error");
        return;
      }

      setSuccessMessage(result.message || "Check your inbox to confirm.");
      setStatus("success");
      setEmail("");
      setConsent(false);

      // Reset after 8 seconds — long enough to read the confirmation notice
      setTimeout(() => setStatus("idle"), 8000);
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  const consentInputId = `newsletter-consent-${variant}`;

  if (variant === "inline") {
    return (
      <div className={className}>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="hello@circuvent.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "error") setStatus("idle");
                }}
                leftIcon={<Mail className="w-4 h-4" />}
                error={status === "error" ? errorMessage : undefined}
              />
            </div>
            <Button
              type="submit"
              disabled={status === "loading" || status === "success" || !consent}
              className="shrink-0"
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status === "success" ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <>
                  Subscribe
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
          <ConsentCheckbox
            id={consentInputId}
            checked={consent}
            onChange={(value) => {
              setConsent(value);
              if (status === "error") setStatus("idle");
            }}
          />
          {status === "success" && (
            <p className="text-xs text-emerald-500">{successMessage}</p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 sm:p-12 ${className || ""}`}
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />

      <div className="relative z-10 max-w-xl mx-auto text-center">
        <Mail
          className="w-10 h-10 mx-auto mb-5"
          style={{ color: "var(--accent-cyan)" }}
        />
        <h3
          className="text-2xl font-bold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--text-tertiary)" }}
        >
          {description}
        </p>

        <AnimatePresence mode="wait">
          {status === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center justify-center gap-2 p-4 rounded-xl"
              style={{
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-500">
                {successMessage}
              </span>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="hello@circuvent.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    leftIcon={<Mail className="w-4 h-4" />}
                    error={status === "error" ? errorMessage : undefined}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={status === "loading" || !consent}
                  className="shrink-0 group"
                >
                  {status === "loading" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </div>
              <ConsentCheckbox
                id={consentInputId}
                checked={consent}
                onChange={(value) => {
                  setConsent(value);
                  if (status === "error") setStatus("idle");
                }}
              />
            </motion.form>
          )}
        </AnimatePresence>

        <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
          We&apos;ll email you to confirm before sending anything. No spam,
          unsubscribe at any time. Read our{" "}
          <a href="/privacy" className="underline hover:text-[var(--accent-cyan)]">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
