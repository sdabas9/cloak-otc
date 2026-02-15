"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "./WalletProvider";

const navLinks = [
  { href: "/", label: "OTC Market" },
  { href: "/my-listings", label: "My Listings" },
  { href: "/statistics", label: "Statistics" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { accountName, login, logout, loading } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gold/10 bg-void/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-8 w-8">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-gold to-gold-dim opacity-90 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-[3px] rounded-[5px] bg-void flex items-center justify-center">
              <span className="text-gold font-bold text-xs">C</span>
            </div>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            CLOAK <span className="text-gold">OTC</span>
          </span>
        </Link>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive
                    ? "text-gold bg-gold/8"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
                {isActive && (
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gold rounded-full" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-9 w-32 rounded-lg bg-white/5 animate-pulse" />
          ) : accountName ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gold/8 border border-gold/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-mono text-gold">{accountName}</span>
              </div>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="px-5 py-2 text-sm font-medium text-void bg-gradient-to-r from-gold to-gold-dim rounded-lg hover:shadow-lg hover:shadow-gold/20 transition-all duration-200 hover:-translate-y-[1px]"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
