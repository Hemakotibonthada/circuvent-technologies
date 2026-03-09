"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

// ============================================================================
// ANIMATED FLOW CHART
// ============================================================================

interface FlowNode {
  id: string;
  label: string;
  icon: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  type: "start" | "process" | "decision" | "end" | "data" | "connector";
}

interface FlowConnection {
  from: string;
  to: string;
  label?: string;
  color?: string;
  animated?: boolean;
  condition?: string;
}

interface AnimatedFlowChartProps {
  nodes: FlowNode[];
  connections: FlowConnection[];
  width?: number;
  height?: number;
  className?: string;
  title?: string;
  interactive?: boolean;
}

export function AnimatedFlowChart({
  nodes,
  connections,
  width = 800,
  height = 600,
  className = "",
  title,
  interactive = true,
}: AnimatedFlowChartProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<FlowNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getNodeCenter = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return { x: 0, y: 0 };
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }, [nodes]);

  const getNodeShape = (node: FlowNode) => {
    const { x, y, width: w, height: h } = node;
    switch (node.type) {
      case "start":
      case "end":
        return (
          <ellipse
            cx={x + w / 2}
            cy={y + h / 2}
            rx={w / 2}
            ry={h / 2}
          />
        );
      case "decision":
        return (
          <polygon
            points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`}
          />
        );
      case "data":
        return (
          <polygon
            points={`${x + 10},${y} ${x + w},${y} ${x + w - 10},${y + h} ${x},${y + h}`}
          />
        );
      default:
        return (
          <rect x={x} y={y} width={w} height={h} rx="8" />
        );
    }
  };

  const isConnectedToNode = (nodeId: string): boolean => {
    if (!hoveredNode) return false;
    return connections.some(
      (c) => (c.from === hoveredNode.id && c.to === nodeId) ||
             (c.to === hoveredNode.id && c.from === nodeId)
    );
  };

  return (
    <div ref={ref} className={className}>
      {title && (
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
      )}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          backdropFilter: "blur(12px)",
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: 400 }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--text-muted)" opacity="0.5" />
            </marker>
            <filter id="flow-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connections */}
          {connections.map((conn, i) => {
            const from = getNodeCenter(conn.from);
            const to = getNodeCenter(conn.to);
            const isHighlighted = hoveredNode &&
              (conn.from === hoveredNode.id || conn.to === hoveredNode.id);

            const midX = (from.x + to.x) / 2;
            const midY = Math.abs(from.y - to.y) > 50
              ? (from.y + to.y) / 2
              : from.y - 40;

            return (
              <g key={`conn-${i}`}>
                <motion.path
                  d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={conn.color || "var(--text-muted)"}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={conn.animated ? "6 4" : "none"}
                  markerEnd="url(#arrowhead)"
                  opacity={hoveredNode ? (isHighlighted ? 0.8 : 0.15) : 0.35}
                  initial={{ pathLength: 0 }}
                  animate={isVisible ? { pathLength: 1 } : {}}
                  transition={{ duration: 0.8, delay: i * 0.1 }}
                />

                {/* Animated pulse on connection */}
                {conn.animated && isVisible && (
                  <circle r="3" fill={conn.color || "#06b6d4"} opacity="0.7">
                    <animateMotion
                      dur={`${3 + i * 0.5}s`}
                      repeatCount="indefinite"
                      path={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                    />
                  </circle>
                )}

                {/* Connection label */}
                {conn.label && (
                  <text
                    x={midX}
                    y={midY - 8}
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--text-muted)"
                    opacity={isHighlighted ? 1 : 0.4}
                  >
                    {conn.label}
                  </text>
                )}

                {/* Condition text */}
                {conn.condition && (
                  <text
                    x={midX + 15}
                    y={midY + 5}
                    fontSize="8"
                    fontStyle="italic"
                    fill={conn.color || "var(--text-muted)"}
                    opacity={0.6}
                  >
                    {conn.condition}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const isHovered = hoveredNode?.id === node.id;
            const isConnected = isConnectedToNode(node.id);
            const dimmed = hoveredNode && !isHovered && !isConnected;

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isVisible ? {
                  opacity: dimmed ? 0.3 : 1,
                  scale: 1,
                } : {}}
                transition={{ delay: i * 0.08, type: "spring" }}
                onMouseEnter={() => interactive && setHoveredNode(node)}
                onMouseLeave={() => interactive && setHoveredNode(null)}
                onClick={() => interactive && setSelectedNode(node)}
                className="cursor-pointer"
              >
                {/* Glow effect */}
                {isHovered && (
                  <rect
                    x={node.x - 4}
                    y={node.y - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx="12"
                    fill={`${node.color}15`}
                    filter="url(#flow-glow)"
                  />
                )}

                {/* Node shape */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx="8"
                  fill="var(--bg-surface)"
                  stroke={isHovered ? node.color : "var(--border-primary)"}
                  strokeWidth={isHovered ? 2 : 1}
                />

                {/* Top border */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height="3"
                  rx="8"
                  fill={node.color}
                  opacity={isHovered ? 1 : 0.6}
                />

                {/* Icon */}
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 - 4}
                  textAnchor="middle"
                  fontSize="16"
                >
                  {node.icon}
                </text>

                {/* Label */}
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 + 14}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="600"
                  fill={isHovered ? node.color : "var(--text-primary)"}
                >
                  {node.label}
                </text>
              </motion.g>
            );
          })}
        </svg>

        {/* Selected node detail panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-4 left-4 right-4 p-4 rounded-xl z-10"
              style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${selectedNode.color}30`,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{selectedNode.icon}</span>
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: selectedNode.color }}>
                      {selectedNode.label}
                    </h4>
                    {selectedNode.description && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {selectedNode.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                        background: `${selectedNode.color}15`,
                        color: selectedNode.color,
                      }}>
                        {selectedNode.type}
                      </span>
                      <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                        ID: {selectedNode.id}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(null); }}
                  className="text-xs p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED DEPENDENCY GRAPH
