"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Blog page error:", error);
  }, [error]);

  return (
    <div className="relative z-10 min-h-[60vh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
        <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Failed to Load Blog
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
          We couldn&apos;t load the blog content. Please try again.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4" />
              Back Home
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
