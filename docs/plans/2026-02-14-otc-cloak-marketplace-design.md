# OTC CLOAK Marketplace -- Design Document

## Overview

A P2P OTC marketplace smart contract on Telos for trading CLOAK tokens priced in TLOS. Sellers list CLOAK at a dynamic price derived from the last auction round plus a premium percentage, with an absolute minimum price floor that freezes listings if the dynamic price drops too low.

## External Contracts

- **`thezeostoken`** -- CLOAK token (eosio.token standard, 4 decimal precision, symbol: CLOAK)
- **`thezeosalias`** -- CLOAK privacy/auction contract (provides auction round data)
- **`eosio.token`** -- TLOS native token

## Pricing Model

### Seller Parameters

Each listing has two seller-defined parameters:
- **`min_price`** (asset, TLOS) -- absolute floor price per 1.0000 CLOAK. Seller will never sell below this.
- **`premium_pct`** (uint16) -- percentage premium over the last completed auction round's effective price (e.g. 10 = 10% above auction)

### Dynamic Price Calculation

At buy-time, the contract computes:

```
last_completed_round = (current_time - auction_start) / round_duration - 1
total_tlos_in_round = SUM(auction[round].amount for all participants)
tokens_per_round = auctioncfg.tokens_per_round
last_auction_price = total_tlos_in_round / tokens_per_round

otc_price = last_auction_price * (100 + premium_pct) / 100
```

### Listing State

- If `otc_price >= min_price` -- listing is **active**, buyers can purchase at `otc_price`
- If `otc_price < min_price` -- listing is **frozen**, buy attempts are rejected

The price re-evaluates automatically each round. No action needed from the seller -- listings activate/freeze based on live auction data.

## Data Model

### `listings` table (scope: contract)

| Field | Type | Description |
|---|---|---|
| `id` | uint64 | Auto-incrementing primary key |
| `seller` | name | Seller's Telos account |
| `quantity` | asset | Remaining CLOAK for sale (4 decimal, symbol CLOAK) |
| `min_price` | asset | Minimum price per 1.0000 CLOAK in TLOS |
| `premium_pct` | uint16 | Premium % over auction price (e.g. 10 = 10%) |
| `created_at` | time_point_sec | Listing creation timestamp |

Secondary index: `by_seller` on `seller` field.

### `config` singleton (scope: contract)

| Field | Type | Description |
|---|---|---|
| `fee_pct` | uint16 | Fee in basis points (e.g. 50 = 0.5%) deducted from CLOAK, burned |
| `paused` | bool | Emergency pause flag, blocks all buys/listings when true |

### `nextid` singleton (scope: contract)

| Field | Type | Description |
|---|---|---|
| `next_id` | uint64 | Next listing ID to assign |

## Actions

### Transfer Handlers (on_notify)

**CLOAK deposit** (`thezeostoken::transfer` to this contract):
- Memo format: `list:<min_price>:<premium_pct>`
  - Example: `list:0.0500:10` -- min price 0.0500 TLOS/CLOAK, 10% premium
- Validates quantity > 0, parses memo, creates listing entry
- No immediate price validation (listing may start frozen if auction price is low)

**TLOS deposit** (`eosio.token::transfer` to this contract):
- Memo format: `buy:<listing_id>`
  - Example: `buy:42`
- Computes `otc_price` from live auction data
- Checks `otc_price >= listing.min_price` (rejects if frozen)
- Calculates `cloak_bought = tlos_sent / otc_price`
- If `cloak_bought > listing.quantity`, refunds excess TLOS
- Deducts fee: `fee_cloak = cloak_bought * fee_pct / 10000`
- Burns fee CLOAK via inline `retire` on `thezeostoken`
- Sends remaining CLOAK to buyer via inline `transfer` on `thezeostoken`
- Sends TLOS to seller via inline `transfer` on `eosio.token`
- Updates listing quantity or erases if fully filled

### Explicit Actions

**`cancellisting(name seller, uint64_t listing_id)`**
- Requires auth of `seller`
- Validates listing exists and belongs to seller
- Sends remaining CLOAK back to seller
- Erases listing

**`setconfig(uint16_t fee_pct, bool paused)`**
- Requires auth of contract account (admin)
- Sets fee percentage (basis points) and pause state

## Fee Mechanism

- Fee is a configurable percentage (basis points) of the CLOAK traded
- Fee CLOAK is burned via inline `retire` action on `thezeostoken`
- This aligns with CLOAK's deflationary tokenomics (50% burn rate on protocol fees)
- The contract needs `retire` permission or the issuer (`thezeosalias`) must authorize it
  - Alternative: send fee CLOAK to a burn address or back to `thezeosalias` if `retire` requires issuer auth

## Auction Data Access

The contract reads two tables from `thezeosalias`:

1. **`auctioncfg`** (scope: `thezeosalias`):
   - `start` (time_point_sec) -- auction start time
   - `round_dur` (uint32) -- round duration in seconds (82800 = 23h)
   - `tokens_per_round` (asset) -- CLOAK per round (1,638,001.6380)

2. **`auction`** (scope: round_number as uint64):
   - Each row has `amount` (asset, TLOS contributed) and `user` (variant)
   - Sum all `amount` values for the round to get total TLOS contributed

Round calculation:
```cpp
uint32_t current_round = (current_time_point_sec().sec_since_epoch() - cfg.start.sec_since_epoch()) / cfg.round_dur;
uint32_t last_round = current_round > 0 ? current_round - 1 : 0;
```

## Security Considerations

- All inline transfers use standard eosio.token patterns
- Memo parsing validated strictly (reject malformed memos)
- Integer overflow protection on price calculations (use 128-bit intermediates)
- Reentrancy protection via deferred state checks
- Pause mechanism for emergency scenarios
- Only contract owner can modify config

## Edge Cases

- **Auction not yet started or round 0**: No completed round exists -- all listings are frozen
- **No contributions in a round**: auction price = 0, `otc_price = 0`, all listings with min_price > 0 are frozen
- **Auction ended (all 60 rounds done)**: last round is round 59, price stays fixed at round 59's price
- **Rounding**: use integer math with sufficient precision (multiply before dividing)
