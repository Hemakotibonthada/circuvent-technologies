"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

interface AccordionProps {
  items: AccordionItem[];
  allowMultiple?: boolean;
  className?: string;
}

export function Accordion({
  items,
  allowMultiple = false,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => {
        const isOpen = openItems.has(item.id);

        return (
          <motion.div
            key={item.id}
            className="group overflow-hidden rounded-2xl transition-all duration-300"
            style={{
              background: "var(--bg-glass)",
              border: `1px solid ${isOpen ? "var(--border-accent)" : "var(--border-primary)"}`,
              backdropFilter: "blur(24px)",
            }}
            layout
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="flex items-center justify-between w-full p-5 sm:p-6 text-left cursor-pointer"
            >
              <div className="flex-1 pr-4">
                {item.category && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider block mb-1"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    {item.category}
                  </span>
                )}
                <h3
                  className="text-sm sm:text-base font-semibold transition-colors group-hover:text-cyan-500"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.question}
                </h3>
              </div>
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="shrink-0"
              >
                <ChevronDown
                  className="w-5 h-5"
                  style={{ color: isOpen ? "var(--accent-cyan)" : "var(--text-muted)" }}
                />
              </motion.div>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div
                    className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm leading-relaxed"
                    style={{
                      color: "var(--text-tertiary)",
                      borderTop: "1px solid var(--border-primary)",
                      paddingTop: "1.25rem",
                    }}
                  >
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
