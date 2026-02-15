import { TELOS_RPC, OTC_CONTRACT, AUCTION_CONTRACT } from "./constants";
import type {
  Listing,
  ContractConfig,
  AuctionConfig,
  AuctionStat,
  AuctionRow,
} from "./types";

async function getTableRows<T>(
  code: string,
  table: string,
  scope: string,
  limit = 100
): Promise<T[]> {
  const res = await fetch(`${TELOS_RPC}/v1/chain/get_table_rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      table,
      scope,
      json: true,
      limit,
    }),
  });
  const data = await res.json();
  return data.rows as T[];
}

export async function getListings(): Promise<Listing[]> {
  return getTableRows<Listing>(OTC_CONTRACT, "listings", OTC_CONTRACT);
}

export async function getConfig(): Promise<ContractConfig | null> {
  const rows = await getTableRows<ContractConfig>(
    OTC_CONTRACT,
    "config",
    OTC_CONTRACT,
    1
  );
  return rows[0] || null;
}

export async function getAuctionConfig(): Promise<AuctionConfig | null> {
  const rows = await getTableRows<AuctionConfig>(
    AUCTION_CONTRACT,
    "auctioncfg",
    AUCTION_CONTRACT,
    1
  );
  return rows[0] || null;
}

export async function getAuctionStat(): Promise<AuctionStat | null> {
  const rows = await getTableRows<AuctionStat>(
    AUCTION_CONTRACT,
    "auctionstat",
    AUCTION_CONTRACT,
    1
  );
  return rows[0] || null;
}

export async function getAuctionRound(round: number): Promise<AuctionRow[]> {
  return getTableRows<AuctionRow>(
    AUCTION_CONTRACT,
    "auction",
    String(round),
    1000
  );
}

export function parseAsset(assetStr: string): {
  amount: number;
  symbol: string;
} {
  const parts = assetStr.split(" ");
  return {
    amount: parseFloat(parts[0]),
    symbol: parts[1],
  };
}

export function formatAsset(amount: number, symbol: string, precision = 4): string {
  return `${amount.toFixed(precision)} ${symbol}`;
}

export function computeAuctionPrice(
  totalTlos: number,
  tokensPerRound: number
): number {
  if (tokensPerRound === 0) return 0;
  return totalTlos / tokensPerRound;
}

export function computeOtcPrice(
  auctionPrice: number,
  premiumPct: number
): number {
  return auctionPrice * (100 + premiumPct) / 100;
}

export function getCurrentRound(
  startTime: number,
  roundDuration: number
): number {
  const now = Math.floor(Date.now() / 1000);
  if (now < startTime) return -1;
  return Math.floor((now - startTime) / roundDuration);
}

export function getTimeToNextRound(
  startTime: number,
  roundDuration: number
): number {
  const now = Math.floor(Date.now() / 1000);
  if (now < startTime) return startTime - now;
  const elapsed = now - startTime;
  const intoRound = elapsed % roundDuration;
  return roundDuration - intoRound;
}
