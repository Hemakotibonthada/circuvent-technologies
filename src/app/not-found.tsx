"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          backgroundImage: `
            linear-gradient(var(--grid-line-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-2xl mx-auto">
        {/* 404 Number */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h1 className="text-[150px] sm:text-[200px] font-bold leading-none bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent select-none">
            404
          </h1>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h2
            className="text-2xl sm:text-3xl font-bold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Page Not Found
          </h2>
          <p
            className="text-base mb-8 max-w-md mx-auto"
            style={{ color: "var(--text-tertiary)" }}
          >
            The page you&apos;re looking for doesn&apos;t exist or has been moved. 
            Let&apos;s get you back on track.
          </p>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/">
            <Button size="lg" className="group">
              <Home className="w-4 h-4" />
              Go Home
            </Button>
          </Link>
          <Link href="/projects">
            <Button variant="outline" size="lg" className="group">
              <Search className="w-4 h-4" />
              Browse Projects
            </Button>
          </Link>
        </motion.div>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6"
        >
          {[
            { label: "Projects", href: "/projects" },
            { label: "Services", href: "/services" },
            { label: "Blog", href: "/blog" },
            { label: "Contact", href: "/contact" },
          ].map((link) => (
            <Link
              key={link.label}
              href={link.href}
              /* The 404 page is where someone is already lost; its links are
                 the way out and were 20px tall. */
              className="inline-flex min-h-[44px] items-center px-2 text-sm transition-colors hover:text-[var(--accent-cyan)]"
              style={{ color: "var(--text-muted)" }}
            >
              {link.label}
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
