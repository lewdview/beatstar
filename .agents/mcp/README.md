# PIM : th3v4ult MCP Server (`pim-ecosystem`)

The official **Model Context Protocol (MCP)** server for **PIM : th3v4ult — Poetry in Motion by th3scr1b3**.

Provides any AI coding agent with direct, zero-hallucination access to PIM's 365-day catalog, rhythm engine math, audio DSP specs, card economy v2.1, design tokens, Supabase schemas, and workspace hierarchy enforcement.

---

## Tool Reference

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| `pim_get_song_metadata` | `day?: number`, `query?: string` | Query metadata for any of the 365 daily track releases (BPM, mood, genre, difficulty, stem URLs). |
| `pim_get_card` | `day?: number`, `card_id?: string` | Inspect card metadata, rarity tier, supply caps, burn values ($V\text{⚡}$), preview limits, and lore. |
| `pim_simulate_gacha` | `pull_count`, `pity_count`, `streak_days`, `is_midnight` | Simulate authoritative Gacha rolls with 25-pull drought pity, midnight $2\times$, and streak bonuses. |
| `pim_validate_forge_op` | `operation`, `rarity`, `card_count`, `echo_generation` | Validate Card Burning, 500 $V\text{⚡}$ Targeted Pull, 150 $V\text{⚡}$ Upgrade, 3-Card Duplicate Fusion, or Echo decay. |
| `pim_lint_beatmap` | `notes: Note[]`, `day?: number` | Lint note arrays for ascending time order, lanes (0, 1, 2), valid types, collisions, hold tails, and swipe vectors. |
| `pim_get_audio_dsp_specs` | *(none)* | Return the 3-band crossover filter graph (300Hz LP, 1200Hz BP, 3200Hz HP), miss muting, and recovery constants. |
| `pim_get_design_tokens` | *(none)* | Retrieve official brutalist color tokens, typography rules (Outfit + Mono), sheared clip-paths, and glassmorphism. |
| `pim_get_brand_logos` | *(none)* | Inspect the 3 rotating brand marks (Mark I Orange, Mark II Red, Mark III Gold) and current SEO image configurations. |
| `pim_get_supabase_schema` | `table?: string` | PostgreSQL schemas for `profiles`, `vault_collections`, `gameplay_records`, `global_supply`, and Edge Functions. |
| `pim_verify_hierarchy` | `file_paths: string[]` | Enforces the strict rule that all development must occur in `artifacts/beatstar-vault` before syncing to `artifacts/rhythm-game`. |

---

## Resources Reference

* `pim://docs/ecosystem`: Master system specification and retention thesis.
* `pim://docs/design-system`: Brutalist UI styling tokens and component recipes.
* `pim://docs/rhythm-engine`: Perspective canvas formulas and timing windows.
* `pim://docs/economy`: Supply cap matrix and token sinks.
* `pim://data/catalog-summary`: Live catalog count and statistics.

---

## Configuration Across IDEs

### 1. Antigravity
Already registered in `.agents/mcp_config.json` and `~/.gemini/config/mcp_config.json`.

### 2. Cursor
Already configured in `.cursor/mcp.json`.

### 3. VSCode (Copilot / Roo-Code / Cline)
Already configured in `.vscode/mcp.json`.

### 4. Windsurf (`~/.codeium/windsurf/mcp_config.json`)
Add to `mcpServers`:
```json
{
  "mcpServers": {
    "pim-ecosystem": {
      "command": "node",
      "args": [
        "/Users/studio/BEATSTAR.th3scr1b3.art/beatstar/.agents/mcp/pim-mcp-server.cjs"
      ]
    }
  }
}
```

### 5. Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "pim-ecosystem": {
      "command": "node",
      "args": [
        "/Users/studio/BEATSTAR.th3scr1b3.art/beatstar/.agents/mcp/pim-mcp-server.cjs"
      ]
    }
  }
}
```
