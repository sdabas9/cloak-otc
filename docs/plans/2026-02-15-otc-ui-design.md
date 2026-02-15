# OTC CLOAK Frontend -- Design Document

## Overview

A standalone Next.js frontend for the OTC CLOAK marketplace contract on Telos. Matches the visual style of app.cloak.today (dark theme, gold accents, professional crypto UI). Uses Wharfkit for wallet connection and reads all data from on-chain tables via Telos RPC.

## Tech Stack

- **Next.js 14+** (App Router)
- **React 18+**
- **Tailwind CSS** for styling
- **Wharfkit** (`@wharfkit/session`, `@wharfkit/web-renderer`) for Antelope wallet connection
- **Telos RPC** (`/v1/chain/get_table_rows`) for reading contract data
- No backend -- all data on-chain

## Visual Style

- Dark navy/charcoal backgrounds (#0a0f1a, #111827)
- Gold accent color (#d4a843) for highlights, active states, CTAs
- White/light gray text for readability
- Card-based layout with subtle borders (border-gray-800)
- Rounded corners, consistent 16/24px spacing
- Sans-serif font (Inter)
- Responsive (mobile-friendly)

## Navigation

Top horizontal bar:
```
[CLOAK Logo]  OTC Market | My Listings | Statistics    [Connect Wallet]
```

## Pages

### 1. OTC Market (/)

The main marketplace view. Shows all active listings.

**Components:**
- **Auction Price Banner** -- Shows current auction round, last auction price, time to next round
- **Listings Table** -- Sortable table of all listings:
  | Column | Source |
  |---|---|
  | ID | listing.id |
  | Seller | listing.seller |
  | Available | listing.quantity |
  | OTC Price | computed: auction_price * (100 + premium_pct) / 100 |
  | Min Price | listing.min_price |
  | Premium | listing.premium_pct |
  | Status | Active (green) / Frozen (gray) based on otc_price vs min_price |
  | Action | "Buy" button (opens modal) |

- **Buy Modal:**
  - Listing details (seller, price, available CLOAK)
  - TLOS input field
  - Live preview: "You will receive X.XXXX CLOAK" (computed from input / otc_price)
  - Fee display: "Fee: X.XXXX CLOAK (burned)"
  - "Confirm Purchase" button -> triggers `eosio.token::transfer` to OTC contract with memo `buy:<id>`

### 2. My Listings (/my-listings)

Requires wallet connected. Shows user's own listings and create form.

**Components:**
- **My Active Listings** -- Table of user's listings with Cancel button per row
  - Cancel triggers `cancellisting` action
- **Create Listing Form:**
  - CLOAK Amount input
  - Min Price (TLOS per CLOAK) input
  - Premium % input
  - Preview box: "At current auction price (X.XXXX TLOS), your OTC price will be Y.YYYY TLOS/CLOAK"
  - "Create Listing" button -> triggers `thezeostoken::transfer` to OTC contract with memo `list:<min_price>:<premium_pct>`

### 3. Statistics (/statistics)

Public page, no wallet needed.

**Components:**
- **Auction Info Card:** Current round, auction price, time remaining, total TLOS contributed
- **OTC Stats Card:** Total listings, total CLOAK listed, total active vs frozen
- **Price Display:** Current auction price and range of OTC prices

## Data Flow

### Reading Contract Data

All reads use `fetch` to Telos RPC endpoint:

```
POST https://mainnet.telos.net/v1/chain/get_table_rows
{
  "code": "<contract>",
  "table": "<table>",
  "scope": "<scope>",
  "json": true,
  "limit": 100
}
```

**Tables to read:**
1. OTC contract `listings` table -> all listings
2. OTC contract `config` table -> fee_pct, paused
3. `thezeosalias` `auctioncfg` table -> auction config
4. `thezeosalias` `auction` table (scoped by round) -> round contributions for price calc
5. `thezeosalias` `auctionstat` table -> total contributed

### Writing (Transactions)

All writes go through Wharfkit session:
- **Buy:** `eosio.token::transfer` (from: user, to: otc_contract, quantity: TLOS, memo: `buy:<id>`)
- **Create listing:** `thezeostoken::transfer` (from: user, to: otc_contract, quantity: CLOAK, memo: `list:<min_price>:<premium_pct>`)
- **Cancel:** `otc_contract::cancellisting` (seller: user, listing_id: id)

## Contract Configuration

Constants needed in the frontend:
```
OTC_CONTRACT = "<deployment_account>"  // configurable
CLOAK_CONTRACT = "thezeostoken"
AUCTION_CONTRACT = "thezeosalias"
TLOS_CONTRACT = "eosio.token"
TELOS_RPC = "https://mainnet.telos.net"
```

## Error Handling

- Wallet not connected -> show "Connect Wallet" prompt
- Contract paused -> show banner "Trading is paused"
- Listing frozen -> Buy button disabled with "Frozen" badge
- Transaction failed -> toast notification with error message
- Network error -> retry with fallback RPC endpoint
