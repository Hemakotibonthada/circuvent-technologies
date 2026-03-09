"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg-primary)" }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full text-center"
      >
        <div
          className="inline-flex p-4 rounded-2xl mb-6"
          style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
        >
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>

        <h1
          className="text-3xl font-bold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Something Went Wrong
        </h1>

        <p
          className="text-sm mb-2"
          style={{ color: "var(--text-tertiary)" }}
        >
          An unexpected error occurred. This has been logged and we&apos;ll look into it.
        </p>

        {error.digest && (
          <p
            className="text-xs font-mono mb-6"
            style={{ color: "var(--text-muted)" }}
          >
            Error ID: {error.digest}
          </p>
        )}

        {process.env.NODE_ENV === "development" && (
          <div
            className="rounded-xl p-4 mb-6 text-left overflow-x-auto"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
            }}
          >
            <p className="text-xs font-mono text-red-500 mb-1">{error.name}: {error.message}</p>
            {error.stack && (
              <pre className="text-[10px] font-mono whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                {error.stack.split("\n").slice(1, 6).join("\n")}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={reset} className="group">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline">
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
