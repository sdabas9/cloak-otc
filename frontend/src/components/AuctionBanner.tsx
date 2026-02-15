"use client";

import { useAuctionPrice } from "@/hooks/useAuctionPrice";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function AuctionBanner() {
  const {
    auctionPrice,
    currentRound,
    timeToNextRound,
    totalContributed,
    loading,
  } = useAuctionPrice();

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: "Last Auction Price",
      value: `${auctionPrice.toFixed(4)} TLOS`,
      accent: true,
    },
    {
      label: "Current Round",
      value: currentRound >= 0 ? `${currentRound} / 60` : "Not Started",
      accent: false,
    },
    {
      label: "Next Round In",
      value: formatTime(timeToNextRound),
      accent: false,
      mono: true,
    },
    {
      label: "Total Contributed",
      value: `${totalContributed.toLocaleString(undefined, { maximumFractionDigits: 0 })} TLOS`,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
            stat.accent
              ? "border-gold/30 bg-gold/[0.04] hover:border-gold/50"
              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
          }`}
        >
          {stat.accent && (
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          )}
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
            {stat.label}
          </p>
          <p
            className={`text-xl font-semibold ${
              stat.accent ? "text-gold" : "text-white"
            } ${stat.mono ? "font-mono" : ""}`}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
