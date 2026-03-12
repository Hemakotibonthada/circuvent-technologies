"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// ANIMATED WORLD MAP WITH HEAT ZONES
// ============================================================================

interface MapPoint {
  lat: number;
  lng: number;
  label: string;
  value: number;
  color: string;
  category?: string;
}

interface WorldMapProps {
  points: MapPoint[];
  width?: number;
  height?: number;
  showHeatmap?: boolean;
  className?: string;
  interactive?: boolean;
}

function latLngToXY(lat: number, lng: number, w: number, h: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (mercN / Math.PI) * (h / 2);
  return { x, y: Math.max(0, Math.min(h, y)) };
}

export function AnimatedWorldMap({
  points,
  width = 800,
  height = 400,
  showHeatmap = true,
  className = "",
  interactive = true,
}: WorldMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredPoint, setHoveredPoint] = useState<MapPoint | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(points.map((p) => p.category || "default"));
    return ["all", ...Array.from(cats)];
  }, [points]);

  const filteredPoints = useMemo(() => {
    if (selectedCategory === "all") return points;
    return points.filter((p) => (p.category || "default") === selectedCategory);
  }, [points, selectedCategory]);

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

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: MapPoint | null = null;
      for (const point of filteredPoints) {
        const pos = latLngToXY(point.lat, point.lng, width, height);
        const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (dist < 15) {
          found = point;
          break;
        }
      }
      setHoveredPoint(found);
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      // Draw simple world outline (simplified continents)
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 0.5;

      // Grid lines
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        const start = latLngToXY(lat, -180, width, height);
        const end = latLngToXY(lat, 180, width, height);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      for (let lng = -180; lng <= 180; lng += 30) {
        ctx.beginPath();
        for (let lat = -80; lat <= 80; lat += 5) {
          const pos = latLngToXY(lat, lng, width, height);
          if (lat === -80) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x, pos.y);
        }
        ctx.stroke();
      }

      // Heat map
      if (showHeatmap) {
        for (const point of filteredPoints) {
          const pos = latLngToXY(point.lat, point.lng, width, height);
          const radius = 20 + point.value * 2;
          const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
          gradient.addColorStop(0, point.color + "30");
          gradient.addColorStop(0.5, point.color + "10");
          gradient.addColorStop(1, "transparent");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw connections between nearby points
      for (let i = 0; i < filteredPoints.length; i++) {
        for (let j = i + 1; j < filteredPoints.length; j++) {
          const p1 = latLngToXY(filteredPoints[i].lat, filteredPoints[i].lng, width, height);
          const p2 = latLngToXY(filteredPoints[j].lat, filteredPoints[j].lng, width, height);
          const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

          if (dist < 200) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);

            // Curved connection
            const midX = (p1.x + p2.x) / 2;
            const midY = Math.min(p1.y, p2.y) - dist * 0.15;
            ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);

            ctx.strokeStyle = filteredPoints[i].color;
            ctx.globalAlpha = 0.08;
            ctx.lineWidth = 1;
            ctx.stroke();

            // Travel dot
            const t = (Math.sin(time * 1.5 + i * 0.5) + 1) * 0.5;
            const dotX = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * midX + t * t * p2.x;
            const dotY = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * midY + t * t * p2.y;
            ctx.beginPath();
            ctx.arc(dotX, dotY, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = filteredPoints[i].color;
            ctx.globalAlpha = 0.4;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      // Draw points
      for (const point of filteredPoints) {
        const pos = latLngToXY(point.lat, point.lng, width, height);
        const isHovered = hoveredPoint === point;
        const pointSize = isHovered ? 6 : 3 + Math.min(point.value * 0.3, 4);

        // Pulse ring
        const pulseSize = pointSize + 3 + Math.sin(time * 3) * 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseSize, 0, Math.PI * 2);
        ctx.strokeStyle = point.color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15 + Math.sin(time * 3) * 0.1;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Glow
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pointSize * 3, 0, Math.PI * 2);
        ctx.fillStyle = point.color;
        ctx.globalAlpha = 0.08;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Point
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pointSize, 0, Math.PI * 2);
        ctx.fillStyle = point.color;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        if (isHovered) {
          ctx.font = "bold 11px system-ui";
          ctx.fillStyle = point.color;
          ctx.textAlign = "center";
          ctx.fillText(point.label, pos.x, pos.y - pointSize - 8);
          ctx.font = "9px system-ui";
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText(`Value: ${point.value}`, pos.x, pos.y - pointSize - 20);
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [filteredPoints, width, height, showHeatmap, interactive, hoveredPoint]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-2xl"
        style={{
          width, height,
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
        }}
      />

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="absolute top-4 left-4 flex gap-1.5">
          {categories.map((cat) => (
            <motion.button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className="px-2 py-1 rounded-md text-[9px] font-medium capitalize"
              style={{
                background: selectedCategory === cat ? "rgba(6,182,212,0.2)" : "rgba(0,0,0,0.3)",
                color: selectedCategory === cat ? "#06b6d4" : "rgba(255,255,255,0.5)",
                border: `1px solid ${selectedCategory === cat ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.1)"}`,
                backdropFilter: "blur(8px)",
              }}
              whileTap={{ scale: 0.95 }}
            >
              {cat}
            </motion.button>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="absolute bottom-4 right-4 px-3 py-2 rounded-lg" style={{
        background: "rgba(0,0,0,0.4)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(8px)",
      }}>
        <div className="text-[9px] text-white/50">
          {filteredPoints.length} locations • {filteredPoints.reduce((sum, p) => sum + p.value, 0)} total value
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// INTERACTIVE SOLAR SYSTEM
// ============================================================================

interface Planet {
  name: string;
  color: string;
  size: number;
  orbitRadius: number;
  speed: number;
  icon: string;
  description?: string;
  moons?: number;
}

interface SolarSystemProps {
  planets?: Planet[];
  size?: number;
  className?: string;
  centerLabel?: string;
  centerIcon?: string;
}

const DEFAULT_PLANETS: Planet[] = [
  { name: "React", color: "#61dafb", size: 8, orbitRadius: 50, speed: 2.5, icon: "⚛️", description: "Frontend framework", moons: 3 },
  { name: "Next.js", color: "#ffffff", size: 7, orbitRadius: 80, speed: 2.0, icon: "▲", description: "Full-stack framework", moons: 2 },
  { name: "Python", color: "#3776ab", size: 10, orbitRadius: 115, speed: 1.5, icon: "🐍", description: "AI & Backend", moons: 4 },
  { name: "Flutter", color: "#02569b", size: 7, orbitRadius: 145, speed: 1.2, icon: "💙", description: "Mobile apps", moons: 1 },
  { name: "Docker", color: "#2496ed", size: 9, orbitRadius: 178, speed: 0.8, icon: "🐳", description: "Containerization", moons: 3 },
  { name: "AI/ML", color: "#8b5cf6", size: 11, orbitRadius: 215, speed: 0.5, icon: "🧠", description: "Machine Learning", moons: 5 },
];

export function InteractiveSolarSystem({
  planets = DEFAULT_PLANETS,
  size = 500,
  className = "",
  centerLabel = "NEXUS",
  centerIcon = "⚡",
}: SolarSystemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredPlanet, setHoveredPlanet] = useState<Planet | null>(null);

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
    let time = 0;

    const planetAngles = planets.map(() => Math.random() * Math.PI * 2);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: Planet | null = null;
      for (let i = 0; i < planets.length; i++) {
        const planet = planets[i];
        const angle = planetAngles[i] + time * planet.speed * 0.01;
        const px = center + Math.cos(angle) * planet.orbitRadius;
        const py = center + Math.sin(angle) * planet.orbitRadius * 0.6; // Slight ellipse
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < planet.size + 10) {
          found = planet;
          break;
        }
      }
      setHoveredPlanet(found);
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      time += 0.016;

      // Stars background
      for (let i = 0; i < 80; i++) {
        const x = (Math.sin(i * 73.13) * 0.5 + 0.5) * size;
        const y = (Math.cos(i * 37.47) * 0.5 + 0.5) * size;
        const twinkle = Math.sin(time * 2 + i) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + twinkle * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.3})`;
        ctx.fill();
      }

      // Center sun glow
      const sunGlow = ctx.createRadialGradient(center, center, 0, center, center, 35);
      sunGlow.addColorStop(0, "rgba(6,182,212,0.3)");
      sunGlow.addColorStop(0.5, "rgba(6,182,212,0.1)");
      sunGlow.addColorStop(1, "transparent");
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(center, center, 35, 0, Math.PI * 2);
      ctx.fill();

      // Center
      ctx.beginPath();
      ctx.arc(center, center, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#06b6d4";
      ctx.fill();

      // Center label
      ctx.font = "bold 8px system-ui";
      ctx.fillStyle = "rgba(6,182,212,0.7)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(centerLabel, center, center + 24);

      // Draw orbits and planets
      for (let i = 0; i < planets.length; i++) {
        const planet = planets[i];
        const isHovered = hoveredPlanet === planet;

        // Orbit path (elliptical)
        ctx.beginPath();
        ctx.ellipse(center, center, planet.orbitRadius, planet.orbitRadius * 0.6, 0, 0, Math.PI * 2);
        ctx.strokeStyle = isHovered ? `${planet.color}40` : "rgba(255,255,255,0.04)";
        ctx.lineWidth = isHovered ? 1.5 : 0.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Planet position
        planetAngles[i] += planet.speed * 0.002;
        const angle = planetAngles[i];
        const px = center + Math.cos(angle) * planet.orbitRadius;
        const py = center + Math.sin(angle) * planet.orbitRadius * 0.6;

        // Planet glow
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(px, py, planet.size + 10, 0, Math.PI * 2);
          ctx.fillStyle = `${planet.color}15`;
          ctx.fill();
        }

        // Planet
        ctx.beginPath();
        ctx.arc(px, py, isHovered ? planet.size + 2 : planet.size, 0, Math.PI * 2);
        ctx.fillStyle = planet.color;
        ctx.globalAlpha = isHovered ? 1 : 0.7;
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(px - 2, py - 2, planet.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fill();
        ctx.globalAlpha = 1;

        // Moons
        if (planet.moons) {
          for (let m = 0; m < Math.min(planet.moons, 3); m++) {
            const moonAngle = time * (3 + m) + m * (Math.PI * 2 / planet.moons);
            const moonDist = planet.size + 6 + m * 4;
            const mx = px + Math.cos(moonAngle) * moonDist;
            const my = py + Math.sin(moonAngle) * moonDist;
            ctx.beginPath();
            ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `${planet.color}80`;
            ctx.fill();
          }
        }

        // Icon & label
        ctx.font = `${planet.size + 4}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(planet.icon, px, py);

        if (isHovered) {
          ctx.font = "bold 10px system-ui";
          ctx.fillStyle = planet.color;
          ctx.fillText(planet.name, px, py - planet.size - 10);

          if (planet.description) {
            ctx.font = "8px system-ui";
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.fillText(planet.description, px, py - planet.size - 22);
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
  }, [planets, size, centerLabel, centerIcon, hoveredPlanet]);

  return (
    <div className={`relative inline-block ${className}`}>
      <canvas
        ref={canvasRef}
        className="cursor-pointer"
        style={{ width: size, height: size }}
      />
      {hoveredPlanet && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-center"
          style={{
            background: "rgba(0,0,0,0.5)",
            border: `1px solid ${hoveredPlanet.color}40`,
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="text-xs font-bold" style={{ color: hoveredPlanet.color }}>{hoveredPlanet.icon} {hoveredPlanet.name}</div>
          <div className="text-[9px] text-white/50">{hoveredPlanet.description} • {hoveredPlanet.moons} moons</div>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// INTERACTIVE PERIODIC TABLE OF TECH
// ============================================================================

interface TechElement {
  symbol: string;
  name: string;
  number: number;
  category: string;
  color: string;
  description: string;
  proficiency: number;
  icon: string;
}

interface PeriodicTableProps {
  elements: TechElement[];
  className?: string;
}

export function TechPeriodicTable({
  elements,
  className = "",
}: PeriodicTableProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<TechElement | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const ref = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const cats = new Set(elements.map((e) => e.category));
    return ["all", ...Array.from(cats)];
  }, [elements]);

  const filtered = useMemo(() => {
    if (filter === "all") return elements;
    return elements.filter((e) => e.category === filter);
  }, [elements, filter]);

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

  return (
    <div ref={ref} className={className}>
      {/* Filter */}
      <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
        {categories.map((cat) => (
          <motion.button
            key={cat}
            onClick={() => setFilter(cat)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-medium capitalize"
            style={{
              background: filter === cat ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
              color: filter === cat ? "var(--accent-cyan)" : "var(--text-muted)",
              border: `1px solid ${filter === cat ? "var(--accent-cyan)" : "var(--border-primary)"}`,
            }}
            whileTap={{ scale: 0.95 }}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
        <AnimatePresence>
          {filtered.map((el, i) => (
            <motion.div
              key={el.symbol}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isVisible ? { opacity: 1, scale: 1 } : {}}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: i * 0.02 }}
              className="relative group cursor-pointer overflow-hidden rounded-lg aspect-square flex flex-col items-center justify-center p-1.5"
              style={{
                background: hoveredElement === el ? `${el.color}15` : "var(--bg-glass)",
                border: `1px solid ${hoveredElement === el ? el.color + "40" : "var(--border-primary)"}`,
              }}
              onMouseEnter={() => setHoveredElement(el)}
              onMouseLeave={() => setHoveredElement(null)}
              whileHover={{ scale: 1.1, zIndex: 10 }}
            >
              {/* Atomic number */}
              <span className="absolute top-1 left-1.5 text-[7px] font-mono" style={{ color: "var(--text-muted)" }}>
                {el.number}
              </span>

              {/* Proficiency bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "var(--border-primary)" }}>
                <motion.div
                  className="h-full"
                  style={{ background: el.color }}
                  initial={{ width: 0 }}
                  animate={isVisible ? { width: `${el.proficiency}%` } : {}}
                  transition={{ delay: i * 0.02 + 0.3 }}
                />
              </div>

              {/* Icon */}
              <span className="text-lg leading-none">{el.icon}</span>

              {/* Symbol */}
              <span className="text-[10px] font-bold mt-0.5" style={{ color: hoveredElement === el ? el.color : "var(--text-primary)" }}>
                {el.symbol}
              </span>

              {/* Name (on hover) */}
              <span className="text-[6px] truncate w-full text-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
                {el.name}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Detail tooltip */}
      <AnimatePresence>
        {hoveredElement && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 p-4 rounded-xl"
            style={{
              background: "var(--bg-glass)",
              border: `1px solid ${hoveredElement.color}30`,
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="text-3xl">{hoveredElement.icon}</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold" style={{ color: hoveredElement.color }}>{hoveredElement.symbol}</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{hoveredElement.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded capitalize" style={{ background: `${hoveredElement.color}15`, color: hoveredElement.color }}>
                    {hoveredElement.category}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{hoveredElement.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border-primary)" }}>
                    <div className="h-full rounded-full" style={{ width: `${hoveredElement.proficiency}%`, background: hoveredElement.color }} />
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: hoveredElement.color }}>{hoveredElement.proficiency}%</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED NETWORK TOPOLOGY MAP
// ============================================================================

interface TopologyNode {
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  type: "server" | "database" | "cache" | "client" | "service" | "queue" | "cdn" | "gateway";
  color: string;
  status: "healthy" | "warning" | "error" | "offline";
  metrics?: { cpu?: number; memory?: number; requests?: number };
}

interface TopologyLink {
  source: string;
  target: string;
  bandwidth?: number;
  latency?: number;
  protocol?: string;
}

interface NetworkTopologyProps {
  nodes: TopologyNode[];
  links: TopologyLink[];
  width?: number;
  height?: number;
  className?: string;
  animated?: boolean;
}

export function NetworkTopology({
  nodes,
  links,
  width = 700,
  height = 450,
  className = "",
  animated = true,
}: NetworkTopologyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<TopologyNode | null>(null);

  const statusColors = {
    healthy: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    offline: "#64748b",
  };

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

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: TopologyNode | null = null;
      for (const node of nodes) {
        const dist = Math.sqrt((mx - node.x) ** 2 + (my - node.y) ** 2);
        if (dist < 25) {
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

      // Draw links
      for (const link of links) {
        const source = nodes.find((n) => n.id === link.source);
        const target = nodes.find((n) => n.id === link.target);
        if (!source || !target) continue;

        const isHighlighted = hoveredNode && (link.source === hoveredNode.id || link.target === hoveredNode.id);

        // Line
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isHighlighted ? source.color : "rgba(255,255,255,0.06)";
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();

        // Data flow animation
        if (animated && source.status === "healthy" && target.status === "healthy") {
          const t = (time * 0.5 + parseInt(source.id, 36) * 0.1) % 1;
          const px = source.x + (target.x - source.x) * t;
          const py = source.y + (target.y - source.y) * t;

          ctx.beginPath();
          ctx.arc(px, py, isHighlighted ? 3 : 2, 0, Math.PI * 2);
          ctx.fillStyle = source.color;
          ctx.globalAlpha = isHighlighted ? 0.8 : 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Protocol label
        if (isHighlighted && link.protocol) {
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2 - 8;
          ctx.font = "8px monospace";
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.textAlign = "center";
          ctx.fillText(link.protocol, midX, midY);

          if (link.latency) {
            ctx.fillText(`${link.latency}ms`, midX, midY + 12);
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const isHovered = hoveredNode?.id === node.id;
        const isConnected = hoveredNode && links.some(
          (l) => (l.source === hoveredNode.id && l.target === node.id) ||
                 (l.target === hoveredNode.id && l.source === node.id)
        );
        const dimmed = hoveredNode && !isHovered && !isConnected;

        ctx.globalAlpha = dimmed ? 0.3 : 1;

        // Node background
        const nodeSize = isHovered ? 24 : 20;
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? `${node.color}20` : "var(--bg-surface)";
        ctx.fill();
        ctx.strokeStyle = isHovered ? node.color : "var(--border-primary)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Status indicator
        const statusAngle = -Math.PI / 4;
        const statusX = node.x + Math.cos(statusAngle) * nodeSize;
        const statusY = node.y + Math.sin(statusAngle) * nodeSize;
        ctx.beginPath();
        ctx.arc(statusX, statusY, 4, 0, Math.PI * 2);
        ctx.fillStyle = statusColors[node.status];
        const pulse = node.status === "healthy" ? 1 : 0.5 + Math.sin(time * 4) * 0.5;
        ctx.globalAlpha = (dimmed ? 0.3 : 1) * pulse;
        ctx.fill();
        ctx.globalAlpha = dimmed ? 0.3 : 1;

        // Icon
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.icon, node.x, node.y);

        // Label
        ctx.font = `${isHovered ? "bold 10px" : "9px"} system-ui`;
        ctx.fillStyle = isHovered ? node.color : "var(--text-secondary)";
        ctx.textBaseline = "top";
        ctx.fillText(node.label, node.x, node.y + nodeSize + 5);

        // Metrics (on hover)
        if (isHovered && node.metrics) {
          ctx.textBaseline = "top";
          ctx.font = "8px monospace";
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          let my = node.y + nodeSize + 18;
          if (node.metrics.cpu !== undefined) {
            ctx.fillText(`CPU: ${node.metrics.cpu}%`, node.x, my);
            my += 12;
          }
          if (node.metrics.memory !== undefined) {
            ctx.fillText(`MEM: ${node.metrics.memory}%`, node.x, my);
            my += 12;
          }
          if (node.metrics.requests !== undefined) {
            ctx.fillText(`REQ: ${node.metrics.requests}/s`, node.x, my);
          }
        }

        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [nodes, links, width, height, animated, hoveredNode]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-2xl"
        style={{
          width, height,
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
        }}
      />
    </div>
  );
}

export default AnimatedWorldMap;
