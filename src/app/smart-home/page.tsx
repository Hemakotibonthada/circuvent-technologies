"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import SmartHomeShowcase from "@/components/SmartHomeShowcase";
import { ShimmerText } from "@/components/AnimationEffects";
import { products, formatINR } from "@/lib/shop-data";
import { SMART_HOME_FAQS } from "@/lib/smart-home-faqs";
import ProductMedia from "@/components/shop/ProductMedia";
import {
  ArrowRight, QrCode, Wifi, CheckCircle2, Mic, Smartphone, LayoutGrid,
  Sparkles, BellRing, Gauge, Lock, Server,
} from "lucide-react";

const STEPS = [
  { icon: QrCode, title: "Scan or add", body: "Open the app, tap Add device, and scan the QR on the box — no codes to type." },
  { icon: Wifi, title: "Send Wi-Fi securely", body: "Pick your 2.4 GHz network; credentials are encrypted to the device, never exposed." },
  { icon: CheckCircle2, title: "Done in a minute", body: "The device self-provisions over TLS and appears in your app, ready to control." },
];

const APP_FEATURES = [
  { icon: Smartphone, t: "Live control", b: "Every device, one app — iOS, Android & web console." },
  { icon: Gauge, t: "Energy insights", b: "Live wattage, kWh, cost and per-device history charts." },
  { icon: LayoutGrid, t: "Rooms & scenes", b: "Group by room; one-tap scenes like Good Night." },
  { icon: BellRing, t: "Smart alerts", b: "Tank dry-run, SOS, motion & offline notifications." },
  { icon: Sparkles, t: "Themes", b: "Aurora, glassmorphism & neumorphism — your choice." },
  { icon: Lock, t: "Secure", b: "Encrypted onboarding, TLS, per-device broker keys." },
];

