#include <otccloak/otccloak.hpp>

// ---- Task 5: setconfig ----

void otccloak::setconfig(uint16_t fee_pct, bool paused) {
   require_auth(get_self());
   check(fee_pct <= 1000, "fee cannot exceed 10%");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   cfg.fee_pct = fee_pct;
   cfg.paused = paused;
   cfg_table.set(cfg, get_self());
}

// ---- Task 6: cancellisting ----

void otccloak::cancellisting(name seller, uint64_t listing_id) {
   require_auth(seller);

   listings_table listings(get_self(), get_self().value);
   auto itr = listings.find(listing_id);
   check(itr != listings.end(), "listing not found");
   check(itr->seller == seller, "not your listing");

   action(
      permission_level{get_self(), "active"_n},
      CLOAK_CONTRACT,
      "transfer"_n,
      std::make_tuple(get_self(), seller, itr->quantity, std::string("otc: listing cancelled"))
   ).send();

   listings.erase(itr);
}

// ---- Task 7: CLOAK transfer handler (listing) ----

void otccloak::on_cloak_transfer(name from, name to, asset quantity, std::string memo) {
   if (to != get_self()) return;
   if (from == get_self()) return;

   check(quantity.symbol == CLOAK_SYMBOL, "only CLOAK deposits accepted");
   check(quantity.amount > 0, "must deposit positive amount");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   check(!cfg.paused, "contract is paused");

   auto parsed = parse_list_memo(memo);

   nextid_singleton nid(get_self(), get_self().value);
   nextid current = nid.get_or_default(nextid{1});
   uint64_t id = current.next_id;
   current.next_id++;
   nid.set(current, get_self());

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

// ---- Task 8: TLOS transfer handler (buying) ----

void otccloak::on_tlos_transfer(name from, name to, asset quantity, std::string memo) {
   if (to != get_self()) return;
   if (from == get_self()) return;

   check(quantity.symbol == TLOS_SYMBOL, "only TLOS accepted for buying");
   check(quantity.amount > 0, "must send positive amount");

   config_singleton cfg_table(get_self(), get_self().value);
   config cfg = cfg_table.get_or_default(config{});
   check(!cfg.paused, "contract is paused");

   check(memo.substr(0, 4) == "buy:", "invalid memo format, expected buy:<listing_id>");
   uint64_t listing_id = std::stoull(memo.substr(4));

   listings_table listings(get_self(), get_self().value);
   auto itr = listings.find(listing_id);
   check(itr != listings.end(), "listing not found");

   asset auction_price = get_last_auction_price();
   asset otc_price = compute_otc_price(auction_price, itr->premium_pct);

   check(otc_price >= itr->min_price, "listing is frozen: otc price is below seller minimum");
   check(otc_price.amount > 0, "otc price is zero, cannot trade");

   int128_t cloak_raw = (int128_t)quantity.amount * 10000 / otc_price.amount;
   int64_t cloak_amount = static_cast<int64_t>(cloak_raw);

   int64_t tlos_refund = 0;
   if (cloak_amount > itr->quantity.amount) {
      cloak_amount = itr->quantity.amount;
      int128_t tlos_cost = (int128_t)cloak_amount * otc_price.amount / 10000;
      tlos_refund = quantity.amount - static_cast<int64_t>(tlos_cost);
   }

   check(cloak_amount > 0, "TLOS amount too small to buy any CLOAK");

   int64_t fee_amount = 0;
   if (cfg.fee_pct > 0) {
      fee_amount = cloak_amount * cfg.fee_pct / 10000;
   }

   asset cloak_to_buyer = asset(cloak_amount - fee_amount, CLOAK_SYMBOL);
   check(cloak_to_buyer.amount > 0, "trade amount too small after fee");

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

   // Burn fee CLOAK
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

// ---- Task 9: getprice query action ----

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
