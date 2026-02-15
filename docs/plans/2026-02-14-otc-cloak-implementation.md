# OTC CLOAK Marketplace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a P2P OTC marketplace contract on Telos where sellers list CLOAK at a dynamic price (auction price + premium %), with a minimum price floor that freezes listings when the dynamic price drops too low.

**Architecture:** Single Antelope C++ smart contract with transfer notification handlers for CLOAK deposits (listing) and TLOS deposits (buying). Reads `thezeosalias` auction tables cross-contract to compute the reference price each round. Fee CLOAK is sent to a burn address.

**Tech Stack:** Antelope CDT (C++), cleos for deployment, Telos mainnet

---

### Task 1: Project Scaffolding

**Files:**
- Create: `CMakeLists.txt`
- Create: `include/otccloak/otccloak.hpp`
- Create: `src/otccloak.cpp`

**Step 1: Create CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.5)
project(otccloak VERSION 1.0.0)

find_package(cdt)

add_contract( otccloak otccloak
  src/otccloak.cpp
)

target_include_directories( otccloak PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)
```

**Step 2: Create empty header and source files**

`include/otccloak/otccloak.hpp`:
```cpp
#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/system.hpp>

using namespace eosio;

class [[eosio::contract("otccloak")]] otccloak : public contract {
public:
   using contract::contract;
};
```

`src/otccloak.cpp`:
```cpp
#include <otccloak/otccloak.hpp>
```

**Step 3: Commit**

```bash
git add CMakeLists.txt include/ src/
git commit -m "chore: scaffold otccloak contract project"
```

---

### Task 2: External Table Structs (Cross-Contract Read Definitions)

Define the structs needed to read `thezeosalias` auction tables.

**Files:**
- Modify: `include/otccloak/otccloak.hpp`

**Step 1: Add external table struct definitions to the header**

Add these above the `otccloak` class definition. These replicate the exact binary layout of `thezeosalias` tables so we can read them cross-contract.

```cpp
// ---- External table structs for reading thezeosalias ----

// Auction configuration (thezeosalias::auctioncfg table)
struct auction_cfg {
   time_point_sec start;
   uint32_t       round_dur;
   uint32_t       num_rounds;
   asset          tokens_per_round;
   name           token_contract;
   asset          min_contribution;
   uint16_t       stake_rate;

   uint64_t primary_key() const { return 0; }
};
typedef multi_index<"auctioncfg"_n, auction_cfg> auctioncfg_table;

// Auction participant row (thezeosalias::auction table, scoped by round)
// The user field is variant<vector<uint8_t>, name> but we only need to
// iterate and sum amounts, so we define a compatible struct.
struct auction_row {
   std::variant<std::vector<uint8_t>, name> user;
   asset    amount;
   bool     claimed;

   uint64_t primary_key() const {
      if (auto* n = std::get_if<name>(&user)) return n->value;
      if (auto* b = std::get_if<std::vector<uint8_t>>(&user)) {
         // hash first 8 bytes for primary key (matches thezeosalias behavior)
         uint64_t key = 0;
         auto sz = std::min(b->size(), (size_t)8);
         std::memcpy(&key, b->data(), sz);
         return key;
      }
      return 0;
   }
};
typedef multi_index<"auction"_n, auction_row> auction_table;
```

**Step 2: Commit**

```bash
git add include/
git commit -m "feat: add external table structs for thezeosalias cross-contract reads"
```

---

### Task 3: Contract Data Model (Tables, Singletons, Constants)

**Files:**
- Modify: `include/otccloak/otccloak.hpp`

**Step 1: Add constants, config struct, listing struct, and table definitions**

Add inside the `otccloak` class:

```cpp
   // ---- Constants ----
   static constexpr name CLOAK_CONTRACT  = "thezeostoken"_n;
   static constexpr name AUCTION_CONTRACT = "thezeosalias"_n;
   static constexpr name TLOS_CONTRACT   = "eosio.token"_n;
   static constexpr name BURN_ACCOUNT    = "eosio.null"_n;
   static constexpr symbol CLOAK_SYMBOL  = symbol("CLOAK", 4);
   static constexpr symbol TLOS_SYMBOL   = symbol("TLOS", 4);

   // ---- Config singleton ----
   struct [[eosio::table]] config {
      uint16_t fee_pct = 0;   // basis points (e.g. 50 = 0.5%)
      bool     paused  = false;
   };
   typedef singleton<"config"_n, config> config_singleton;

   // ---- Listings table ----
   struct [[eosio::table]] listing {
      uint64_t       id;
      name           seller;
      asset          quantity;     // CLOAK remaining
      asset          min_price;    // minimum TLOS per 1.0000 CLOAK
      uint16_t       premium_pct;  // % premium over auction price
      time_point_sec created_at;

      uint64_t primary_key() const { return id; }
      uint64_t by_seller()   const { return seller.value; }
   };
   typedef multi_index<"listings"_n, listing,
      indexed_by<"byseller"_n,
         const_mem_fun<listing, uint64_t, &listing::by_seller>>
   > listings_table;

   // ---- Next ID singleton ----
   struct [[eosio::table]] nextid {
      uint64_t next_id = 1;
   };
   typedef singleton<"nextid"_n, nextid> nextid_singleton;
