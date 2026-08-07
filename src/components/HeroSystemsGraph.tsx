"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Brain, Cpu, LineChart, HeartPulse, Building2, GraduationCap, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useMousePosition, useReducedMotion } from "@/hooks/useMousePosition";

const VB = 520;
const CORE = { x: 260, y: 258 };

interface SysNode {
  id: string;
  slug: string;
  label: string;
  short: string;
  tagline: string;
  desc: string;
  caps: string[];
  icon: LucideIcon;
  x: number;
  y: number;
  color: string;
  labelDy: number;
}

// The branches are Circuvent's six real engineering domains (src/lib/domains-data.ts),
// each linking to its own /domains/<slug> page.
const NODES: SysNode[] = [
  {
    id: "ai",
    slug: "ai",
    label: "AI & Agents",
    short: "AI & Agents",
    tagline: "Think · Learn · Act",
    desc: "Multi-agent orchestration, LLM integration, computer vision and NLP — all running local-first.",
    caps: ["Multi-Agent Orchestration", "Computer Vision", "LLM Integration"],
    icon: Brain,
    x: 260,
    y: 70,
    color: "#8b5cf6",
    labelDy: -32,
  },
  {
    id: "healthtech",
    slug: "healthtech",
    label: "HealthTech",
    short: "HealthTech",
    tagline: "AI-powered healthcare",
    desc: "Cancer-detection AI, health analytics, vitals tracking and HIPAA-aligned medical platforms.",
    caps: ["Ensemble ML Models", "Health Analytics", "Wearable Integration"],
    icon: HeartPulse,
    x: 432,
    y: 160,
    color: "#ec4899",
    labelDy: -30,
  },
  {
    id: "education",
    slug: "education",
    label: "Education & Health",
    short: "Education",
    tagline: "Learning & community",
    desc: "LMS platforms, micro-habit engines, community platforms and cross-platform consumer apps.",
    caps: ["AI-Driven Learning", "Real-Time Collaboration", "Community Platforms"],
    icon: GraduationCap,
    x: 432,
    y: 356,
    color: "#6366f1",
    labelDy: 40,
  },
  {
    id: "fintech",
    slug: "fintech",
    label: "FinTech",
    short: "FinTech",
    tagline: "Trading · Analytics · Payments",
    desc: "Quantitative trading engines, financial analytics, subscription billing and NPU-accelerated inference.",
    caps: ["Algorithmic Trading", "Financial Analytics", "Risk Management"],
    icon: LineChart,
    x: 260,
    y: 448,
    color: "#10b981",
    labelDy: 40,
  },
  {
    id: "enterprise",
    slug: "enterprise",
    label: "Enterprise",
    short: "Enterprise",
    tagline: "Business-critical platforms",
    desc: "HRMS, email infrastructure, CMS and enterprise-grade internal tooling — deployed with Docker.",
    caps: ["HRMS Platforms", "Email Infrastructure", "Docker Deployment"],
    icon: Building2,
    x: 88,
    y: 356,
    color: "#64748b",
    labelDy: 40,
  },
  {
    id: "iot",
    slug: "iot",
    label: "IoT & Smart Home",
    short: "IoT",
    tagline: "Silicon to cloud",
    desc: "ESP32 ecosystems, MQTT, sensor networks and embedded firmware for intelligent environments.",
    caps: ["Embedded Firmware", "MQTT Architecture", "OTA Updates"],
    icon: Cpu,
    x: 88,
    y: 160,
    color: "#06b6d4",
    labelDy: -30,
  },
];

const CORE_NODE = {
  id: "core",
  slug: "",
  label: "Circuvent Core",
  tagline: "AI · IoT · Full-Stack",
  desc: "One engineering core that crafts intelligent systems across six domains — from silicon to cloud.",
  caps: ["AI", "IoT", "FinTech", "HealthTech", "Enterprise", "Education"],
  color: "#8b5cf6",
};

const CYCLE = NODES.map((n) => n.id);

