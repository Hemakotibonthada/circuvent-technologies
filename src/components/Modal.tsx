"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useKeyPress } from "@/hooks/useKeyPress";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showClose?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  showClose = true,
}: ModalProps) {
  const escapePressed = useKeyPress("Escape");
  const modalRef = useClickOutside<HTMLDivElement>(onClose, isOpen);

  useEffect(() => {
    if (escapePressed && isOpen) {
      onClose();
    }
  }, [escapePressed, isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[calc(100vw-2rem)]",
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background: "var(--bg-overlay)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`relative w-full ${sizeClasses[size]} max-h-[85vh] overflow-y-auto rounded-2xl`}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Header */}
            {(title || showClose) && (
              <div
                className="sticky top-0 flex items-start justify-between p-6 pb-4 z-10"
                style={{
                  background: "var(--bg-surface)",
                  borderBottom: "1px solid var(--border-primary)",
                }}
              >
                <div>
                  {title && (
                    <h2
                      className="text-lg font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {description}
                    </p>
                  )}
                </div>
                {showClose && (
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--accent-cyan-muted)] cursor-pointer shrink-0 ml-4"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
