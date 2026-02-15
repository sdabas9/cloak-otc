#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/singleton.hpp>
#include <eosio/system.hpp>
#include <cstring>
#include <variant>
#include <vector>
#include <algorithm>

using namespace eosio;

// ---- External table structs for reading thezeosalias ----

// Auction configuration (thezeosalias::auctioncfg table)
// Field types must match the on-chain ABI exactly for correct deserialization.
struct auction_cfg {
   uint32_t       start_block_time;   // Unix epoch seconds
   uint32_t       round_duration_sec; // seconds per round (82800 = 23h)
   uint16_t       number_of_rounds;   // total rounds (60)
   asset          tokens_per_round;   // CLOAK per round
   name           token_contract;     // thezeostoken
   extended_asset min_contribution;   // minimum TLOS contribution
   uint8_t        stake_rate;         // % of contributions staked

   uint64_t primary_key() const { return 0; }
};
typedef multi_index<"auctioncfg"_n, auction_cfg> auctioncfg_table;

// Auction participant row (thezeosalias::auction table, scoped by round)
// amount is raw int64 (not asset) per the on-chain ABI.
struct auction_row {
   std::variant<std::vector<uint8_t>, name> user;
   int64_t  amount;   // TLOS contributed (raw units, 4 decimal)
   bool     claimed;

   uint64_t primary_key() const {
      if (auto* n = std::get_if<name>(&user)) return n->value;
      if (auto* b = std::get_if<std::vector<uint8_t>>(&user)) {
         uint64_t key = 0;
         auto sz = std::min(b->size(), (size_t)8);
         std::memcpy(&key, b->data(), sz);
         return key;
      }
      return 0;
   }
};
typedef multi_index<"auction"_n, auction_row> auction_table;

// ---- OTC CLOAK Marketplace Contract ----

class [[eosio::contract("otccloak")]] otccloak : public contract {
public:
   using contract::contract;

   // ---- Constants ----
   static constexpr name CLOAK_CONTRACT  = "thezeostoken"_n;
   static constexpr name AUCTION_CONTRACT = "thezeosalias"_n;
   static constexpr name TLOS_CONTRACT   = "eosio.token"_n;
   static constexpr name BURN_ACCOUNT    = "eosio.null"_n;
   static constexpr symbol CLOAK_SYMBOL  = symbol("CLOAK", 4);
   static constexpr symbol TLOS_SYMBOL   = symbol("TLOS", 4);

   // ---- Config singleton ----
   struct [[eosio::table]] config {
      uint16_t fee_pct = 0;
      bool     paused  = false;
   };
   typedef singleton<"config"_n, config> config_singleton;

   // ---- Listings table ----
   struct [[eosio::table]] listing {
      uint64_t       id;
      name           seller;
      asset          quantity;
      asset          min_price;
      uint16_t       premium_pct;
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

   // ---- Actions ----
   [[eosio::action]]
   void setconfig(uint16_t fee_pct, bool paused);

   [[eosio::action]]
   void cancellisting(name seller, uint64_t listing_id);

   [[eosio::action]]
   void getprice(uint64_t listing_id);

   // ---- Transfer notifications ----
   [[eosio::on_notify("thezeostoken::transfer")]]
   void on_cloak_transfer(name from, name to, asset quantity, std::string memo);

   [[eosio::on_notify("eosio.token::transfer")]]
   void on_tlos_transfer(name from, name to, asset quantity, std::string memo);

private:
   asset get_last_auction_price() const {
      auctioncfg_table acfg(AUCTION_CONTRACT, AUCTION_CONTRACT.value);
      auto cfg_itr = acfg.begin();
      check(cfg_itr != acfg.end(), "auction config not found on thezeosalias");

      uint32_t now_sec = current_time_point().sec_since_epoch();
      uint32_t start_sec = cfg_itr->start_block_time;

      if (now_sec < start_sec) {
         return asset(0, TLOS_SYMBOL);
      }

      uint32_t elapsed = now_sec - start_sec;
      uint32_t current_round = elapsed / cfg_itr->round_duration_sec;

      if (current_round == 0) {
         return asset(0, TLOS_SYMBOL);
      }

      uint32_t last_round = current_round - 1;
      if (last_round >= cfg_itr->number_of_rounds) {
         last_round = cfg_itr->number_of_rounds - 1;
      }

      auction_table auctions(AUCTION_CONTRACT, last_round);
      int64_t total_tlos = 0;
      for (auto itr = auctions.begin(); itr != auctions.end(); ++itr) {
         total_tlos += itr->amount;
      }

      if (total_tlos == 0) {
         return asset(0, TLOS_SYMBOL);
      }

      int64_t tokens_amount = cfg_itr->tokens_per_round.amount;
      check(tokens_amount > 0, "tokens_per_round is zero");

      int128_t price = (int128_t)total_tlos * 10000 / tokens_amount;

      return asset(static_cast<int64_t>(price), TLOS_SYMBOL);
   }

   asset compute_otc_price(const asset& auction_price, uint16_t premium_pct) const {
      if (auction_price.amount == 0) {
         return asset(0, TLOS_SYMBOL);
      }
      int128_t result = (int128_t)auction_price.amount * (100 + premium_pct) / 100;
      return asset(static_cast<int64_t>(result), TLOS_SYMBOL);
   }

   // ---- Memo parsing helper ----
   struct list_memo {
      asset    min_price;
      uint16_t premium_pct;
   };

   list_memo parse_list_memo(const std::string& memo) const {
      check(memo.substr(0, 5) == "list:", "invalid memo format, expected list:<min_price>:<premium_pct>");

      std::string rest = memo.substr(5);
      auto sep = rest.find(':');
      check(sep != std::string::npos, "invalid memo format, missing premium_pct separator");

      std::string price_str = rest.substr(0, sep);
      std::string pct_str = rest.substr(sep + 1);
      check(!pct_str.empty(), "premium_pct is missing");
      check(pct_str.find_first_not_of("0123456789") == std::string::npos,
            "premium_pct must be a number");

      // Parse "0.0400" format into asset with 4 decimal precision
      check(!price_str.empty(), "min_price is empty");
      check(price_str.find_first_not_of("0123456789.") == std::string::npos,
            "min_price contains invalid characters");
      auto dot_pos = price_str.find('.');
      int64_t int_part = 0;
      int64_t frac_part = 0;
      if (dot_pos != std::string::npos) {
         if (dot_pos > 0) int_part = std::stoll(price_str.substr(0, dot_pos));
         std::string frac_str = price_str.substr(dot_pos + 1);
         check(frac_str.size() <= 4, "min_price precision exceeds 4 decimals");
         while (frac_str.size() < 4) frac_str += '0';
         frac_part = std::stoll(frac_str);
      } else {
         int_part = std::stoll(price_str);
      }
      int64_t raw_amount = int_part * 10000 + frac_part;
      asset min_price = asset(raw_amount, TLOS_SYMBOL);
      check(min_price.amount > 0, "min_price must be positive");

      unsigned long raw_pct = std::stoul(pct_str);
      check(raw_pct <= 10000, "premium_pct cannot exceed 10000");
      uint16_t premium_pct = static_cast<uint16_t>(raw_pct);

      return {min_price, premium_pct};
   }
};
