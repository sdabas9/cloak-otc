"use client";

import { useState } from "react";
import { useListings } from "@/hooks/useListings";
import { useAuctionPrice } from "@/hooks/useAuctionPrice";
import { computeOtcPrice } from "@/lib/rpc";
import BuyModal from "./BuyModal";
import type { Listing } from "@/lib/types";

export default function ListingsTable() {
  const { listings, config, loading, refresh } = useListings();
  const { auctionPrice } = useAuctionPrice();
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [sortField, setSortField] = useState<"price" | "amount" | "premium">("price");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const enrichedListings = listings.map((l) => {
    const otcPrice = computeOtcPrice(auctionPrice, l.premium_pct);
    const minPrice = parseFloat(l.min_price.split(" ")[0]);
    const active = otcPrice >= minPrice && otcPrice > 0;
    const available = parseFloat(l.quantity.split(" ")[0]);
    return { ...l, otcPrice, active, available, minPrice };
  });

  const sortedListings = [...enrichedListings].sort((a, b) => {
    let diff = 0;
    if (sortField === "price") diff = a.otcPrice - b.otcPrice;
    else if (sortField === "amount") diff = a.available - b.available;
    else if (sortField === "premium") diff = a.premium_pct - b.premium_pct;
    return sortAsc ? diff : -diff;
  });

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <span className="ml-1 text-[10px] text-slate-600">
      {sortField === field ? (sortAsc ? "▲" : "▼") : "⬍"}
    </span>
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="p-8 text-center">
          <div className="inline-block w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin mb-3" />
          <p className="text-sm text-slate-500">Loading listings...</p>
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
        <div className="text-4xl mb-4 opacity-30">📋</div>
        <p className="text-slate-400 mb-1">No listings yet</p>
        <p className="text-sm text-slate-600">
          Be the first to list CLOAK for sale
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_100px_100px] gap-4 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-xs font-medium uppercase tracking-wider text-slate-500">
          <div>ID</div>
          <div>Seller</div>
          <div
            className="cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => handleSort("amount")}
          >
            Available <SortIcon field="amount" />
          </div>
          <div
            className="cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => handleSort("price")}
          >
            OTC Price <SortIcon field="price" />
          </div>
          <div
            className="cursor-pointer hover:text-slate-300 transition-colors"
            onClick={() => handleSort("premium")}
          >
            Premium <SortIcon field="premium" />
          </div>
          <div>Status</div>
          <div></div>
        </div>

        {/* Table Rows */}
        {sortedListings.map((listing) => (
          <div
            key={listing.id}
            className={`grid grid-cols-[60px_1fr_1fr_1fr_1fr_100px_100px] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-0 transition-colors ${
              listing.active
                ? "hover:bg-white/[0.02]"
                : "opacity-50"
            }`}
          >
            <div className="text-sm font-mono text-slate-400">#{listing.id}</div>
            <div className="text-sm font-mono text-white truncate">
              {listing.seller}
            </div>
            <div className="text-sm font-mono text-white">
              {listing.available.toLocaleString(undefined, {
                minimumFractionDigits: 4,
              })}{" "}
              <span className="text-slate-500">CLOAK</span>
            </div>
            <div className="text-sm font-mono text-gold font-medium">
              {listing.otcPrice.toFixed(4)}{" "}
              <span className="text-gold/60">TLOS</span>
            </div>
            <div className="text-sm text-slate-300">+{listing.premium_pct}%</div>
            <div>
              {listing.active ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  Frozen
                </span>
              )}
            </div>
            <div>
              {listing.active && (
                <button
                  onClick={() => setSelectedListing(listing)}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 hover:border-gold/40 transition-all"
                >
                  Buy
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Buy Modal */}
      {selectedListing && (
        <BuyModal
          listing={selectedListing}
          otcPrice={computeOtcPrice(auctionPrice, selectedListing.premium_pct)}
          feePct={config?.fee_pct || 0}
          onClose={() => setSelectedListing(null)}
          onSuccess={() => {
            setSelectedListing(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
