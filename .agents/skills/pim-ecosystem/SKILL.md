---
name: pim-ecosystem
description: >-
  Comprehensive domain authority and master specification for PIM : th3v4ult - poetry in motion.
  Covers the 3-lane HTML5 canvas rhythm engine, 3-band Web Audio crossover filtering,
  Economy v2.1 tokenomics and Forge mechanics, Supabase database schemas and Edge Functions,
  Base EVM/Coinbase Smart Wallet auth, technical brutalist brand design system, and campaign architecture.
---

# PIM : th3v4ult - poetry in motion // Master Agent Skill & System Specification

## 1. System Identity, Vision & The Retention Thesis

**PIM (Poetry in Motion)** is a hybrid live-service gaming and digital collectibles platform bridging a high-precision HTML5 Canvas rhythm game with an audio-reactive collectible card engine under a premium brutalist cyberpunk aesthetic.

### The Retention Thesis
$$\textbf{Music Unlocks Gameplay} \longrightarrow \textbf{Gameplay Unlocks Ownership} \longrightarrow \textbf{Ownership Unlocks Status}$$

1. **Music Unlocks Gameplay**: Players engage daily with 365 unique track releases (one for every day of the calendar year) accessed via deep links and chapter roadmaps.
2. **Gameplay Unlocks Ownership**: High accuracy ($>70\%$ Bronze, $>85\%$ Silver, $>95\%$ Gold, $100\%$ Platinum) earns collectible card drops containing session stems, registry proofs, and card burn assets.
3. **Ownership Unlocks Status**: Players forge cards, elevate global prestige scores, showcase streaks, unlock first-discoverer certifications, and bind collections to Base EVM wallets.

### The Three Interlocking Economies
* **The Skill Economy**: Governed by millisecond timing windows, swipe precision, hold ribbon tracking, and unbroken combo multipliers (up to $5\times$).
* **The Scarcity Economy**: Powered by global hard supply caps, rarity tiers (Common $\to$ Mythic), mintable vs. gameplay copy splits, and card burning sinks.
* **The Social Economy**: Expressed through collection prestige points, global leaderboard telemetry, replay ghosts, and 1-of-1 First Discoverer gold stamps.

---

## 2. Workspace Hierarchy & Critical Development Directives

> [!CAUTION]
> ### STRICT WORKFLOW HIERARCHY: BEATSTAR-VAULT IS PRIMARY
> 1. **Primary Target (`@workspace/beatstar-vault`)** at `artifacts/beatstar-vault`:
>    - ALL feature development, bug fixes, UI/UX polish, rhythm engine updates, database logic, gacha tuning, audio DSP filters, and documentation MUST occur first in `artifacts/beatstar-vault`.
> 2. **Secondary Target (`@workspace/rhythm-game`)** at `artifacts/rhythm-game`:
>    - Standalone rhythm client package. Only sync features, maps, or engine updates back to `rhythm-game` AFTER validation in `beatstar-vault`.

### Technology Stack
* **Monorepo**: pnpm workspaces (`pnpm-workspace.yaml`).
* **Frontend**: React 19, TypeScript, Vite.
* **Routing & State**: `wouter` (declarative routing), `zustand` (global reactive stores).
* **Styling**: Vanilla CSS + TailwindCSS 4, modern Outfit & Roboto/JetBrains Mono typography, custom HSL design tokens.
* **Animations**: Framer Motion (card reveal packs, modal drawers, particle overlays).
* **Audio & Render Loop**: Web Audio API (3-band BiQuad filter crossover) + HTML5 2D Canvas 60fps `requestAnimationFrame` render highway.
* **Backend & Web3**: Supabase (Auth, PostgreSQL RLS, Deno Edge Functions), Base Mainnet EVM / Coinbase Smart Wallet (EIP-1271 signature validation).

---

## 3. Brand Identity & Technical Brutalist Design System

PIM rejects generic, soft, corporate UI in favor of **Technical Brutalism meets High-Fidelity Cyber Neon**.