// ============================================================================

interface DependencyNode {
  id: string;
  name: string;
  version: string;
  size: number;
  type: "production" | "development" | "peer";
  color: string;
}

interface DependencyLink {
  source: string;
  target: string;
}

interface DependencyGraphProps {
  nodes: DependencyNode[];
  links: DependencyLink[];
  width?: number;
  height?: number;
  className?: string;
}

export function DependencyGraph({
  nodes,
  links,
  width = 600,
  height = 400,
  className = "",
}: DependencyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<DependencyNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Position nodes using force-directed layout simulation
    const positioned = nodes.map((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      const radius = Math.min(width, height) * 0.3;
      return {
        ...node,
        x: width / 2 + Math.cos(angle) * radius * (0.5 + Math.random() * 0.5),
        y: height / 2 + Math.sin(angle) * radius * (0.5 + Math.random() * 0.5),
        vx: 0,
        vy: 0,
      };
    });

    let time = 0;
    const mousePos = { x: -1000, y: -1000 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = e.clientX - rect.left;
      mousePos.y = e.clientY - rect.top;

      let found: DependencyNode | null = null;
      for (const node of positioned) {
        const dist = Math.sqrt((mousePos.x - node.x) ** 2 + (mousePos.y - node.y) ** 2);
        if (dist < node.size * 2 + 8) {
          found = node;
          break;
        }
      }
      setHoveredNode(found);
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      // Simple force simulation
      for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
          const dx = positioned[j].x - positioned[i].x;
          const dy = positioned[j].y - positioned[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 50 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          positioned[i].vx -= fx;
          positioned[i].vy -= fy;
          positioned[j].vx += fx;
          positioned[j].vy += fy;
        }

        // Center gravity
        const dx = width / 2 - positioned[i].x;
        const dy = height / 2 - positioned[i].y;
        positioned[i].vx += dx * 0.0005;
        positioned[i].vy += dy * 0.0005;

        // Damping
        positioned[i].vx *= 0.95;
        positioned[i].vy *= 0.95;

        // Apply velocity
        positioned[i].x += positioned[i].vx;
        positioned[i].y += positioned[i].vy;

        // Bounds
        positioned[i].x = Math.max(30, Math.min(width - 30, positioned[i].x));
        positioned[i].y = Math.max(30, Math.min(height - 30, positioned[i].y));
      }

      // Draw links
      for (const link of links) {
        const source = positioned.find((n) => n.id === link.source);
        const target = positioned.find((n) => n.id === link.target);
        if (!source || !target) continue;

        const isHighlighted = hoveredNode &&
          (link.source === hoveredNode.id || link.target === hoveredNode.id);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isHighlighted ? source.color : "var(--border-primary)";
        ctx.globalAlpha = isHighlighted ? 0.6 : 0.1;
        ctx.lineWidth = isHighlighted ? 2 : 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (const node of positioned) {
        const isHovered = hoveredNode?.id === node.id;
        const nodeSize = node.size + (isHovered ? 4 : 0);

        // Glow
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, nodeSize + 8, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.globalAlpha = 0.1;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = isHovered ? 0.9 : 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        if (isHovered || nodeSize > 8) {
          ctx.font = `${isHovered ? 11 : 9}px system-ui`;
          ctx.fillStyle = isHovered ? node.color : "var(--text-muted)";
          ctx.textAlign = "center";
          ctx.fillText(node.name, node.x, node.y + nodeSize + 14);

          if (isHovered) {
            ctx.font = "8px monospace";
            ctx.fillStyle = "var(--text-muted)";
            ctx.fillText(`v${node.version}`, node.x, node.y + nodeSize + 26);
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [nodes, links, width, height, hoveredNode]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-2xl"
        style={{
          width,
          height,
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
        }}
      />
      {hoveredNode && (
        <div
          className="absolute top-4 right-4 px-3 py-2 rounded-lg text-xs"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <div className="font-bold" style={{ color: hoveredNode.color }}>
            {hoveredNode.name} v{hoveredNode.version}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Type: {hoveredNode.type} • Size: {hoveredNode.size}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ANIMATED MATRIX RAIN
// ============================================================================

interface MatrixRainProps {
  width?: number;
  height?: number;
  fontSize?: number;
  speed?: number;
  color?: string;
  className?: string;
  characters?: string;
  density?: number;
}

export function MatrixRain({
  width = 600,
  height = 400,
  fontSize = 14,
  speed = 1,
  color = "#06b6d4",
  className = "",
  characters = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF",
  density = 0.95,
}: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const columns = Math.floor(width / fontSize);
    const drops: number[] = new Array(columns).fill(0).map(() => Math.random() * -100);

    const animate = () => {
      // Fade effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns; i++) {
        const char = characters[Math.floor(Math.random() * characters.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Head character (brighter)
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.9;
        ctx.fillText(char, x, y);

        // Trail
        for (let t = 1; t < 8; t++) {
          const trailChar = characters[Math.floor(Math.random() * characters.length)];
          ctx.globalAlpha = (8 - t) / 12;
          ctx.fillText(trailChar, x, y - t * fontSize);
        }

        ctx.globalAlpha = 1;

        // Reset drop
        if (y > height && Math.random() > density) {
          drops[i] = 0;
        }

        drops[i] += speed;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [width, height, fontSize, speed, color, characters, density]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} style={{ background: "#000" }}>
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}

// ============================================================================
// ANIMATED SPECTRUM ANALYZER
// ============================================================================

interface SpectrumAnalyzerProps {
  bars?: number;
  width?: number;
  height?: number;
  colors?: string[];
  className?: string;
  speed?: number;
  style?: "bars" | "wave" | "mirror";
}

export function SpectrumAnalyzer({
  bars = 32,
  width = 600,
  height = 200,
  colors = ["#06b6d4", "#8b5cf6", "#ec4899"],
  className = "",
  speed = 1,
  style: variant = "bars",
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const valuesRef = useRef<number[]>(new Array(bars).fill(0));
  const targetValuesRef = useRef<number[]>(new Array(bars).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    let time = 0;
    let beatTimer = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016 * speed;
      beatTimer += 0.016;

      // Simulate audio spectrum
      if (beatTimer > 0.1) {
        beatTimer = 0;
        for (let i = 0; i < bars; i++) {
          // Create frequency-like distribution
          const freq = i / bars;
          const bass = Math.sin(time * 2) * 0.5 + 0.5;
          const mid = Math.sin(time * 4 + freq * 5) * 0.3 + 0.3;
          const treble = Math.random() * 0.4;
          
          const baseValue = freq < 0.2 ? bass : freq < 0.6 ? mid : treble;
          targetValuesRef.current[i] = baseValue * height * 0.8 + Math.random() * 20;
        }
      }

      // Smoothly interpolate
      for (let i = 0; i < bars; i++) {
        valuesRef.current[i] += (targetValuesRef.current[i] - valuesRef.current[i]) * 0.15;
      }

      const barWidth = (width - (bars - 1) * 2) / bars;

      for (let i = 0; i < bars; i++) {
        const barHeight = Math.max(2, valuesRef.current[i]);
        const x = i * (barWidth + 2);
        const colorIndex = Math.floor((i / bars) * colors.length);
        const barColor = colors[Math.min(colorIndex, colors.length - 1)];

        // Create gradient for each bar
        const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
        gradient.addColorStop(0, barColor + "80");
        gradient.addColorStop(1, barColor);

        if (variant === "bars" || variant === "mirror") {
          // Bar
          ctx.fillStyle = gradient;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);

          // Glow
          ctx.fillStyle = barColor;
          ctx.globalAlpha = 0.15;
          ctx.fillRect(x - 1, height - barHeight - 4, barWidth + 2, 4);
          ctx.globalAlpha = 1;

          // Mirror effect
          if (variant === "mirror") {
            ctx.fillStyle = barColor;
            ctx.globalAlpha = 0.1;
            ctx.fillRect(x, height, barWidth, barHeight * 0.3);
            ctx.globalAlpha = 1;
          }

          // Peak indicator
          ctx.fillStyle = barColor;
          ctx.fillRect(x, height - barHeight - 2, barWidth, 2);
        } else if (variant === "wave") {
          // Wave style
          if (i === 0) {
            ctx.beginPath();
            ctx.moveTo(x, height - barHeight);
          } else {
            const prevX = (i - 1) * (barWidth + 2) + barWidth / 2;
            const prevH = valuesRef.current[i - 1];
            const cpX = (prevX + x + barWidth / 2) / 2;
            ctx.quadraticCurveTo(cpX, height - prevH, x + barWidth / 2, height - barHeight);
          }

          if (i === bars - 1) {
            ctx.lineTo(width, height);
            ctx.lineTo(0, height);
            ctx.closePath();

            const waveGrad = ctx.createLinearGradient(0, 0, 0, height);
            waveGrad.addColorStop(0, colors[0] + "60");
            waveGrad.addColorStop(1, colors[colors.length - 1] + "10");
            ctx.fillStyle = waveGrad;
            ctx.fill();

            // Stroke
            ctx.strokeStyle = colors[0];
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [bars, width, height, colors, speed, variant]);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} style={{
      background: "rgba(0,0,0,0.3)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}

// ============================================================================
// ANIMATED CLOCK
// ============================================================================

interface AnimatedClockProps {
  size?: number;
  color?: string;
  showSeconds?: boolean;
  showDigital?: boolean;
  className?: string;
  timezone?: string;
}

export function AnimatedClock({
  size = 200,
  color = "#06b6d4",
  showSeconds = true,
  showDigital = true,
  className = "",
}: AnimatedClockProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const radius = size * 0.42;

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      const now = new Date();
      const hours = now.getHours() % 12;
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const milliseconds = now.getMilliseconds();

      // Background circle
      ctx.beginPath();
      ctx.arc(center, center, radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6, 182, 212, 0.03)";
      ctx.fill();

      // Outer ring
      ctx.beginPath();
      ctx.arc(center, center, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = `${color}30`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Hour markers
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const innerR = radius - (i % 3 === 0 ? 15 : 8);
        const outerR = radius - 3;

        ctx.beginPath();
        ctx.moveTo(
          center + Math.cos(angle) * innerR,
          center + Math.sin(angle) * innerR
        );
        ctx.lineTo(
          center + Math.cos(angle) * outerR,
          center + Math.sin(angle) * outerR
        );
        ctx.strokeStyle = i % 3 === 0 ? color : `${color}40`;
        ctx.lineWidth = i % 3 === 0 ? 2 : 1;
        ctx.stroke();

        // Hour numbers
        if (i % 3 === 0) {
          const numR = radius - 22;
          ctx.font = "bold 12px system-ui";
          ctx.fillStyle = color;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            (i || 12).toString(),
            center + Math.cos(angle) * numR,
            center + Math.sin(angle) * numR
          );
        }
      }

      // Minute ticks
      for (let i = 0; i < 60; i++) {
        if (i % 5 === 0) continue;
        const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const innerR = radius - 5;
        const outerR = radius - 2;

        ctx.beginPath();
        ctx.moveTo(
          center + Math.cos(angle) * innerR,
          center + Math.sin(angle) * innerR
        );
        ctx.lineTo(
          center + Math.cos(angle) * outerR,
          center + Math.sin(angle) * outerR
        );
        ctx.strokeStyle = `${color}15`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Hour hand
      const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(hourAngle) * radius * 0.5,
        center + Math.sin(hourAngle) * radius * 0.5
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();

      // Minute hand
      const minuteAngle = ((minutes + seconds / 60) / 60) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(
        center + Math.cos(minuteAngle) * radius * 0.7,
        center + Math.sin(minuteAngle) * radius * 0.7
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();

      // Second hand
      if (showSeconds) {
        const secondAngle = ((seconds + milliseconds / 1000) / 60) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(
          center - Math.cos(secondAngle) * 15,
          center - Math.sin(secondAngle) * 15
        );
        ctx.lineTo(
          center + Math.cos(secondAngle) * radius * 0.8,
          center + Math.sin(secondAngle) * radius * 0.8
        );
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1;
        ctx.lineCap = "round";
        ctx.stroke();

        // Second hand dot
        ctx.beginPath();
        ctx.arc(center, center, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      }

      // Center dot
      ctx.beginPath();
      ctx.arc(center, center, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Digital display
      if (showDigital) {
        const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        ctx.font = "10px monospace";
        ctx.fillStyle = `${color}80`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(timeStr, center, center + radius * 0.4);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [size, color, showSeconds, showDigital]);

  return (
    <div className={`relative inline-block ${className}`}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
}

// ============================================================================
// ANIMATED LOADING STATES
// ============================================================================

interface LoadingAnimationProps {
  variant?: "dots" | "pulse" | "bars" | "spinner" | "skeleton" | "orbit";
  size?: number;
  color?: string;
  className?: string;
}

export function LoadingAnimation({
  variant = "dots",
  size = 40,
  color = "#06b6d4",
  className = "",
}: LoadingAnimationProps) {
  switch (variant) {
    case "dots":
      return (
        <div className={`flex items-center gap-1 ${className}`}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{ width: size * 0.25, height: size * 0.25, background: color }}
              animate={{
                y: [0, -size * 0.3, 0],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
      );
    case "pulse":
      return (
        <motion.div
          className={`rounded-full ${className}`}
          style={{ width: size, height: size, background: `${color}20`, border: `2px solid ${color}` }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [1, 0.3, 1],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      );
    case "bars":
      return (
        <div className={`flex items-end gap-1 ${className}`} style={{ height: size }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              style={{ width: size * 0.12, background: color }}
              animate={{
                height: [size * 0.3, size, size * 0.3],
              }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
        </div>
      );
    case "spinner":
      return (
        <motion.div
          className={`rounded-full ${className}`}
          style={{
            width: size,
            height: size,
            border: `3px solid ${color}20`,
            borderTop: `3px solid ${color}`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
        />
      );
    case "orbit":
      return (
        <div className={`relative ${className}`} style={{ width: size, height: size }}>
          <div
            className="absolute inset-2 rounded-full"
            style={{ border: `1px solid ${color}20` }}
          />
          <motion.div
            className="absolute rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            style={{
              width: size * 0.2,
              height: size * 0.2,
              background: color,
              transformOrigin: `${size * 0.1}px ${size / 2}px`,
            }}
          />
        </div>
      );
    default:
      return (
        <div className={`space-y-2 ${className}`} style={{ width: size * 4 }}>
          {[1, 0.75, 0.5].map((w, i) => (
            <motion.div
              key={i}
              className="rounded-md"
              style={{ width: `${w * 100}%`, height: size * 0.3, background: `${color}15` }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </div>
      );
  }
}

export default AnimatedFlowChart;
