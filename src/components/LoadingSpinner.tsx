"use client";

import { motion } from "framer-motion";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export default function LoadingSpinner({
  size = "md",
  text,
  className,
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: { container: "w-6 h-6", dot: "w-1.5 h-1.5" },
    md: { container: "w-12 h-12", dot: "w-2.5 h-2.5" },
    lg: { container: "w-20 h-20", dot: "w-3.5 h-3.5" },
  };

  const sizes = sizeMap[size];

  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className || ""}`}>
      <div className={`relative ${sizes.container}`}>
        {/* Orbital dots */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`absolute ${sizes.dot} rounded-full`}
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              background:
                i === 0
                  ? "var(--accent-cyan)"
                  : i === 1
                  ? "var(--accent-violet)"
                  : "var(--accent-pink)",
            }}
            animate={{
              x: [
                Math.cos((i * 2 * Math.PI) / 3) * 16,
                Math.cos((i * 2 * Math.PI) / 3 + (2 * Math.PI) / 3) * 16,
                Math.cos((i * 2 * Math.PI) / 3 + (4 * Math.PI) / 3) * 16,
                Math.cos((i * 2 * Math.PI) / 3) * 16,
              ],
              y: [
                Math.sin((i * 2 * Math.PI) / 3) * 16,
                Math.sin((i * 2 * Math.PI) / 3 + (2 * Math.PI) / 3) * 16,
                Math.sin((i * 2 * Math.PI) / 3 + (4 * Math.PI) / 3) * 16,
                Math.sin((i * 2 * Math.PI) / 3) * 16,
              ],
              scale: [1, 1.3, 1, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.15,
            }}
          />
        ))}

        {/* Center pulse */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
          style={{ background: "var(--accent-cyan)" }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>

      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
