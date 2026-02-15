export interface Listing {
  id: number;
  seller: string;
  quantity: string; // "1000.0000 CLOAK"
  min_price: string; // "0.0500 TLOS"
  premium_pct: number;
  created_at: string;
}

export interface ContractConfig {
  fee_pct: number;
  paused: boolean;
}

export interface AuctionConfig {
  start_block_time: number;
  round_duration_sec: number;
  number_of_rounds: number;
  tokens_per_round: string;
  token_contract: string;
  min_contribution: {
    quantity: string;
    contract: string;
  };
  stake_rate: number;
}

export interface AuctionStat {
  amount_contributed: string;
  amount_staked: string;
}

export interface AuctionRow {
  user: [string, string];
  amount: number;
  claimed: boolean;
}