```

**Step 2: Commit**

```bash
git add include/
git commit -m "feat: add config, listings table, and nextid singleton"
```

---

### Task 4: Auction Price Calculation Helper

**Files:**
- Modify: `include/otccloak/otccloak.hpp`

**Step 1: Add the price calculation method to the class**

Add as a private method inside the `otccloak` class:

```cpp
private:
   // Returns the effective price per 1.0000 CLOAK from the last completed
   // auction round, in TLOS (4 decimal). Returns {0, TLOS_SYMBOL} if no
   // completed round exists or no contributions were made.
   asset get_last_auction_price() const {
      // Read auction config from thezeosalias
      auctioncfg_table acfg(AUCTION_CONTRACT, AUCTION_CONTRACT.value);
      auto cfg_itr = acfg.begin();
      check(cfg_itr != acfg.end(), "auction config not found on thezeosalias");

      uint32_t now_sec = current_time_point().sec_since_epoch();
      uint32_t start_sec = cfg_itr->start.sec_since_epoch();

      // Auction hasn't started yet
      if (now_sec < start_sec) {
         return asset(0, TLOS_SYMBOL);
      }

      uint32_t elapsed = now_sec - start_sec;
      uint32_t current_round = elapsed / cfg_itr->round_dur;

      // No completed round yet (still in round 0)
      if (current_round == 0) {
         return asset(0, TLOS_SYMBOL);
      }

      // Cap to last valid round if auction ended
      uint32_t last_round = current_round - 1;
      if (last_round >= cfg_itr->num_rounds) {
         last_round = cfg_itr->num_rounds - 1;
      }

      // Sum all TLOS contributions in the last completed round
      auction_table auctions(AUCTION_CONTRACT, last_round);
      int64_t total_tlos = 0;
      for (auto itr = auctions.begin(); itr != auctions.end(); ++itr) {
         total_tlos += itr->amount.amount;
      }

      if (total_tlos == 0) {
         return asset(0, TLOS_SYMBOL);
      }

      // price = total_tlos / tokens_per_round
      // Both are 4-decimal assets. To get price per 1.0000 CLOAK:
      // price_amount = total_tlos * 10000 / tokens_per_round.amount
      // This gives us the TLOS amount (in 4-decimal units) for 1.0000 CLOAK
      int64_t tokens_amount = cfg_itr->tokens_per_round.amount;
      check(tokens_amount > 0, "tokens_per_round is zero");

      // Use 128-bit to prevent overflow
      int128_t price = (int128_t)total_tlos * 10000 / tokens_amount;

      return asset(static_cast<int64_t>(price), TLOS_SYMBOL);
   }

   // Compute the OTC price for a listing given the current auction price.
   // Returns the dynamic OTC price (auction_price * (100 + premium_pct) / 100).
   asset compute_otc_price(const asset& auction_price, uint16_t premium_pct) const {
      if (auction_price.amount == 0) {
         return asset(0, TLOS_SYMBOL);
      }
      int128_t result = (int128_t)auction_price.amount * (100 + premium_pct) / 100;
      return asset(static_cast<int64_t>(result), TLOS_SYMBOL);
   }
```

**Step 2: Commit**

```bash
git add include/
git commit -m "feat: add auction price calculation and OTC price helpers"
```

---

### Task 5: setconfig Action

**Files:**
- Modify: `include/otccloak/otccloak.hpp` (action declaration)
- Modify: `src/otccloak.cpp` (implementation)

**Step 1: Declare the action in the header**

Add to the public section of `otccloak` class:

```cpp
   [[eosio::action]]
   void setconfig(uint16_t fee_pct, bool paused);
