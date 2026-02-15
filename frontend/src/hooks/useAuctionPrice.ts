"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAuctionConfig,
  getAuctionRound,
  getCurrentRound,
  getTimeToNextRound,
  getAuctionStat,
} from "@/lib/rpc";
import type { AuctionConfig } from "@/lib/types";

interface AuctionPriceData {
  auctionPrice: number;
  currentRound: number;
  lastCompletedRound: number;
  timeToNextRound: number;
  totalContributed: number;
  roundContributed: number;
  tokensPerRound: number;
  config: AuctionConfig | null;
  loading: boolean;
  error: string | null;
}

export function useAuctionPrice(): AuctionPriceData {
  const [data, setData] = useState<AuctionPriceData>({
    auctionPrice: 0,
    currentRound: -1,
    lastCompletedRound: -1,
    timeToNextRound: 0,
    totalContributed: 0,
    roundContributed: 0,
    tokensPerRound: 0,
    config: null,
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const config = await getAuctionConfig();
      if (!config) {
        setData((prev) => ({ ...prev, loading: false, error: "No auction config" }));
        return;
      }

      const currentRound = getCurrentRound(
        config.start_block_time,
        config.round_duration_sec
      );
      const timeToNext = getTimeToNextRound(
        config.start_block_time,
        config.round_duration_sec
      );

      const lastRound = currentRound > 0 ? currentRound - 1 : -1;
      const tokensPerRound = parseFloat(config.tokens_per_round.split(" ")[0]);

      let roundContributed = 0;
      let auctionPrice = 0;

      if (lastRound >= 0) {
        const rows = await getAuctionRound(lastRound);
        roundContributed = rows.reduce((sum, r) => sum + r.amount, 0) / 10000;
        if (tokensPerRound > 0) {
          auctionPrice = roundContributed / tokensPerRound;
        }
      }

      const stat = await getAuctionStat();
      const totalContributed = stat
        ? parseInt(stat.amount_contributed) / 10000
        : 0;

      setData({
        auctionPrice,
        currentRound,
        lastCompletedRound: lastRound,
        timeToNextRound: timeToNext,
        totalContributed,
        roundContributed,
        tokensPerRound,
        config,
        loading: false,
        error: null,
      });
    } catch (err) {
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load auction data",
      }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setData((prev) => ({
        ...prev,
        timeToNextRound: Math.max(0, prev.timeToNextRound - 1),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return data;
}
