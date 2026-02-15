# thezeosalias Contract Guide

Contract account: `thezeosalias` on **Telos mainnet**

The CLOAK privacy protocol contract. Handles shielded (private) transactions using zk-SNARKs, a token auction for distributing CLOAK, fee collection and burning, and account blacklisting.

---

## Tables

### `auctioncfg` -- Auction Configuration

Scope: `thezeosalias` | Single row

| Field | Type | Description |
|---|---|---|
| `start_block_time` | uint32 | Auction start time (Unix epoch seconds) |
| `round_duration_sec` | uint32 | Duration of each round in seconds |
| `number_of_rounds` | uint16 | Total number of auction rounds |
| `tokens_per_round` | asset | CLOAK distributed per round |
| `token_contract` | name | Token contract (`thezeostoken`) |
| `min_contribution` | extended_asset | Minimum TLOS contribution per deposit |
| `stake_rate` | uint8 | % of contributions auto-staked to CPU |

**Current values:**

```
start_block_time:   1769803200 (2026-01-30 12:00:00 UTC)
round_duration_sec: 82800 (23 hours)
number_of_rounds:   60
tokens_per_round:   1,638,001.6380 CLOAK
token_contract:     thezeostoken
min_contribution:   100.0000 TLOS (via eosio.token)
stake_rate:         5%
```

**Total auction allocation:** 60 * 1,638,001.6380 = **98,280,098.2800 CLOAK** (~9.83% of 1B max supply)

**Auction end (approx):** 2026-01-30 + (60 * 23h) = ~2026-03-29

### `auction` -- Per-Round Participation

Scope: **round number** (0, 1, 2, ..., 59)

| Field | Type | Description |
|---|---|---|
| `user` | variant_bytes_name | Participant: `["name", "account"]` or `["bytes", "0x..."]` for anonymous |
| `amount` | int64 | TLOS contributed (raw units, 4 decimal) |
| `claimed` | bool | Whether tokens have been claimed for this round |

The `variant_bytes_name` type allows both named Telos accounts and anonymous privacy wallets (32-byte cryptographic commitments) to participate.

**Reading a round:**
```bash
cleos -u https://mainnet.telos.net get table thezeosalias 0 auction --limit 100
```

### `auctionstat` -- Aggregate Auction Stats

Scope: `thezeosalias` | Single row

| Field | Type | Description |
|---|---|---|
| `amount_contributed` | int64 | Total TLOS contributed across all rounds (raw units) |
| `amount_staked` | int64 | Total TLOS staked to CPU (raw units) |

**Current values:**
```
amount_contributed: 1,296,921.8852 TLOS
amount_staked:         64,846.0930 TLOS  (5% of contributed)
```

### `fees` -- Fee Schedule

Scope: `thezeosalias` | Single row

| Field | Type | Description |
|---|---|---|
| `token_contract` | name | Fee token contract (`thezeostoken`) |
| `symbol_code` | symbol_code | Fee token symbol (`CLOAK`) |
| `fees` | pair_name_asset[] | Array of (action_name, fee_amount) pairs |
| `burn_rate` | uint8 | % of collected fees that are burned |

**Current fee schedule:**

| Action | Fee |
|---|---|
| `begin` | 0.2000 CLOAK |
| `authenticate` | 0.1000 CLOAK |
| `mint` | 0.1000 CLOAK |
| `output` | 0.1000 CLOAK |
| `publishnotes` | 0.1000 CLOAK |
| `spend` | 0.1000 CLOAK |
| `spendoutput` | 0.1000 CLOAK |

**Burn rate: 50%** -- half of all fees are permanently burned.

### `burned` -- Total CLOAK Burned

Scope: `thezeosalias` | Single row

| Field | Type | Description |
|---|---|---|
| `amount` | uint64 | Total CLOAK burned (raw units, 4 decimal) |

**Current value:** 36.1500 CLOAK burned

### `actionbuffer` -- Privacy Operation Buffer

Scope: `thezeosalias` | Temporary

