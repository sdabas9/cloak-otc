"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getListings, getConfig } from "@/lib/rpc";
import type { Listing, ContractConfig } from "@/lib/types";

interface ListingsData {
  listings: Listing[];
  config: ContractConfig | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useListings(): ListingsData {
  const [listings, setListings] = useState<Listing[]>([]);
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const refresh = useCallback(async () => {
    try {
      if (!hasFetched.current) {
        setLoading(true);
      }
      const [listingsData, configData] = await Promise.all([
        getListings(),
        getConfig(),
      ]);
      setListings(listingsData);
      setConfig(configData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
      hasFetched.current = true;
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { listings, config, loading, error, refresh };
}