### Core Palette Tokens (HSL / Hex)
| Token | Hex Code | System Purpose | Context / Rarity |
| :--- | :--- | :--- | :--- |
| **Void Black** | `#000000` | Canvas base & root background | Absolute Base |
| **Corridor Charcoal** | `#0C0C14` / `#08080C` | Backdrop layout sections & drawers | Structural Panels |
| **Cyber Slate** | `#18181B` / `#27272A` | Grid lines, empty slots, borders | Structural Grids |
| **Hot Pink** | `#FF1493` | Primary play actions, Surge mode | Light / Action Accent |
| **Neon Orange** | `#FF5500` | Vault doors, system warnings, overrides | Special Picks / Prophecy |
| **Neon Cyan** | `#00E5FF` | Mids audio lane, hold guides | Lane 1 / Uncommon Tier |
| **Neon Green** | `#39FF14` | Signal Lock overlay, success badges | Rare Tier / Flow State |
| **Power Gold** | `#E5B800` | Fever mode, login streaks, medals | Legendary Tier / Fever |
| **Prismatic Purple** | `#A855F7` | Bass Realm modifier, Mythic glow | Lane 0 / Mythic Tier |

### Typography Guidelines
* **Display & Titles**: `Outfit` (sans-serif, geometric, uppercase, `letter-spacing: 0.2em` to `0.5em`).
* **Metadata & Readouts**: `Roboto Mono` or `JetBrains Mono` (monospace, tabular digits, high legibility for scores, timestamps, and engine readouts).

### Geometric Motifs & CSS Utilities
* **Sheared Action Buttons**: `clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)` with glowing neon borders.
* **Glassmorphic Panels**: `backdrop-filter: blur(20px) saturate(1.4)` with `rgba(12, 12, 20, 0.55)` fill and subtle `1px solid rgba(255,255,255,0.08)` borders.
* **CRT Hardware Styling**: Vignette radial gradients combined with `mix-blend-mode: multiply` 3px scanlines.

---

## 4. Rhythm Engine & 3D Perspective Canvas Subsystem

### Perspective Geometry & Speed Scaling
Notes project from the horizon ($P = 0$) to the hit line ($P = 1.0$):
$$Y_{\text{note}} = Y_{\text{top}} + (Y_{\text{bottom}} - Y_{\text{top}}) \times P$$
$$\text{Approach Time (seconds)} = \max(1.35, 2.5 - (\text{Difficulty Level} - 1) \times 0.128)$$

### Lane Layout
* **Lane 0 (Bass)**: Left Track (Lowpass $<300\text{Hz}$).
* **Lane 1 (Mids)**: Center Track (Bandpass $\approx 1200\text{Hz}$).
* **Lane 2 (Treble)**: Right Track (Highpass $>3200\text{Hz}$).

### Note Taxonomy & Mechanics
1. **Core Notes**:
   * **Tap**: Solid rectangular bar hit at the target line.
   * **Hold**: Sustained beam requiring continuous press until release.
   * **Swipe**: Directional chevrons (`↑`, `↓`, `←`, `→`, diagonals) unlocked at Level 4+.
   * **Hold + Swipe End**: Sustained rail culminating in a flick release.
   * **Double Tap**: Simultaneous dual-lane targets.
2. **Advanced Mechanics**:
   * **Slide (Drag)**: Curved path tracking across lanes ($\text{visualLane} = \text{lerp}(\text{visualLane}, \text{targetLane}, 0.18)$).
   * **Zigzag Slide**: Snaking trajectory for synth/electronic solos.
   * **Mine / Ghost**: Hazard obstacle; hitting deducts 500 pts, resets combo, and triggers glitch static.
   * **Lift**: Release timing note on the exact beat.
   * **Scratch**: Circular touch/gesture motion during breakbeats.
3. **PIM Signature Feature — Remix Note ⚡**:
   * Glowing ethereal rune head.
   * Hitting with PERFECT timing executes `audioManager.triggerRemixStemEffect()`, isolating or boosting stems (`vocals_isolate`, `drums_mute`, `bass_boost`) for 4–8 beats, inverting the canvas palette, and awarding +1000 bonus points.

