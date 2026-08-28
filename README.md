# PIM : th3v4ult - poetry in motion

> **A Hybrid HTML5 Canvas Rhythm Game & Digital Collectible Card Ecosystem Under a Technical Brutalist Cyberpunk Aesthetic.**

[![Base Network](https://img.shields.io/badge/Network-Base%20Mainnet%20(8453)-0052FF?style=flat-square&logo=ethereum)](https://base.org)
[![React 19](https://img.shields.io/badge/React-19.1.0-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20Edge-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Tauri 2.0](https://img.shields.io/badge/Tauri-2.0-FFC131?style=flat-square&logo=tauri)](https://tauri.app)

---

## ⚡ The Retention Thesis

$$\textbf{Music Unlocks Gameplay} \longrightarrow \textbf{Gameplay Unlocks Ownership} \longrightarrow \textbf{Ownership Unlocks Status}$$

1. **Music Unlocks Gameplay**: Players engage daily with 365 unique track releases (one for every day of the calendar year) accessed via deep links and chapter roadmaps.
2. **Gameplay Unlocks Ownership**: High accuracy ($>70\%$ Bronze, $>85\%$ Silver, $>95\%$ Gold, $100\%$ Platinum) earns collectible card drops containing session stems, registry proofs, and card burn assets.
3. **Ownership Unlocks Status**: Players forge cards, elevate global prestige scores, showcase streaks, unlock first-discoverer certifications, and bind collections to Base EVM wallets.

---

## 🏛️ Monorepo Architecture & Critical Hierarchy

This repository is managed with **pnpm workspaces** (`pnpm-workspace.yaml`).

> [!CAUTION]
> ### STRICT WORKFLOW DIRECTIVE: BEATSTAR-VAULT IS PRIMARY
> - **Primary Target (`@workspace/beatstar-vault`)** at `artifacts/beatstar-vault`:
>   - **ALWAYS** perform all development, code modifications, UI features, rhythm engine updates, database logic, gacha tuning, audio DSP filters, and documentation directly in **`artifacts/beatstar-vault`**.
>   - `beatstar-vault` is the single source of truth and primary live-service client application.
> - **Secondary Target (`@workspace/rhythm-game`)** at `artifacts/rhythm-game`:
>   - Standalone rhythm client package. Only sync features, maps, tutorials, or fixes back to `rhythm-game` **AFTER** they have been fully built, tested, and validated in `beatstar-vault`.

### Workspace Layout

```
beatstar/
├── AGENTS.md                                # AI Agent rules & workflow directives
├── project_dossier.md                       # Authoritative master system specification
├── pnpm-workspace.yaml                      # Monorepo workspace configuration & supply-chain safety
├── schema.sql                               # PostgreSQL production schema definition
│
├── artifacts/
│   ├── beatstar-vault/                      # [PRIMARY] Single source of truth live-service portal
│   │   ├── src/                             # React 19 + TypeScript + Canvas engine source
│   │   ├── src-tauri/                       # Desktop native cross-platform core (Tauri 2.0)
│   │   ├── public/                          # Static assets, covers, audio samples, pitch deck
│   │   └── project_dossier.md               # Synced client specification
│   ├── rhythm-game/                         # [SECONDARY] Standalone rhythm game package
│   ├── api-server/                          # Express + TypeScript API backend
│   └── mockup-sandbox/                      # Prototype and UI visual testing suite
│
├── lib/
│   ├── contracts/                           # Hardhat Solidity smart contracts (PIM.sol on Base)
│   ├── db/                                  # Drizzle ORM schemas & database initializers
│   ├── api-spec/                            # OpenAPI contract definitions
│   ├── api-zod/                             # Auto-generated runtime Zod validation schemas
│   └── api-client-react/                    # Typed React Query hooks for client apps
│
├── supabase/
│   ├── migrations/                          # Versioned PostgreSQL migrations & seed scripts
│   └── functions/                           # Deno Serverless Edge Functions
│       ├── vault-engine/                    # Server-authoritative drops, gacha, & forge logic
│       ├── auth-smart-wallet/               # Base EVM & Coinbase Smart Wallet EIP-1271 auth
│       └── stripe-webhook/                  # Fiat payment processing & pack minting
│
└── scripts/                                 # Migration, data import, and maintenance utilities
```

---

## 🎮 Core System Highlights

### 1. Rhythm Highway & Canvas Subsystem
- **3D Perspective Projection**: Real-time canvas projection highway calculating speed approach curves based on difficulty.
- **3-Lane Layout**: Lane 0 (Bass $<300\text{Hz}$), Lane 1 (Mids $\approx 1200\text{Hz}$), Lane 2 (Treble $>3200\text{Hz}$).
- **Rich Note Taxonomy**: Tap, Hold, 8-directional Swipe (`↑`, `↓`, `←`, `→`, diagonals), Hold+Swipe End, Double Tap, Slide/Drag lerp, Zigzag, Mine/Ghost hazards, Lift, Scratch, and **Remix Note ⚡** (live stem mutations).
- **Overdrive Flow States**: **FEVER** ($2\times$ combo $\ge 20$), **SURGE** ($3\times$ combo $\ge 40$ with **Autoplay Assist**), **SIGNAL LOCK** ($4\times$ combo $\ge 60$).
- **Audio Rewind & Continues**: 3-miss failure limit triggers 2.5s audio rewind, 1.2s highway reverse scroll, and up to 3 continues per run.

### 2. Sonic Punishment (3-Band Web Audio Crossover)
- Missed notes instantly mute their respective frequency lane ($0.04$ gain over $0.12\text{s}$).
- Clean hits instantly un-silence the band ($1.0$ gain over $0.25\text{s}$).
- $3.5\text{s}$ passive auto-recovery prevents audio deadlocks.

### 3. Economy Rebalance v2.1 & The Forge
- **Hard Supply Caps**: Common ($2,000$ off-chain), Uncommon ($500$ cap / $50$ mintable), Rare ($100$ cap / $25$ mintable), Legendary ($10$ cap / $3$ mintable), Mythic ($1$ cap / $1$ mintable).
- **Token Sinks**: Targeted Pulls ($500\text{ }V\text{⚡}$), Rarity Upgrades ($150\text{ }V\text{⚡}$), Duplicate Fusions ($3:1$).
- **Echo Cards & Generational Decay**: $15\%$ gacha roll rate, decaying prestige yield from Gen 0 ($1.0\times$) to Gen 3+ ($0.1\times$ Entropy Death).
- **Pity Protections**: 25 consecutive pull drought protection, Midnight Drop $2\times$ Legendary rate, and 7-day streak boosts.

### 4. Web3 & Progressive Decentralization
- **Network**: **Base Mainnet (Chain ID `8453` / `0x2105`)**.
- **Smart Contract (`PIM.sol`)**: ERC-721 with fully on-chain dynamic Base64 metadata generation, EIP-1271 Coinbase Smart Wallet compatibility, and ECDSA signature-based minting.
- **Dual Auth**: Web3 EVM sign-in + Web2 Email fallback with local ephemeral keypair generation in encrypted LocalStorage for frictionless, gasless onboarding.

---

## 🚀 Quickstart & Development

### Prerequisites
- Node.js $\ge 20.0.0$
- `pnpm` $\ge 9.0.0$
- Supabase CLI (optional, for local Edge Functions)

### 1. Install Dependencies
```bash
pnpm install
```

> **Note on Supply-Chain Security**: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` (packages must be published for at least 24 hours).

### 2. Run Primary Client (`beatstar-vault`)
```bash
# Start Vite development server on http://localhost:5173
pnpm --filter @workspace/beatstar-vault dev
```

### 3. Build Client & Native Desktop
```bash
# Build web production bundle
pnpm --filter @workspace/beatstar-vault build

# Build Tauri desktop bundle (macOS, Windows, Linux)
pnpm --filter @workspace/beatstar-vault tauri build
```

### 4. Run Smart Contracts Suite
```bash
cd lib/contracts
pnpm install
npx hardhat test
```

---

## 🔒 Security Posture & Database State

- **Row Level Security (RLS)** enabled across all public PostgreSQL tables (`profiles`, `vault_collections`, `gameplay_records`, `releases`, `global_supply`).
- **Server-Authoritative Transactions**: Token mints, burns, gacha rate calculations, and claim limits execute strictly within Supabase Deno Edge Functions.
- **Production Migrations**: Contains full un-truncated imported database state (900+ registered profiles, 10,764+ gameplay records, 630+ cards, 416+ supply counters, 365 catalog tracks on Cloudflare R2 / CDN).

---

## 📄 License & Attribution

Designed, engineered, and composed by **TH3SCR1B3** ([th3scr1b3.art](https://th3scr1b3.art)).  
All rights reserved. Smart contracts licensed under MIT.
