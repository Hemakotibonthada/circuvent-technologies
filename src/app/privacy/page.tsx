"use client";

import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import { Shield, Lock, Eye, Database, Globe, FileText, Mail, Cpu, Mic, Users } from "lucide-react";

const sections = [
  {
    icon: Database,
    title: "Information We Collect",
    content: [
      "When you visit our website, we may collect certain information automatically, including your IP address, browser type, operating system, referring URLs, and pages visited. This data helps us understand how visitors use our site and improve the user experience.",
      "If you contact us through our contact form, we collect the information you provide, including your name, email address, company name, and message content. This information is used solely to respond to your inquiry.",
      "We may also collect information when you subscribe to our newsletter, including your email address. You can unsubscribe at any time using the link provided in each email.",
    ],
  },
  {
    icon: Eye,
    title: "How We Use Your Information",
    content: [
      "We use the information we collect for the following purposes:",
      "• To provide, maintain, and improve our website and services",
      "• To respond to your inquiries and communicate with you",
      "• To send you updates about our projects and engineering insights (if you've opted in)",
      "• To analyze website usage and optimize user experience",
      "• To detect, prevent, and address technical issues or security concerns",
      "• To comply with legal obligations",
      "We do not sell, trade, or otherwise transfer your personal information to third parties. We do not use your data for targeted advertising.",
    ],
  },
  {
    icon: Lock,
    title: "Data Security",
    content: [
      "We implement industry-standard security measures to protect your information from unauthorized access, alteration, disclosure, or destruction. These measures include:",
      "• HTTPS encryption for all data in transit",
      "• Regular security audits and vulnerability assessments",
      "• Access controls and authentication for internal systems",
      "• Data minimization — we only collect what we need",
      "However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal information, we cannot guarantee its absolute security.",
    ],
  },
  {
    icon: Globe,
    title: "Cookies and Tracking",
    content: [
      "Our website uses minimal cookies and tracking technologies:",
      "• Essential cookies: Required for the website to function properly (theme preference, session management)",
      "• Analytics: We use privacy-respecting analytics to understand general usage patterns. No personal identifiers are collected or stored.",
      "We do not use third-party advertising cookies, social media tracking pixels, or cross-site tracking mechanisms.",
      "You can configure your browser to refuse all cookies or to indicate when a cookie is being sent. However, some features of our site may not function properly without cookies.",
    ],
  },
  {
    icon: Shield,
    title: "Open Source and Code Privacy",
    content: [
      "Circuvent Technologies maintains 53+ open source repositories. All code in our public repositories is freely available under the MIT License unless otherwise specified.",
      "For client projects, we maintain strict confidentiality. Client source code is never made public, shared with third parties, or used in our open source projects without explicit written consent.",
      "Our AI systems (NEXUS AI OS, JARVIS, etc.) are designed with a local-first philosophy — all AI inference runs on-device by default, ensuring no user data is sent to external servers.",
    ],
  },
  {
    icon: Cpu,
    title: "Devices, Homes and Telemetry",
    content: [
      "When you set up a Circuvent device, the control plane stores what it needs to show you your home and act on your instructions: the device's id, the name and room you give it, the state it reports (for example on/off, brightness, tank level, power draw), the commands sent to it and who sent them, and a record of when it was last seen online.",
      "Command history exists so that a house has an honest record of what happened in it. Where a home is shared with other people, an action is recorded against the person who took it — not against the account holder — precisely so that the record means something.",
      "Energy and sensor readings are kept as history so the app can show you trends. Device state is also sent, in real time, to the phones and browsers signed in to your account.",
      "Devices talk to the control plane over an encrypted MQTT connection using credentials issued to that device alone. A device you remove from your account has its broker credentials withdrawn.",
    ],
  },
  {
    icon: Lock,
    title: "Cameras, Faces and Number Plates",
    content: [
      "Some Circuvent products process images. What is kept, and for how long, differs by product, and the differences are deliberate.",
      "• FaceDoor stores a mathematical descriptor of an enrolled face — a list of numbers — and not the photograph it was computed from. The photograph is used to compute the descriptor and then discarded. A descriptor cannot be turned back into a picture of a face. Every unlock attempt, granted or refused, is recorded so the household can see who came to the door.",
      "• Number-plate recognition stores the plate read, the time and the camera. The captured image is kept for a shorter period than the reading itself, because a photograph of a gate also contains whoever was walking past and the inside of the car, and that is only useful for the short window in which somebody might dispute a specific read.",
      "• Camera video is relayed live to your own signed-in devices on request. It is not recorded to our servers as part of that relay.",
      "You can delete an enrolled face, a vehicle, or a whole device at any time from the app or the console, and the associated records go with it.",
    ],
  },
  {
    icon: Users,
    title: "Sharing a Home With Other People",
    content: [
      "You can invite other people into your home and give each of them a level of access. A member can see the devices in that home and, depending on the access you chose, control them. They cannot see or change anything about your account — not your password, not your signed-in devices, not your billing.",
      "Invitations are single-use and expire. Removing somebody ends their access immediately rather than when their session happens to expire.",
      "People you invite are told what access they have and can leave a home at any time.",
    ],
  },
  {
    icon: Mic,
    title: "Voice Assistants (Google Home and Alexa)",
    content: [
      "Linking Circuvent to Google Home or Amazon Alexa is entirely optional and is something you do yourself. Nothing is shared with either company unless you link your account.",
      "When you link, we share with that assistant only what it needs to show and control your devices: each device's id, the name and room you gave it, its type, and its current state — whether it is on, its brightness, a fan's speed, and whether it is reachable. When you speak a command, the assistant sends it to us and we pass it to your device.",
      "We do not send them your email address, your address, your other devices, your camera images, enrolled faces, number-plate reads, or your energy history.",
      "Locks, gates, cameras, number-plate cameras and drones are deliberately not exposed to voice assistants at all. A spoken command should not be able to unlock a door, open a gate, or launch an aircraft.",
      "Google and Amazon process what we send them under their own privacy policies. You can disconnect at any time from the assistant's own app, or from Settings → Account in Circuvent, and either route immediately revokes the access it was granted.",
    ],
  },
  {
    icon: FileText,
    title: "Your Rights",
    content: [
      "You have the following rights regarding your personal information:",
      "• Access: You can request a copy of the personal data we hold about you",
      "• Correction: You can request that we correct any inaccurate information",
      "• Deletion: You can request that we delete your personal information",
      "• Objection: You can object to certain processing of your data",
      "• Portability: You can request your data in a machine-readable format",
      "• Withdrawal: You can withdraw consent for data processing at any time",
      "To exercise any of these rights, please contact us at contact@circuvent.com. We will respond to your request within 30 days.",
    ],
  },
  {
    icon: Mail,
    title: "Third-Party Services",
    content: [
      "Our website may contain links to third-party websites and services. We are not responsible for the privacy practices of these external sites. We encourage you to review their privacy policies before providing any personal information.",
      "We may use the following third-party services:",
      "• GitHub: For hosting our open source repositories and project collaboration",
      "• Vercel: For website hosting and deployment",
      "• Firebase: For backend services in some of our applications (with separate privacy policies for each app)",
      "Each of these services has its own privacy policy governing the use of data on their platforms.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  const lastUpdated = "March 1, 2026";

  return (
    <>

      <PageHeader
        eyebrow="Legal"
        title="Privacy"
        titleHighlight="Policy"
        titleGradient="from-emerald-500 via-teal-500 to-cyan-500"
        description="We take your privacy seriously. This policy explains how we collect, use, and protect your information when you use our website and services."
      >
        <div
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full"
          style={{
            background: "var(--accent-cyan-muted)",
            border: "1px solid var(--border-accent)",
          }}
        >
          <Shield className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Last updated: {lastUpdated}
          </span>
        </div>
      </PageHeader>

      {/* Content */}
      <section className="relative z-10 py-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          {/* Summary Box */}
          <ScrollReveal>
            <div
              className="rounded-2xl p-8 mb-12"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                backdropFilter: "blur(24px)",
              }}
            >
              <h2
                className="text-lg font-bold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                TL;DR — Our Privacy Commitment
              </h2>
              <ul className="space-y-2">
                {[
                  "We collect minimal data — only what's needed to serve you",
                  "We never sell your data to third parties",
                  "Our AI systems run local-first — your data stays on your device",
                  "We use privacy-respecting analytics with no personal tracking",
                  "All client code and data is kept strictly confidential",
                  "You can request deletion of your data at any time",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Shield className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          {/* Sections */}
          <div className="space-y-16">
            {sections.map((section, i) => (
              <ScrollReveal key={section.title} delay={i * 0.05}>
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="p-2.5 rounded-xl"
                      style={{
                        background: "var(--accent-cyan-muted)",
                        border: "1px solid var(--border-accent)",
                      }}
                    >
                      <section.icon
                        className="w-5 h-5"
                        style={{ color: "var(--accent-cyan)" }}
                      />
                    </div>
                    <h2
                      className="text-2xl font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {section.title}
                    </h2>
                  </div>

                  <div className="space-y-4 pl-12">
                    {section.content.map((paragraph, j) => (
                      <p
                        key={j}
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Changes to Policy */}
          <ScrollReveal>
            <div
              className="mt-16 rounded-2xl p-8"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                backdropFilter: "blur(24px)",
              }}
            >
              <h2
                className="text-lg font-bold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                Changes to This Policy
              </h2>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: "var(--text-tertiary)" }}
              >
                We may update this privacy policy from time to time. We will notify
                you of any changes by posting the new policy on this page and updating
                the &ldquo;Last updated&rdquo; date. We encourage you to review this policy
                periodically for any changes.
              </p>
              <p
                className="text-sm"
                style={{ color: "var(--text-tertiary)" }}
              >
                For questions about this policy, please contact us at{" "}
                <a
                  href="mailto:contact@circuvent.com"
                  className="underline hover:text-[var(--accent-cyan)]"
                  style={{ color: "var(--accent-cyan-text)" }}
                >
                  contact@circuvent.com
                </a>
                .
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
