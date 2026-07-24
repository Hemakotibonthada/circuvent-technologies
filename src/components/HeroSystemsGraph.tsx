"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Atom, ScanFace, Globe, Server, GitBranch, Cpu, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useMousePosition, useReducedMotion } from "@/hooks/useMousePosition";

const VB = 520;
const CORE = { x: 260, y: 258 };

interface SysNode {
  id: string;
  label: string;
  short: string;
  tagline: string;
  desc: string;
  icon: LucideIcon;
  x: number;
  y: number;
  color: string;
  labelDy: number;
  leaves: { x: number; y: number }[];
}

const NODES: SysNode[] = [
  {
    id: "biometric",
    label: "Ethical Biometric Integration",
    short: "Biometrics",
    tagline: "Face · Speech · Identity",
    desc: "Face, speech and biometric fusion with consent, on-device inference and privacy built in from the first line of code.",
    icon: ScanFace,
    x: 258,
    y: 74,
    color: "#06b6d4",
    labelDy: -34,
    leaves: [
      { x: 200, y: 40 },
      { x: 258, y: 26 },
      { x: 316, y: 40 },
    ],
  },
  {
    id: "quantum",
    label: "Quantum Entanglement Plane",
    short: "Quantum Plane",
    tagline: "Entangled coordination",
    desc: "An entanglement-inspired coordination layer that keeps satellites, edge nodes and the central AI in lock-step.",
    icon: Atom,
    x: 452,
    y: 150,
    color: "#8b5cf6",
    labelDy: 36,
    leaves: [
      { x: 498, y: 96 },
      { x: 510, y: 152 },
      { x: 496, y: 206 },
    ],
  },
  {
    id: "modeltree",
    label: "Multi-Scale Model Tree",
    short: "Model Tree",
    tagline: "Tiny → large ensembles",
    desc: "Models that branch from tiny on-device nets to large cloud ensembles, routing each request to the right scale.",
    icon: GitBranch,
    x: 450,
    y: 386,
    color: "#ec4899",
    labelDy: 36,
    leaves: [
      { x: 496, y: 352 },
      { x: 508, y: 388 },
      { x: 496, y: 424 },
      { x: 486, y: 330 },
      { x: 486, y: 446 },
    ],
  },
  {
    id: "distributed",
    label: "Distributed Edge",
    short: "Distributed Edge",
    tagline: "City-scale, ms latency",
    desc: "Compute pushed to the edge — city-scale sensing and control with millisecond latency and offline resilience.",
    icon: Server,
    x: 110,
    y: 398,
    color: "#10b981",
    labelDy: 36,
    leaves: [
      { x: 58, y: 376 },
      { x: 66, y: 432 },
      { x: 122, y: 452 },
    ],
  },
  {
    id: "edgemesh",
    label: "Global Edge Mesh",
    short: "Edge Mesh",
    tagline: "Self-healing · offline-first",
    desc: "A self-healing mesh that keeps devices synchronized worldwide, offline-first and eventually consistent.",
    icon: Globe,
    x: 74,
    y: 150,
    color: "#22d3ee",
    labelDy: -32,
    leaves: [
      { x: 36, y: 108 },
      { x: 34, y: 192 },
      { x: 116, y: 92 },
    ],
  },
];

const CORE_NODE = {
  id: "core",
  label: "Core AGI Synthesis",
  tagline: "The reasoning core",
  desc: "The reasoning core — fuses signals from every subsystem into one coordinated, self-improving intelligence.",
  color: "#8b5cf6",
};

const CYCLE = ["biometric", "quantum", "modeltree", "distributed", "edgemesh"];

export default function HeroSystemsGraph() {
  const mouse = useMousePosition();
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string>("biometric");
  const [paused, setPaused] = useState(false);
  const idx = useRef(0);

  // Idle auto-cycle so the graph feels alive when no one is interacting.
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      if (paused) return;
      idx.current = (idx.current + 1) % CYCLE.length;
      setActive(CYCLE[idx.current]);
    }, 2800);
    return () => clearInterval(t);
  }, [reduced, paused]);

  const activeInfo = active === "core" ? CORE_NODE : NODES.find((n) => n.id === active) || NODES[0];
  const ActiveIcon = active === "core" ? Cpu : (NODES.find((n) => n.id === active)?.icon || Cpu);

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
        <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full overflow-visible" role="img" aria-label="Circuvent intelligent systems architecture">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#06b6d4" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>
            <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Core aura */}
          <circle cx={CORE.x} cy={CORE.y} r="150" fill="url(#coreGlow)" />

          {/* Entanglement rings around the core */}
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

          {/* Leaf connectors + leaves */}
          {NODES.map((n) =>
            n.leaves.map((lf, li) => {
              const on = active === n.id;
              return (
                <g key={`${n.id}-lf-${li}`}>
                  <line
                    x1={n.x}
                    y1={n.y}
                    x2={lf.x}
                    y2={lf.y}
                    stroke={on ? n.color : "var(--border-primary)"}
                    strokeOpacity={on ? 0.7 : 0.4}
                    strokeWidth="1"
                  />
                  <circle cx={lf.x} cy={lf.y} r="3" fill={on ? n.color : "var(--text-muted)"} fillOpacity={on ? 1 : 0.55} />
                </g>
              );
            })
          )}

          {/* Core → subsystem edges with flowing dashes */}
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
                    strokeOpacity={on ? 0.9 : 0.45}
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
                    transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.35 }}
                  />
                )}
              </g>
            );
          })}

          {/* Subsystem nodes */}
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
                style={{ transformOrigin: `${n.x}px ${n.y}px` }}
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

          {/* Core node */}
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
              strokeWidth={active === "core" ? 3 : 2}
              animate={reduced ? {} : { scale: [1, 1.06, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: `${CORE.x}px ${CORE.y}px` }}
            />
            <g transform={`translate(${CORE.x - 13}, ${CORE.y - 13})`} style={{ color: "#8b5cf6" }}>
              <Cpu width={26} height={26} />
            </g>
            <text
              x={CORE.x}
              y={CORE.y + 52}
              textAnchor="middle"
              className="text-[12px] font-bold"
              fill="var(--text-secondary)"
              style={{ paintOrder: "stroke", stroke: "var(--bg-primary)", strokeWidth: 3 }}
            >
              Core AGI
            </text>
          </g>
        </svg>
      </motion.div>
      </div>

      {/* Info card — reflects the active/hovered node */}
      <div className="mt-3 flex justify-center sm:justify-start">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeInfo.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto w-[19rem] max-w-full rounded-2xl border p-4 backdrop-blur-xl"
            style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: `${activeInfo.color}22`, color: activeInfo.color }}
              >
                <ActiveIcon className="h-[18px] w-[18px]" />
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
            <Link
              href="/projects"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: activeInfo.color }}
            >
              Explore related work <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
