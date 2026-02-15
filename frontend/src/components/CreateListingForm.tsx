"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { useAuctionPrice } from "@/hooks/useAuctionPrice";
import { OTC_CONTRACT, CLOAK_CONTRACT } from "@/lib/constants";
import { computeOtcPrice } from "@/lib/rpc";

interface CreateListingFormProps {
  onSuccess: () => void;
}

export default function CreateListingForm({ onSuccess }: CreateListingFormProps) {
  const { session, login } = useWallet();
  const { auctionPrice } = useAuctionPrice();
  const [cloakAmount, setCloakAmount] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [premiumPct, setPremiumPct] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const premium = parseInt(premiumPct) || 0;
  const previewOtcPrice = computeOtcPrice(auctionPrice, premium);
  const minPriceNum = parseFloat(minPrice) || 0;
  const wouldBeActive = previewOtcPrice >= minPriceNum && previewOtcPrice > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) {
      await login();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const quantity = `${parseFloat(cloakAmount).toFixed(4)} CLOAK`;
      const memo = `list:${parseFloat(minPrice).toFixed(4)}:${premium}`;

      await session.transact({
        actions: [
          {
            account: CLOAK_CONTRACT,
            name: "transfer",
            authorization: [{ actor: session.actor, permission: "active" }],
            data: {
              from: session.actor,
              to: OTC_CONTRACT,
              quantity,
              memo,
            },
          },
        ],
      });

      setCloakAmount("");
      setMinPrice("");
      setPremiumPct("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h3 className="text-lg font-semibold text-white">Create Listing</h3>

      {/* CLOAK Amount */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">CLOAK Amount</label>
        <div className="relative">
          <input
            type="number"
            step="0.0001"
            min="0"
            value={cloakAmount}
            onChange={(e) => setCloakAmount(e.target.value)}
            placeholder="0.0000"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-20 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            CLOAK
          </span>
        </div>
      </div>

      {/* Min Price */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Minimum Price (floor)
        </label>
        <div className="relative">
          <input
            type="number"
            step="0.0001"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="0.0000"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-24 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            TLOS/CLOAK
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Listing freezes if OTC price drops below this
        </p>
      </div>

      {/* Premium % */}
      <div>
        <label className="block text-sm text-slate-400 mb-2">
          Premium over Auction Price
        </label>
        <div className="relative">
          <input
            type="number"
            step="1"
            min="0"
            max="10000"
            value={premiumPct}
            onChange={(e) => setPremiumPct(e.target.value)}
            placeholder="10"
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-12 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500">
            %
          </span>
        </div>
      </div>

      {/* Preview */}
      {auctionPrice > 0 && premium >= 0 && (
        <div
          className={`rounded-xl border p-4 space-y-2 ${
            wouldBeActive
              ? "bg-emerald-500/[0.04] border-emerald-500/20"
              : "bg-amber-500/[0.04] border-amber-500/20"
          }`}
        >
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Auction Price</span>
            <span className="text-white font-mono">
              {auctionPrice.toFixed(4)} TLOS
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Your OTC Price</span>
            <span className="text-gold font-semibold font-mono">
              {previewOtcPrice.toFixed(4)} TLOS
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Status</span>
            <span
              className={`font-medium ${
                wouldBeActive ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {wouldBeActive ? "Would be Active" : "Would be Frozen"}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={
          submitting ||
          !cloakAmount ||
          !minPrice ||
          premiumPct === ""
        }
        className="w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-gold to-gold-dim text-void hover:shadow-lg hover:shadow-gold/20 hover:-translate-y-[1px]"
      >
        {submitting
          ? "Confirming..."
          : !session
          ? "Connect Wallet to List"
          : "Create Listing"}
      </button>
    </form>
  );
}
