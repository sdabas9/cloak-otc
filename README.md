# CLOAK OTC Marketplace

A P2P over-the-counter trading smart contract on **Telos** for buying and selling **CLOAK** tokens at a dynamic price tied to the live auction on `thezeosalias`.

## Core Idea

Sellers deposit CLOAK and set two parameters:

- **Premium %** -- percentage above the current auction price (e.g. 10% above)
- **Minimum price** -- absolute floor price in TLOS. If the dynamic price drops below this, the listing freezes automatically

The OTC price floats with each new auction round. No manual repricing needed.

## How It Works

| Action | Command |
|---|---|
| **Sell** | Transfer CLOAK with memo `list:<min_price>:<premium_pct>` |
| **Buy** | Transfer TLOS with memo `buy:<listing_id>` |
| **Cancel** | `cleos push action <contract> cancellisting '["seller", 1]'` |
| **Check price** | `cleos push action <contract> getprice '[1]'` |

### Price Calculation

```
auction_price = total_tlos_in_last_round / cloak_per_round
otc_price     = auction_price * (100 + premium_pct) / 100

if otc_price < min_price -> listing frozen
if otc_price >= min_price -> listing active, buyers pay otc_price
```

## Benefits

**For sellers:**
- Sell CLOAK OTC without waiting for an exchange listing
- Price automatically tracks the auction -- no manual repricing
- Minimum price floor protects against selling too cheap
- Cancel anytime -- no lock-up

**For buyers:**
- Know the exact price upfront (unlike the auction where price depends on total contributions)
- Buy any amount -- partial fills supported, excess TLOS refunded
- Buy instantly -- no waiting for auction rounds

**For the CLOAK ecosystem:**
- Establishes OTC price discovery anchored to auction data
- Every trade burns CLOAK via fees, adding deflationary pressure
- Creates a secondary market alongside the auction
- Fully on-chain, trustless -- no centralized exchange needed

## Building

Requires [Antelope CDT](https://github.com/AntelopeIO/cdt) v4.1+:

```bash
mkdir build && cd build
cmake ..
make
```

## Deploying

```bash
CONTRACT_ACCOUNT=youraccount TELOS_API=https://mainnet.telos.net ./scripts/deploy.sh
```

## Contract Details

- **Chain:** Telos
- **CLOAK token:** `thezeostoken` (4 decimal, symbol CLOAK)
- **Auction source:** `thezeosalias`
- **Fee:** Configurable basis points, burned as CLOAK to `eosio.null`
