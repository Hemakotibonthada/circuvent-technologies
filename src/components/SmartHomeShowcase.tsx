"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Smartphone, Mic, Zap, ShieldCheck, Clock, Wifi, ArrowRight } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";
import { ShimmerText } from "@/components/AnimationEffects";

const FEATURES = [
  { icon: Smartphone, title: "One app, every device", body: "Control plugs, lights, fans, locks, tanks & more from a single iOS / Android app — or the web console." },
  { icon: Zap, title: "Real-time, even manual", body: "Flip a physical switch and the app reflects it in under a second. Live state, not stale polling." },
  { icon: Mic, title: "Works with Alexa & Google", body: "Link once and control everything by voice — “turn on the living-room light”, “lock the door”." },
  { icon: Clock, title: "Scenes & schedules", body: "One-tap scenes and time automations — good-night, sunrise curtains, night-only pumps." },
  { icon: ShieldCheck, title: "Secure by design", body: "Encrypted Wi-Fi onboarding, TLS to the cloud, per-device broker credentials." },
  { icon: Wifi, title: "Self-hosted control plane", body: "Your own MQTT + API on a private VM. No third-party lock-in, sub-second commands." },
];

const DEVICES = ["🔌 Plug", "🎚️ Switch", "💡 Light", "🌀 Fan", "🔒 Lock", "🪟 Curtain", "💧 AquaGuard", "🏠 Home Hub", "⚡ Energy", "🛡️ Guardian"];

export default function SmartHomeShowcase() {
  return (
    <section className="relative z-10 py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <div className="text-center mb-14">
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Smart Home</span>
            <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
              One app. Every device. <ShimmerText gradient="from-cyan-400 via-violet-400 to-pink-400">Your voice.</ShimmerText>
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-lg" style={{ color: "var(--text-tertiary)" }}>
              The Circuvent app, web console and Alexa / Google integrations control the whole
              Circuvent device family — in real time, on your own infrastructure.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* phone mockup */}
          <ScrollReveal>
            <div className="relative flex justify-center">
              <div className="absolute inset-0 blur-3xl opacity-30" style={{ background: "radial-gradient(circle at 50% 40%, var(--accent-violet), transparent 60%)" }} />
              <motion.div
                initial={{ rotate: -4, y: 20 }}
                whileInView={{ rotate: -4, y: 0 }}
                whileHover={{ rotate: 0, scale: 1.02 }}
                transition={{ type: "spring", stiffness: 120, damping: 14 }}
                className="relative w-[260px] rounded-[2.2rem] p-3 shadow-2xl"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(20px)" }}
              >
                <div className="rounded-[1.8rem] overflow-hidden" style={{ background: "linear-gradient(160deg,#0b1024,#131a30)" }}>
                  <div className="px-5 pt-6 pb-5">
                    <div className="text-white/60 text-xs">Good evening, Hema</div>
                    <div className="text-white text-lg font-extrabold mt-0.5">Home</div>
                    <div className="mt-4 rounded-2xl p-4" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                      <div className="text-white/80 text-[10px] font-bold tracking-widest">LIVE POWER</div>
                      <div className="text-white text-3xl font-black leading-none mt-1">248 <span className="text-sm font-bold">W</span></div>
                      <div className="text-white/80 text-[11px] mt-1">6 / 9 devices online</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 mt-3">
                      {[["💡", "Light", "#f59e0b", true], ["🔒", "Front door", "#ef4444", true], ["🌀", "Fan", "#22d3ee", false], ["🪟", "Curtain", "#8b5cf6", true]].map(([g, n, c, on]) => (
                        <div key={n as string} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{g as string}</span>
                            <span className="w-7 h-4 rounded-full flex items-center px-0.5" style={{ background: on ? (c as string) : "#334155", justifyContent: on ? "flex-end" : "flex-start" }}>
                              <span className="w-3 h-3 rounded-full bg-white" />
                            </span>
                          </div>
                          <div className="text-white text-xs font-bold mt-2">{n as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </ScrollReveal>

          {/* features */}
          <div>
            <div className="grid sm:grid-cols-2 gap-4">
              {FEATURES.map((f, i) => (
                <ScrollReveal key={f.title} delay={i * 0.06}>
                  <div className="rounded-2xl p-5 h-full" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                      <f.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="font-bold" style={{ color: "var(--text-primary)" }}>{f.title}</div>
                    <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>{f.body}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <ScrollReveal delay={0.1}>
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>Works with Amazon Alexa</span>
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>Works with Google Home</span>
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>iOS &amp; Android</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <Link href="/smart-home" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold text-white group" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                  Explore the app <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/shop" className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold" style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
                  Shop devices
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </div>

        {/* device family strip */}
        <ScrollReveal delay={0.1}>
          <div className="flex flex-wrap justify-center gap-2.5 mt-14">
            {DEVICES.map((d) => (
              <span key={d} className="px-4 py-2 rounded-full text-sm font-medium" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>{d}</span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