| Field | Type | Description |
|---|---|---|
| `mint_actions` | pls_mint[] | Pending mint (shield) operations |
| `spend_actions` | pls_spend_sequence[] | Pending spend operations |
| `authenticate_actions` | pls_authenticate[] | Pending authentication proofs |
| `withdraw_actions` | pls_withdraw[] | Pending withdraw (unshield) operations |

Used internally between `begin` and `end` calls to batch privacy operations.

### `exec` -- Execution State

Scope: `thezeosalias` | Single row

| Field | Type | Description |
|---|---|---|
| `prev_balance` | int64 | Previous CLOAK balance for fee tracking |
| `fee` | int64 | Accumulated fee for current batch |

### `blacklist` -- Blocked Accounts

Scope: `thezeosalias`

| Field | Type | Description |
|---|---|---|
| `account` | name | Blacklisted Telos account |

---

## Actions

### Auction Actions

#### `auctioncfg` -- Set Auction Configuration
```
Auth: contract owner
Params: row (auction_cfg struct)
```
Initializes or updates the auction configuration. Sets start time, round duration, tokens per round, etc.

#### `rmauctioncfg` -- Remove Auction Configuration
```
Auth: contract owner
Params: none
```
Removes the auction config (disables auction).

#### `claimauction` -- Claim Auction Tokens (Named Account)
```
Auth: public
Params: user (name), round (uint32)
```
Claims CLOAK tokens for a named account from a completed round. The amount received is proportional to the user's TLOS contribution relative to the total for that round:
```
cloak_received = (user_contribution / total_round_contribution) * tokens_per_round
```

#### `claimauctiop` -- Claim Auction Tokens (Privacy Wallet)
```
Auth: public (with zk proof in transaction)
Params: round (uint32)
```
Same as `claimauction` but for anonymous participants who used a privacy wallet (bytes variant).

### Privacy Protocol Actions

These actions implement Zcash-style shielded transactions using Groth-16 zk-SNARKs on the BLS12-381 curve.

#### `begin` -- Start Privacy Batch
```
Auth: public
Params: none
Fee: 0.2000 CLOAK
```
Opens a new privacy transaction batch. All subsequent privacy operations (mint, spend, authenticate, withdraw) are buffered until `end` is called.

#### `mint` -- Shield Tokens
```
Auth: public
Params: actions (pls_mint[]), note_ct (string[])
Fee: 0.1000 CLOAK per mint
```
Moves tokens from a public account into a shielded note. The commitment (`cm`), value, symbol, token contract, and a zk-proof are provided. The note ciphertexts (`note_ct`) are published for the recipient.

**pls_mint fields:**
| Field | Type | Description |
|---|---|---|
| `cm` | bytes | Note commitment |
| `value` | uint64 | Token amount |
| `symbol` | uint64 | Token symbol |
| `contract` | name | Token contract |
| `proof` | bytes | Groth-16 zk-SNARK proof |

#### `spend` -- Private Transfer
```
Auth: public
Params: actions (pls_spend_sequence[]), note_ct (string[])
Fee: 0.1000 CLOAK per spend
```
Transfers tokens between shielded wallets. Uses nullifiers to prevent double-spending and Merkle roots to prove note existence without revealing which note.

**pls_spend_sequence fields:**
| Field | Type | Description |
|---|---|---|
| `scm` | bytes | Sequence commitment |
| `spend_output` | pls_spend_output[] | Combined spend + output operations |
| `spend` | pls_spend[] | Spend-only inputs |
| `output` | pls_output[] | Output-only notes |

**pls_spend fields:**
| Field | Type | Description |
|---|---|---|
| `root` | bytes | Merkle tree root |
| `nf` | bytes | Nullifier (prevents double-spend) |
| `cv_u` | bytes | Pedersen commitment (value) |
| `cv_v` | bytes | Pedersen commitment (value) |
| `proof` | bytes | Groth-16 zk-SNARK proof |

**pls_output fields:**
| Field | Type | Description |
|---|---|---|
| `cm` | bytes | New note commitment |
| `cv_u` | bytes | Pedersen commitment |
| `cv_v` | bytes | Pedersen commitment |
| `proof` | bytes | Groth-16 zk-SNARK proof |

