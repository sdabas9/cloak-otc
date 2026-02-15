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
  const [cloakInput, setCloakInput] = useState("");
  const [tlosInput, setTlosInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableCloak = parseFloat(listing.quantity.split(" ")[0]);
  const cloakAmount = Math.min(parseFloat(cloakInput) || 0, availableCloak);
  const pct = availableCloak > 0 ? (cloakAmount / availableCloak) * 100 : 0;
  const tlosCost = cloakAmount * otcPrice;
  const feeCloak = cloakAmount * feePct / 10000;
  const netCloak = cloakAmount - feeCloak;

  const updateFromCloak = (cloak: number) => {
    const capped = Math.min(cloak, availableCloak);
    setCloakInput(capped > 0 ? capped.toFixed(4) : "");
    setTlosInput(capped > 0 ? (capped * otcPrice).toFixed(4) : "");
  };

  const handleCloakInput = (val: string) => {
    setCloakInput(val);
    const c = Math.min(parseFloat(val) || 0, availableCloak);
    setTlosInput(c > 0 ? (c * otcPrice).toFixed(4) : "");
  };

  const handleTlosInput = (val: string) => {
    setTlosInput(val);
    const t = parseFloat(val) || 0;
    const c = otcPrice > 0 ? Math.min(t / otcPrice, availableCloak) : 0;
    setCloakInput(c > 0 ? c.toFixed(4) : "");
  };

  const setPercent = (p: number) => {
    updateFromCloak(availableCloak * p / 100);
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFromCloak(parseFloat(e.target.value));
  };

  const handleBuy = async () => {
    if (!session) {
      await login();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Send enough TLOS to cover the CLOAK amount (add tiny buffer for rounding)
      const tlosToSend = Math.ceil(tlosCost * 10000) / 10000;
      const quantity = `${tlosToSend.toFixed(4)} TLOS`;
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

          {/* Editable Inputs */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">You spend</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={tlosInput}
                  onChange={(e) => handleTlosInput(e.target.value)}
                  placeholder="0.0000"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 pr-14 text-white font-mono text-base placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">
                  TLOS
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">You receive</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={cloakInput}
                  onChange={(e) => handleCloakInput(e.target.value)}
                  placeholder="0.0000"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 pr-16 text-white font-mono text-base placeholder:text-slate-600 focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/20 transition-all"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">
                  CLOAK
                </span>
              </div>
            </div>
          </div>

          {/* Slider */}
          <div className="mb-4 px-1">
            <input
              type="range"
              min={0}
              max={availableCloak}
              step={0.0001}
              value={cloakAmount}
              onChange={handleSlider}
              className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/[0.06] accent-gold [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gold [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(212,175,55,0.4)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gold-dim"
              style={{
                background: `linear-gradient(to right, rgb(212 175 55) 0%, rgb(212 175 55) ${pct}%, rgba(255,255,255,0.06) ${pct}%, rgba(255,255,255,0.06) 100%)`,
              }}
            />
          </div>

          {/* Percent Buttons */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => setPercent(p)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  Math.abs(pct - p) < 0.01
                    ? "bg-gold/20 text-gold border-gold/40"
                    : "bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Action */}
          <button
            onClick={handleBuy}
            disabled={submitting || cloakAmount <= 0}
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
