"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, PackageSearch, Truck, Wallet, UserCircle2, Home, Cpu } from "lucide-react";
import { useAccount } from "./AccountProvider";
import { formatINR } from "@/lib/shop-data";
import CartButton from "./CartButton";

const links = [
  { href: "/shop", label: "Products", icon: Store },
  { href: "/shop/devices", label: "Devices", icon: Cpu },
  { href: "/shop/account", label: "My orders", icon: PackageSearch },
  { href: "/track", label: "Track", icon: Truck },
];

export default function ShopHeader() {
  const { account, wallet, ready } = useAccount();
  const pathname = usePathname();

  return (
    <div
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 lg:px-8">
        <Link href="/shop" className="mr-1 flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-white"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            <Store className="h-4 w-4" />
          </span>
          <span className="hidden text-sm sm:inline">Circuvent Store</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  color: active ? "var(--accent-cyan)" : "var(--text-tertiary)",
                  background: active ? "var(--accent-cyan-muted)" : "transparent",
                }}
              >
                <l.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/"
            className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium sm:flex"
            style={{ color: "var(--text-tertiary)" }}
            title="Back to main site"
          >
            <Home className="h-4 w-4" /> <span className="hidden lg:inline">Main site</span>
          </Link>
          {ready && account && (
            <Link
              href="/shop/account"
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold"
              style={{ borderColor: "var(--border-accent)", color: "var(--accent-cyan)", background: "var(--accent-cyan-muted)" }}
              title="Wallet balance"
            >
              <Wallet className="h-4 w-4" /> {formatINR(wallet)}
            </Link>
          )}
          <Link
            href="/shop/account"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            <UserCircle2 className="h-5 w-5" />
            <span className="hidden max-w-[100px] truncate md:inline">
              {ready && account ? account.name.split(" ")[0] : "Sign in"}
            </span>
          </Link>
          <CartButton />
        </div>
      </div>
    </div>
  );
}
