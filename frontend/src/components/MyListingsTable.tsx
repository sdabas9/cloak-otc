"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { useListings } from "@/hooks/useListings";
import { useAuctionPrice } from "@/hooks/useAuctionPrice";
import { computeOtcPrice } from "@/lib/rpc";
import { OTC_CONTRACT } from "@/lib/constants";

export default function MyListingsTable() {
  const { session, accountName } = useWallet();
  const { listings, loading, refresh } = useListings();
  const { auctionPrice } = useAuctionPrice();
  const [cancelling, setCancelling] = useState<number | null>(null);

  const myListings = listings.filter((l) => l.seller === accountName);

  const handleCancel = async (listingId: number) => {
    if (!session) return;

    setCancelling(listingId);
    try {
      await session.transact({
        actions: [
          {
            account: OTC_CONTRACT,
            name: "cancellisting",
            authorization: [{ actor: session.actor, permission: "active" }],
            data: {
              seller: session.actor,
              listing_id: listingId,
            },
          },
        ],
      });
      refresh();
    } catch (err) {
      console.error("Cancel failed:", err);
    } finally {
      setCancelling(null);
    }
  };

  if (!accountName) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
        <p className="text-slate-400 mb-1">Connect your wallet</p>
        <p className="text-sm text-slate-600">to view your listings</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <div className="inline-block w-6 h-6 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (myListings.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
        <p className="text-slate-400 mb-1">No active listings</p>
        <p className="text-sm text-slate-600">Create one using the form</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="grid grid-cols-[60px_1fr_1fr_1fr_100px_100px] gap-4 px-6 py-3 border-b border-white/[0.06] bg-white/[0.02] text-xs font-medium uppercase tracking-wider text-slate-500">
        <div>ID</div>
        <div>Available</div>
        <div>OTC Price</div>
        <div>Min Price</div>
        <div>Status</div>
        <div></div>
      </div>

      {myListings.map((listing) => {
        const otcPrice = computeOtcPrice(auctionPrice, listing.premium_pct);
        const minPrice = parseFloat(listing.min_price.split(" ")[0]);
        const active = otcPrice >= minPrice && otcPrice > 0;

        return (
          <div
            key={listing.id}
            className="grid grid-cols-[60px_1fr_1fr_1fr_100px_100px] gap-4 px-6 py-4 border-b border-white/[0.04] last:border-0"
          >
            <div className="text-sm font-mono text-slate-400">#{listing.id}</div>
            <div className="text-sm font-mono text-white">{listing.quantity}</div>
            <div className="text-sm font-mono text-gold">
              {otcPrice.toFixed(4)} TLOS
            </div>
            <div className="text-sm font-mono text-slate-400">
              {listing.min_price}
            </div>
            <div>
              {active ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                  Frozen
                </span>
              )}
            </div>
            <div>
              <button
                onClick={() => handleCancel(listing.id)}
                disabled={cancelling === listing.id}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all disabled:opacity-50"
              >
                {cancelling === listing.id ? "..." : "Cancel"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
