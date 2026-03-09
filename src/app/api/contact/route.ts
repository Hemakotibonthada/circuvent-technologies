import { NextResponse } from "next/server";

/**
 * POST /api/contact
 * 
 * Handles contact form submissions.
 * In production, this would send to an email service or CRM.
 */
export async function POST(request: Request) {
  try {
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

    // In production, you would:
    // 1. Send email via SendGrid/SES/Resend
    // 2. Create CRM entry (HubSpot, Salesforce)
    // 3. Send Slack notification
    // 4. Log to database

    // For now, log the submission
    console.log("Contact form submission:", {
      name,
      email,
      company: company || "Not specified",
      service: service || "Not specified",
      budget: budget || "Not specified",
      messageLength: message.length,
      timestamp: new Date().toISOString(),
    });

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
    console.error("Contact form error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}
