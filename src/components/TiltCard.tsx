"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useMotionValue, useMotionTemplate, useSpring, useTransform } from "framer-motion";
import { useReducedMotion } from "@/hooks/useMousePosition";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  tiltAmount?: number;
  glareEnabled?: boolean;
  scale?: number;
  perspective?: number;
  gradient?: string;
}

export default function TiltCard({
  children,
  className,
  tiltAmount = 15,
  glareEnabled = true,
  scale: hoverScale = 1.02,
  perspective = 1000,
  gradient,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  /*
   * Tilt needs a pointer that can hover and can be positioned precisely.
   *
   * This used to be `window.innerWidth < 768`, which answers a different
   * question: it calls a touch tablet a desktop and a narrow desktop window a
   * phone. A finger has no hover position, so pointer-driven tilt fires once on
   * tap and sticks. `Tilt3D` on the shop already gates on the media query;
   * this is the same rule.
   */
  const [finePointer, setFinePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const disabled = reducedMotion || !finePointer;

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [tiltAmount, -tiltAmount]), {
    stiffness: 200,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-tiltAmount, tiltAmount]), {
    stiffness: 200,
    damping: 20,
  });

  const glareX = useTransform(mouseX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseY, [-0.5, 0.5], [0, 100]);
  const glareOpacity = useSpring(0, { stiffness: 200, damping: 20 });

  /*
   * A motion value interpolated into a plain template literal stringifies to
   * "[object Object]", so the gradient was invalid CSS and the glare has never
   * actually painted. useMotionTemplate is the supported way to build a string
   * that tracks its inputs.
   */
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    glareOpacity.set(0.15);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0);
    mouseY.set(0);
    glareOpacity.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`relative ${className || ""}`}
      /*
       * `perspective` only. `transform-style: preserve-3d` used to be set here
       * and on the rotating layer below, and that is what made these cards
       * unclickable on a Retina MacBook while working on a 1× Windows display.
       *
       * preserve-3d puts the whole subtree into a 3D rendering context, which
       * Blink hit-tests through the compositor by inverting the layer's
       * transform rather than through normal 2D hit-testing. That inversion is
       * done against the rasterisation scale, so it is device-pixel-ratio
       * dependent — the card painted in the right place and answered clicks
       * somewhere else. It reproduces on any 2× display, not just macOS.
       *
       * Nothing here needs it: preserve-3d only matters when *descendants* of a
       * rotated element must sit at their own Z positions, and every child of
       * this card is flat. The rotation below still reads as 3D because that is
       * what this `perspective` does, and it renders identically.
       */
      style={{ perspective }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: hoverScale }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          // Rasterise at the post-rotation size, or text inside a tilted card
          // is resampled from its flat resolution and goes soft.
          willChange: disabled ? undefined : "transform",
        }}
        className="relative w-full h-full"
      >
        {children}

        {/* Glare effect */}
        {glareEnabled && (
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{ opacity: glareOpacity, background: glareBackground }}
          />
        )}

        {/* 3D border glow. Sits behind via `-z-10`; it needs no Z translation,
            which is what let the 3D context go. */}
        {gradient && isHovered && (
          <div
            aria-hidden="true"
            className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r ${gradient} opacity-20 blur-sm -z-10 pointer-events-none`}
          />
        )}
      </motion.div>
    </motion.div>
  );
}
