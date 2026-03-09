"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

// ============================================================================
// ANIMATED GLOBE - Interactive rotating globe with connection arcs
// ============================================================================

interface GlobePoint {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  size?: number;
}

interface GlobeConnection {
  from: number;
  to: number;
  color?: string;
}

interface AnimatedGlobeProps {
  points?: GlobePoint[];
  connections?: GlobeConnection[];
  size?: number;
  rotationSpeed?: number;
  interactive?: boolean;
  showGrid?: boolean;
  baseColor?: string;
  glowColor?: string;
  className?: string;
}

function latLngToXYZ(lat: number, lng: number, radius: number): { x: number; y: number; z: number } {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

function rotateY(x: number, y: number, z: number, angle: number): { x: number; y: number; z: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos + z * sin,
    y,
    z: -x * sin + z * cos,
  };
}

function rotateX(x: number, y: number, z: number, angle: number): { x: number; y: number; z: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x,
    y: y * cos - z * sin,
    z: y * sin + z * cos,
  };
}

const DEFAULT_GLOBE_POINTS: GlobePoint[] = [
  { lat: 40.7128, lng: -74.006, label: "New York", color: "#06b6d4" },
  { lat: 51.5074, lng: -0.1278, label: "London", color: "#8b5cf6" },
  { lat: 35.6762, lng: 139.6503, label: "Tokyo", color: "#ec4899" },
  { lat: 1.3521, lng: 103.8198, label: "Singapore", color: "#10b981" },
  { lat: -33.8688, lng: 151.2093, label: "Sydney", color: "#f59e0b" },
  { lat: 48.8566, lng: 2.3522, label: "Paris", color: "#6366f1" },
  { lat: 55.7558, lng: 37.6173, label: "Moscow", color: "#ef4444" },
  { lat: 22.3193, lng: 114.1694, label: "Hong Kong", color: "#14b8a6" },
  { lat: -23.5505, lng: -46.6333, label: "São Paulo", color: "#a855f7" },
  { lat: 37.5665, lng: 126.978, label: "Seoul", color: "#f43f5e" },
  { lat: 19.076, lng: 72.8777, label: "Mumbai", color: "#06b6d4" },
  { lat: 25.2048, lng: 55.2708, label: "Dubai", color: "#fbbf24" },
  { lat: 17.385, lng: 78.4867, label: "Hyderabad", color: "#22d3ee", size: 5 },
  { lat: 12.9716, lng: 77.5946, label: "Bangalore", color: "#a78bfa" },
];

const DEFAULT_GLOBE_CONNECTIONS: GlobeConnection[] = [
  { from: 12, to: 0, color: "#06b6d4" },
  { from: 12, to: 1, color: "#8b5cf6" },
  { from: 12, to: 2, color: "#ec4899" },
  { from: 12, to: 3, color: "#10b981" },
  { from: 12, to: 7, color: "#14b8a6" },
  { from: 12, to: 13, color: "#a78bfa" },
  { from: 0, to: 1, color: "#6366f1" },
  { from: 1, to: 5, color: "#8b5cf6" },
  { from: 2, to: 9, color: "#f43f5e" },
  { from: 3, to: 4, color: "#f59e0b" },
  { from: 10, to: 11, color: "#fbbf24" },
  { from: 10, to: 12, color: "#22d3ee" },
];