### Timing Windows & Judgment Tolerances
| Judgment | Tolerance Formula (Seconds) | Base Score |
| :--- | :--- | :--- |
| **PERFECT+** | $\le \max(0.030, 0.060 - (\text{diff} - 1) \times 0.0033)$ | 500 pts |
| **PERFECT** | $\le \max(0.055, 0.110 - (\text{diff} - 1) \times 0.0061)$ | 300 pts |
| **GOOD** | $\le \max(0.100, 0.190 - (\text{diff} - 1) \times 0.010)$ | 150 pts |
| **MISS** | $> \max(0.190, 0.360 - (\text{diff} - 1) \times 0.019)$ | 0 pts (Breaks Combo) |

### Multipliers & Overdrive Flow States
* **Difficulty Multiplier Caps**: LIGHT (Levels 1–3) $\to 3\times$; DARK (Levels 4–6) $\to 4\times$; VOID (Levels 7–10) $\to 5\times$.
* **FEVER (Combo $\ge 20$)**: 9s duration, $2\times$ multiplier, automatically upgrades standard `PERFECT` hits to `PERFECT+` (Gold `#E5B800` aura).
* **SURGE (Combo $\ge 40$)**: 11s duration, $3\times$ multiplier, **Autoplay Assist** locks onto complex slide paths and hold tails (Hot Pink `#FF1493`).
* **SIGNAL LOCK (Combo $\ge 60$)**: 14s duration, $4\times$ multiplier, peak visual stability and matrix grid glow (Neon Green `#39FF14`).

### Failure & Rewind System
* **3 Miss Limit**: 3 misses trigger `SIGNAL LOST`.
* **Audio Rewind**: Automatically rewinds audio playback by 2.5 seconds.
* **Canvas Rewind**: Perspective highway scrolls in reverse over 1.2s (`1200ms`) to restore missed notes.
* **Continues**: Up to 3 continues allowed per song run.

---

## 5. Sonic Punishment Subsystem (3-Band Web Audio Crossover)

The game feeds player misses directly into physical audio channel degradation.

```
[Audio Source Element]
       │
       ├───> [Lowpass Filter: 300Hz, Q:0.8]  ───> [Lane 0 Gain] ───┐
       ├───> [Bandpass Filter: 1200Hz, Q:0.7] ───> [Lane 1 Gain] ───┼───> [Audio Destination]
       └───> [Highpass Filter: 3200Hz, Q:0.8] ───> [Lane 2 Gain] ───┘
```

* **Muting on Miss**: Missing in a lane instantly drops its gain node to `0.04` over `0.12s`.
* **Active Restore on Hit**: Hitting a note in a muted lane ramps its gain back to `1.0` over `0.25s`.
* **Passive Auto-Recovery**: If a lane remains muted for `3.5s` without incoming notes, auto-recovery ramps gain back over `0.4s` to prevent silent audio stalls.

---

## 6. Economy Rebalance v2.1, Collectibles & The Forge

### Velocity-Balanced Card Supply Matrix
| Rarity Tier | Gameplay Copy Cap | Mintable Cap (On-Chain) | Token Burn Value | Audio Preview Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Common** | 2,000 | 0 (Off-Chain) | 3 $V\text{⚡}$ | 15 seconds |
| **Uncommon** | 500 | 50 | 10 $V\text{⚡}$ | 60 seconds |
| **Rare** | 100 | 25 | 30 $V\text{⚡}$ | Full Track |
| **Legendary** | 10 | 3 | 80 $V\text{⚡}$ | Full Track |
| **Mythic** | 1 | 1 | 200 $V\text{⚡}$ | Full Track + Session Stems |

### The Forge Operations & Token Sinks
* **Card Burning**: Deconstruct duplicate or unwanted cards into $V\text{⚡}$ tokens.
* **Targeted Pull**: Spend **500 $V\text{⚡}$** to acquire any specific card from the 365 catalog.
* **Rarity Upgrade**: Spend **150 $V\text{⚡}$** to upgrade an owned card by 1 rarity tier.
* **Duplicate Fusion**: Combine **3 identical cards** (same day & rarity) to forge 1 card of the next tier.
* **Echo Cards**: 15% roll rate on Gacha. Yields high prestige but undergoes generational decay: Gen 0 ($1.0\times$) $\to$ Gen 1 ($0.6\times$) $\to$ Gen 2 ($0.3\times$) $\to$ Gen 3+ ($0.1\times$ Entropy Death).

