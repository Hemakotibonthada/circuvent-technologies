"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useMousePosition } from "@/hooks/useMousePosition";
import { useTheme } from "@/components/ThemeProvider";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useMousePosition();
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const { resolvedTheme } = useTheme();

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
          "rgba(6, 182, 212, ",   // cyan
          "rgba(139, 92, 246, ",  // violet
          "rgba(236, 72, 153, ",  // pink
          "rgba(59, 130, 246, ",  // blue
        ]
      : [
          "rgba(8, 145, 178, ",    // darker cyan for light
          "rgba(124, 58, 237, ",   // darker violet
          "rgba(219, 39, 119, ",   // darker pink
          "rgba(37, 99, 235, ",    // darker blue
        ];

    const lineColor = isDark ? "rgba(6, 182, 212," : "rgba(8, 145, 178,";

    particlesRef.current = Array.from({ length: 50 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * (isDark ? 0.5 : 0.35) + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.opacity + ")";
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const other = particles[j];
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `${lineColor} ${(isDark ? 0.07 : 0.04) * (1 - dist / 140)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationRef.current);
    };
  }, [resolvedTheme]);

  // React to mouse movement
  useEffect(() => {
    const particles = particlesRef.current;
    particles.forEach((p) => {
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200 && dist > 0) {
        const force = (200 - dist) / 200;
        p.vx -= (dx / dist) * force * 0.015;
        p.vy -= (dy / dist) * force * 0.015;
      }
      p.vx *= 0.99;
      p.vy *= 0.99;
    });
  }, [mouse.x, mouse.y]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0"
        style={{ opacity: resolvedTheme === "dark" ? 0.6 : 0.35 }}
      />
      {/* Gradient orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div
          animate={{ x: mouse.normalizedX * 30, y: mouse.normalizedY * 30 }}
          transition={{ type: "spring", stiffness: 50, damping: 30 }}
          className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full blur-[120px]"
          style={{ background: "var(--accent-cyan)", opacity: "var(--orb-opacity)" }}
        />
        <motion.div
          animate={{ x: mouse.normalizedX * -20, y: mouse.normalizedY * -20 }}
          transition={{ type: "spring", stiffness: 50, damping: 30 }}
          className="absolute bottom-1/4 -right-1/4 w-[500px] h-[500px] rounded-full blur-[120px]"
          style={{ background: "var(--accent-violet)", opacity: "var(--orb-opacity)" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[100px]"
          style={{ background: "var(--accent-pink)", opacity: "calc(var(--orb-opacity) * 0.6)" }}
        />
      </div>
    </>
  );
}
