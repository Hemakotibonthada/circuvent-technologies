"use client";

import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import SmartHomeShowcase from "@/components/SmartHomeShowcase";
import { ShimmerText } from "@/components/AnimationEffects";
import { Sparkles, Bell, Gauge, LayoutGrid, ShieldCheck, Wifi } from "lucide-react";

/** "Get it on Google Play" style badge (link works once the listing is public). */
function PlayBadge({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 rounded-xl px-5 py-2.5 bg-black hover:bg-black/85 transition" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
      <svg width="24" height="26" viewBox="0 0 512 512" aria-hidden="true"><path fill="#00d0ff" d="M47 20 300 256 47 492c-10-6-16-17-16-30V50c0-13 6-24 16-30z"/><path fill="#00f076" d="M47 20c4-2 9-3 14-3 8 0 16 3 24 7l232 132-73 73L47 20z"/><path fill="#ffce00" d="M406 210c22 12 22 80 0 92l-62 35-73-73 73-73 62 19z"/><path fill="#ff3b30" d="M47 492 244 302l73 73L109 508c-8 4-16 7-24 7-15 0-29-9-38-23z" opacity="0.9"/></svg>
      <span className="text-left leading-tight"><span className="block text-[10px] text-white/70">GET IT ON</span><span className="block text-white font-semibold text-lg -mt-0.5">Google Play</span></span>
    </a>
  );
}
function AppleBadge({ soon }: { soon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 rounded-xl px-5 py-2.5 bg-black ${soon ? "opacity-60" : ""}`} style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
      <svg width="22" height="26" viewBox="0 0 384 512" fill="#fff" aria-hidden="true"><path d="M318 268c-1-58 47-86 49-87-27-39-68-44-83-45-35-4-69 21-87 21-18 0-45-20-74-20-38 1-73 22-93 56-40 69-10 171 28 227 19 27 41 58 70 57 28-1 39-18 73-18s44 18 74 17c30-1 49-28 67-55 21-31 30-61 30-63-1-1-58-22-59-88zM262 84c15-19 26-45 23-71-22 1-49 15-65 34-14 16-27 43-24 68 25 2 50-13 66-31z"/></svg>
      <span className="text-left leading-tight"><span className="block text-[10px] text-white/70">{soon ? "COMING SOON" : "Download on the"}</span><span className="block text-white font-semibold text-lg -mt-0.5">App Store</span></span>
    </span>
  );
}

const HIGHLIGHTS = [
  { icon: LayoutGrid, t: "Dashboard & rooms", b: "Favorites, quick actions, scene shortcuts and room grouping." },
  { icon: Gauge, t: "Energy", b: "Live power gauge, kWh, cost and per-device history charts." },
  { icon: Bell, t: "Notifications", b: "Real-time alerts for tanks, SOS, motion and offline devices." },
  { icon: Sparkles, t: "Themes", b: "Aurora, glassmorphism & neumorphism with 7 accent colours." },
  { icon: ShieldCheck, t: "Secure onboarding", b: "Encrypted Wi-Fi handoff + QR scan, TLS to your control plane." },
  { icon: Wifi, t: "Real-time", b: "Physical switch flips show in the app in under a second." },
];

export default function AppPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">

      <section className="relative z-10 pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>The Circuvent App</span>
            <h1 className="text-5xl sm:text-6xl font-black mt-4" style={{ color: "var(--text-primary)" }}>
              Control everything, <ShimmerText gradient="from-cyan-400 via-violet-400 to-pink-400">everywhere.</ShimmerText>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg" style={{ color: "var(--text-tertiary)" }}>
              The Circuvent app for iOS &amp; Android puts your whole smart home in one place — real-time
              control, energy insights, scenes, and voice via Alexa &amp; Google.
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4 mt-8">
              <PlayBadge href="https://play.google.com/store/apps/details?id=com.circuvent.app" />
              <AppleBadge soon />
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>Android available now (testing) · iOS coming soon</p>
          </ScrollReveal>
        </div>
      </section>

      <SmartHomeShowcase />

      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink-text)" }}>Highlights</span>
              <h2 className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>Built for daily life</h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {HIGHLIGHTS.map((f, i) => (
              <ScrollReveal key={f.t} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <f.icon className="w-6 h-6 mb-3" style={{ color: "var(--accent-cyan)" }} />
                  <div className="font-bold" style={{ color: "var(--text-primary)" }}>{f.t}</div>
                  <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>{f.b}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
          <ScrollReveal delay={0.1}>
            <div className="flex flex-wrap justify-center items-center gap-4 mt-12">
              <PlayBadge href="https://play.google.com/store/apps/details?id=com.circuvent.app" />
              <AppleBadge soon />
            </div>
          </ScrollReveal>
        </div>
      </section>

      <CTASection
        title="Get the"
        titleHighlight="Circuvent app"
        description="Pair a device and control your home from your pocket in minutes."
        primaryCTA={{ label: "Shop devices", href: "/shop" }}
        secondaryCTA={{ label: "See the smart home", href: "/smart-home" }}
      />
    </main>
  );
}