```

**Step 2: Implement in source**

```cpp
void otccloak::setconfig(uint16_t fee_pct, bool paused) {
   require_auth(get_self());

   check(fee_pct <= 1000, "fee cannot exceed 10%");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   cfg.fee_pct = fee_pct;
   cfg.paused = paused;
   cfg_table.set(cfg, get_self());
}
```

**Step 3: Commit**

```bash
git add include/ src/
git commit -m "feat: add setconfig action for fee and pause control"
```

---

### Task 6: cancellisting Action

**Files:**
- Modify: `include/otccloak/otccloak.hpp` (action declaration)
- Modify: `src/otccloak.cpp` (implementation)

**Step 1: Declare the action in the header**

Add to the public section:

```cpp
   [[eosio::action]]
   void cancellisting(name seller, uint64_t listing_id);
```

**Step 2: Implement in source**

```cpp
void otccloak::cancellisting(name seller, uint64_t listing_id) {
   require_auth(seller);

   listings_table listings(get_self(), get_self().value);
   auto itr = listings.find(listing_id);
   check(itr != listings.end(), "listing not found");
   check(itr->seller == seller, "not your listing");

   // Return CLOAK to seller
   action(
      permission_level{get_self(), "active"_n},
      CLOAK_CONTRACT,
      "transfer"_n,
      std::make_tuple(get_self(), seller, itr->quantity, std::string("otc: listing cancelled"))
   ).send();

   listings.erase(itr);
}
```

**Step 3: Commit**

```bash
git add include/ src/
git commit -m "feat: add cancellisting action to return CLOAK to seller"
```

---

### Task 7: Transfer Notification Handler -- CLOAK Deposits (Listing)

**Files:**
- Modify: `include/otccloak/otccloak.hpp` (on_notify declaration + memo parser)
- Modify: `src/otccloak.cpp` (implementation)

**Step 1: Add memo parsing helper to the header (private section)**

```cpp
   // Parse "list:<min_price>:<premium_pct>" memo
   struct list_memo {
      asset    min_price;
      uint16_t premium_pct;
   };

   list_memo parse_list_memo(const std::string& memo) const {
      // Expected format: "list:0.0500:10"
      check(memo.substr(0, 5) == "list:", "invalid memo format, expected list:<min_price>:<premium_pct>");

      std::string rest = memo.substr(5);
      auto sep = rest.find(':');
      check(sep != std::string::npos, "invalid memo format, missing premium_pct separator");

      std::string price_str = rest.substr(0, sep);
      std::string pct_str = rest.substr(sep + 1);

      // Parse min_price -- expect format like "0.0500"
      // Convert to asset with TLOS symbol
      asset min_price = asset::from_string(price_str + " TLOS");
      check(min_price.amount > 0, "min_price must be positive");
      check(min_price.symbol == TLOS_SYMBOL, "min_price must be in TLOS");

      // Parse premium_pct
      uint16_t premium_pct = static_cast<uint16_t>(std::stoul(pct_str));

      return {min_price, premium_pct};
   }
```

**Step 2: Declare the on_notify handler in the header (public section)**

```cpp
   [[eosio::on_notify("thezeostoken::transfer")]]
   void on_cloak_transfer(name from, name to, asset quantity, std::string memo);
```

**Step 3: Implement the CLOAK transfer handler**

```cpp
void otccloak::on_cloak_transfer(name from, name to, asset quantity, std::string memo) {
   if (to != get_self()) return;
   if (from == get_self()) return;

   check(quantity.symbol == CLOAK_SYMBOL, "only CLOAK deposits accepted");
   check(quantity.amount > 0, "must deposit positive amount");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   check(!cfg.paused, "contract is paused");

   auto parsed = parse_list_memo(memo);

   // Get next listing ID
   nextid_singleton nid(get_self(), get_self().value);
   nextid current = nid.get_or_default(nextid{1});
   uint64_t id = current.next_id;
   current.next_id++;
   nid.set(current, get_self());

   // Create listing
   listings_table listings(get_self(), get_self().value);
   listings.emplace(get_self(), [&](auto& row) {
      row.id          = id;
      row.seller      = from;
      row.quantity    = quantity;
      row.min_price   = parsed.min_price;
      row.premium_pct = parsed.premium_pct;
      row.created_at  = current_time_point();
   });
}
```

**Step 4: Commit**

```bash
git add include/ src/
git commit -m "feat: add CLOAK transfer handler to create OTC listings"
```

---

### Task 8: Transfer Notification Handler -- TLOS Deposits (Buying)

**Files:**
- Modify: `include/otccloak/otccloak.hpp` (on_notify declaration)
- Modify: `src/otccloak.cpp` (implementation)

**Step 1: Declare the on_notify handler in the header (public section)**

```cpp
   [[eosio::on_notify("eosio.token::transfer")]]
   void on_tlos_transfer(name from, name to, asset quantity, std::string memo);
