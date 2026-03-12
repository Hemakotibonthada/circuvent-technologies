"use client";

import { useRef, useMemo } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Interactive Skill Radar Chart — SVG-based radar/spider chart
 * that animates in on scroll with hover highlights.
 */

interface SkillData {
  label: string;
  value: number; // 0-100
  color?: string;
}

interface SkillRadarProps {
  skills: SkillData[];
  size?: number;
  className?: string;
  showLabels?: boolean;
  showValues?: boolean;
  animated?: boolean;
  fillGradient?: boolean;
}

export default function SkillRadar({
  skills,
  size = 400,
  className,
  showLabels = true,
  showValues = true,
  animated = true,
  fillGradient = true,
}: SkillRadarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const center = size / 2;
  const radius = size * 0.35;
  const levels = 5;
  const angleStep = (Math.PI * 2) / skills.length;

  // Generate level rings
  const levelRings = useMemo(() => {
    return Array.from({ length: levels }, (_, level) => {
      const r = (radius / levels) * (level + 1);
      const points = skills.map((_, i) => {
        const angle = angleStep * i - Math.PI / 2;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      });
      return points.join(" ");
    });
  }, [skills.length, radius, angleStep, center, levels]);

  // Generate data polygon
  const dataPoints = useMemo(() => {
    return skills.map((skill, i) => {
      const angle = angleStep * i - Math.PI / 2;
      const r = (skill.value / 100) * radius;
      return {
        x: center + r * Math.cos(angle),
        y: center + r * Math.sin(angle),
        labelX: center + (radius + 30) * Math.cos(angle),
        labelY: center + (radius + 30) * Math.sin(angle),
        angle,
        skill,
      };
    });
  }, [skills, angleStep, center, radius]);

  const polygonPoints = dataPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="mx-auto"
      >
        <defs>
          <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Level rings */}
        {levelRings.map((points, level) => (
          <motion.polygon
            key={level}
            points={points}
            fill="none"
            stroke="var(--border-primary)"
            strokeWidth="1"
            opacity={0.3 + level * 0.1}
            initial={animated ? { opacity: 0, scale: 0.5 } : undefined}
            animate={isInView ? { opacity: 0.3 + level * 0.1, scale: 1 } : undefined}
            transition={{ duration: 0.5, delay: level * 0.1 }}
            style={{ transformOrigin: `${center}px ${center}px` }}
          />
        ))}

        {/* Axis lines */}
        {skills.map((_, i) => {
          const angle = angleStep * i - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <motion.line
              key={i}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="var(--border-primary)"
              strokeWidth="1"
              opacity={0.3}
              initial={animated ? { pathLength: 0 } : undefined}
              animate={isInView ? { pathLength: 1 } : undefined}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
            />
          );
        })}

        {/* Data polygon */}
        <motion.polygon
          points={polygonPoints}
          fill={fillGradient ? "url(#radarFill)" : "rgba(6, 182, 212, 0.15)"}
          stroke="url(#radarStroke)"
          strokeWidth="2"
          filter="url(#glow)"
          initial={animated ? { opacity: 0, scale: 0.3 } : undefined}
          animate={isInView ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: `${center}px ${center}px` }}
        />

        {/* Data points */}
        {dataPoints.map((point, i) => (
          <motion.g key={i}>
            {/* Point dot */}
            <motion.circle
              cx={point.x}
              cy={point.y}
              r={5}
              fill="url(#radarStroke)"
              stroke="var(--bg-primary)"
              strokeWidth="2"
              initial={animated ? { opacity: 0, scale: 0 } : undefined}
              animate={isInView ? { opacity: 1, scale: 1 } : undefined}
              transition={{ duration: 0.3, delay: 0.8 + i * 0.08, type: "spring" }}
            />

            {/* Pulse ring */}
            <motion.circle
              cx={point.x}
              cy={point.y}
              r={5}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="1"
              initial={{ opacity: 0 }}
              animate={
                isInView
                  ? {
                      opacity: [0.6, 0],
                      r: [5, 15],
                    }
                  : undefined
              }
              transition={{
                duration: 2,
                delay: 1 + i * 0.2,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            />
          </motion.g>
        ))}

        {/* Labels */}
        {showLabels &&
          dataPoints.map((point, i) => {
            const isRight = point.labelX > center;
            const isBottom = point.labelY > center;
            return (
              <motion.text
                key={i}
                x={point.labelX}
                y={point.labelY}
                textAnchor={Math.abs(point.labelX - center) < 10 ? "middle" : isRight ? "start" : "end"}
                dominantBaseline={Math.abs(point.labelY - center) < 10 ? "middle" : isBottom ? "hanging" : "auto"}
                fill="var(--text-secondary)"
                fontSize="12"
                fontWeight="600"
                fontFamily="system-ui"
                initial={animated ? { opacity: 0 } : undefined}
                animate={isInView ? { opacity: 1 } : undefined}
                transition={{ duration: 0.3, delay: 1 + i * 0.1 }}
              >
                {point.skill.label}
                {showValues && (
                  <tspan fill="var(--text-muted)" fontSize="10" dx="4">
                    {point.skill.value}%
                  </tspan>
                )}
              </motion.text>
            );
          })}

        {/* Center dot */}
        <circle cx={center} cy={center} r={3} fill="var(--accent-cyan)" opacity={0.5} />
      </svg>
    </div>
  );
}

/**
 * Animated bar chart
 */
interface BarData {
  label: string;
  value: number;
  maxValue?: number;
  color?: string;
  gradient?: string;
}

export function AnimatedBarChart({
  bars,
  className,
  horizontal = true,
  showValues = true,
  barHeight = 32,
  animated = true,
}: {
  bars: BarData[];
  className?: string;
  horizontal?: boolean;
  showValues?: boolean;
  barHeight?: number;
  animated?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const maxValue = Math.max(...bars.map((b) => b.maxValue || b.value));

  return (
    <div ref={ref} className={`space-y-3 ${className || ""}`}>
      {bars.map((bar, i) => {
        const percentage = (bar.value / maxValue) * 100;
        return (
          <div key={bar.label} className="group">
            <div className="flex items-center justify-between mb-1">
              <span
                className="text-sm font-medium group-hover:text-[var(--accent-cyan)] transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                {bar.label}
              </span>
              {showValues && (
                <motion.span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-muted)" }}
                  initial={animated ? { opacity: 0 } : undefined}
                  animate={isInView ? { opacity: 1 } : undefined}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  {bar.value.toLocaleString()}
                </motion.span>
              )}
            </div>
            <div
              className="relative overflow-hidden rounded-full"
              style={{ height: barHeight / 3, background: "var(--border-primary)" }}
            >
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full ${
                  bar.gradient
                    ? `bg-gradient-to-r ${bar.gradient}`
                    : ""
                }`}
                style={!bar.gradient ? { background: bar.color || "var(--accent-cyan)" } : undefined}
                initial={animated ? { width: 0 } : undefined}
                animate={isInView ? { width: `${percentage}%` } : undefined}
                transition={{
                  duration: 1,
                  delay: 0.3 + i * 0.1,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
