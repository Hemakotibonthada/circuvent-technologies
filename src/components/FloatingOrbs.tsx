"use client";

import { motion } from "framer-motion";

interface FloatingOrbsProps {
  variant?: "hero" | "section" | "subtle" | "dense";
  className?: string;
}

const orbConfigs = {
  hero: [
    { size: 600, color: "var(--accent-cyan)", x: "65%", y: "-10%", opacity: 0.06, blur: 140, duration: 18, dx: 40, dy: 30 },
    { size: 500, color: "var(--accent-violet)", x: "-10%", y: "30%", opacity: 0.05, blur: 120, duration: 22, dx: -30, dy: 40 },
    { size: 400, color: "var(--accent-pink)", x: "80%", y: "60%", opacity: 0.04, blur: 100, duration: 20, dx: 25, dy: -35 },
    { size: 300, color: "var(--accent-cyan)", x: "20%", y: "70%", opacity: 0.03, blur: 80, duration: 25, dx: -20, dy: 25 },
  ],
  section: [
    { size: 400, color: "var(--accent-cyan)", x: "70%", y: "0%", opacity: 0.04, blur: 100, duration: 15, dx: 20, dy: 15 },
    { size: 300, color: "var(--accent-violet)", x: "-5%", y: "50%", opacity: 0.03, blur: 80, duration: 18, dx: -15, dy: 20 },
  ],
  subtle: [
    { size: 350, color: "var(--accent-cyan)", x: "60%", y: "20%", opacity: 0.025, blur: 90, duration: 20, dx: 15, dy: 10 },
  ],
  dense: [
    { size: 500, color: "var(--accent-cyan)", x: "0%", y: "-15%", opacity: 0.06, blur: 120, duration: 16, dx: 30, dy: 25 },
    { size: 450, color: "var(--accent-violet)", x: "70%", y: "10%", opacity: 0.05, blur: 110, duration: 20, dx: -25, dy: 35 },
    { size: 400, color: "var(--accent-pink)", x: "30%", y: "60%", opacity: 0.04, blur: 100, duration: 18, dx: 20, dy: -30 },
    { size: 350, color: "#10b981", x: "85%", y: "70%", opacity: 0.03, blur: 90, duration: 22, dx: -15, dy: 20 },
    { size: 300, color: "var(--accent-violet)", x: "-10%", y: "80%", opacity: 0.035, blur: 80, duration: 24, dx: 25, dy: -15 },
  ],
};

export default function FloatingOrbs({ variant = "section", className = "" }: FloatingOrbsProps) {
  const orbs = orbConfigs[variant];

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: orb.size,
            height: orb.size,
            background: orb.color,
            left: orb.x,
            top: orb.y,
            opacity: orb.opacity,
            filter: `blur(${orb.blur}px)`,
          }}
          animate={{
            x: [0, orb.dx, 0, -orb.dx * 0.5, 0],
            y: [0, -orb.dy, 0, orb.dy * 0.7, 0],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 2,
          }}
        />
      ))}
    </div>
  );
}
