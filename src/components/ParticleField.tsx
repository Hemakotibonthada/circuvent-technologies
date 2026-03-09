"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// PARTICLE FIELD - Advanced Canvas-based particle system
// ============================================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
  maxLife: number;
  type: "circle" | "square" | "triangle" | "star" | "hexagon";
  rotation: number;
  rotationSpeed: number;
  pulsePhase: number;
  trail: Array<{ x: number; y: number; opacity: number }>;
  mass: number;
  charge: number;
}

interface Attractor {
  x: number;
  y: number;
  strength: number;
  radius: number;
  type: "attract" | "repel" | "orbit";
}

interface ParticleFieldProps {
  count?: number;
  colors?: string[];
  speed?: number;
  connectionDistance?: number;
  showConnections?: boolean;
  interactive?: boolean;
  gravity?: { x: number; y: number };
  attractors?: Attractor[];
  particleTypes?: Array<"circle" | "square" | "triangle" | "star" | "hexagon">;
  trailLength?: number;
  pulseEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  blendMode?: GlobalCompositeOperation;
  turbulence?: number;
  flowField?: boolean;
  flowFieldScale?: number;
  emitters?: Array<{ x: number; y: number; rate: number; spread: number }>;
  onParticleClick?: (particle: Particle) => void;
  glowEnabled?: boolean;
  sizeRange?: [number, number];
  opacityRange?: [number, number];
  preset?: "starfield" | "fireflies" | "matrix" | "aurora" | "nebula" | "snow" | "rain" | "confetti" | "dna" | "circuit";
}

const PRESETS: Record<string, Partial<ParticleFieldProps>> = {
  starfield: {
    count: 200,
    colors: ["#ffffff", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8"],
    speed: 0.3,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [0.5, 3],
    opacityRange: [0.2, 1],
    pulseEnabled: true,
  },
  fireflies: {
    count: 50,
    colors: ["#fbbf24", "#f59e0b", "#d97706", "#92400e"],
    speed: 0.5,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [2, 6],
    opacityRange: [0.3, 0.9],
    pulseEnabled: true,
    glowEnabled: true,
  },
  matrix: {
    count: 150,
    colors: ["#00ff00", "#00cc00", "#009900", "#006600"],
    speed: 2,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [1, 3],
    opacityRange: [0.1, 0.8],
    gravity: { x: 0, y: 0.5 },
  },
  aurora: {
    count: 80,
    colors: ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#3b82f6"],
    speed: 0.8,
    connectionDistance: 120,
    showConnections: true,
    sizeRange: [2, 5],
    opacityRange: [0.1, 0.5],
    blendMode: "screen" as GlobalCompositeOperation,
    flowField: true,
  },
  nebula: {
    count: 120,
    colors: ["#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#6366f1"],
    speed: 0.4,
    connectionDistance: 100,
    showConnections: true,
    sizeRange: [1, 8],
    opacityRange: [0.05, 0.4],
    blendMode: "screen" as GlobalCompositeOperation,
    glowEnabled: true,
    turbulence: 0.3,
  },
  snow: {
    count: 100,
    colors: ["#ffffff", "#e2e8f0", "#cbd5e1"],
    speed: 1,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [1, 4],
    opacityRange: [0.3, 0.8],
    gravity: { x: 0, y: 0.3 },
    turbulence: 0.5,
  },
  rain: {
    count: 200,
    colors: ["#06b6d4", "#0891b2", "#0e7490"],
    speed: 5,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [0.5, 1.5],
    opacityRange: [0.2, 0.6],
    gravity: { x: 0.2, y: 3 },
  },
  confetti: {
    count: 80,
    colors: ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"],
    speed: 1.5,
    connectionDistance: 0,
    showConnections: false,
    sizeRange: [3, 8],
    opacityRange: [0.6, 1],
    gravity: { x: 0, y: 0.2 },
    particleTypes: ["square", "triangle", "circle"],
  },
  dna: {
    count: 60,
    colors: ["#06b6d4", "#8b5cf6"],
    speed: 0.5,
    connectionDistance: 80,
    showConnections: true,
    sizeRange: [2, 5],
    opacityRange: [0.3, 0.8],
  },
  circuit: {
    count: 100,
    colors: ["#06b6d4", "#0891b2", "#22d3ee"],
    speed: 0.8,
    connectionDistance: 60,
    showConnections: true,
    sizeRange: [2, 4],
    opacityRange: [0.3, 0.7],
    particleTypes: ["square", "circle"],
  },
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const spikes = 5;
  const outerRadius = size;
  const innerRadius = size * 0.4;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = cx + Math.cos(angle) * size;
    const py = cy + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx - size * 0.866, cy + size * 0.5);
  ctx.lineTo(cx + size * 0.866, cy + size * 0.5);
  ctx.closePath();
}

