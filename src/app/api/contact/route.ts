import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { addContactMessage, flushNow } from "@/lib/store";
import { sendMail } from "@/lib/order-core";

/**
 * Per-service team routing, when it has somewhere to route to.
 *
 * These used to default to `ai@`, `iot@`, `web@`, `mobile@`, `enterprise@` and
 * `devops@` on the domain. None of those addresses exist — not as mailboxes and
 * not in the alias table — so every enquiry that named a service was CC'd to a
 * dead address and produced a bounce. A bounce our own relay has to handle, at
 * a moment when our sending reputation is under review.
 *
 * So the defaults are gone rather than invented. Set the matching TEAM_*_EMAIL
 * variable to turn routing on for a service; until then an enquiry simply goes
 * to the main contact address, which is what was actually happening anyway.
 */
function teamEmailFor(service?: string): string | undefined {
  if (!service) return undefined;
  const key = service.toLowerCase();
  const env = (n: string) => process.env[n]?.trim() || undefined;
  const map: Record<string, string | undefined> = {
    "ai-ml": env("TEAM_AI_EMAIL"),
    ai: env("TEAM_AI_EMAIL"),
    iot: env("TEAM_IOT_EMAIL"),
    web: env("TEAM_WEB_EMAIL"),
    "web-development": env("TEAM_WEB_EMAIL"),
    mobile: env("TEAM_MOBILE_EMAIL"),
    enterprise: env("TEAM_ENTERPRISE_EMAIL"),
    devops: env("TEAM_DEVOPS_EMAIL"),
    cloud: env("TEAM_DEVOPS_EMAIL"),
  };
  return map[key];
}

/**
 * POST /api/contact
 *
 * Handles contact form submissions. The message is saved for the admin and
 * emailed through the Circuvent mail server.
 */
export async function POST(request: Request) {
  try {
    // Rate limiting — 5 submissions per minute per IP
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("contact", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();

    const { name, email, company, service, budget, message } = body;

    // Validation — always run before checking service availability so callers
    // get a 400 for bad input regardless of email configuration.
    const errors: Record<string, string> = {};

    if (!name || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters.";
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please provide a valid email address.";
    }

    if (!message || message.trim().length < 20) {
      errors.message = "Message must be at least 20 characters.";
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { success: false, errors },
        { status: 400 }
      );
    }

    const team = teamEmailFor(service);
    // Persist to the store so it appears in the admin Messages panel even if
    // email delivery is unavailable.
    try {
      addContactMessage({ name, email, company, service, budget, message, team });
      await flushNow();
    } catch (e) {
      console.error("contact persist error:", e);
    }

    // Email is best-effort: the message is already captured (visible in the
    // admin Messages panel), so a delivery failure must not fail the request.
    const successResponse = NextResponse.json({
      success: true,
      message: "Thank you for your message. We'll respond within 24-48 hours.",
      data: { name, email, submittedAt: new Date().toISOString() },
    });

    const recipient = process.env.CONTACT_EMAIL || "contact@circuvent.com";
    const subject = `[Circuvent] New inquiry from ${name}${company ? ` (${company})` : ""}`;
    const html = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #06b6d4, #8b5cf6); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 20px;">New Contact Form Submission</h1>
          </div>
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px; width: 120px;">Name</td>
                <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Email</td>
                <td style="padding: 8px 0; font-size: 14px;"><a href="mailto:${email}" style="color: #0891b2;">${email}</a></td>
              </tr>
              ${company ? `<tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Company</td>
                <td style="padding: 8px 0; font-size: 14px;">${company}</td>
              </tr>` : ""}
              ${service ? `<tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Service</td>
                <td style="padding: 8px 0; font-size: 14px;">${service}</td>
              </tr>` : ""}
              ${budget ? `<tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Budget</td>
                <td style="padding: 8px 0; font-size: 14px;">${budget}</td>
              </tr>` : ""}
            </table>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.05em;">Message</p>
              <p style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${message}</p>
            </div>
            <p style="color: #94a3b8; font-size: 11px; margin-top: 24px;">
              Sent from circuvent.com contact form at ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `;

    /*
     * Sent through the shared sender, so it leaves via the Circuvent mail
     * server like everything else.
     *
     * This route used to call the Resend API directly, from
     * `onboarding@resend.dev` to a hardcoded gmail address. That sender is
     * Resend's sandbox: it can only deliver to the API key owner, so the
     * routing rules below were decorative. It also bypassed the mail server
     * entirely, which meant these sends consumed the Resend free allowance
     * without ever appearing in the outbound counts that read the mail
     * server's log.
     *
     * sendMail writes the evidence-log entry itself, which is why this route
     * no longer records one by hand.
     */
    const sent = await sendMail(recipient, subject, html, email, {
      type: "contact",
      cc: team ? [team] : undefined,
      related: email,
    });

    if (!sent) {
      console.warn(
        "Contact email could not be sent; the message is still saved for the admin."
      );
    }

    return successResponse;
  } catch (error) {
    console.error(
      "Contact form error:",
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        message: `Something went wrong: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