#### `authenticate` -- Prove Note Ownership
```
Auth: public
Params: action (pls_authenticate)
Fee: 0.1000 CLOAK
```
Proves ownership of a shielded note to execute arbitrary public contract actions. Enables private interaction with public dApps.

**pls_authenticate fields:**
| Field | Type | Description |
|---|---|---|
| `cm` | bytes | Note commitment |
| `contract` | name | Target contract to interact with |
| `actions` | action[] | Actions to execute on the target contract |
| `burn` | uint8 | Whether to burn the note after use |
| `proof` | bytes | Groth-16 zk-SNARK proof |

#### `withdraw` -- Unshield Tokens
```
Auth: public
Params: actions (pls_withdraw[])
```
Withdraws tokens from a shielded note back to a public named account.

**pls_withdraw fields:**
| Field | Type | Description |
|---|---|---|
| `contract` | name | Token contract |
| `value` | uint64 | Amount to withdraw |
| `symbol` | uint64 | Token symbol |
| `memo` | string | Transfer memo |
| `to` | name | Destination public account |

#### `publishnotes` -- Publish Note Ciphertexts
```
Auth: public
Params: note_ct (string[])
Fee: 0.1000 CLOAK
```
Publishes encrypted note ciphertexts so recipients can detect and decrypt incoming shielded transfers.

#### `end` -- Execute Privacy Batch
```
Auth: public
Params: none
```
Executes all buffered privacy operations from the current batch (opened with `begin`). Verifies all zk-proofs, applies state changes, and clears the action buffer.

### Admin Actions

#### `initfees` -- Initialize Fee Structure
```
Auth: contract owner
Params: row (fees struct)
```
Sets up the fee schedule, token contract, symbol, and burn rate.

#### `setfee` -- Update Single Fee
```
Auth: contract owner
Params: action (name), quantity (asset)
```
Updates the fee for a specific action.

#### `removefees` -- Remove Fee Structure
```
Auth: contract owner
Params: none
```

#### `blacklistadd` -- Blacklist Account
```
Auth: contract owner
Params: account (name)
```
Adds an account to the blacklist, preventing it from using the protocol.

#### `testlock` -- Test Function
```
Auth: contract owner
Params: none
```
Development/testing action.

---

## How the Auction Works

1. **60 rounds**, each lasting **23 hours**, starting 2026-01-30
2. Each round distributes exactly **1,638,001.6380 CLOAK** proportionally
3. Users send **TLOS** (min 100.0000) to `thezeosalias` to participate
4. Participants can be named accounts or anonymous privacy wallets
5. **5%** of all TLOS contributions are auto-staked to CPU
6. After a round ends, participants call `claimauction` / `claimauctiop`
7. Each participant receives: `(their_tlos / total_round_tlos) * 1,638,001.6380 CLOAK`

**Effective price per round:**
```
price_per_cloak = total_tlos_in_round / 1,638,001.6380
```

This is a fair-launch mechanism -- no fixed price, the market determines it each round.

---

## How Privacy Works

The privacy system follows the **shield / transact / unshield** pattern:

```
Public Account                    Shielded Pool
     |                                 |
     |--- mint (shield) ------------->|   (public tokens become private notes)
     |                                 |
     |                    spend ------>|   (private-to-private transfer)
     |                                 |
     |<-- withdraw (unshield) --------|   (private notes become public tokens)
     |                                 |
     |<-- authenticate + actions -----|   (prove ownership, execute public actions)
```

All privacy operations are batched between `begin` and `end` calls. Each operation includes a Groth-16 zk-SNARK proof verified on-chain.

---

## Querying the Contract

```bash
# Auction config
cleos -u https://mainnet.telos.net get table thezeosalias thezeosalias auctioncfg

# Auction stats
cleos -u https://mainnet.telos.net get table thezeosalias thezeosalias auctionstat

# Round 5 participants
cleos -u https://mainnet.telos.net get table thezeosalias 5 auction --limit 100

# Fees
cleos -u https://mainnet.telos.net get table thezeosalias thezeosalias fees

# Burned total
cleos -u https://mainnet.telos.net get table thezeosalias thezeosalias burned

# Blacklist
cleos -u https://mainnet.telos.net get table thezeosalias thezeosalias blacklist
```