```

**Step 2: Implement the TLOS transfer handler (buy logic)**

```cpp
void otccloak::on_tlos_transfer(name from, name to, asset quantity, std::string memo) {
   if (to != get_self()) return;
   if (from == get_self()) return;

   check(quantity.symbol == TLOS_SYMBOL, "only TLOS accepted for buying");
   check(quantity.amount > 0, "must send positive amount");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   check(!cfg.paused, "contract is paused");

   // Parse memo: "buy:<listing_id>"
   check(memo.substr(0, 4) == "buy:", "invalid memo format, expected buy:<listing_id>");
   uint64_t listing_id = std::stoull(memo.substr(4));

   // Look up listing
   listings_table listings(get_self(), get_self().value);
   auto itr = listings.find(listing_id);
   check(itr != listings.end(), "listing not found");

   // Compute dynamic OTC price
   asset auction_price = get_last_auction_price();
   asset otc_price = compute_otc_price(auction_price, itr->premium_pct);

   // Check price floor
   check(otc_price >= itr->min_price,
      "listing is frozen: otc price is below seller minimum");
   check(otc_price.amount > 0, "otc price is zero, cannot trade");

   // Calculate how much CLOAK the buyer gets
   // cloak_amount = tlos_sent / otc_price (per 1.0000 CLOAK)
   // tlos_sent and otc_price are both 4-decimal TLOS assets
   // cloak_raw = tlos_sent.amount * 10000 / otc_price.amount
   int128_t cloak_raw = (int128_t)quantity.amount * 10000 / otc_price.amount;
   int64_t cloak_amount = static_cast<int64_t>(cloak_raw);

   // Cap to available quantity
   int64_t tlos_refund = 0;
   if (cloak_amount > itr->quantity.amount) {
      cloak_amount = itr->quantity.amount;
      // Recalculate actual TLOS cost
      // tlos_cost = cloak_amount * otc_price.amount / 10000
      int128_t tlos_cost = (int128_t)cloak_amount * otc_price.amount / 10000;
      tlos_refund = quantity.amount - static_cast<int64_t>(tlos_cost);
   }

   check(cloak_amount > 0, "TLOS amount too small to buy any CLOAK");

   asset cloak_bought = asset(cloak_amount, CLOAK_SYMBOL);

   // Calculate fee
   int64_t fee_amount = 0;
   if (cfg.fee_pct > 0) {
      fee_amount = cloak_amount * cfg.fee_pct / 10000;
   }

   asset cloak_to_buyer = asset(cloak_amount - fee_amount, CLOAK_SYMBOL);
   check(cloak_to_buyer.amount > 0, "trade amount too small after fee");

   // Calculate TLOS to send to seller
   int128_t tlos_to_seller_raw = (int128_t)cloak_amount * otc_price.amount / 10000;
   asset tlos_to_seller = asset(static_cast<int64_t>(tlos_to_seller_raw), TLOS_SYMBOL);

   // Send CLOAK to buyer
   action(
      permission_level{get_self(), "active"_n},
      CLOAK_CONTRACT,
      "transfer"_n,
      std::make_tuple(get_self(), from, cloak_to_buyer, std::string("otc: purchase"))
   ).send();

   // Send TLOS to seller
   action(
      permission_level{get_self(), "active"_n},
      TLOS_CONTRACT,
      "transfer"_n,
      std::make_tuple(get_self(), itr->seller, tlos_to_seller, std::string("otc: sale proceeds"))
   ).send();

   // Burn fee CLOAK (send to eosio.null)
   if (fee_amount > 0) {
      asset fee_cloak = asset(fee_amount, CLOAK_SYMBOL);
      action(
         permission_level{get_self(), "active"_n},
         CLOAK_CONTRACT,
         "transfer"_n,
         std::make_tuple(get_self(), BURN_ACCOUNT, fee_cloak, std::string("otc: fee burn"))
      ).send();
   }

   // Refund excess TLOS
   if (tlos_refund > 0) {
      action(
         permission_level{get_self(), "active"_n},
         TLOS_CONTRACT,
         "transfer"_n,
         std::make_tuple(get_self(), from, asset(tlos_refund, TLOS_SYMBOL), std::string("otc: refund excess"))
      ).send();
   }

   // Update or erase listing
   if (cloak_amount >= itr->quantity.amount) {
      listings.erase(itr);
   } else {
      listings.modify(itr, same_payer, [&](auto& row) {
         row.quantity.amount -= cloak_amount;
      });
   }
}
```

**Step 3: Commit**

```bash
git add include/ src/
git commit -m "feat: add TLOS transfer handler for buying CLOAK from listings"
```

---

### Task 9: Read-Only Query Action (getprice)

A convenience action that logs the current auction price and a listing's OTC price so users can check before buying.

**Files:**
- Modify: `include/otccloak/otccloak.hpp`
- Modify: `src/otccloak.cpp`

**Step 1: Declare the action (public section)**

```cpp
   [[eosio::action]]
   void getprice(uint64_t listing_id);