function drawParticleShape(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  glow: boolean
) {
  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.globalAlpha = particle.opacity;

  if (glow) {
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = particle.size * 4;
  }

  ctx.fillStyle = particle.color;

  switch (particle.type) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "square":
      ctx.fillRect(-particle.size, -particle.size, particle.size * 2, particle.size * 2);
      break;
    case "triangle":
      drawTriangle(ctx, 0, 0, particle.size);
      ctx.fill();
      break;
    case "star":
      drawStar(ctx, 0, 0, particle.size);
      ctx.fill();
      break;
    case "hexagon":
      drawHexagon(ctx, 0, 0, particle.size);
      ctx.fill();
      break;
  }

  ctx.restore();
}

export default function ParticleField({
  preset,
  count: countProp,
  colors: colorsProp,
  speed: speedProp,
  connectionDistance: connDistProp,
  showConnections: showConnProp,
  interactive = true,
  gravity: gravityProp,
  attractors = [],
  particleTypes: typesProp,
  trailLength = 0,
  pulseEnabled: pulseProp,
  className = "",
  style = {},
  blendMode: blendProp,
  turbulence: turbProp,
  flowField: flowProp,
  flowFieldScale = 0.005,
  glowEnabled: glowProp,
  sizeRange: sizeProp,
  opacityRange: opacityProp,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  const presetConfig = preset ? PRESETS[preset] || {} : {};

  const count = countProp ?? presetConfig.count ?? 100;
  const colors = colorsProp ?? presetConfig.colors ?? ["#06b6d4", "#8b5cf6", "#ec4899"];
  const speed = speedProp ?? presetConfig.speed ?? 1;
  const connectionDistance = connDistProp ?? presetConfig.connectionDistance ?? 80;
  const showConnections = showConnProp ?? presetConfig.showConnections ?? true;
  const gravity = gravityProp ?? presetConfig.gravity ?? { x: 0, y: 0 };
  const particleTypes = typesProp ?? presetConfig.particleTypes ?? ["circle"];
  const pulseEnabled = pulseProp ?? presetConfig.pulseEnabled ?? false;
  const blendMode = blendProp ?? presetConfig.blendMode ?? ("source-over" as GlobalCompositeOperation);
  const turbulence = turbProp ?? presetConfig.turbulence ?? 0;
  const flowField = flowProp ?? presetConfig.flowField ?? false;
  const glowEnabled = glowProp ?? presetConfig.glowEnabled ?? false;
  const sizeRange = sizeProp ?? presetConfig.sizeRange ?? [1, 4];
  const opacityRange = opacityProp ?? presetConfig.opacityRange ?? [0.2, 0.8];

  const createParticle = useCallback(
    (width: number, height: number, x?: number, y?: number): Particle => {
      const type = particleTypes[Math.floor(Math.random() * particleTypes.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = lerp(sizeRange[0], sizeRange[1], Math.random());
      const opacity = lerp(opacityRange[0], opacityRange[1], Math.random());
      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * speed;

      return {
        x: x ?? Math.random() * width,
        y: y ?? Math.random() * height,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size,
        opacity,
        color,
        life: 0,
        maxLife: 500 + Math.random() * 1000,
        type,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        pulsePhase: Math.random() * Math.PI * 2,
        trail: [],
        mass: size * 0.5,
        charge: Math.random() > 0.5 ? 1 : -1,
      };
    },
    [colors, particleTypes, speed, sizeRange, opacityRange]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = rect?.height || 600;

    particlesRef.current = Array.from({ length: count }, () => createParticle(w, h));

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const canvasRect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
        active: true,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const animate = () => {
      const parentRect = canvas.parentElement?.getBoundingClientRect();
      const canvasW = parentRect?.width || 800;
      const canvasH = parentRect?.height || 600;

      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.globalCompositeOperation = blendMode;

      timeRef.current += 0.016;
      const t = timeRef.current;

      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Flow field influence
        if (flowField) {
          const fx = Math.sin(p.x * flowFieldScale + t) * Math.cos(p.y * flowFieldScale * 0.5);
          const fy = Math.cos(p.y * flowFieldScale + t * 0.7) * Math.sin(p.x * flowFieldScale * 0.5);
          p.vx += fx * 0.1;
          p.vy += fy * 0.1;
        }

        // Turbulence
        if (turbulence > 0) {
          p.vx += (noise2D(p.x * 0.01, t) - 0.5) * turbulence;
          p.vy += (noise2D(p.y * 0.01, t + 100) - 0.5) * turbulence;
        }

        // Gravity
        p.vx += gravity.x * 0.01;
        p.vy += gravity.y * 0.01;

        // Mouse interaction
        if (mouseRef.current.active && interactive) {
          const dx = mouseRef.current.x - p.x;
          const dy = mouseRef.current.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = (150 - dist) / 150;
            p.vx -= (dx / dist) * force * 0.5;
            p.vy -= (dy / dist) * force * 0.5;
          }
        }

        // Attractors
        for (const att of attractors) {
          const dx = att.x * canvasW - p.x;
          const dy = att.y * canvasH - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < att.radius && dist > 1) {
            const force = (att.strength * (att.radius - dist)) / (att.radius * dist);
            switch (att.type) {
              case "attract":
                p.vx += dx * force;
                p.vy += dy * force;
                break;
              case "repel":
                p.vx -= dx * force;
                p.vy -= dy * force;
                break;
              case "orbit":
                p.vx += -dy * force * 0.5;
                p.vy += dx * force * 0.5;
                break;
            }
          }
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Speed limit
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (spd > speed * 3) {
          p.vx = (p.vx / spd) * speed * 3;
          p.vy = (p.vy / spd) * speed * 3;
        }

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Rotation
        p.rotation += p.rotationSpeed;

        // Pulse
        if (pulseEnabled) {
          p.pulsePhase += 0.02;
          const pulse = Math.sin(p.pulsePhase) * 0.3 + 0.7;
          p.opacity = lerp(opacityRange[0], opacityRange[1], pulse);
        }

        // Trail
        if (trailLength > 0) {
          p.trail.push({ x: p.x, y: p.y, opacity: p.opacity });
          if (p.trail.length > trailLength) p.trail.shift();
        }

        // Life
        p.life++;

        // Wrap around edges
        if (p.x < -50) p.x = canvasW + 50;
        if (p.x > canvasW + 50) p.x = -50;
        if (p.y < -50) p.y = canvasH + 50;
        if (p.y > canvasH + 50) p.y = -50;

        // Reset dead particles
        if (p.life > p.maxLife) {
          const newP = createParticle(canvasW, canvasH);
          particles[i] = newP;
          continue;
        }

        // Draw trail
        if (trailLength > 0 && p.trail.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.5;
          for (let ti = 0; ti < p.trail.length - 1; ti++) {
            const tp = p.trail[ti];
            const alpha = (ti / p.trail.length) * p.opacity * 0.3;
            ctx.globalAlpha = alpha;
            if (ti === 0) {
              ctx.moveTo(tp.x, tp.y);
            } else {
              ctx.lineTo(tp.x, tp.y);
            }
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Draw particle
        drawParticleShape(ctx, p, glowEnabled);
      }

      // Draw connections
      if (showConnections && connectionDistance > 0) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < connectionDistance) {
              const alpha = (1 - dist / connectionDistance) * 0.15;
              ctx.beginPath();
              ctx.strokeStyle = particles[i].color;
              ctx.globalAlpha = alpha;
              ctx.lineWidth = 0.5;
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      ctx.globalCompositeOperation = "source-over";
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      resizeObserver.disconnect();
    };
  }, [
    count, colors, speed, connectionDistance, showConnections, interactive,
    gravity, attractors, particleTypes, trailLength, pulseEnabled, blendMode,
    turbulence, flowField, flowFieldScale, glowEnabled, sizeRange, opacityRange,
    createParticle,
  ]);

  return (
    <div className={`relative w-full h-full ${className}`} style={style}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-auto"
        style={{ opacity: 0.8 }}
      />
    </div>
  );
}

// ============================================================================
// INTERACTIVE PARTICLE DEMO - Showcaseable demo with controls
// ============================================================================

interface ParticleDemoProps {
  className?: string;
}

export function InteractiveParticleDemo({ className = "" }: ParticleDemoProps) {
  const [activePreset, setActivePreset] = useState<string>("aurora");
  const [showControls, setShowControls] = useState(false);

  const presetList = useMemo(() => [
    { key: "aurora", label: "Aurora", icon: "🌌" },
    { key: "nebula", label: "Nebula", icon: "✨" },
    { key: "starfield", label: "Stars", icon: "⭐" },
    { key: "fireflies", label: "Fireflies", icon: "🔥" },
    { key: "circuit", label: "Circuit", icon: "⚡" },
    { key: "snow", label: "Snow", icon: "❄️" },
    { key: "confetti", label: "Confetti", icon: "🎉" },
    { key: "matrix", label: "Matrix", icon: "💻" },
    { key: "dna", label: "DNA", icon: "🧬" },
    { key: "rain", label: "Rain", icon: "🌧️" },
  ], []);

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} style={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.06)", minHeight: 400 }}>
      {/* Particle canvas */}
      <div className="absolute inset-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activePreset}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full h-full"
          >
            <ParticleField preset={activePreset as ParticleFieldProps["preset"]} interactive />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Preset selector */}
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <motion.div
          className="flex flex-wrap gap-2 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          {presetList.map((p) => (
            <motion.button
              key={p.key}
              onClick={() => setActivePreset(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activePreset === p.key
                  ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40"
                  : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/80"
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="mr-1">{p.icon}</span>
              {p.label}
            </motion.button>
          ))}
        </motion.div>
      </div>

      {/* Label */}
      <div className="absolute top-4 left-4 z-10">
        <motion.div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs text-white/70 font-mono">Interactive Particle System</span>
        </motion.div>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 right-4 z-10">
        <motion.p
          className="text-[10px] text-white/30 font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Move mouse to interact
        </motion.p>
      </div>
    </div>
  );
}

