export const OTC_CONTRACT = process.env.NEXT_PUBLIC_OTC_CONTRACT || "otccloak111";
export const CLOAK_CONTRACT = "thezeostoken";
export const AUCTION_CONTRACT = "thezeosalias";
export const TLOS_CONTRACT = "eosio.token";
export const TELOS_RPC = process.env.NEXT_PUBLIC_TELOS_RPC || "https://mainnet.telos.net";
export const TELOS_CHAIN_ID = "4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11";

export const CLOAK_SYMBOL = { symbol: "CLOAK", precision: 4 };
export const TLOS_SYMBOL = { symbol: "TLOS", precision: 4 };

export const ROUND_DURATION_SEC = 82800; // 23 hours
export const TOKENS_PER_ROUND = 16380016380; // 1,638,001.6380 CLOAK in raw units
