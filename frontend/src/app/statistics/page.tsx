"use client";

import { useAuctionPrice } from "@/hooks/useAuctionPrice";
import { useListings } from "@/hooks/useListings";
import { computeOtcPrice } from "@/lib/rpc";

export default function StatisticsPage() {
  const auction = useAuctionPrice();
  const { listings, config, loading } = useListings();

  const enriched = listings.map((l) => {
    const otcPrice = computeOtcPrice(auction.auctionPrice, l.premium_pct);
    const minPrice = parseFloat(l.min_price.split(" ")[0]);
    const active = otcPrice >= minPrice && otcPrice > 0;
    const available = parseFloat(l.quantity.split(" ")[0]);
    return { ...l, otcPrice, active, available };
  });

  const totalListings = enriched.length;
  const activeListings = enriched.filter((l) => l.active).length;
  const frozenListings = totalListings - activeListings;
  const totalCloakListed = enriched.reduce((sum, l) => sum + l.available, 0);
  const uniqueSellers = new Set(enriched.map((l) => l.seller)).size;

  const priceRange = enriched.filter((l) => l.active);
  const minOtcPrice =
    priceRange.length > 0
      ? Math.min(...priceRange.map((l) => l.otcPrice))
      : 0;
  const maxOtcPrice =
    priceRange.length > 0
      ? Math.max(...priceRange.map((l) => l.otcPrice))
      : 0;

  const isLoading = auction.loading || loading;

  const stats = [
    {
      label: "Auction Price",
      value: `${auction.auctionPrice.toFixed(4)} TLOS`,
      sub: `Round ${auction.currentRound >= 0 ? auction.currentRound : "-"} of 60`,
      accent: true,
    },
    {
      label: "Total CLOAK Listed",
      value: totalCloakListed.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      sub: `Across ${totalListings} listing${totalListings !== 1 ? "s" : ""}`,
      accent: false,
    },
    {
      label: "Active / Frozen",
      value: `${activeListings} / ${frozenListings}`,
      sub: `${uniqueSellers} unique seller${uniqueSellers !== 1 ? "s" : ""}`,
      accent: false,
    },
    {
      label: "OTC Price Range",
      value:
        minOtcPrice > 0
          ? `${minOtcPrice.toFixed(4)} - ${maxOtcPrice.toFixed(4)}`
          : "N/A",
      sub: "TLOS per CLOAK",
      accent: false,
    },
    {
      label: "Total Auction TLOS",
      value: `${auction.totalContributed.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}`,
      sub: "TLOS contributed across all rounds",
      accent: false,
    },
    {
      label: "Fee Rate",
      value: config ? `${(config.fee_pct / 100).toFixed(2)}%` : "...",
      sub: "Burned as CLOAK on each trade",
      accent: false,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Statistics</h1>
        <p className="text-sm text-slate-500">
          Auction data and OTC marketplace overview
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-white/[0.03] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className={`relative overflow-hidden rounded-xl border p-6 transition-all duration-300 ${
                stat.accent
                  ? "border-gold/30 bg-gold/[0.04] hover:border-gold/50"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
              }`}
            >
              {stat.accent && (
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              )}
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">
                {stat.label}
              </p>
              <p
                className={`text-2xl font-bold mb-1 ${
                  stat.accent ? "text-gold" : "text-white"
                }`}
              >
                {stat.value}
              </p>
              <p className="text-xs text-slate-600">{stat.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* How Pricing Works */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
        <h2 className="text-lg font-semibold text-white mb-4">
          How OTC Pricing Works
        </h2>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-slate-400">
          <div>
            <div className="text-gold font-mono text-xs uppercase tracking-wider mb-2">
              Step 1
            </div>
            <p>
              Each auction round, the effective CLOAK price is determined by
              total TLOS contributed divided by CLOAK distributed.
            </p>
          </div>
          <div>
            <div className="text-gold font-mono text-xs uppercase tracking-wider mb-2">
              Step 2
            </div>
            <p>
              Sellers set a premium percentage above the auction price. The OTC
              price automatically adjusts each round.
            </p>
          </div>
          <div>
            <div className="text-gold font-mono text-xs uppercase tracking-wider mb-2">
              Step 3
            </div>
            <p>
              If the dynamic price drops below the seller&apos;s minimum floor, the
              listing freezes until auction prices recover.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