export default function SmartHomePage() {
  // Derived from the shop catalogue rather than a duplicated hardcoded list, so
  // new devices, price changes and artwork appear here automatically.
  const family = products.filter((p) => p.available !== false);
  const entryPrice = family.length ? Math.min(...family.map((p) => p.price)) : 0;

  return (
    <main className="relative min-h-screen overflow-hidden">

      {/* HERO */}
      <section className="relative z-10 pt-32 pb-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>Circuvent Smart Home</span>
            <h1 className="text-5xl sm:text-6xl font-black mt-4" style={{ color: "var(--text-primary)" }}>
              Your whole home,<br /><ShimmerText gradient="from-cyan-400 via-violet-400 to-pink-400">in one app.</ShimmerText>
            </h1>
            <p className="mt-6 max-w-2xl mx-auto text-lg" style={{ color: "var(--text-tertiary)" }}>
              Control every Circuvent device from your phone, the web, or your voice — in real time,
              on a control plane you own. Works with Amazon Alexa and Google Home.
            </p>
            <div className="flex flex-wrap justify-center gap-3 mt-8">
              <Link href="/shop" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white group" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                Shop devices <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/smarthome" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold" style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}>
                Open web console
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* main showcase (app + voice + device strip) */}
      <SmartHomeShowcase />

      {/* WORKS WITH ALEXA & GOOGLE */}
      <section className="relative z-10 py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="rounded-3xl p-10 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
              <Mic className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--accent-cyan)" }} />
              <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: "var(--text-primary)" }}>Just ask.</h2>
              <p className="mt-3 max-w-xl mx-auto" style={{ color: "var(--text-tertiary)" }}>
                Link your Circuvent account once in the Alexa or Google Home app, then control everything by voice.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 mt-8 text-left">
                {["“Alexa, turn on the living-room light.”", "“Hey Google, lock the front door.”", "“Alexa, set the fan to speed two.”"].map((q) => (
                  <div key={q} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>{q}</div>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>Amazon Alexa</span>
                <span className="px-4 py-2 rounded-full text-sm font-semibold" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>Google Home</span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* SETUP STEPS */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Setup</span>
              <h2 className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>Live in under a minute</h2>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <ScrollReveal key={s.title} delay={i * 0.08}>
                <div className="rounded-2xl p-6 h-full relative" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <div className="text-6xl font-black absolute top-3 right-5 opacity-10" style={{ color: "var(--text-primary)" }}>{i + 1}</div>
                  <div className="w-11 h-[44px] rounded-xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                    <s.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>{s.title}</div>
                  <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>{s.body}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* APP FEATURES */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink-text)" }}>The app</span>
              <h2 className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>Everything, beautifully in control</h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {APP_FEATURES.map((f, i) => (
              <ScrollReveal key={f.t} delay={i * 0.05}>
                <div className="rounded-2xl p-6 h-full" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <f.icon className="w-6 h-6 mb-3" style={{ color: "var(--accent-cyan)" }} />
                  <div className="font-bold" style={{ color: "var(--text-primary)" }}>{f.t}</div>
                  <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>{f.b}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* DEVICE FAMILY */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex items-end justify-between mb-10 gap-4 flex-wrap">
              <div>
                <h2 className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>The device family</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {family.length} devices, all on the same app and control plane — from {formatINR(entryPrice)}.
                </p>
              </div>
              <Link href="/shop" className="min-h-[44px] text-sm font-semibold inline-flex items-center gap-1" style={{ color: "var(--accent-cyan)" }}>Shop all <ArrowRight className="w-4 h-4" /></Link>
            </div>
          </ScrollReveal>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {family.map((d, i) => (
              <ScrollReveal key={d.id} delay={Math.min(i, 7) * 0.04}>
                <li className="h-full list-none">
                  <Link href={`/shop/${d.slug}`} className="block h-full">
                    <motion.div
                      whileHover={{ y: -4 }}
                      className="rounded-2xl h-full flex flex-col overflow-hidden"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
                    >
                      <ProductMedia
                        image={d.image}
                        accent={d.accent}
                        icon={d.icon}
                        name={d.name}
                        className="h-32 w-full"
                        iconClass="text-4xl"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                      <div className="p-5 flex flex-col flex-1">
                        <div className="font-bold leading-snug" style={{ color: "var(--text-primary)" }}>{d.name}</div>
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{d.tagline}</p>
                        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{formatINR(d.price)}</span>
                          <span className="text-xs font-semibold inline-flex items-center gap-0.5" style={{ color: "var(--accent-cyan)" }}>
                            View <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                </li>
              </ScrollReveal>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-16" aria-labelledby="smart-home-faq">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>Questions</span>
              <h2 id="smart-home-faq" className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>Good to know</h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-3">
            {SMART_HOME_FAQS.map((faq, i) => (
              <ScrollReveal key={faq.question} delay={Math.min(i, 5) * 0.05}>
                <details className="group rounded-2xl p-5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <summary className="cursor-pointer list-none marker:hidden font-semibold flex items-center justify-between gap-3" style={{ color: "var(--text-primary)" }}>
                    {faq.question}
                    <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90" style={{ color: "var(--accent-cyan)" }} />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{faq.answer}</p>
                </details>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* SELF-HOSTED */}
      <section className="relative z-10 py-16">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="rounded-3xl p-10 flex flex-col md:flex-row items-center gap-8" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
              <Server className="w-12 h-12 shrink-0" style={{ color: "var(--accent-violet)" }} />
              <div>
                <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Your cloud, your rules</h2>
                <p className="mt-2" style={{ color: "var(--text-tertiary)" }}>
                  Circuvent runs a self-hosted control plane — MQTT broker, API and web console on your own VM.
                  Sub-second commands, no third-party lock-in, and a real-time link that reflects even a physical switch flip.
                </p>
                <Link href="/architecture" className="min-h-[44px] inline-flex items-center gap-1 mt-4 text-sm font-semibold" style={{ color: "var(--accent-cyan)" }}>See the architecture <ArrowRight className="w-4 h-4" /></Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <CTASection
        title="Bring your home"
        titleHighlight="to life"
        description="Grab a Circuvent device and control it from anywhere in minutes — phone, web or voice."
        primaryCTA={{ label: "Shop devices", href: "/shop" }}
        secondaryCTA={{ label: "Talk to us", href: "/contact" }}
      />
    </main>
  );
}