### Gacha Drop Modifiers & Pity Protection
* **Drought Pity Protection**: 25 consecutive pulls without Rare+ guarantees Rare or higher on the next pull.
* **Midnight Drop**: Opening packs between 12:00 AM and 2:00 AM grants a $2\times$ multiplier on Legendary drop rates.
* **Streak Bonus**: 7+ day login streaks grant a $+50\%$ boost to Rare and Legendary drop chances.
* **Prestige Score Formula**:
  $$\text{Prestige} = (\text{Streak} \times 120) + (\text{Pulls} \times 15) + \sum \text{Card Base Points} + \text{Bonuses}$$

---

## 7. Database Schemas & Edge Functions

### Core Supabase Tables (PostgreSQL with RLS)
* `profiles`: `id (UUID)`, `username`, `wallet_address`, `tokens`, `daily_standard_claims`, `daily_premium_claims`, `streak_count`, `total_pulls`, `pulls_since_rare_plus`.
* `vault_collections`: `id`, `owner_id`, `card_id`, `rarity`, `source`, `edition`, `max_supply`, `is_echo`, `echo_generation`, `blockchain_status`.
* `gameplay_records`: `id`, `user_id`, `song_id`, `score`, `accuracy`, `max_combo`, `medal ('NONE','BRONZE','SILVER','GOLD','PLATINUM')`, `pack_rewarded`.
* `global_supply`: `card_id_rarity (PK)`, `supply (INT)`.

### Server-Authoritative Supabase Edge Functions
1. **`vault-engine`**:
   * Validates claims, rolls Gacha probabilities with active pity/streak/midnight modifiers, charges $V\text{⚡}$ tokens, executes card burns, upgrades rarities, and enforces global supply limits.
2. **`auth-smart-wallet`**:
   * Verifies EVM `personal_sign` and Coinbase Smart Wallet EIP-1271 signatures on Base Mainnet (`0x2105` / `8453`) to issue JWT sessions.

---

## 8. Web3 Authentication & Progressive Decentralization

* **Target Network**: **Base Mainnet (Chain ID `8453` / Hex `0x2105`)**
* **RPC URL**: `https://mainnet.base.org`
* **Dual Auth Modes**:
  1. *Web3 EVM / Smart Wallet*: Connects via MetaMask or Coinbase Smart Wallet (EIP-1271 verification).
  2. *Web2 Fallback*: Supabase Email/Password with local ephemeral wallet creation to ensure zero onboarding friction for non-crypto players.

---

## 9. Platform Suites & Auxiliary Tools

* **Campaign & Constellation Map**: Calendar navigation with winding road stages and milestone star reward chests.
* **Beatmap Editor (`BeatmapEditor.tsx`)**: Interactive canvas editor supporting 8-directional swipes, snap subdivisions (1/4 to 1/32), BPM detection, and JSON export/import.
* **Listen Jukebox (`ListenPage.tsx`)**: Full track and isolated stem player.
* **Voyeur Telemetry (`VoyeurPage.tsx`)**: Real-time global feed of card drops, platinum runs, and leaderboard shifts.
* **Admin Dashboard (`AdminPage.tsx`)**: Dynamic gacha drop tuning, pity controls, and economy live adjustments.

---

## 10. Defensive Engineering & Code Standards

1. **Time-Lock Guards**: Always wrap date calculations in `isSongTimeLocked()` to prevent timezone mismatches from triggering infinite redirect loops.
2. **Defensive Parsing**: Use optional chaining on string operations (`date?.split('/') ?? []`) to prevent crashes during sparse chapter renders.
3. **Session Resiliency**: Implement fallback getters (`result?.score ?? 0`) across gameplay results and vault stores to survive mid-session page reloads.
4. **Clean Code Integrity**: Maintain comments, preserve existing types, and ensure zero unhandled promises in Web Audio initialization.
