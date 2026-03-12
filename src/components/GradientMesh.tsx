"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

/**
 * Animated gradient mesh background with flowing organic shapes.
 * Uses canvas for smooth 60fps animation.
 */

interface GradientMeshProps {
  className?: string;
  speed?: number;
  complexity?: number;
  opacity?: number;
}

interface MeshPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  phase: number;
}

export default function GradientMesh({
  className,
  speed = 0.5,
  complexity = 5,
  opacity: baseOpacity = 0.15,
}: GradientMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const pointsRef = useRef<MeshPoint[]>([]);
  const { resolvedTheme } = useTheme();
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const isDark = resolvedTheme === "dark";

    const colors = isDark
      ? [
          "rgba(6, 182, 212, 0.4)",
          "rgba(139, 92, 246, 0.35)",
          "rgba(236, 72, 153, 0.3)",
          "rgba(59, 130, 246, 0.35)",
          "rgba(16, 185, 129, 0.3)",
        ]
      : [
          "rgba(8, 145, 178, 0.2)",
          "rgba(124, 58, 237, 0.18)",
          "rgba(219, 39, 119, 0.15)",
          "rgba(37, 99, 235, 0.18)",
          "rgba(16, 185, 129, 0.15)",
        ];

    // Initialize mesh points
    pointsRef.current = Array.from({ length: complexity }, (_, i) => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      radius: Math.random() * 300 + 200,
      color: colors[i % colors.length],
      phase: Math.random() * Math.PI * 2,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      timeRef.current += 0.01;

      const points = pointsRef.current;

      points.forEach((point) => {
        // Organic movement with sine waves
        point.x += point.vx + Math.sin(timeRef.current + point.phase) * 0.3;
        point.y += point.vy + Math.cos(timeRef.current * 0.7 + point.phase) * 0.3;

        // Bounce off edges with padding
        const padding = point.radius;
        if (point.x < -padding) point.x = canvas.width + padding;
        if (point.x > canvas.width + padding) point.x = -padding;
        if (point.y < -padding) point.y = canvas.height + padding;
        if (point.y > canvas.height + padding) point.y = -padding;

        // Breathing radius
        const breathingRadius = point.radius + Math.sin(timeRef.current * 0.5 + point.phase) * 50;

        // Draw radial gradient blob
        const gradient = ctx.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          breathingRadius
        );
        gradient.addColorStop(0, point.color);
        gradient.addColorStop(1, "transparent");

        ctx.beginPath();
        ctx.arc(point.x, point.y, breathingRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [resolvedTheme, speed, complexity]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-0 ${className || ""}`}
      style={{ opacity: baseOpacity, mixBlendMode: "screen" }}
    />
  );
}

/**
 * Animated dot grid background
 */
export function DotGrid({
  className,
  dotSize = 1.5,
  gap = 30,
  color,
  animated = true,
}: {
  className?: string;
  dotSize?: number;
  gap?: number;
  color?: string;
  animated?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const { resolvedTheme } = useTheme();
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    if (animated) window.addEventListener("mousemove", handleMouse);

    const isDark = resolvedTheme === "dark";
    const dotColor = color || (isDark ? "rgba(148, 163, 184, 0.15)" : "rgba(15, 23, 42, 0.08)");
    const highlightColor = isDark ? "rgba(6, 182, 212, 0.5)" : "rgba(8, 145, 178, 0.4)";

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cols = Math.ceil(canvas.width / gap);
      const rows = Math.ceil(canvas.height / gap);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * gap + gap / 2;
          const y = r * gap + gap / 2;

          let size = dotSize;
          let fillColor = dotColor;

          if (animated) {
            const dx = mouseRef.current.x - x;
            const dy = mouseRef.current.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 120) {
              const factor = 1 - dist / 120;
              size = dotSize + factor * 3;
              fillColor = highlightColor;
            }
          }

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
      }

      if (animated) {
        animationRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (animated) window.removeEventListener("mousemove", handleMouse);
      cancelAnimationFrame(animationRef.current);
    };
  }, [resolvedTheme, dotSize, gap, color, animated]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-0 ${className || ""}`}
    />
  );
}

/**
 * Animated noise texture overlay
 */
export function NoiseTexture({
  opacity = 0.02,
  className,
}: {
  opacity?: number;
  className?: string;
}) {
  return (
    <div
      className={`fixed inset-0 pointer-events-none z-[9999] ${className || ""}`}
      style={{
        opacity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundRepeat: "repeat",
        backgroundSize: "256px 256px",
      }}
    />
  );
}