// ============================================================================
// PARTICLE TEXT - Text rendered with particles
// ============================================================================

interface ParticleTextProps {
  text: string;
  fontSize?: number;
  colors?: string[];
  particleSize?: number;
  density?: number;
  className?: string;
}

export function ParticleText({
  text,
  fontSize = 80,
  colors = ["#06b6d4", "#8b5cf6", "#ec4899"],
  particleSize = 2,
  density = 4,
  className = "",
}: ParticleTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    originX: number;
    originY: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
  }>>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 600;
    const h = rect?.height || 200;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    // Draw text to offscreen canvas to get pixel data
    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const offCtx = offscreen.getContext("2d")!;
    offCtx.fillStyle = "#fff";
    offCtx.font = `bold ${fontSize}px system-ui`;
    offCtx.textAlign = "center";
    offCtx.textBaseline = "middle";
    offCtx.fillText(text, w / 2, h / 2);

    const imageData = offCtx.getImageData(0, 0, w, h);
    const pixels = imageData.data;

    const points: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < h; y += density) {
      for (let x = 0; x < w; x += density) {
        const i = (y * w + x) * 4;
        if (pixels[i + 3] > 128) {
          points.push({ x, y });
        }
      }
    }

    particlesRef.current = points.map((p) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      originX: p.x,
      originY: p.y,
      vx: 0,
      vy: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: particleSize + Math.random() * particleSize * 0.5,
    }));

    const handleMouseMove = (e: MouseEvent) => {
      const cRect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - cRect.left,
        y: e.clientY - cRect.top,
      };
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        const dx = mouseRef.current.x - p.x;
        const dy = mouseRef.current.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 80) {
          const force = (80 - dist) / 80;
          p.vx -= (dx / dist) * force * 3;
          p.vy -= (dy / dist) * force * 3;
        }

        // Spring back to origin
        p.vx += (p.originX - p.x) * 0.05;
        p.vy += (p.originY - p.y) * 0.05;

        // Damping
        p.vx *= 0.9;
        p.vy *= 0.9;

        p.x += p.vx;
        p.y += p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.8;
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [text, fontSize, colors, particleSize, density]);

  return (
    <div className={`relative ${className}`} style={{ height: fontSize * 1.5 }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// ============================================================================
// MORPHING SHAPES - Particles morph between shapes
// ============================================================================

interface MorphingShapesProps {
  shapes?: Array<Array<{ x: number; y: number }>>;
  particleCount?: number;
  colors?: string[];
  morphDuration?: number;
  className?: string;
}

function generateShapePoints(type: string, count: number, size: number, cx: number, cy: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  switch (type) {
    case "circle":
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = size * (0.8 + Math.random() * 0.4);
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }
      break;
    case "square":
      for (let i = 0; i < count; i++) {
        const side = Math.floor(i / (count / 4));
        const t = (i % (count / 4)) / (count / 4);
        switch (side) {
          case 0: points.push({ x: cx - size + t * size * 2, y: cy - size }); break;
          case 1: points.push({ x: cx + size, y: cy - size + t * size * 2 }); break;
          case 2: points.push({ x: cx + size - t * size * 2, y: cy + size }); break;
          case 3: points.push({ x: cx - size, y: cy + size - t * size * 2 }); break;
        }
      }
      break;
    case "triangle":
      for (let i = 0; i < count; i++) {
        const side = Math.floor(i / (count / 3));
        const t = (i % (count / 3)) / (count / 3);
        const vertices = [
          { x: cx, y: cy - size },
          { x: cx + size * 0.866, y: cy + size * 0.5 },
          { x: cx - size * 0.866, y: cy + size * 0.5 },
        ];
        const v1 = vertices[side % 3];
        const v2 = vertices[(side + 1) % 3];
        points.push({
          x: v1.x + (v2.x - v1.x) * t,
          y: v1.y + (v2.y - v1.y) * t,
        });
      }
      break;
    case "star":
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const r = i % 2 === 0 ? size : size * 0.4;
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }
      break;
    case "heart":
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2;
        const heartX = 16 * Math.pow(Math.sin(t), 3);
        const heartY = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        points.push({
          x: cx + heartX * (size / 18),
          y: cy + heartY * (size / 18),
        });
      }
      break;
    default:
      // Random scatter
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * size;
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }
  }

  return points;
}

