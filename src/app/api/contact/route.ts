import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/contact
 * 
 * Handles contact form submissions via Resend email.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        {
          success: false,
          message:
            "Email service is not configured. Please set the RESEND_API_KEY environment variable.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const { name, email, company, service, budget, message } = body;

    // Validation
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

    // Send email via Resend
    const { data, error: resendError } = await resend.emails.send({
      from: "Circuvent Contact <onboarding@resend.dev>",
      to: ["hemakotibonthada@gmail.com"],
      replyTo: email,
      subject: `[Circuvent] New inquiry from ${name}${company ? ` (${company})` : ""}`,
      html: `
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
              Sent from circuvent.tech contact form at ${new Date().toISOString()}
            </p>
          </div>
        </div>
      `,
    });

    if (resendError) {
      console.error("Resend error:", JSON.stringify(resendError, null, 2));
      return NextResponse.json(
        {
          success: false,
          message: `Failed to send email: ${resendError.message || "Unknown Resend error"}`,
        },
        { status: 500 }
      );
    }

    console.log("Contact email sent successfully:", JSON.stringify(data, null, 2));

    return NextResponse.json({
      success: true,
      message: "Thank you for your message. We'll respond within 24-48 hours.",
      data: {
        name,
        email,
        submittedAt: new Date().toISOString(),
      },
    });
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
