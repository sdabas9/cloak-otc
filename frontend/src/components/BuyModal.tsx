"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { OTC_CONTRACT, TLOS_CONTRACT } from "@/lib/constants";
import type { Listing } from "@/lib/types";

interface BuyModalProps {
  listing: Listing;
  otcPrice: number;
  feePct: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BuyModal({
  listing,
  otcPrice,
  feePct,
  onClose,
  onSuccess,
}: BuyModalProps) {
  const { session, login } = useWallet();
  const [tlosAmount, setTlosAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCloak = parseFloat(listing.quantity.split(" ")[0]);
  const tlosNum = parseFloat(tlosAmount) || 0;
  const cloakReceived = otcPrice > 0 ? tlosNum / otcPrice : 0;
  const cloakCapped = Math.min(cloakReceived, availableCloak);
  const feeCloak = cloakCapped * feePct / 10000;
  const netCloak = cloakCapped - feeCloak;
  const actualTlosCost = cloakCapped * otcPrice;

  const handleBuy = async () => {
    if (!session) {
      await login();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const quantity = `${tlosNum.toFixed(4)} TLOS`;
      await session.transact({
        actions: [
          {
            account: TLOS_CONTRACT,
            name: "transfer",
            authorization: [{ actor: session.actor, permission: "active" }],
            data: {
              from: session.actor,
              to: OTC_CONTRACT,
              quantity,
              memo: `buy:${listing.id}`,
            },
          },
        ],
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface shadow-2xl shadow-black/50">
        {/* Header glow */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Buy CLOAK</h2>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Listing Info */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Seller</span>
              <span className="text-white font-mono">{listing.seller}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">OTC Price</span>
              <span className="text-gold font-semibold">
                {otcPrice.toFixed(4)} TLOS/CLOAK
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Available</span>
              <span className="text-white">{listing.quantity}</span>
            </div>
          </div>

          {/* TLOS Input */}
          <div className="mb-5">
            <label className="block text-sm text-slate-400 mb-2">
              Amount to spend
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.0001"
                min="0"
                value={tlosAmount}
                onChange={(e) => setTlosAmount(e.target.value)}
                placeholder="0.0000"
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-16 text-white font-mono text-lg placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                TLOS
              </span>
            </div>
          </div>

          {/* Preview */}
          {tlosNum > 0 && (
            <div className="rounded-xl bg-gold/[0.04] border border-gold/20 p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">You receive</span>
                <span className="text-gold font-semibold font-mono">
                  {netCloak.toFixed(4)} CLOAK
                </span>
              </div>
              {feeCloak > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fee (burned)</span>
                  <span className="text-slate-400 font-mono">
                    {feeCloak.toFixed(4)} CLOAK
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Actual cost</span>
                <span className="text-slate-400 font-mono">
                  {actualTlosCost.toFixed(4)} TLOS
                </span>
              </div>
              {cloakReceived > availableCloak && (
                <p className="text-xs text-amber-400 mt-1">
                  Capped to available amount. Excess TLOS will be refunded.
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Action */}
          <button
            onClick={handleBuy}
            disabled={submitting || tlosNum <= 0}
            className="w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-gold to-gold-dim text-void hover:shadow-lg hover:shadow-gold/20 hover:-translate-y-[1px]"
          >
            {submitting
              ? "Confirming..."
              : !session
              ? "Connect Wallet"
              : "Confirm Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