// Small "sub-capability" dots fanning outward from each domain node.
function leavesFor(n: SysNode) {
  const dx = n.x - CORE.x;
  const dy = n.y - CORE.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;
  const b = { x: n.x + ux * 26, y: n.y + uy * 26 };
  return [
    { x: b.x + px * 16, y: b.y + py * 16 },
    { x: b.x - px * 16, y: b.y - py * 16 },
    { x: n.x + ux * 42, y: n.y + uy * 42 },
  ];
}

export default function HeroSystemsGraph() {
  const mouse = useMousePosition();
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string>("ai");
  const [paused, setPaused] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      if (paused) return;
      idx.current = (idx.current + 1) % CYCLE.length;
      setActive(CYCLE[idx.current]);
    }, 2800);
    return () => clearInterval(t);
  }, [reduced, paused]);

  const isCore = active === "core";
  const activeInfo = isCore ? CORE_NODE : NODES.find((n) => n.id === active) || NODES[0];
  const ActiveIcon = isCore ? Brain : NODES.find((n) => n.id === active)?.icon || Brain;
  const exploreHref = isCore ? "/domains" : `/domains/${activeInfo.slug}`;

  const pick = (id: string) => setActive(id);

  return (
    <div
      className="relative mx-auto w-[min(540px,86vw)] select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-square w-full">
        <motion.div
          className="absolute inset-0"
          animate={{
            x: reduced ? 0 : mouse.normalizedX * 10,
            y: reduced ? 0 : mouse.normalizedY * 8,
          }}
          transition={{ type: "spring", stiffness: 50, damping: 30 }}
        >
          <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible" role="img" aria-label="Circuvent engineering domains">
            <defs>
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.5" />
                <stop offset="55%" stopColor="#06b6d4" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </radialGradient>
              <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            <circle cx={CORE.x} cy={CORE.y} r="150" fill="url(#coreGlow)" />

            {!reduced &&
              [0, 1].map((i) => (
                <motion.ellipse
                  key={i}
                  cx={CORE.x}
                  cy={CORE.y}
                  rx={i === 0 ? 92 : 128}
                  ry={i === 0 ? 34 : 20}
                  fill="none"
                  stroke={i === 0 ? "#8b5cf6" : "#06b6d4"}
                  strokeOpacity="0.35"
                  strokeWidth="1"
                  style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }}
                  animate={{ rotate: i === 0 ? 360 : -360 }}
                  transition={{ duration: 26 + i * 10, repeat: Infinity, ease: "linear" }}
                />
              ))}

            {/* Sub-capability leaves */}
            {NODES.map((n) => {
              const on = active === n.id;
              return leavesFor(n).map((lf, li) => (
                <g key={`${n.id}-lf-${li}`}>
                  <line x1={n.x} y1={n.y} x2={lf.x} y2={lf.y} stroke={on ? n.color : "var(--border-primary)"} strokeOpacity={on ? 0.7 : 0.4} strokeWidth="1" />
                  <circle cx={lf.x} cy={lf.y} r="3" fill={on ? n.color : "var(--text-muted)"} fillOpacity={on ? 1 : 0.55} />
                </g>
              ));
            })}

            {/* Core → domain edges with flowing data */}
            {NODES.map((n, i) => {
              const on = active === n.id;
              return (
                <g key={`edge-${n.id}`}>
                  <line x1={CORE.x} y1={CORE.y} x2={n.x} y2={n.y} stroke={on ? n.color : "var(--border-hover)"} strokeOpacity={on ? 0.9 : 0.3} strokeWidth={on ? 2 : 1} />
                  {!reduced && (
                    <motion.line
                      x1={CORE.x}
                      y1={CORE.y}
                      x2={n.x}
                      y2={n.y}
                      stroke={n.color}
                      strokeOpacity={on ? 0.9 : 0.4}
                      strokeWidth={on ? 2 : 1.4}
                      strokeDasharray="2 12"
                      strokeLinecap="round"
                      animate={{ strokeDashoffset: [0, -14] }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                    />
                  )}
                  {!reduced && (
                    <motion.circle
                      r={on ? 3.5 : 2.4}
                      fill={n.color}
                      animate={{ cx: [CORE.x, n.x], cy: [CORE.y, n.y], opacity: [0, 1, 1, 0] }}
                      transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                    />
                  )}
                </g>
              );
            })}

            {/* Domain nodes */}
            {NODES.map((n) => {
              const on = active === n.id;
              const Icon = n.icon;
              return (
                <g
                  key={n.id}
                  tabIndex={0}
                  role="button"
                  aria-label={n.label}
                  onMouseEnter={() => pick(n.id)}
                  onFocus={() => pick(n.id)}
                  onClick={() => pick(n.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      pick(n.id);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  {on && <circle cx={n.x} cy={n.y} r="30" fill={n.color} fillOpacity="0.18" filter="url(#soft)" />}
                  <motion.circle
                    cx={n.x}
                    cy={n.y}
                    r="20"
                    fill="var(--bg-surface)"
                    stroke={n.color}
                    strokeWidth={on ? 2.5 : 1.5}
                    strokeOpacity={on ? 1 : 0.6}
                    animate={{ scale: on ? 1.12 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                  />
                  <g transform={`translate(${n.x - 9}, ${n.y - 9})`} style={{ color: n.color }}>
                    <Icon width={18} height={18} />
                  </g>
                  <text
                    x={n.x}
                    y={n.y + n.labelDy}
                    textAnchor="middle"
                    className="text-[12px] font-semibold"
                    fill={on ? n.color : "var(--text-tertiary)"}
                    style={{ paintOrder: "stroke", stroke: "var(--bg-primary)", strokeWidth: 3 }}
                  >
                    {n.short}
                  </text>
                </g>
              );
            })}

            {/* Core node — the Circuvent brand mark */}
            <g
              tabIndex={0}
              role="button"
              aria-label={CORE_NODE.label}
              onMouseEnter={() => pick("core")}
              onFocus={() => pick("core")}
              onClick={() => pick("core")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick("core");
                }
              }}
              className="cursor-pointer outline-none"
            >
              <motion.circle
                cx={CORE.x}
                cy={CORE.y}
                r="34"
                fill="var(--bg-surface)"
                stroke="#8b5cf6"
                strokeWidth={isCore ? 3 : 2}
                animate={reduced ? {} : { scale: [1, 1.06, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }}
              />
              <image href="/logo-mark-160.png" x={CORE.x - 22} y={CORE.y - 22} width={44} height={44} preserveAspectRatio="xMidYMid meet" />
              <text
                x={CORE.x}
                y={CORE.y + 54}
                textAnchor="middle"
                className="text-[12px] font-bold"
                fill="var(--text-secondary)"
                style={{ paintOrder: "stroke", stroke: "var(--bg-primary)", strokeWidth: 3 }}
              >
                Circuvent
              </text>
            </g>
          </svg>
        </motion.div>
      </div>

      {/* Info card — reflects the active/hovered domain */}
      <div className="mt-3 flex justify-center sm:justify-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeInfo.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="w-[20rem] max-w-full rounded-2xl border p-4 backdrop-blur-xl"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `${activeInfo.color}22`, color: activeInfo.color }}>
                {isCore ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/logo-mark-160.png" alt="Circuvent" className="h-5 w-5 object-contain" />
                ) : (
                  <ActiveIcon className="h-[18px] w-[18px]" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {activeInfo.label}
                </p>
                <p className="truncate text-[11px] font-medium uppercase tracking-wider" style={{ color: activeInfo.color }}>
                  {activeInfo.tagline}
                </p>
              </div>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              {activeInfo.desc}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {activeInfo.caps.map((c) => (
                <span
                  key={c}
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-tertiary)", background: "var(--bg-surface)" }}
                >
                  {c}
                </span>
              ))}
            </div>
            <Link href={exploreHref} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: activeInfo.color }}>
              {isCore ? "Explore all domains" : `Explore ${activeInfo.label}`} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
