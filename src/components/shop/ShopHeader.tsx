"use client";

import { useState } from "react";
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

/**
 * Fallback for the header avatar when the photo fails to load.
 *
 * Mirrors the admin console's `StaffAvatar` (src/app/smarthome/admin/StaffAvatar.tsx):
 * the email is only ever consulted when there is no name, and only its local
 * part — splitting the full address on "." would let the domain supply a
 * "word" ("ada@circuvent.com" -> "circuvent", "com"), pairing a customer's
 * initial with Circuvent's rather than her own.
 */
function initialsFor(name: string, email: string): string {
  const source = name.trim() || email.trim().split("@")[0];
  if (!source) return "?";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ShopHeader() {
  const { account, wallet, ready } = useAccount();
  const pathname = usePathname();
  /*
   * Remembered by value rather than a boolean so a picture uploaded after a
   * failure (a new avatarUpdatedAt) is tried on its own merits instead of
   * inheriting the previous one's broken state.
   */
  const [failedAvatarSrc, setFailedAvatarSrc] = useState("");

  const avatarSrc = account?.avatarUpdatedAt
    ? `/api/account/avatar?v=${encodeURIComponent(account.avatarUpdatedAt)}`
    : "";
  const showAvatarPhoto = Boolean(avatarSrc) && avatarSrc !== failedAvatarSrc;
  const showAvatarInitials = Boolean(account) && Boolean(avatarSrc) && !showAvatarPhoto;

  return (
    <div
      className="sticky top-0 z-40 border-b backdrop-blur-xl"
      style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 lg:px-8">
        <Link href="/shop" className="min-h-[44px] min-w-[44px] mr-1 flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
          <img src="/logo-mark-160.png" alt="Circuvent" width={28} height={28} className="rounded-lg" />
          <span className="hidden text-sm sm:inline">Circuvent Store</span>
        </Link>

        <nav className="flex items-center gap-0.5">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
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
            className="min-h-[44px] hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium sm:flex"
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
            className="min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {ready && showAvatarPhoto ? (
              /*
                Shown at the size it is displayed. The source is an
                authenticated route, which next/image cannot fetch, and the
                object behind it is already a 256px JPEG. onError swaps to
                initials rather than leaving the browser's broken-image glyph
                up when the object 404s or the store rejects the request.
              */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarSrc}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 rounded-full object-cover"
                onError={() => setFailedAvatarSrc(avatarSrc)}
              />
            ) : ready && showAvatarInitials && account ? (
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))" }}
                aria-hidden
              >
                {initialsFor(account.name, account.email)}
              </span>
            ) : (
              <UserCircle2 className="h-5 w-5" />
            )}
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
