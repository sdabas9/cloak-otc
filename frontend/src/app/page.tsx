"use client";

import AuctionBanner from "@/components/AuctionBanner";
import ListingsTable from "@/components/ListingsTable";

export default function OtcMarket() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">OTC Market</h1>
        <p className="text-sm text-slate-500">
          Buy CLOAK at fixed prices tied to the live auction
        </p>
      </div>

      {/* Auction Stats */}
      <AuctionBanner />

      {/* Listings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Active Listings</h2>
        </div>
        <ListingsTable />
      </div>
    </div>
  );
}
