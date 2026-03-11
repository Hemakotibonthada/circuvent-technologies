"use client";

import { useState, useRef, useEffect, useCallback, useMemo, useId } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import {
  BarChart3, PieChart, Activity, TrendingUp as TrendingUpIcon,
  GitBranch, GitCommit, Calendar, Clock, Users, Star,
  ArrowUpRight, ArrowDownRight, Minus, Eye, Download,
  ChevronLeft, ChevronRight, Maximize2,
} from "lucide-react";

// ============================================================================
// ANIMATED DONUT CHART
// ============================================================================

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface AnimatedDonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  animationDuration?: number;
  showLabels?: boolean;
  showCenter?: boolean;
  centerLabel?: string;
  centerValue?: string;
  className?: string;
}

export function AnimatedDonutChart({
  segments,
  size = 240,
  strokeWidth = 24,
  animationDuration = 1500,
  showLabels = true,
  showCenter = true,
  centerLabel = "Total",
  centerValue,
  className = "",
}: AnimatedDonutChartProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const total = useMemo(() => segments.reduce((sum, s) => sum + s.value, 0), [segments]);
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  let cumulativePercent = 0;

  return (
    <div ref={ref} className={`relative inline-flex flex-col items-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {segments.map((segment, i) => {
          const percent = segment.value / total;
          const dashLength = circumference * percent;
          const dashOffset = circumference * cumulativePercent;
          const isHovered = hoveredIndex === i;
          cumulativePercent += percent;

          return (
            <motion.circle
              key={segment.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={-dashOffset}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={isVisible ? {
                strokeDasharray: `${dashLength} ${circumference - dashLength}`,
              } : {}}
              transition={{
                duration: animationDuration / 1000,
                delay: i * 0.15,
                ease: "easeOut",
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-all duration-200"
              style={{ filter: isHovered ? `drop-shadow(0 0 8px ${segment.color})` : "none" }}
            />
          );
        })}
      </svg>

      {/* Center text */}
      {showCenter && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            {hoveredIndex !== null ? (
              <motion.div
                key={`hovered-${hoveredIndex}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-center"
              >
                <div className="text-2xl font-bold" style={{ color: segments[hoveredIndex].color }}>
                  {((segments[hoveredIndex].value / total) * 100).toFixed(1)}%
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {segments[hoveredIndex].label}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="default"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                  {centerValue || total}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {centerLabel}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Labels */}
      {showLabels && (
        <div className="flex flex-wrap gap-3 mt-6 justify-center">
          {segments.map((segment, i) => (
            <motion.div
              key={segment.label}
              className="flex items-center gap-2 text-xs cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              whileHover={{ scale: 1.05 }}
              initial={{ opacity: 0, y: 10 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1 + 0.5 }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              <span style={{ color: hoveredIndex === i ? segment.color : "var(--text-tertiary)" }}>
                {segment.label}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// AREA CHART
// ============================================================================

interface DataPoint {
  label: string;
  value: number;
}

interface AreaChartProps {
  data: DataPoint[];
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  height?: number;
  showGrid?: boolean;
  showDots?: boolean;
  showValues?: boolean;
  animated?: boolean;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function AnimatedAreaChart({
  data,
  color = "#06b6d4",
  gradientFrom = "#06b6d4",
  gradientTo = "transparent",
  height = 240,
  showGrid = true,
  showDots = true,
  showValues = false,
  animated = true,
  className = "",
  title,
  subtitle,
}: AreaChartProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const svgWidth = 600;
  const svgHeight = height;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)) * 1.1, [data]);
  const minValue = useMemo(() => Math.min(...data.map((d) => d.value)) * 0.9, [data]);
  const range = maxValue - minValue;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => {
    return data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartWidth,
      y: padding.top + chartHeight - ((d.value - minValue) / range) * chartHeight,
      ...d,
    }));
  }, [data, chartWidth, chartHeight, padding, minValue, range]);

  const linePath = useMemo(() => {
    if (points.length === 0) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
      const cpy1 = prev.y;
      const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
      const cpy2 = curr.y;
      path += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${curr.x} ${curr.y}`;
    }
    return path;
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return "";
    const bottom = padding.top + chartHeight;
    return `${linePath} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`;
  }, [linePath, points, chartHeight, padding]);

  const gridLines = useMemo(() => {
    const lines: number[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      lines.push(minValue + (range / steps) * i);
    }
    return lines;
  }, [minValue, range]);

  const gradientId = useId();

  return (
    <div ref={ref} className={`relative ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {title}
            </h4>
          )}
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={gradientFrom} stopOpacity="0.3" />
            <stop offset="100%" stopColor={gradientTo || gradientFrom} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {showGrid && gridLines.map((val, i) => {
          const y = padding.top + chartHeight - ((val - minValue) / range) * chartHeight;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={svgWidth - padding.right}
                y2={y}
                stroke="var(--border-primary)"
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--text-muted)"
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Area */}
        <motion.path
          d={areaPath}
          fill={`url(#${gradientId})`}
          initial={animated ? { opacity: 0 } : {}}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ duration: 1, delay: 0.3 }}
        />

        {/* Line */}
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animated ? { pathLength: 0 } : {}}
          animate={isVisible ? { pathLength: 1 } : {}}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />

        {/* Dots */}
        {showDots && points.map((point, i) => (
          <g key={`dot-${i}`}>
            <motion.circle
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === i ? 6 : 4}
              fill={color}
              stroke="var(--bg-primary)"
              strokeWidth="2"
              initial={animated ? { scale: 0 } : {}}
              animate={isVisible ? { scale: 1 } : {}}
              transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer"
            />
            {/* Tooltip */}
            {hoveredIndex === i && (
              <g>
                <rect
                  x={point.x - 30}
                  y={point.y - 35}
                  width="60"
                  height="24"
                  rx="6"
                  fill="var(--bg-elevated)"
                  stroke="var(--border-primary)"
                  strokeWidth="1"
                />
                <text
                  x={point.x}
                  y={point.y - 20}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={color}
                >
                  {point.value}
                </text>
              </g>
            )}
          </g>
        ))}

        {/* X-axis labels */}
        {points.map((point, i) => (
          <text
            key={`label-${i}`}
            x={point.x}
            y={svgHeight - 8}
            textAnchor="middle"
            fontSize="10"
            fill="var(--text-muted)"
          >
            {point.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ============================================================================
// LIVE STATS DASHBOARD WIDGET
// ============================================================================

interface StatItem {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  color?: string;
  sparkline?: number[];
}

interface LiveStatsDashboardProps {
  stats: StatItem[];
  title?: string;
  className?: string;
  columns?: 2 | 3 | 4;
}

function MiniSparkline({ data, color = "#06b6d4", width = 60, height = 24 }: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5 }}
      />
    </svg>
  );
}

export function LiveStatsDashboard({
  stats,
  title = "Live Stats",
  className = "",
  columns = 4,
}: LiveStatsDashboardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const colClass = columns === 2 ? "grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div ref={ref} className={className}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h4>
        </div>
      )}
      <div className={`grid ${colClass} gap-3`}>
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.1 }}
            className="relative overflow-hidden rounded-xl p-4"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </div>
              {stat.icon && (
                <div className="p-1.5 rounded-lg" style={{ background: "var(--accent-cyan-muted)" }}>
                  {stat.icon}
                </div>
              )}
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xl font-bold" style={{ color: stat.color || "var(--text-primary)" }}>
                  {stat.value}
                </div>
                {stat.change !== undefined && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${
                    stat.change > 0 ? "text-emerald-500" : stat.change < 0 ? "text-red-500" : "text-gray-500"
                  }`}>
                    {stat.change > 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : stat.change < 0 ? (
                      <ArrowDownRight className="w-3 h-3" />
                    ) : (
                      <Minus className="w-3 h-3" />
                    )}
                    {Math.abs(stat.change)}%
                  </div>
                )}
              </div>
              {stat.sparkline && (
                <MiniSparkline data={stat.sparkline} color={stat.color || "#06b6d4"} />
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// GITHUB CONTRIBUTION GRAPH
// ============================================================================

interface ContributionDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GitHubContributionGraphProps {
  data?: ContributionDay[];
  generateRandom?: boolean;
  weeks?: number;
  className?: string;
  colorScheme?: string[];
}

function generateRandomContributions(weeks: number): ContributionDay[] {
  const contributions: ContributionDay[] = [];
  const today = new Date("2026-03-09"); // Fixed date for SSR consistency
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - weeks * 7);

  // Deterministic pseudo-random based on day index
  let seed = 42;
  const nextRand = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  let dayIndex = 0;
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const rand = nextRand();
    let level: 0 | 1 | 2 | 3 | 4;
    let count: number;

    if (rand < 0.25) {
      level = 0; count = 0;
    } else if (rand < 0.5) {
      level = 1; count = Math.floor(nextRand() * 3) + 1;
    } else if (rand < 0.75) {
      level = 2; count = Math.floor(nextRand() * 5) + 4;
    } else if (rand < 0.92) {
      level = 3; count = Math.floor(nextRand() * 8) + 9;
    } else {
      level = 4; count = Math.floor(nextRand() * 10) + 17;
    }

    contributions.push({
      date: new Date(d).toISOString().split("T")[0],
      count,
      level,
    });
    dayIndex++;
  }

  return contributions;
}

export function GitHubContributionGraph({
  data,
  generateRandom = true,
  weeks = 52,
  className = "",
  colorScheme = [
    "var(--bg-surface-hover)",
    "#0e4429",
    "#006d32",
    "#26a641",
    "#39d353",
  ],
}: GitHubContributionGraphProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<ContributionDay | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const contributions = useMemo(() => {
    if (data) return data;
    if (generateRandom) return generateRandomContributions(weeks);
    return [];
  }, [data, generateRandom, weeks]);

  const totalContributions = useMemo(() => contributions.reduce((sum, d) => sum + d.count, 0), [contributions]);
  const maxStreak = useMemo(() => {
    let streak = 0;
    let maxS = 0;
    for (const d of contributions) {
      if (d.count > 0) {
        streak++;
        maxS = Math.max(maxS, streak);
      } else {
        streak = 0;
      }
    }
    return maxS;
  }, [contributions]);

  // Organize into weeks
  const weekData = useMemo(() => {
    const w: ContributionDay[][] = [];
    let currentWeek: ContributionDay[] = [];

    for (let i = 0; i < contributions.length; i++) {
      currentWeek.push(contributions[i]);
      if (currentWeek.length === 7) {
        w.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) w.push(currentWeek);
    return w;
  }, [contributions]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const cellSize = 12;
  const cellGap = 3;
  const dayNames = ["", "Mon", "", "Wed", "", "Fri", ""];

  return (
    <div ref={ref} className={className}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {totalContributions.toLocaleString()} contributions in the last year
          </h4>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>🔥 {maxStreak} day streak</span>
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <div className="flex gap-0.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 mr-1" style={{ width: 28 }}>
            {dayNames.map((day, i) => (
              <div
                key={i}
                className="text-[9px] flex items-center justify-end pr-1"
                style={{ height: cellSize, color: "var(--text-muted)" }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Grid */}
          {weekData.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.5">
              {week.map((day, di) => (
                <motion.div
                  key={day.date}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: wi * 0.01 + di * 0.005, duration: 0.2 }}
                  className="rounded-sm cursor-pointer transition-all duration-100 hover:ring-1 hover:ring-white/30"
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: colorScheme[day.level],
                  }}
                  onMouseEnter={(e) => {
                    setHoveredDay(day);
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const parentRect = ref.current?.getBoundingClientRect();
                    if (parentRect) {
                      setTooltipPos({
                        x: rect.left - parentRect.left + cellSize / 2,
                        y: rect.top - parentRect.top - 8,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Tooltip */}
        <AnimatePresence>
          {hoveredDay && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute pointer-events-none z-20 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.y,
                transform: "translate(-50%, -100%)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <strong>{hoveredDay.count} contributions</strong> on {hoveredDay.date}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1 mt-3">
        <span className="text-[10px] mr-1" style={{ color: "var(--text-muted)" }}>Less</span>
        {colorScheme.map((color, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: color }}
          />
        ))}
        <span className="text-[10px] ml-1" style={{ color: "var(--text-muted)" }}>More</span>
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED PROGRESS RINGS
// ============================================================================

interface ProgressRing {
  label: string;
  value: number;
  max: number;
  color: string;
  icon?: React.ReactNode;
}

interface ProgressRingsProps {
  rings: ProgressRing[];
  size?: number;
  className?: string;
}

export function AnimatedProgressRings({
  rings,
  size = 160,
  className = "",
}: ProgressRingsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const center = size / 2;

  return (
    <div ref={ref} className={`inline-flex flex-col items-center gap-4 ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((ring, i) => {
          const strokeWidth = 8;
          const gap = 14;
          const radius = center - strokeWidth / 2 - i * gap;
          const circumference = 2 * Math.PI * radius;
          const percent = ring.value / ring.max;

          return (
            <g key={ring.label}>
              {/* Background */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="var(--border-primary)"
                strokeWidth={strokeWidth}
                opacity="0.3"
              />
              {/* Progress */}
              <motion.circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${circumference * percent} ${circumference * (1 - percent)}`}
                strokeDashoffset={circumference * 0.25}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={isVisible ? {
                  strokeDasharray: `${circumference * percent} ${circumference * (1 - percent)}`,
                } : {}}
                transition={{ duration: 1.5, delay: i * 0.2, ease: "easeOut" }}
                style={{ filter: `drop-shadow(0 0 4px ${ring.color}40)` }}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 justify-center">
        {rings.map((ring, i) => (
          <motion.div
            key={ring.label}
            className="flex items-center gap-2 text-xs"
            initial={{ opacity: 0, y: 10 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5 + i * 0.1 }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ring.color }} />
            <span style={{ color: "var(--text-tertiary)" }}>
              {ring.label}: {ring.value}/{ring.max}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// HEAT MAP
// ============================================================================

interface HeatMapData {
  row: string;
  col: string;
  value: number;
}

interface HeatMapProps {
  data: HeatMapData[];
  rows: string[];
  cols: string[];
  colorScale?: string[];
  cellSize?: number;
  className?: string;
  title?: string;
}

export function AnimatedHeatMap({
  data,
  rows,
  cols,
  colorScale = ["#0f172a", "#0e4429", "#006d32", "#26a641", "#39d353"],
  cellSize = 40,
  className = "",
  title,
}: HeatMapProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<HeatMapData | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const maxValue = useMemo(() => Math.max(...data.map((d) => d.value)), [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getColor = (value: number): string => {
    const ratio = value / maxValue;
    const index = Math.min(Math.floor(ratio * (colorScale.length - 1)), colorScale.length - 1);
    return colorScale[index];
  };

  const getValue = (row: string, col: string): number => {
    const cell = data.find((d) => d.row === row && d.col === col);
    return cell?.value || 0;
  };

  return (
    <div ref={ref} className={className}>
      {title && (
        <h4 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          {title}
        </h4>
      )}
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Column headers */}
          <div className="flex ml-16">
            {cols.map((col) => (
              <div
                key={col}
                className="text-[10px] font-mono text-center truncate"
                style={{ width: cellSize, color: "var(--text-muted)" }}
              >
                {col}
              </div>
            ))}
          </div>

          {/* Rows */}
          {rows.map((row, ri) => (
            <div key={row} className="flex items-center">
              <div
                className="text-[10px] font-mono text-right pr-2 truncate"
                style={{ width: 64, color: "var(--text-muted)" }}
              >
                {row}
              </div>
              {cols.map((col, ci) => {
                const value = getValue(row, col);
                return (
                  <motion.div
                    key={`${row}-${col}`}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: (ri * cols.length + ci) * 0.01 }}
                    className="cursor-pointer rounded-sm transition-transform hover:scale-110 hover:z-10"
                    style={{
                      width: cellSize - 2,
                      height: cellSize - 2,
                      margin: 1,
                      backgroundColor: getColor(value),
                    }}
                    onMouseEnter={() => setHoveredCell({ row, col, value })}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredCell && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-xs font-mono px-3 py-1.5 rounded-lg inline-block"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            {hoveredCell.row} × {hoveredCell.col}: <strong>{hoveredCell.value}</strong>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED NUMBER TICKER
// ============================================================================

interface NumberTickerProps {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function NumberTicker({
  value,
  duration = 2000,
  format,
  className = "",
  prefix = "",
  suffix = "",
  decimals = 0,
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const startTime = Date.now();
    const startValue = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (value - startValue) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, value, duration]);

  const formatted = format
    ? format(displayValue)
    : displayValue.toFixed(decimals);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
}

// ============================================================================
// ANIMATED GAUGE
// ============================================================================

interface GaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function AnimatedGauge({
  value,
  max = 100,
  size = 160,
  strokeWidth = 12,
  color = "#06b6d4",
  label,
  showValue = true,
  className = "",
}: GaugeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const center = size / 2;
  const radius = center - strokeWidth;
  // Semi-circle (180 degrees)
  const arcLength = Math.PI * radius;
  const percent = Math.min(value / max, 1);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;

  const bgPath = `M ${center + radius * Math.cos(startAngle)} ${center + radius * Math.sin(startAngle)} A ${radius} ${radius} 0 1 1 ${center + radius * Math.cos(endAngle)} ${center + radius * Math.sin(endAngle)}`;

  return (
    <div ref={ref} className={`relative inline-flex flex-col items-center ${className}`}>
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Background arc */}
        <path
          d={bgPath}
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        <motion.path
          d={bgPath}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={arcLength * (1 - percent)}
          initial={{ strokeDashoffset: arcLength }}
          animate={isVisible ? { strokeDashoffset: arcLength * (1 - percent) } : {}}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />

        {/* Tick marks */}
        {Array.from({ length: 11 }).map((_, i) => {
          const angle = startAngle + (endAngle - startAngle) * (i / 10);
          const innerR = radius - strokeWidth / 2 - 4;
          const outerR = radius - strokeWidth / 2 - 8;
          return (
            <line
              key={i}
              x1={Math.round((center + innerR * Math.cos(angle)) * 1000) / 1000}
              y1={Math.round((center + innerR * Math.sin(angle)) * 1000) / 1000}
              x2={Math.round((center + outerR * Math.cos(angle)) * 1000) / 1000}
              y2={Math.round((center + outerR * Math.sin(angle)) * 1000) / 1000}
              stroke="var(--text-muted)"
              strokeWidth="1"
              opacity="0.3"
            />
          );
        })}
      </svg>

      {showValue && (
        <div className="absolute bottom-0 text-center">
          <div className="text-2xl font-bold" style={{ color }}>
            <NumberTicker value={value} suffix={`/${max}`} />
          </div>
          {label && (
            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TREE MAP
// ============================================================================

interface TreeMapItem {
  label: string;
  value: number;
  color: string;
  children?: TreeMapItem[];
}

interface TreeMapProps {
  data: TreeMapItem[];
  width?: number;
  height?: number;
  className?: string;
}

export function AnimatedTreeMap({
  data,
  width = 600,
  height = 300,
  className = "",
}: TreeMapProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<TreeMapItem | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // Simple squarified treemap layout
  const rects = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const result: Array<TreeMapItem & { x: number; y: number; w: number; h: number }> = [];

    let x = 0;
    let y = 0;
    let remainingWidth = width;
    let remainingHeight = height;
    let isHorizontal = true;

    for (const item of sorted) {
      const ratio = item.value / total;

      if (isHorizontal) {
        const w = remainingWidth * ratio * (height / remainingHeight);
        const clampedW = Math.min(w, remainingWidth);
        result.push({ ...item, x, y, w: clampedW, h: remainingHeight });
        x += clampedW;
        remainingWidth -= clampedW;
        if (remainingWidth < width * 0.15) {
          isHorizontal = false;
          x = 0;
          remainingWidth = width;
        }
      } else {
        const h = remainingHeight * ratio * (width / remainingWidth);
        const clampedH = Math.min(h, remainingHeight);
        result.push({ ...item, x, y, w: remainingWidth, h: clampedH });
        y += clampedH;
        remainingHeight -= clampedH;
      }
    }

    return result;
  }, [data, width, height, total]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {rects.map((rect, i) => (
          <g key={rect.label}>
            <motion.rect
              x={rect.x + 1}
              y={rect.y + 1}
              width={Math.max(rect.w - 2, 0)}
              height={Math.max(rect.h - 2, 0)}
              rx="4"
              fill={rect.color}
              opacity={hoveredItem === rect ? 1 : 0.7}
              initial={{ scale: 0, opacity: 0 }}
              animate={isVisible ? { scale: 1, opacity: hoveredItem === rect ? 1 : 0.7 } : {}}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              onMouseEnter={() => setHoveredItem(rect)}
              onMouseLeave={() => setHoveredItem(null)}
              className="cursor-pointer transition-opacity"
            />
            {rect.w > 50 && rect.h > 30 && (
              <text
                x={rect.x + rect.w / 2}
                y={rect.y + rect.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(rect.w / 8, 14)}
                fill="white"
                fontWeight="600"
                className="pointer-events-none"
              >
                {rect.label}
              </text>
            )}
            {rect.w > 50 && rect.h > 45 && (
              <text
                x={rect.x + rect.w / 2}
                y={rect.y + rect.h / 2 + 14}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fill="white"
                opacity="0.7"
                className="pointer-events-none"
              >
                {((rect.value / total) * 100).toFixed(1)}%
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default AnimatedDonutChart;
