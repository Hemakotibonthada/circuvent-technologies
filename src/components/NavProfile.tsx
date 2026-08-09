"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, User, Package, Heart, Wallet, MapPin, LogOut, ChevronDown } from "lucide-react";
import { useAccount } from "./shop/AccountProvider";

const MENU: { href: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[] = [
  { href: "/shop/account", label: "My account", icon: User },
  { href: "/shop/account", label: "Orders", icon: Package },
  { href: "/shop/account", label: "Wishlist", icon: Heart },
  { href: "/shop/account", label: "Wallet", icon: Wallet },
  { href: "/track", label: "Track order", icon: MapPin },
];

/** Desktop nav CTA: profile menu when signed in, otherwise the "View Work" CTA. */
export default function NavProfile() {
  const { account, ready, logout } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Signed out (or not hydrated yet) → keep the original CTA.
  if (!ready || !account) {
    return (
      <Link href={account ? "/shop/account" : "/projects"}>
        <motion.div
          className="relative inline-flex min-h-[44px] items-center px-5 py-2 text-[13px] font-semibold rounded-xl overflow-hidden group"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            background: "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))",
            border: "1px solid var(--border-accent)",
            color: "var(--text-primary)",
          }}
        >
          <span className="relative z-10 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--accent-cyan)" }} />
            View Work
          </span>
        </motion.div>
      </Link>
    );
  }

  const name = account.name || account.email.split("@")[0];
  const initial = (name[0] || "?").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2.5 text-[13px] font-semibold"
        style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.12), rgba(139,92,246,0.12))", border: "1px solid var(--border-accent)", color: "var(--text-primary)" }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
          {initial}
        </span>
        <span className="max-w-[100px] truncate">{name}</span>
        <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
            role="menu"
          >
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-primary)" }}>
              <p className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{name}</p>
              <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{account.email}</p>
            </div>
            <div className="py-1">
              {MENU.map((m) => (
                <Link
                  key={m.label}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--accent-cyan-muted)]"
                  style={{ color: "var(--text-secondary)" }}
                  role="menuitem"
                >
                  <m.icon className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} /> {m.label}
                </Link>
              ))}
            </div>
            <button
              onClick={() => { setOpen(false); logout(); }}
              className="flex w-full items-center gap-3 border-t px-4 py-2.5 text-sm transition-colors hover:bg-[var(--accent-cyan-muted)]"
              style={{ borderColor: "var(--border-primary)", color: "#ef4444" }}
              role="menuitem"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