export function AnimatedGlobe({
  points = DEFAULT_GLOBE_POINTS,
  connections = DEFAULT_GLOBE_CONNECTIONS,
  size = 400,
  rotationSpeed = 0.003,
  interactive = true,
  showGrid = true,
  baseColor = "rgba(6, 182, 212, 0.08)",
  glowColor = "#06b6d4",
  className = "",
}: AnimatedGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const tiltRef = useRef(-0.3);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const [hoveredPoint, setHoveredPoint] = useState<GlobePoint | null>(null);

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
    const radius = size * 0.38;

    const handleMouseDown = (e: MouseEvent) => {
      if (!interactive) return;
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        velocityRef.current = { x: dx * 0.005, y: dy * 0.005 };
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }

      // Check hover on points
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found: GlobePoint | null = null;
      for (const point of points) {
        const pos3d = latLngToXYZ(point.lat, point.lng, radius);
        const rotated = rotateY(pos3d.x, pos3d.y, pos3d.z, rotationRef.current);
        const tilted = rotateX(rotated.x, rotated.y, rotated.z, tiltRef.current);
        if (tilted.z < 0) continue; // behind globe
        const px = center + tilted.x;
        const py = center + tilted.y;
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < 12) {
          found = point;
          break;
        }
      }
      setHoveredPoint(found);
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mousemove", handleMouseMove);

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      time += 0.016;

      // Apply velocity / rotation
      if (isDraggingRef.current) {
        rotationRef.current += velocityRef.current.x;
        tiltRef.current = Math.max(-1, Math.min(1, tiltRef.current + velocityRef.current.y));
      } else {
        rotationRef.current += rotationSpeed;
        velocityRef.current.x *= 0.95;
        velocityRef.current.y *= 0.95;
        rotationRef.current += velocityRef.current.x;
        tiltRef.current += velocityRef.current.y;
      }

      // Globe outline with glow
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      const glowGrad = ctx.createRadialGradient(
        center - radius * 0.3, center - radius * 0.3, 0,
        center, center, radius * 1.2
      );
      glowGrad.addColorStop(0, `${glowColor}15`);
      glowGrad.addColorStop(0.5, `${glowColor}08`);
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fill();

      // Globe border
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Grid lines
      if (showGrid) {
        // Latitude lines
        for (let lat = -60; lat <= 60; lat += 30) {
          ctx.beginPath();
          let started = false;
          for (let lng = 0; lng <= 360; lng += 5) {
            const pos3d = latLngToXYZ(lat, lng, radius);
            const rotated = rotateY(pos3d.x, pos3d.y, pos3d.z, rotationRef.current);
            const tilted = rotateX(rotated.x, rotated.y, rotated.z, tiltRef.current);
            if (tilted.z < 0) {
              started = false;
              continue;
            }
            const px = center + tilted.x;
            const py = center + tilted.y;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }

        // Longitude lines
        for (let lng = 0; lng < 360; lng += 30) {
          ctx.beginPath();
          let started = false;
          for (let lat = -90; lat <= 90; lat += 5) {
            const pos3d = latLngToXYZ(lat, lng, radius);
            const rotated = rotateY(pos3d.x, pos3d.y, pos3d.z, rotationRef.current);
            const tilted = rotateX(rotated.x, rotated.y, rotated.z, tiltRef.current);
            if (tilted.z < 0) {
              started = false;
              continue;
            }
            const px = center + tilted.x;
            const py = center + tilted.y;
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 0.3;
          ctx.stroke();
        }
      }

      // Draw connections
      for (const conn of connections) {
        const p1 = points[conn.from];
        const p2 = points[conn.to];
        if (!p1 || !p2) continue;

        const pos1 = latLngToXYZ(p1.lat, p1.lng, radius);
        const rot1 = rotateY(pos1.x, pos1.y, pos1.z, rotationRef.current);
        const tilt1 = rotateX(rot1.x, rot1.y, rot1.z, tiltRef.current);

        const pos2 = latLngToXYZ(p2.lat, p2.lng, radius);
        const rot2 = rotateY(pos2.x, pos2.y, pos2.z, rotationRef.current);
        const tilt2 = rotateX(rot2.x, rot2.y, rot2.z, tiltRef.current);

        if (tilt1.z < -radius * 0.3 && tilt2.z < -radius * 0.3) continue;

        const x1 = center + tilt1.x;
        const y1 = center + tilt1.y;
        const x2 = center + tilt2.x;
        const y2 = center + tilt2.y;

        // Arc
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const arcHeight = dist * 0.3;
        const cpX = midX;
        const cpY = midY - arcHeight;

        const visibility = Math.min(
          Math.max((tilt1.z + radius * 0.5) / radius, 0),
          Math.max((tilt2.z + radius * 0.5) / radius, 0)
        );

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cpX, cpY, x2, y2);
        ctx.strokeStyle = conn.color || "#06b6d4";
        ctx.lineWidth = 1;
        ctx.globalAlpha = visibility * 0.3;
        ctx.stroke();

        // Animated dot on arc
        const t = (Math.sin(time * 2 + conn.from) + 1) * 0.5;
        const dotX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cpX + t * t * x2;
        const dotY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cpY + t * t * y2;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
        ctx.fillStyle = conn.color || "#06b6d4";
        ctx.globalAlpha = visibility * 0.7;
        ctx.fill();

        ctx.globalAlpha = 1;
      }

      // Draw points
      for (const point of points) {
        const pos3d = latLngToXYZ(point.lat, point.lng, radius);
        const rotated = rotateY(pos3d.x, pos3d.y, pos3d.z, rotationRef.current);
        const tilted = rotateX(rotated.x, rotated.y, rotated.z, tiltRef.current);

        if (tilted.z < -radius * 0.2) continue;

        const visibility = (tilted.z + radius * 0.5) / (radius * 1.5);
        const px = center + tilted.x;
        const py = center + tilted.y;
        const pointColor = point.color || "#06b6d4";
        const pointSize = point.size || 3;
        const isHovered = hoveredPoint === point;

        // Glow
        if (visibility > 0.3) {
          ctx.beginPath();
          ctx.arc(px, py, pointSize * 4, 0, Math.PI * 2);
          ctx.fillStyle = pointColor;
          ctx.globalAlpha = visibility * 0.1;
          ctx.fill();

          // Pulse ring
          const pulseSize = pointSize * 2 + Math.sin(time * 3) * 3;
          ctx.beginPath();
          ctx.arc(px, py, pulseSize, 0, Math.PI * 2);
          ctx.strokeStyle = pointColor;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = visibility * 0.2;
          ctx.stroke();
        }

        // Point
        ctx.beginPath();
        ctx.arc(px, py, isHovered ? pointSize * 1.5 : pointSize, 0, Math.PI * 2);
        ctx.fillStyle = pointColor;
        ctx.globalAlpha = visibility;
        ctx.fill();

        // Label
        if (isHovered && point.label && visibility > 0.5) {
          ctx.font = "11px system-ui";
          ctx.fillStyle = pointColor;
          ctx.globalAlpha = 1;
          ctx.textAlign = "center";
          ctx.fillText(point.label, px, py - 14);
        }

        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [points, connections, size, rotationSpeed, interactive, showGrid, baseColor, glowColor, hoveredPoint]);

  return (
    <div className={`relative inline-block ${className}`}>
      <canvas
        ref={canvasRef}
        className="cursor-grab active:cursor-grabbing"
        style={{ width: size, height: size }}
      />
      {hoveredPoint && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-medium pointer-events-none"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            color: hoveredPoint.color || "var(--text-primary)",
            backdropFilter: "blur(8px)",
          }}
        >
          📍 {hoveredPoint.label}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CIRCUIT BOARD ANIMATION
// ============================================================================

interface CircuitBoardProps {
  width?: number;
  height?: number;
  nodeCount?: number;
  colors?: string[];
  speed?: number;
  className?: string;
}

export function CircuitBoard({
  width = 600,
  height = 400,
  nodeCount = 30,
  colors = ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981"],
  speed = 1,
  className = "",
}: CircuitBoardProps) {
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

    // Generate grid-aligned nodes
    const gridSize = 30;
    const nodes: Array<{
      x: number;
      y: number;
      connections: number[];
      color: string;
      size: number;
      type: "chip" | "junction" | "terminal";
      pulse: number;
    }> = [];

    for (let i = 0; i < nodeCount; i++) {
      const x = Math.round((Math.random() * (width - 60) + 30) / gridSize) * gridSize;
      const y = Math.round((Math.random() * (height - 60) + 30) / gridSize) * gridSize;
      const type = Math.random() > 0.7 ? "chip" : Math.random() > 0.5 ? "junction" : "terminal";
      nodes.push({
        x,
        y,
        connections: [],
        color: colors[Math.floor(Math.random() * colors.length)],
        size: type === "chip" ? 8 : type === "junction" ? 4 : 3,
        type,
        pulse: Math.random() * Math.PI * 2,
      });
    }

    // Create connections between nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      const nearest = nodes
        .map((n, j) => ({
          index: j,
          dist: Math.abs(n.x - nodes[i].x) + Math.abs(n.y - nodes[i].y),
        }))
        .filter((n) => n.index !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2 + Math.floor(Math.random() * 2));

      for (const n of nearest) {
        if (!nodes[i].connections.includes(n.index)) {
          nodes[i].connections.push(n.index);
        }
      }
    }

    // Data packets traveling along paths
    interface DataPacket {
      fromNode: number;
      toNode: number;
      progress: number;
      speed: number;
      color: string;
      size: number;
    }

    const packets: DataPacket[] = [];

    // Spawn packets periodically
    let spawnTimer = 0;

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016 * speed;
      spawnTimer += 0.016 * speed;

      // Spawn new packets
      if (spawnTimer > 0.3 && packets.length < 20) {
        spawnTimer = 0;
        const fromNode = Math.floor(Math.random() * nodes.length);
        const node = nodes[fromNode];
        if (node.connections.length > 0) {
          const toNode = node.connections[Math.floor(Math.random() * node.connections.length)];
          packets.push({
            fromNode,
            toNode,
            progress: 0,
            speed: 0.5 + Math.random() * 1.5,
            color: node.color,
            size: 2 + Math.random() * 2,
          });
        }
      }

      // Draw traces (connections)
      for (const node of nodes) {
        for (const connIdx of node.connections) {
          const target = nodes[connIdx];
          if (!target) continue;

          // Draw L-shaped traces
          const midX = target.x;
          const midY = node.y;

          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(midX, midY);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = "rgba(255,255,255,0.04)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Glowing trace
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(midX, midY);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = node.color;
          ctx.globalAlpha = 0.06;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.pulse += 0.02;
        const pulseAlpha = 0.3 + Math.sin(node.pulse) * 0.2;

        // Glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = 0.05;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (node.type === "chip") {
          // Draw chip shape
          const s = node.size;
          ctx.fillStyle = node.color;
          ctx.globalAlpha = pulseAlpha;
          ctx.fillRect(node.x - s, node.y - s, s * 2, s * 2);

          // Pins
          for (let p = -1; p <= 1; p += 2) {
            ctx.fillRect(node.x + p * s - 1, node.y - s - 3, 2, 3);
            ctx.fillRect(node.x + p * s - 1, node.y + s, 2, 3);
            ctx.fillRect(node.x - s - 3, node.y + p * s * 0.5 - 1, 3, 2);
            ctx.fillRect(node.x + s, node.y + p * s * 0.5 - 1, 3, 2);
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.globalAlpha = pulseAlpha;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Update and draw packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const packet = packets[i];
        packet.progress += 0.016 * packet.speed;

        if (packet.progress >= 1) {
          // Continue to next node or remove
          const currentNode = nodes[packet.toNode];
          if (currentNode && currentNode.connections.length > 0 && Math.random() > 0.3) {
            packet.fromNode = packet.toNode;
            packet.toNode = currentNode.connections[Math.floor(Math.random() * currentNode.connections.length)];
            packet.progress = 0;
          } else {
            packets.splice(i, 1);
            continue;
          }
        }

        const from = nodes[packet.fromNode];
        const to = nodes[packet.toNode];
        if (!from || !to) continue;

        // L-shaped movement
        const midX = to.x;
        const midY = from.y;
        let px: number, py: number;

        if (packet.progress < 0.5) {
          const t = packet.progress * 2;
          px = from.x + (midX - from.x) * t;
          py = from.y;
        } else {
          const t = (packet.progress - 0.5) * 2;
          px = midX;
          py = midY + (to.y - midY) * t;
        }

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, packet.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = packet.color;
        ctx.globalAlpha = 0.15;
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(px, py, packet.size, 0, Math.PI * 2);
        ctx.fillStyle = packet.color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [width, height, nodeCount, colors, speed]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" style={{ width, height }} />
    </div>
  );
}

// ============================================================================
// NEURAL NETWORK VISUALIZATION
// ============================================================================

interface NeuralNetworkProps {
  layers?: number[];
  width?: number;
  height?: number;
  colors?: string[];
  animated?: boolean;
  className?: string;
}

export function NeuralNetworkViz({
  layers = [4, 6, 8, 6, 3],
  width = 600,
  height = 400,
  colors = ["#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"],
  animated = true,
  className = "",
}: NeuralNetworkProps) {
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

    const padding = 60;
    const layerGap = (width - padding * 2) / (layers.length - 1);

    // Generate node positions
    const nodePositions: Array<Array<{ x: number; y: number }>> = [];
    for (let l = 0; l < layers.length; l++) {
      const layerNodes: Array<{ x: number; y: number }> = [];
      const count = layers[l];
      const layerHeight = height - padding * 2;
      const gap = layerHeight / (count + 1);

      for (let n = 0; n < count; n++) {
        layerNodes.push({
          x: padding + l * layerGap,
          y: padding + gap * (n + 1),
        });
      }
      nodePositions.push(layerNodes);
    }

    // Generate weights
    const weights: number[][][] = [];
    for (let l = 0; l < layers.length - 1; l++) {
      const layerWeights: number[][] = [];
      for (let n = 0; n < layers[l]; n++) {
        const nodeWeights: number[] = [];
        for (let nn = 0; nn < layers[l + 1]; nn++) {
          nodeWeights.push(Math.random() * 2 - 1);
        }
        layerWeights.push(nodeWeights);
      }
      weights.push(layerWeights);
    }

    // Signals
    interface Signal {
      fromLayer: number;
      fromNode: number;
      toNode: number;
      progress: number;
      color: string;
    }

    const signals: Signal[] = [];
    let signalTimer = 0;

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.016;

      // Draw connections
      for (let l = 0; l < layers.length - 1; l++) {
        for (let n = 0; n < layers[l]; n++) {
          for (let nn = 0; nn < layers[l + 1]; nn++) {
            const from = nodePositions[l][n];
            const to = nodePositions[l + 1][nn];
            const weight = weights[l][n][nn];
            const alpha = Math.abs(weight) * 0.12;

            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.strokeStyle = weight > 0 ? colors[l % colors.length] : "#ef4444";
            ctx.globalAlpha = alpha;
            ctx.lineWidth = Math.abs(weight) * 1.5;
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Spawn signals
      if (animated) {
        signalTimer += 0.016;
        if (signalTimer > 0.15 && signals.length < 30) {
          signalTimer = 0;
          const fromNode = Math.floor(Math.random() * layers[0]);
          signals.push({
            fromLayer: 0,
            fromNode,
            toNode: Math.floor(Math.random() * layers[1]),
            progress: 0,
            color: colors[0],
          });
        }
      }

      // Update signals
      for (let i = signals.length - 1; i >= 0; i--) {
        const sig = signals[i];
        sig.progress += 0.025;

        if (sig.progress >= 1) {
          const nextLayer = sig.fromLayer + 1;
          if (nextLayer < layers.length - 1) {
            sig.fromLayer = nextLayer;
            sig.fromNode = sig.toNode;
            sig.toNode = Math.floor(Math.random() * layers[nextLayer + 1]);
            sig.progress = 0;
            sig.color = colors[nextLayer % colors.length];
          } else {
            signals.splice(i, 1);
            continue;
          }
        }

        const from = nodePositions[sig.fromLayer][sig.fromNode];
        const to = nodePositions[sig.fromLayer + 1]?.[sig.toNode];
        if (!from || !to) continue;

        const px = from.x + (to.x - from.x) * sig.progress;
        const py = from.y + (to.y - from.y) * sig.progress;

        // Glow
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = sig.color;
        ctx.globalAlpha = 0.2;
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = sig.color;
        ctx.globalAlpha = 0.9;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Draw nodes
      for (let l = 0; l < layers.length; l++) {
        const color = colors[l % colors.length];
        for (let n = 0; n < layers[l]; n++) {
          const pos = nodePositions[l][n];
          const pulse = Math.sin(time * 2 + l + n) * 0.2 + 0.8;

          // Outer ring
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.08;
          ctx.fill();

          // Node
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = pulse;
          ctx.fill();

          // Inner highlight
          ctx.beginPath();
          ctx.arc(pos.x - 1, pos.y - 1, 2, 0, Math.PI * 2);
          ctx.fillStyle = "#fff";
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Labels
      const layerLabels = ["Input", "Hidden", "Hidden", "Hidden", "Output"];
      for (let l = 0; l < layers.length; l++) {
        const label = l === 0 ? "Input" : l === layers.length - 1 ? "Output" : `Hidden ${l}`;
        ctx.font = "10px system-ui";
        ctx.fillStyle = colors[l % colors.length];
        ctx.globalAlpha = 0.5;
        ctx.textAlign = "center";
        ctx.fillText(label, nodePositions[l][0].x, height - 15);
        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [layers, width, height, colors, animated]);

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} style={{ width, height }} className="w-full h-full" />
    </div>
  );
}

// ============================================================================
// ORBIT ANIMATION - Logo/icons orbiting around a center
// ============================================================================

interface OrbitItem {
  icon: string;
  label: string;
  color?: string;
}

interface OrbitAnimationProps {
  items: OrbitItem[];
  centerIcon?: React.ReactNode;
  centerLabel?: string;
  size?: number;
  speed?: number;
  className?: string;
}

export function OrbitAnimation({
  items,
  centerIcon,
  centerLabel = "Core",
  size = 400,
  speed = 0.5,
  className = "",
}: OrbitAnimationProps) {
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

    // Create orbits
    const orbitCount = Math.ceil(items.length / 4);
    const orbits: Array<{
      radius: number;
      items: Array<OrbitItem & { angle: number; orbitSpeed: number }>;
      color: string;
    }> = [];

    let itemIndex = 0;
    for (let o = 0; o < orbitCount; o++) {
      const radius = (o + 1) * (size * 0.15);
      const itemsInOrbit = Math.min(4 + o, items.length - itemIndex);
      const orbitItems: Array<OrbitItem & { angle: number; orbitSpeed: number }> = [];

      for (let i = 0; i < itemsInOrbit && itemIndex < items.length; i++) {
        orbitItems.push({
          ...items[itemIndex],
          angle: (i / itemsInOrbit) * Math.PI * 2,
          orbitSpeed: speed * (1 / (o + 1)) * (o % 2 === 0 ? 1 : -1),
        });
        itemIndex++;
      }

      orbits.push({
        radius,
        items: orbitItems,
        color: "rgba(6, 182, 212, 0.08)",
      });
    }

    let time = 0;

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      time += 0.016;

      // Center glow
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, 40);
      gradient.addColorStop(0, "rgba(6, 182, 212, 0.15)");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center, center, 40, 0, Math.PI * 2);
      ctx.fill();

      // Center dot
      ctx.beginPath();
      ctx.arc(center, center, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#06b6d4";
      ctx.fill();

      // Center label
      ctx.font = "bold 10px system-ui";
      ctx.fillStyle = "rgba(6, 182, 212, 0.7)";
      ctx.textAlign = "center";
      ctx.fillText(centerLabel, center, center + 25);

      // Draw orbits
      for (const orbit of orbits) {
        // Orbit path
        ctx.beginPath();
        ctx.arc(center, center, orbit.radius, 0, Math.PI * 2);
        ctx.strokeStyle = orbit.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Items
        for (const item of orbit.items) {
          item.angle += item.orbitSpeed * 0.016;

          const x = center + Math.cos(item.angle) * orbit.radius;
          const y = center + Math.sin(item.angle) * orbit.radius;

          // Connection to center
          ctx.beginPath();
          ctx.moveTo(center, center);
          ctx.lineTo(x, y);
          ctx.strokeStyle = item.color || "rgba(6, 182, 212, 0.06)";
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Item background
          ctx.beginPath();
          ctx.arc(x, y, 16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(10, 15, 26, 0.8)";
          ctx.fill();
          ctx.strokeStyle = item.color || "rgba(6, 182, 212, 0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Icon (emoji)
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(item.icon, x, y);

          // Label
          ctx.font = "9px system-ui";
          ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
          ctx.textBaseline = "top";
          ctx.fillText(item.label, x, y + 20);
          ctx.textBaseline = "alphabetic";
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, [items, centerLabel, size, speed]);

  return (
    <div className={`relative inline-block ${className}`}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} />
    </div>
  );
}

// ============================================================================
// TYPING CODE DEMO - Shows code being written with output
// ============================================================================

interface TypingCodeDemoProps {
  steps: Array<{
    code: string;
    output?: string;
    highlight?: string;
    description?: string;
  }>;
  language?: string;
  className?: string;
}

export function TypingCodeDemo({
  steps,
  language = "typescript",
  className = "",
}: TypingCodeDemoProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [typedCode, setTypedCode] = useState("");
  const [showOutput, setShowOutput] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (currentStep >= steps.length) {
      setIsComplete(true);
      return;
    }

    const step = steps[currentStep];
    setShowOutput(false);
    setTypedCode("");

    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex < step.code.length) {
        setTypedCode(step.code.slice(0, charIndex + 1));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        if (step.output) {
          setTimeout(() => setShowOutput(true), 300);
        }
        setTimeout(() => {
          setCurrentStep((prev) => prev + 1);
        }, step.output ? 2000 : 1000);
      }
    }, 25);

    return () => clearInterval(typeInterval);
  }, [currentStep, steps]);

  // Reset when done
  useEffect(() => {
    if (isComplete) {
      const timeout = setTimeout(() => {
        setCurrentStep(0);
        setIsComplete(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isComplete]);

  const currentStepData = steps[currentStep] || steps[steps.length - 1];

  return (
    <div className={`overflow-hidden rounded-2xl ${className}`} style={{
      background: "#1e1e2e",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{
        background: "rgba(0,0,0,0.3)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-xs font-mono text-[#6c7086]">demo.{language}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-[#6c7086]">
            Step {Math.min(currentStep + 1, steps.length)}/{steps.length}
          </div>
          <div className="w-16 h-1 rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-cyan-500"
              animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Description */}
      {currentStepData?.description && (
        <div className="px-4 py-2 text-xs text-[#6c7086]" style={{
          background: "rgba(6, 182, 212, 0.03)",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
        }}>
          💡 {currentStepData.description}
        </div>
      )}

      {/* Code */}
      <div className="p-4 font-mono text-sm">
        <pre className="text-[#a6adc8]" style={{ margin: 0 }}>
          {typedCode}
          {!isComplete && (
            <motion.span
              className="text-[#528bff]"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              ▎
            </motion.span>
          )}
        </pre>
      </div>

      {/* Output */}
      <AnimatePresence>
        {showOutput && currentStepData?.output && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            <div className="p-4 font-mono text-sm text-emerald-400">
              {currentStepData.output.split("\n").map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  {line}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AnimatedGlobe;
