/**
 * Can this deployment actually deliver mail?
 *
 * Every notification path in the product — order confirmations, OTPs, incident
 * pages — ends in `sendMail`, which sends over SMTP to the Circuvent mail
 * server. When that is misconfigured `sendMail` returns false, writes a line to
 * the log, and the product carries on looking healthy. That is the failure this
 * module exists to make visible.
 *
 * ── There is deliberately no second transport ──
 *
 * `sendMail` used to fall back to the Resend API directly, and this module
 * reported on it. Both are gone. That fallback sent from `onboarding@resend.dev`
 * — Resend's sandbox sender, which refuses every recipient except the API key
 * owner — so it could not deliver to a customer, and because it bypassed the
 * mail server its sends never appeared in the outbound counts that read the
 * mail server's log. The mail server already relays through Resend using our
 * own authenticated domain, so routing everything through it loses no
 * redundancy. Reporting a fallback that no longer exists would be worse than
 * reporting nothing, so `verdict` is now simply whether SMTP works.
 *
 * ── On the host name ──
 *
 * Circuvent runs its own Postfix/Dovecot stack. Its submission service is
 * `mx.circuvent.com` — which is what the domain's MX record points at, and
 * which answers on 587 with `220 mx.circuvent.com ESMTP Circuvent Mail`.
 *
 * `mail.circuvent.com` is the *webmail application*, and resolves to the web
 * host. Pointing SMTP_HOST at it — which the mail server's own `.env.example`
 * suggests — connects to a website and times out. That is worth stating in
 * code, because the symptom is a timeout with no explanation and the two names
 * differ by three characters.
 *
 * SERVER ONLY.
 */

import nodemailer from "nodemailer";

export type MailVerdict = "ok" | "degraded" | "broken";

export interface TransportReport {
  /** Whether enough configuration exists to try at all. */
  configured: boolean;
  ok: boolean;
  /** Short, human-readable reason when `ok` is false. */
  problem: string;
  /** What to do about it, when that is knowable. */
  advice: string;
}

export interface MailHealth {
  verdict: MailVerdict;
  /** One sentence, suitable for a banner. */
  summary: string;
  smtp: TransportReport & {
    host: string;
    port: number;
    user: string;
    /** True when the host looks like a webmail front-end rather than a relay. */
    suspectHost: boolean;
  };
  from: string;
  checkedAt: string;
}

/** Hosts that serve the webmail UI and do not accept submission. */
const WEBMAIL_HOSTS = ["mail.circuvent.com", "webmail.circuvent.com"];

/**
 * Classifies a nodemailer failure.
 *
 * The distinction that matters is authentication versus reachability: one is a
 * wrong password and the other is a wrong host or a blocked port, and they are
 * fixed by different people. The raw error says `EAUTH` or `ETIMEDOUT` in a
 * field nobody reads.
 */
function describeSmtpError(e: unknown): { problem: string; advice: string } {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const code = err?.code ?? "";
  const message = err?.message ?? String(e);

  if (code === "EAUTH" || err?.responseCode === 535) {
    return {
      problem: "The mail server rejected the credentials.",
      advice:
        "SMTP_USER and SMTP_PASS do not match a mailbox on SMTP_HOST. " +
        "Check the password, and that the mailbox exists on that server.",
    };
  }
  if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNREFUSED") {
    return {
      problem: "The mail server could not be reached.",
      advice:
        "Check SMTP_HOST and SMTP_PORT. Circuvent's submission service is " +
        "mx.circuvent.com:587 — mail.circuvent.com is the webmail app and will time out.",
    };
  }
  if (code === "EDNS" || code === "ENOTFOUND") {
    return {
      problem: "The mail host does not resolve.",
      advice: "SMTP_HOST is not a real hostname. Check for a typo or a stray newline.",
    };
  }
  return { problem: message.slice(0, 200), advice: "See the server log for the full error." };
}

/**
 * Tests the configured transports without sending anything.
 *
 * `verify()` opens the connection and completes the SASL handshake, so it
 * proves the credential — a check that only looked at whether the variables
 * were set would have passed happily on the broken configuration above.
 */
export async function checkMailHealth(timeoutMs = 8000): Promise<MailHealth> {
  const checkedAt = new Date().toISOString();
  const host = process.env.SMTP_HOST?.trim() ?? "";
  const port = Number(String(process.env.SMTP_PORT || 587).trim());
  const user = process.env.SMTP_USER?.trim() ?? "";
  const pass = process.env.SMTP_PASS?.trim() ?? "";
  const from = process.env.EMAIL_FROM?.trim() || (user ? `Circuvent <${user}>` : "");

  const suspectHost = WEBMAIL_HOSTS.includes(host.toLowerCase());

  const smtp: MailHealth["smtp"] = {
    configured: !!(host && user && pass),
    ok: false,
    problem: "",
    advice: "",
    host,
    port,
    user,
    suspectHost,
  };

  if (!smtp.configured) {
    smtp.problem = "SMTP is not configured.";
    smtp.advice = "Set SMTP_HOST, SMTP_USER and SMTP_PASS to a mailbox on mx.circuvent.com.";
  } else if (suspectHost) {
    /* Reported without dialling: the connection would simply hang until the
       timeout, and "timed out" is a much worse answer than naming the mistake. */
    smtp.problem = `${host} is the webmail application, not the mail server.`;
    smtp.advice = "Use mx.circuvent.com — that is what the domain's MX record points at.";
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE).trim() === "true",
        auth: { user, pass },
        requireTLS: true,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
      });
      await transporter.verify();
      smtp.ok = true;
      transporter.close();
    } catch (e) {
      const { problem, advice } = describeSmtpError(e);
      smtp.problem = problem;
      smtp.advice = advice;
    }
  }

  const verdict: MailVerdict = smtp.ok ? "ok" : "broken";
  const summary = smtp.ok
    ? `Mail is being delivered through ${host}.`
    : `Mail is not being delivered. ${smtp.problem}`.trim();

  return { verdict, summary, smtp, from, checkedAt };
}
