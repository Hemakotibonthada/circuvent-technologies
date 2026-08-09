"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  variant?: "pills" | "underline" | "bordered";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  variant = "pills",
  size = "md",
  className,
}: TabsProps) {
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const activeTabElement = tabRefs.current.get(activeTab);
    if (activeTabElement && tabsRef.current) {
      const containerRect = tabsRef.current.getBoundingClientRect();
      const tabRect = activeTabElement.getBoundingClientRect();

      if (variant === "underline") {
        setIndicatorStyle({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
        });
      }
    }
  }, [activeTab, variant]);

  const sizeClasses = {
    // A tab is a primary navigation control, so it gets a full 44px target at
    // every size. Only the horizontal padding and type scale change.
    sm: "min-h-[44px] px-3 py-1.5 text-xs",
    md: "min-h-[44px] px-4 py-2 text-sm",
    lg: "min-h-[44px] px-6 py-3 text-base",
  };

  return (
    <div
      ref={tabsRef}
      className={cn(
        /*
         * Scroll rather than push the page sideways.
         *
         * A tab strip is as wide as its labels, and on /docs that came to
         * 575px inside a 390px viewport -- so the whole page scrolled
         * horizontally and every other element on it moved. max-w-full
         * plus overflow-x-auto keeps the overflow inside the strip, where
         * it belongs.
         */
        "relative inline-flex max-w-full overflow-x-auto",
        variant === "pills" && "gap-1 p-1 rounded-xl",
        variant === "underline" && "gap-0",
        variant === "bordered" &&
          "gap-0 rounded-xl overflow-hidden",
        className
      )}
      style={
        variant === "pills"
          ? {
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
            }
          : variant === "bordered"
          ? {
              border: "1px solid var(--border-primary)",
            }
          : {
              borderBottom: "1px solid var(--border-primary)",
            }
      }
    >
      {variant === "underline" && (
        <motion.div
          className="absolute bottom-0 h-[2px] bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full"
          animate={indicatorStyle as Record<string, number>}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}

      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative flex items-center gap-2 font-medium transition-all duration-300 cursor-pointer whitespace-nowrap",
              sizeClasses[size],
              variant === "pills" && "rounded-lg",
              variant === "bordered" && (isActive ? "" : ""),
              !isActive && "hover:text-[var(--text-secondary)]"
            )}
            style={
              isActive
                ? variant === "pills"
                  ? {
                      background: "var(--accent-cyan-muted)",
                      color: "var(--text-primary)",
                    }
                  : variant === "bordered"
                  ? {
                      background: "var(--bg-surface)",
                      color: "var(--text-primary)",
                      borderBottom: "2px solid var(--accent-cyan)",
                    }
                  : { color: "var(--text-primary)" }
                : { color: "var(--text-muted)" }
            }
          >
            {variant === "pills" && isActive && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 rounded-lg"
                style={{
                  background: "var(--accent-cyan-muted)",
                  border: "1px solid var(--border-accent)",
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: isActive
                      ? "var(--accent-cyan-text)"
                      : "var(--bg-surface)",
                    color: isActive
                      ? "white"
                      : "var(--text-muted)",
                  }}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface TabContentProps {
  id: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

export function TabContent({ id, activeTab, children, className }: TabContentProps) {
  if (activeTab !== id) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