```

**Step 2: Implement**

```cpp
void otccloak::getprice(uint64_t listing_id) {
   listings_table listings(get_self(), get_self().value);
   auto itr = listings.find(listing_id);
   check(itr != listings.end(), "listing not found");

   asset auction_price = get_last_auction_price();
   asset otc_price = compute_otc_price(auction_price, itr->premium_pct);
   bool active = otc_price >= itr->min_price && otc_price.amount > 0;

   print("listing_id=", listing_id,
         " seller=", itr->seller,
         " available=", itr->quantity,
         " auction_price=", auction_price,
         " otc_price=", otc_price,
         " min_price=", itr->min_price,
         " premium_pct=", itr->premium_pct,
         " active=", active ? "true" : "false");
}
```

**Step 3: Commit**

```bash
git add include/ src/
git commit -m "feat: add getprice action for querying listing status"
```

---

### Task 10: Final Assembly and Compile

**Files:**
- Verify: `include/otccloak/otccloak.hpp` (complete header)
- Verify: `src/otccloak.cpp` (complete source)

**Step 1: Verify the complete header file is correct**

The full header should contain (in order):
1. Pragma once, includes
2. External table structs (auction_cfg, auction_row)
3. The `otccloak` class with:
   - Constants
   - Config singleton struct + typedef
   - Listing struct + typedef
   - Nextid singleton struct + typedef
   - Public action declarations (setconfig, cancellisting, getprice, two on_notify)
   - Private helpers (get_last_auction_price, compute_otc_price, list_memo, parse_list_memo)

**Step 2: Verify the complete source file has all implementations**

The source should contain implementations for:
1. `setconfig`
2. `cancellisting`
3. `on_cloak_transfer`
4. `on_tlos_transfer`
5. `getprice`

**Step 3: Build the contract**

Run:
```bash
mkdir -p build && cd build && cmake .. && make
```

Expected: `otccloak.wasm` and `otccloak.abi` generated in `build/` directory.

**Step 4: Fix any compilation errors**

Address any issues found during compilation.

**Step 5: Commit the final working build**

```bash
git add -A
git commit -m "feat: complete OTC CLOAK marketplace contract"
```

---

### Task 11: Deployment Script

**Files:**
- Create: `scripts/deploy.sh`

**Step 1: Create deployment helper script**

```bash
#!/bin/bash
set -e

# Configuration -- update these for your deployment
TELOS_API="${TELOS_API:-https://mainnet.telos.net}"
CONTRACT_ACCOUNT="${CONTRACT_ACCOUNT:-your_account}"
BUILD_DIR="$(dirname "$0")/../build"

echo "Deploying otccloak to $CONTRACT_ACCOUNT on $TELOS_API"
echo "Build dir: $BUILD_DIR"

# Deploy contract
cleos -u "$TELOS_API" set contract "$CONTRACT_ACCOUNT" "$BUILD_DIR" \
  otccloak.wasm otccloak.abi \
  -p "$CONTRACT_ACCOUNT@active"

echo "Contract deployed. Setting up eosio.code permission..."

# Add eosio.code permission so the contract can send inline transfers
# Get the current public key for the account
CURRENT_KEY=$(cleos -u "$TELOS_API" get account "$CONTRACT_ACCOUNT" -j | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['permissions'][0]['required_auth']['keys'][0]['key'])")

cleos -u "$TELOS_API" set account permission "$CONTRACT_ACCOUNT" active \
  "{\"threshold\":1,\"keys\":[{\"key\":\"$CURRENT_KEY\",\"weight\":1}],\"accounts\":[{\"permission\":{\"actor\":\"$CONTRACT_ACCOUNT\",\"permission\":\"eosio.code\"},\"weight\":1}]}" \
  owner -p "$CONTRACT_ACCOUNT@owner"

echo "Done. Setting initial config (0.5% fee, not paused)..."

cleos -u "$TELOS_API" push action "$CONTRACT_ACCOUNT" setconfig '[50, false]' \
  -p "$CONTRACT_ACCOUNT@active"

echo "Deployment complete!"
```

**Step 2: Make executable**

```bash
chmod +x scripts/deploy.sh
```

**Step 3: Commit**

```bash
git add scripts/
git commit -m "chore: add deployment script with eosio.code permission setup"
```
