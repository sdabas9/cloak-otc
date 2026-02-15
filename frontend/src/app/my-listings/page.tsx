"use client";

import { useCallback, useState } from "react";
import AuctionBanner from "@/components/AuctionBanner";
import MyListingsTable from "@/components/MyListingsTable";
import CreateListingForm from "@/components/CreateListingForm";

export default function MyListingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">My Listings</h1>
        <p className="text-sm text-slate-500">
          Manage your OTC listings and create new ones
        </p>
      </div>

      <AuctionBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* My Listings */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            Your Active Listings
          </h2>
          <MyListingsTable key={refreshKey} />
        </div>

        {/* Create Listing */}
        <div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <CreateListingForm onSuccess={handleSuccess} />
          </div>
        </div>
      </div>
    </div>
  );
}
