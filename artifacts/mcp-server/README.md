# PIM Ecosystem MCP Server (Cloudflare Worker)

Authoritative Model Context Protocol (MCP 2024-11-05 standard) gateway for **PIM : th3v4ult — poetry in motion**, deployed on Cloudflare Workers at **`https://mcp.th3scr1b3.art`**.

Provides any AI coding assistant or remote client with live access to:
- 365-day track metadata & CDN stem links
- Full cover artwork variants (square, widescreen/letterbox, Bombshell sets, rarity alternates)
- Full song MP3 streams & stem channels (Bass, Mids/Vocals, Treble/Drums)
- Chart variants across engine versions (v5_flagship, v4_neural, v3_master, v2_minimal, v1_gimmicks)
- Gacha & Collector Packs pricing tiers, drop rate distributions, and cover graphics
- Economy v2.1 card catalog & Forge mechanics validation
- Gacha probability simulation with Drought Pity & Midnight multipliers
- 3-band Web Audio crossover DSP filters & recovery curves
- Brutalist design system tokens & master logos
- Supabase schema definitions & Edge Function contracts
- Strict Beatstar-Vault is Primary workspace verification

---

## Authoritative Tools (14)

| Tool Name | Description |
| :--- | :--- |
| **`pim_get_cover_artwork`** | Query all cover artwork variants for any day (1-365). Returns primary cover URL, rarity tier alternate covers, square Bombshell variants, letterbox/banner variants, and direct CDN links. |
| **`pim_get_song_audio`** | Query full audio assets for any track. Returns master MP3 CDN stream URLs, fallback URLs, stem breakdown paths (Bass, Vocals, Drums), BPM, duration, valence, and preview rules. |
| **`pim_get_chart_variants`** | Look up beatmap chart variants across engine versions (`v5_flagship`, `v4_neural`, `v3_master`, `v2_minimal`, `v1_gimmicks`). Returns standard and deluxe chart URLs. |
| **`pim_get_pack_catalog`** | Query Gacha & Collector Pack configurations. Returns drop rate matrices, price tiers ($0.25-$10.00 / token cost), cover artwork, and theme gradients for Free, Bombshell, Taste, Light, and Dark packs. |
| **`pim_get_song_metadata`** | Query rich metadata for any of the 365 daily track releases. Returns BPM, mood, genre, difficulty rating, audioUrl, coverArt, stage count, and direct CDN links. |
| **`pim_get_card`** | Look up collectible card metadata for any day in PIM. Returns title, rarity tier (common to mythic), max supply, token burn value, preview limit, lore, and artwork links. |
| **`pim_simulate_gacha`** | Simulate authoritative PIM Gacha rolls under Economy v2.1 with active Drought Pity (25 pulls guarantees Rare+), Midnight 2x multiplier, and Streak bonuses. |
| **`pim_validate_forge_op`** | Validate and calculate costs/yields for Forge operations: Card Burning, Targeted Pull, Rarity Upgrade, Duplicate Fusion, and Echo Card decay. |
| **`pim_lint_beatmap`** | Lint and validate a rhythm game beatmap. Checks for ascending time order, valid lanes (0, 1, 2), valid note types, lane collisions, hold tail durations, and swipe directions. |
| **`pim_get_audio_dsp_specs`** | Retrieve the authoritative 3-band Web Audio crossover DSP specifications (300Hz lowpass, 1200Hz bandpass, 3200Hz highpass), muting rates, and recovery time constants. |
| **`pim_get_design_tokens`** | Get authoritative design tokens: Void Black, Corridor Charcoal, Hot Pink, Neon Orange, Neon Cyan, Neon Green, Power Gold, Prismatic Purple, brutalist clip-paths, and blur recipes. |
| **`pim_get_brand_logos`** | Get metadata and asset URLs for all rotating brand logos (Mark I Orange, Mark II Red, Mark III Gold) and current SEO preview configuration. |
| **`pim_get_supabase_schema`** | Get PostgreSQL table schemas (`profiles`, `vault_collections`, `gameplay_records`, `global_supply`) and Edge Function signatures. |
| **`pim_verify_hierarchy`** | Verifies file paths to enforce that all development occurs in `artifacts/beatstar-vault` (Primary) before syncing to `artifacts/rhythm-game` (Secondary). |

---

## Deploying Updates to Cloudflare

From inside `artifacts/mcp-server`:
```bash
cd artifacts/mcp-server
npx wrangler deploy
```

---

## Connecting AI Assistants

### Antigravity / Gemini (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "pim-ecosystem": {
      "serverUrl": "https://mcp.th3scr1b3.art/sse"
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "pim-ecosystem": {
      "serverUrl": "https://mcp.th3scr1b3.art/sse"
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "pim-ecosystem": {
      "url": "https://mcp.th3scr1b3.art/sse"
    }
  }
}
```