export function MorphingShapes({
  particleCount = 200,
  colors = ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981"],
  morphDuration = 3000,
  className = "",
}: MorphingShapesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const shapeIndexRef = useRef(0);
  const morphProgressRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 400;
    const h = rect?.height || 400;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h) * 0.3;
    const shapeNames = ["circle", "square", "triangle", "star", "heart"];

    const allShapes = shapeNames.map((name) =>
      generateShapePoints(name, particleCount, size, cx, cy)
    );

    const particles = allShapes[0].map((p, i) => ({
      x: p.x,
      y: p.y,
      targetX: p.x,
      targetY: p.y,
      prevX: p.x,
      prevY: p.y,
      color: colors[i % colors.length],
      size: 1.5 + Math.random() * 1.5,
    }));

    let lastMorphTime = Date.now();

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      const now = Date.now();
      const elapsed = now - lastMorphTime;

      if (elapsed > morphDuration) {
        lastMorphTime = now;
        shapeIndexRef.current = (shapeIndexRef.current + 1) % allShapes.length;
        const newShape = allShapes[shapeIndexRef.current];
        for (let i = 0; i < particles.length; i++) {
          if (newShape[i]) {
            particles[i].prevX = particles[i].x;
            particles[i].prevY = particles[i].y;
            particles[i].targetX = newShape[i].x;
            particles[i].targetY = newShape[i].y;
          }
        }
      }

      const progress = Math.min(elapsed / (morphDuration * 0.6), 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      for (const p of particles) {
        p.x = lerp(p.prevX, p.targetX, eased);
        p.y = lerp(p.prevY, p.targetY, eased);

        // Add slight wobble
        const wobble = Math.sin(now * 0.002 + p.x * 0.01) * 2;
        const wobbleY = Math.cos(now * 0.003 + p.y * 0.01) * 2;

        ctx.beginPath();
        ctx.arc(p.x + wobble, p.y + wobbleY, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.8;
        ctx.fill();

        // Glow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x + wobble, p.y + wobbleY, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [particleCount, colors, morphDuration]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

// ============================================================================
// WAVE ANIMATION - Animated wave backgrounds
// ============================================================================

interface WaveAnimationProps {
  waves?: number;
  amplitude?: number;
  frequency?: number;
  speed?: number;
  colors?: string[];
  fill?: boolean;
  className?: string;
  height?: number;
}

export function WaveAnimation({
  waves = 3,
  amplitude = 40,
  frequency = 0.02,
  speed = 0.02,
  colors = ["rgba(6, 182, 212, 0.15)", "rgba(139, 92, 246, 0.1)", "rgba(236, 72, 153, 0.08)"],
  fill = true,
  className = "",
  height = 200,
}: WaveAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    let phase = 0;

    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      phase += speed;

      for (let waveIndex = 0; waveIndex < waves; waveIndex++) {
        const waveAmplitude = amplitude * (1 - waveIndex * 0.2);
        const waveFreq = frequency * (1 + waveIndex * 0.3);
        const wavePhase = phase + waveIndex * 0.5;
        const baseY = h * 0.5 + waveIndex * 15;

        ctx.beginPath();
        ctx.moveTo(0, baseY);

        for (let x = 0; x <= w; x += 2) {
          const y =
            baseY +
            Math.sin(x * waveFreq + wavePhase) * waveAmplitude +
            Math.sin(x * waveFreq * 0.5 + wavePhase * 1.5) * waveAmplitude * 0.3;
          ctx.lineTo(x, y);
        }

        if (fill) {
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          ctx.fillStyle = colors[waveIndex % colors.length];
          ctx.fill();
        } else {
          ctx.strokeStyle = colors[waveIndex % colors.length];
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [waves, amplitude, frequency, speed, colors, fill, height]);

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// ============================================================================
// GRADIENT MESH - Animated gradient mesh background
// ============================================================================

interface GradientMeshProps {
  colors?: string[];
  speed?: number;
  complexity?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function GradientMesh({
  colors = ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981"],
  speed = 0.003,
  complexity = 3,
  className = "",
  style = {},
}: GradientMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 800;
    const h = rect?.height || 600;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const blobs = colors.map((color, i) => ({
      x: w * (0.2 + Math.random() * 0.6),
      y: h * (0.2 + Math.random() * 0.6),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      radius: Math.min(w, h) * (0.3 + Math.random() * 0.3),
      color,
      phase: i * Math.PI * 0.5,
    }));

    let time = 0;

    const animate = () => {
      time += speed;
      ctx.clearRect(0, 0, w, h);

      for (const blob of blobs) {
        blob.x += Math.sin(time + blob.phase) * 0.5;
        blob.y += Math.cos(time * 0.7 + blob.phase) * 0.5;

        // Bounce off edges
        if (blob.x < -blob.radius * 0.3) blob.vx = Math.abs(blob.vx);
        if (blob.x > w + blob.radius * 0.3) blob.vx = -Math.abs(blob.vx);
        if (blob.y < -blob.radius * 0.3) blob.vy = Math.abs(blob.vy);
        if (blob.y > h + blob.radius * 0.3) blob.vy = -Math.abs(blob.vy);

        blob.x += blob.vx * 0.3;
        blob.y += blob.vy * 0.3;

        const pulsedRadius = blob.radius + Math.sin(time * 2 + blob.phase) * 20;

        const gradient = ctx.createRadialGradient(
          blob.x, blob.y, 0,
          blob.x, blob.y, pulsedRadius
        );
        gradient.addColorStop(0, blob.color + "40");
        gradient.addColorStop(0.5, blob.color + "15");
        gradient.addColorStop(1, blob.color + "00");

        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, pulsedRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [colors, speed, complexity]);

  return (
    <div className={`relative ${className}`} style={style}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
