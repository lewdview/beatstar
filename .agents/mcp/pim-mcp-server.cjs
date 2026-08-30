#!/usr/bin/env node

/**
 * PIM & th3scr1b3 MCP Server (Model Context Protocol)
 * 
 * Provides AI coding agents with authoritative tools, live catalog queries,
 * rhythm engine math, audio DSP crossover specifications, card economy v2.1 rules,
 * design system tokens, and workspace hierarchy enforcement.
 * 
 * Protocol: JSON-RPC 2.0 over stdio (MCP 2024-11-05 standard)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Workspace paths
const ROOT_DIR = path.resolve(__dirname, '../..');
const VAULT_DATA_DIR = path.join(ROOT_DIR, 'artifacts/beatstar-vault/src/data');
const VAULT_PUBLIC_DATA = path.join(ROOT_DIR, 'artifacts/beatstar-vault/public/data');

// Load catalogs safely
function loadJsonFile(filepath, fallback = null) {
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // ignore
  }
  return fallback;
}

const songCatalog = loadJsonFile(path.join(VAULT_DATA_DIR, 'song_catalog.json'), []);
const cardCatalog = loadJsonFile(path.join(VAULT_DATA_DIR, 'card_catalog.json'), []);
const dayFileMap = loadJsonFile(path.join(ROOT_DIR, 'artifacts/beatstar-vault/src/game/day_file_map.json'), {});

// Brand Design Tokens
const DESIGN_TOKENS = {
  colors: {
    voidBlack: { hex: '#000000', hsl: 'hsl(0, 0%, 0%)', role: 'Canvas base & root background' },
    corridorCharcoal: { hex: '#08080C', hsl: 'hsl(240, 20%, 4%)', role: 'Backdrop layout sections & drawers' },
    cyberSlate: { hex: '#18181B', hsl: 'hsl(240, 5%, 10%)', role: 'Grid lines, empty slots, borders' },
    hotPink: { hex: '#FF1493', hsl: 'hsl(328, 100%, 54%)', role: 'Primary play actions, Surge mode, Light accent' },
    neonOrange: { hex: '#FF5500', hsl: 'hsl(20, 100%, 50%)', role: 'Vault doors, system warnings, Mark I flagship' },
    neonCyan: { hex: '#00E5FF', hsl: 'hsl(186, 100%, 50%)', role: 'Mids audio lane (Lane 1), Uncommon tier' },
    neonGreen: { hex: '#39FF14', hsl: 'hsl(111, 100%, 54%)', role: 'Signal Lock overlay, success badges, Rare tier' },
    powerGold: { hex: '#E5B800', hsl: 'hsl(48, 100%, 45%)', role: 'Fever mode, login streaks, Legendary tier, Mark III' },
    prismaticPurple: { hex: '#A855F7', hsl: 'hsl(271, 91%, 65%)', role: 'Bass lane (Lane 0), Mythic tier, Mark II' },
    crimsonRed: { hex: '#FF2244', hsl: 'hsl(351, 100%, 57%)', role: 'Mark II brand mark, critical alert' }
  },
  typography: {
    display: 'Outfit, sans-serif (uppercase, tracking: 0.2em - 0.5em, weights: 700, 900)',
    mono: 'Roboto Mono, JetBrains Mono, monospace (tabular figures for scores, telemetry, BPM)'
  },
  motifs: {
    shearedButton: 'clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
    glassPanel: 'backdrop-filter: blur(20px) saturate(1.4); background: rgba(12, 12, 20, 0.55); border: 1px solid rgba(255, 255, 255, 0.08);',
    crtScanlines: 'background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06)); background-size: 100% 3px, 3px 100%;'
  },
  rarities: {
    common: { color: '#9CA3AF', supplyCap: 2000, onChainCap: 0, burnTokens: 3, previewSeconds: 15 },
    uncommon: { color: '#00E5FF', supplyCap: 500, onChainCap: 50, burnTokens: 10, previewSeconds: 60 },
    rare: { color: '#39FF14', supplyCap: 100, onChainCap: 25, burnTokens: 30, previewSeconds: 'Full Track' },
    legendary: { color: '#E5B800', supplyCap: 10, onChainCap: 3, burnTokens: 80, previewSeconds: 'Full Track' },
    mythic: { color: '#A855F7', supplyCap: 1, onChainCap: 1, burnTokens: 200, previewSeconds: 'Full Track + Stems' }
  }
};

// Brand Logos Registry
const BRAND_LOGOS = [
  {
    id: 'logo_1',
    name: 'PIM Master Brand Mark I (Flagship / SEO Default)',
    src: '/data/logos/logo_1.png',
    fullUrl: 'https://pim.th3scr1b3.art/data/logos/logo_1.png',
    accent: '#ff5500',
    glow: 'rgba(255, 85, 0, 0.65)',
    kanji: '詩の動き',
    isCurrentSeo: true
  },
  {
    id: 'logo_2',
    name: 'PIM Master Brand Mark II (Crimson)',
    src: '/data/logos/logo_2.png',
    fullUrl: 'https://pim.th3scr1b3.art/data/logos/logo_2.png',
    accent: '#ff2244',
    glow: 'rgba(255, 34, 68, 0.65)',
    kanji: '詩の動き',
    isCurrentSeo: false
  },
  {
    id: 'logo_3',
    name: 'PIM Master Brand Mark III (Cyber Gold)',
    src: '/data/logos/logo_3.png',
    fullUrl: 'https://pim.th3scr1b3.art/data/logos/logo_3.png',
    accent: '#ffb800',
    glow: 'rgba(255, 184, 0, 0.65)',
    kanji: '詩の動き',
    isCurrentSeo: false
  }
];

// Audio DSP Specifications
const AUDIO_DSP_SPEC = {
  crossoverFilters: {
    lane0_bass: { type: 'lowpass', cutoffHz: 300, Q: 0.8, description: 'Bass / Kick drum channel (Left Lane)' },
    lane1_mids: { type: 'bandpass', centerHz: 1200, Q: 0.7, description: 'Vocals / Synth leads (Center Lane)' },
    lane2_treble: { type: 'highpass', cutoffHz: 3200, Q: 0.8, description: 'Hi-hats / Percussion cymbals (Right Lane)' }
  },
  missDegradation: {
    attenuationGain: 0.04,
    rampDownSeconds: 0.12,
    description: 'Missing a note instantly cuts that specific frequency band to near-silence'
  },
  hitRecovery: {
    targetGain: 1.0,
    rampUpSeconds: 0.25,
    description: 'Hitting a note in a muted lane immediately restores full fidelity'
  },
  passiveAutoRecovery: {
    inactivityTriggerSeconds: 3.5,
    rampUpSeconds: 0.4,
    description: 'Prevents silent deadlocks if a lane has no incoming notes for 3.5s'
  },
  remixNoteTriggers: {
    types: ['vocals_isolate', 'drums_mute', 'bass_boost', 'filter_sweep'],
    durationBeats: '4 - 8 beats',
    visualEffect: 'Canvas palette inversion + glowing particle aura',
    scoreBonus: 1000
  }
};

// Tool Definitions
const TOOLS = [
  {
    name: 'pim_get_song_metadata',
    description: 'Query metadata for any of the 365 daily track releases in PIM (by day 1-365 or title query). Returns BPM, mood, genre, difficulty rating, audioUrl, and stem paths.',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'number', description: 'Day of the calendar year (1-365)' },
        query: { type: 'string', description: 'Search term for song title or artist' }
      }
    }
  },
  {
    name: 'pim_get_card',
    description: 'Look up collectible card metadata for any day in PIM. Returns title, rarity tier (common to mythic), max supply, token burn value, preview limit, and lore.',
    inputSchema: {
      type: 'object',
      properties: {
        day: { type: 'number', description: 'Day number (1-365)' },
        card_id: { type: 'string', description: 'Card identifier (e.g., "card-1")' }
      }
    }
  },
  {
    name: 'pim_simulate_gacha',
    description: 'Simulate authoritative PIM Gacha rolls under Economy v2.1 with active Drought Pity (25 pulls guarantees Rare+), Midnight 2x multiplier, and Streak bonuses.',
    inputSchema: {
      type: 'object',
      properties: {
        pull_count: { type: 'number', description: 'Number of packs to open (default 1, max 100)' },
        pity_count: { type: 'number', description: 'Current consecutive pulls without Rare+ (0-25)' },
        streak_days: { type: 'number', description: 'Current user login streak (7+ gives +50% rare+ bonus)' },
        is_midnight: { type: 'boolean', description: 'Whether the roll is between 12:00 AM and 2:00 AM (2x Legendary chance)' }
      }
    }
  },
  {
    name: 'pim_validate_forge_op',
    description: 'Validate and calculate costs/yields for Forge operations: Card Burning (tokens), Targeted Pull (500 tokens), Rarity Upgrade (150 tokens), Duplicate Fusion (3 identical cards -> 1 next tier), and Echo Card decay.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['burn', 'target_pull', 'upgrade_rarity', 'duplicate_fusion', 'echo_decay'],
          description: 'The forge operation to validate'
        },
        rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'legendary', 'mythic'], description: 'Card rarity tier' },
        card_count: { type: 'number', description: 'Number of cards involved' },
        echo_generation: { type: 'number', description: 'Generation for Echo decay check (0 to 3)' }
      },
      required: ['operation']
    }
  },
  {
    name: 'pim_lint_beatmap',
    description: 'Lint and validate a rhythm game beatmap. Checks for ascending time order, valid lanes (0, 1, 2), valid note types (tap, hold, swipe, slide, remix), lane collisions, hold tail durations, and swipe directions.',
    inputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          description: 'Array of Note objects with { time, lane, type, duration?, direction? }',
          items: {
            type: 'object',
            properties: {
              time: { type: 'number' },
              lane: { type: 'number' },
              type: { type: 'string' },
              duration: { type: 'number' },
              direction: { type: 'string' }
            },
            required: ['time', 'lane', 'type']
          }
        },
        day: { type: 'number', description: 'Day number to lint existing map from catalog' }
      }
    }
  },
  {
    name: 'pim_get_audio_dsp_specs',
    description: 'Retrieve the authoritative 3-band Web Audio crossover DSP specifications (300Hz lowpass, 1200Hz bandpass, 3200Hz highpass), muting rates, and recovery time constants.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'pim_get_design_tokens',
    description: 'Get authoritative design tokens: Void Black, Corridor Charcoal, Hot Pink, Neon Orange, Neon Cyan, Neon Green, Power Gold, Prismatic Purple, brutalist clip-paths, and glassmorphic blur recipes.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'pim_get_brand_logos',
    description: 'Get metadata and asset URLs for all rotating brand logos (Mark I Orange, Mark II Red, Mark III Gold) and current SEO preview configuration.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'pim_get_supabase_schema',
    description: 'Get PostgreSQL table schemas (profiles, vault_collections, gameplay_records, global_supply) and Edge Function signatures for PIM.',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: ['all', 'profiles', 'vault_collections', 'gameplay_records', 'global_supply', 'edge_functions'],
          description: 'Specific table or resource schema'
        }
      }
    }
  },
  {
    name: 'pim_verify_hierarchy',
    description: 'Verifies file paths to enforce that all development occurs in artifacts/beatstar-vault (Primary) before syncing to artifacts/rhythm-game (Secondary).',
    inputSchema: {
      type: 'object',
      properties: {
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of file paths intended for modification'
        }
      },
      required: ['file_paths']
    }
  }
];

// Resources List
const RESOURCES = [
  {
    uri: 'pim://docs/ecosystem',
    name: 'PIM Master Ecosystem Specification',
    mimeType: 'text/markdown',
    description: 'System Identity, Retention Thesis, and 3 Interlocking Economies.'
  },
  {
    uri: 'pim://docs/design-system',
    name: 'PIM Brutalist Design System Tokens',
    mimeType: 'text/markdown',
    description: 'Colors, Typography, Sheared Buttons, Glassmorphism, and Scanlines.'
  },
  {
    uri: 'pim://docs/rhythm-engine',
    name: 'PIM 3D Canvas Rhythm Engine Specs',
    mimeType: 'text/markdown',
    description: 'Perspective projection formulas, approach times, and timing windows.'
  },
  {
    uri: 'pim://docs/economy',
    name: 'PIM Economy v2.1 & Forge Mechanics',
    mimeType: 'text/markdown',
    description: 'Supply caps, card burning token sinks, Echo decay, and Gacha pity.'
  },
  {
    uri: 'pim://data/catalog-summary',
    name: 'PIM 365-Day Catalog Summary',
    mimeType: 'application/json',
    description: 'Catalog statistics, total song count, and registered card tiers.'
  }
];

// Prompt Templates
const PROMPTS = [
  {
    name: 'generate_beatmap',
    description: 'Scaffold a rhythm map with proper timing windows, 3 lanes, and remix notes based on BPM and duration.',
    arguments: [
      { name: 'day', description: 'Day number (1-365)', required: true },
      { name: 'difficulty', description: 'LIGHT (1-3), DARK (4-6), or VOID (7-10)', required: true }
    ]
  },
  {
    name: 'verify_agent_work',
    description: 'Audit pending code changes against the Beatstar-Vault is Primary rule and brutalist design tokens.',
    arguments: [
      { name: 'modified_files', description: 'Comma separated list of modified files', required: true }
    ]
  }
];

// Handler: Tools
function handleToolCall(name, args = {}) {
  switch (name) {
    case 'pim_get_song_metadata': {
      const day = args.day ? parseInt(args.day, 10) : null;
      const query = args.query ? args.query.toLowerCase() : null;

      if (day) {
        const found = songCatalog.find(s => s.day === day) || dayFileMap[day.toString()];
        if (found) {
          return { success: true, song: found };
        }
        return { success: false, error: `Song for day ${day} not found in catalog.` };
      }

      if (query) {
        const matches = songCatalog.filter(s => 
          (s.title && s.title.toLowerCase().includes(query)) ||
          (s.artist && s.artist.toLowerCase().includes(query)) ||
          (s.genre && Array.isArray(s.genre) && s.genre.some(g => g.toLowerCase().includes(query)))
        ).slice(0, 10);
        return { success: true, count: matches.length, matches };
      }

      return { success: true, totalSongs: songCatalog.length, sample: songCatalog.slice(0, 5) };
    }

    case 'pim_get_card': {
      const day = args.day ? parseInt(args.day, 10) : null;
      const cardId = args.card_id ? args.card_id.toLowerCase() : (day ? `card-${day}` : null);

      if (cardId) {
        const found = cardCatalog.find(c => (c.id && c.id.toLowerCase() === cardId) || c.day === day);
        if (found) {
          const rarity = (found.rarity || 'common').toLowerCase();
          const spec = DESIGN_TOKENS.rarities[rarity] || DESIGN_TOKENS.rarities.common;
          return {
            success: true,
            card: {
              ...found,
              burnTokens: spec.burnTokens,
              maxGameplaySupply: spec.supplyCap,
              maxOnChainSupply: spec.onChainCap,
              previewLimit: spec.previewSeconds,
              rarityColor: spec.color
            }
          };
        }
      }
      return { success: false, error: `Card for ${cardId || 'day ' + day} not found.` };
    }

    case 'pim_simulate_gacha': {
      const pullCount = Math.min(Math.max(parseInt(args.pull_count || 1, 10), 1), 100);
      let pityCount = Math.max(parseInt(args.pity_count || 0, 10), 0);
      const streakDays = Math.max(parseInt(args.streak_days || 0, 10), 0);
      const isMidnight = Boolean(args.is_midnight);

      const results = [];
      const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };

      // Base Rates: Common 65%, Uncommon 25%, Rare 8%, Legendary 1.8%, Mythic 0.2%
      for (let i = 0; i < pullCount; i++) {
        pityCount++;
        let roll = Math.random() * 100;
        let rarity = 'common';

        // Drought Pity: 25 pulls without Rare+ guarantees Rare or higher
        if (pityCount >= 25) {
          const pityRoll = Math.random() * 100;
          if (pityRoll < 80) rarity = 'rare';
          else if (pityRoll < 98) rarity = 'legendary';
          else rarity = 'mythic';
          pityCount = 0;
        } else {
          // Modifiers
          let mythicChance = 0.2;
          let legendaryChance = 1.8 * (isMidnight ? 2.0 : 1.0);
          let rareChance = 8.0 * (streakDays >= 7 ? 1.5 : 1.0);
          let uncommonChance = 25.0;

          if (roll < mythicChance) {
            rarity = 'mythic';
            pityCount = 0;
          } else if (roll < mythicChance + legendaryChance) {
            rarity = 'legendary';
            pityCount = 0;
          } else if (roll < mythicChance + legendaryChance + rareChance) {
            rarity = 'rare';
            pityCount = 0;
          } else if (roll < mythicChance + legendaryChance + rareChance + uncommonChance) {
            rarity = 'uncommon';
          } else {
            rarity = 'common';
          }
        }

        // 15% Echo Card chance
        const isEcho = Math.random() < 0.15;
        const echoGen = isEcho ? Math.floor(Math.random() * 3) : null;

        counts[rarity]++;
        results.push({ pull: i + 1, rarity, isEcho, echoGen });
      }

      return {
        success: true,
        summary: {
          totalPulls: pullCount,
          distribution: counts,
          finalPityCounter: pityCount,
          activeModifiers: {
            midnightBoost: isMidnight ? '2x Legendary Rate' : 'Inactive',
            streakBoost: streakDays >= 7 ? '+50% Rare+ Rate' : 'Inactive (Requires 7+ streak)'
          }
        },
        samplePulls: results.slice(0, 10)
      };
    }

    case 'pim_validate_forge_op': {
      const op = args.operation;
      const rarity = (args.rarity || 'common').toLowerCase();
      const cardCount = parseInt(args.card_count || 1, 10);
      const spec = DESIGN_TOKENS.rarities[rarity] || DESIGN_TOKENS.rarities.common;

      switch (op) {
        case 'burn': {
          const totalTokens = spec.burnTokens * cardCount;
          return {
            success: true,
            operation: 'burn',
            rarity,
            cardCount,
            tokenYield: totalTokens,
            formula: `${cardCount} card(s) × ${spec.burnTokens} V⚡`
          };
        }
        case 'target_pull': {
          return {
            success: true,
            operation: 'target_pull',
            tokenCost: 500,
            description: 'Acquire any specific card from the 365-day catalog directly.',
            currency: 'V⚡'
          };
        }
        case 'upgrade_rarity': {
          if (rarity === 'mythic') {
            return { success: false, error: 'Mythic is the highest tier and cannot be upgraded.' };
          }
          const tiers = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
          const nextTier = tiers[tiers.indexOf(rarity) + 1];
          return {
            success: true,
            operation: 'upgrade_rarity',
            currentTier: rarity,
            nextTier,
            tokenCost: 150,
            currency: 'V⚡'
          };
        }
        case 'duplicate_fusion': {
          if (cardCount < 3) {
            return { success: false, error: 'Duplicate Fusion requires at least 3 identical cards (same day & rarity).' };
          }
          const fusions = Math.floor(cardCount / 3);
          const remainder = cardCount % 3;
          const tiers = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
          const nextTier = rarity === 'mythic' ? 'mythic' : tiers[tiers.indexOf(rarity) + 1];
          return {
            success: true,
            operation: 'duplicate_fusion',
            consumedCards: fusions * 3,
            fusedCardsProduced: fusions,
            producedRarity: nextTier,
            remainingCards: remainder
          };
        }
        case 'echo_decay': {
          const gen = parseInt(args.echo_generation || 0, 10);
          const multipliers = [1.0, 0.6, 0.3, 0.1];
          const mult = gen < multipliers.length ? multipliers[gen] : 0.1;
          return {
            success: true,
            operation: 'echo_decay',
            generation: gen,
            prestigeMultiplier: mult,
            status: gen >= 3 ? 'Entropy Death (Max Decay)' : `Active Generation ${gen}`
          };
        }
        default:
          return { success: false, error: `Unknown forge operation: ${op}` };
      }
    }

    case 'pim_lint_beatmap': {
      const notes = args.notes || [];
      const issues = [];

      if (!Array.isArray(notes) || notes.length === 0) {
        return { success: false, error: 'Notes array is empty or invalid.' };
      }

      let lastTime = -1;
      const laneTimestamps = { 0: new Set(), 1: new Set(), 2: new Set() };
      const VALID_TYPES = ['tap', 'hold', 'swipe', 'slide', 'remix', 'double'];
      const VALID_DIRECTIONS = ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'];

      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (typeof n.time !== 'number' || n.time < 0) {
          issues.push(`Note [${i}]: Invalid time ${n.time}`);
        }
        if (n.time < lastTime) {
          issues.push(`Note [${i}]: Out of chronological order (time ${n.time} < previous ${lastTime})`);
        }
        lastTime = n.time;

        if (![0, 1, 2].includes(n.lane)) {
          issues.push(`Note [${i}]: Invalid lane ${n.lane} (must be 0, 1, or 2)`);
        }

        if (!VALID_TYPES.includes(n.type)) {
          issues.push(`Note [${i}]: Invalid type "${n.type}" (valid: ${VALID_TYPES.join(', ')})`);
        }

        // Collision check
        if (laneTimestamps[n.lane]) {
          if (laneTimestamps[n.lane].has(n.time)) {
            issues.push(`Note [${i}]: Collision - duplicate note at time ${n.time} on lane ${n.lane}`);
          }
          laneTimestamps[n.lane].add(n.time);
        }

        // Hold duration check
        if (n.type === 'hold') {
          if (typeof n.duration !== 'number' || n.duration <= 0.1) {
            issues.push(`Note [${i}]: Hold note requires duration > 0.1s (got ${n.duration})`);
          }
        }

        // Swipe direction check
        if (n.type === 'swipe' && n.direction) {
          if (!VALID_DIRECTIONS.includes(n.direction.toLowerCase())) {
            issues.push(`Note [${i}]: Invalid swipe direction "${n.direction}"`);
          }
        }
      }

      return {
        success: issues.length === 0,
        totalNotes: notes.length,
        issueCount: issues.length,
        issues: issues.slice(0, 20),
        status: issues.length === 0 ? 'VALID_BEATMAP' : 'LINT_ERRORS_FOUND'
      };
    }

    case 'pim_get_audio_dsp_specs': {
      return { success: true, audioDspSpec: AUDIO_DSP_SPEC };
    }

    case 'pim_get_design_tokens': {
      return { success: true, designTokens: DESIGN_TOKENS };
    }

    case 'pim_get_brand_logos': {
      return {
        success: true,
        masterLogos: BRAND_LOGOS,
        currentSeoImage: BRAND_LOGOS.find(l => l.isCurrentSeo) || BRAND_LOGOS[0],
        guidelines: 'Logo rotates on session start and click in MainBrandLogo component. SEO crawler meta tags are fixed to Mark I Orange for consistency.'
      };
    }

    case 'pim_get_supabase_schema': {
      const schemas = {
        profiles: {
          columns: ['id (UUID, PK)', 'username (TEXT)', 'wallet_address (TEXT)', 'tokens (BIGINT)', 'daily_standard_claims (INT)', 'daily_premium_claims (INT)', 'streak_count (INT)', 'total_pulls (INT)', 'pulls_since_rare_plus (INT)', 'created_at (TIMESTAMPTZ)'],
          rls: 'Users can read own profile; service role updates token balances.'
        },
        vault_collections: {
          columns: ['id (UUID, PK)', 'owner_id (UUID, FK -> profiles.id)', 'card_id (TEXT)', 'day (INT)', 'rarity (TEXT)', 'source (TEXT)', 'edition (INT)', 'max_supply (INT)', 'is_echo (BOOLEAN)', 'echo_generation (INT)', 'blockchain_status (TEXT)', 'created_at (TIMESTAMPTZ)'],
          rls: 'Public read for showcase; mutations through vault-engine Edge Function.'
        },
        gameplay_records: {
          columns: ['id (UUID, PK)', 'user_id (UUID, FK)', 'song_id (TEXT)', 'day (INT)', 'score (INT)', 'accuracy (FLOAT)', 'max_combo (INT)', 'medal (TEXT: NONE/BRONZE/SILVER/GOLD/PLATINUM)', 'pack_rewarded (BOOLEAN)', 'played_at (TIMESTAMPTZ)'],
          rls: 'Insert allowed with valid session; leaderboards query aggregated top scores.'
        },
        global_supply: {
          columns: ['card_id_rarity (TEXT, PK)', 'current_supply (INT)', 'max_supply (INT)', 'minted_onchain (INT)'],
          rls: 'Read-only public; modified exclusively by authoritative Edge Functions.'
        },
        edge_functions: {
          'vault-engine': 'Executes server-authoritative Gacha claims, token spends, burn payouts, and rarity upgrades.',
          'auth-smart-wallet': 'Validates EIP-1271 signatures on Base Mainnet (0x2105 / 8453) for Coinbase Smart Wallet.'
        }
      };

      const requested = args.table || 'all';
      if (requested !== 'all' && schemas[requested]) {
        return { success: true, table: requested, schema: schemas[requested] };
      }
      return { success: true, schemas };
    }

    case 'pim_verify_hierarchy': {
      const paths = args.file_paths || [];
      const violations = [];
      const validEdits = [];

      for (const p of paths) {
        const norm = p.replace(/\\/g, '/');
        if (norm.includes('artifacts/rhythm-game/') && !norm.includes('artifacts/beatstar-vault/')) {
          violations.push({
            path: p,
            rule: 'STRICT WORKFLOW DIRECTIVE: BEATSTAR-VAULT IS PRIMARY',
            reason: 'Modifying artifacts/rhythm-game directly is prohibited before building, testing, and validating in artifacts/beatstar-vault.'
          });
        } else {
          validEdits.push(p);
        }
      }

      return {
        compliant: violations.length === 0,
        violationCount: violations.length,
        violations,
        approvedPaths: validEdits,
        directive: 'Always perform changes in artifacts/beatstar-vault first, then sync to artifacts/rhythm-game as a secondary step.'
      };
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// Handler: Resources
function handleResourceRead(uri) {
  switch (uri) {
    case 'pim://docs/ecosystem':
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: `# PIM : th3v4ult — Master Ecosystem Specification\n\n## Retention Thesis\nMusic Unlocks Gameplay -> Gameplay Unlocks Ownership -> Ownership Unlocks Status.\n\n365 daily song releases, 3-band audio crossover, Base Mainnet EVM wallet integration.`
        }]
      };
    case 'pim://docs/design-system':
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: JSON.stringify(DESIGN_TOKENS, null, 2)
        }]
      };
    case 'pim://docs/rhythm-engine':
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: `# PIM Rhythm Engine Math\n\nY_note = Y_top + (Y_bottom - Y_top) * P\nApproach Time = max(1.35, 2.5 - (diff - 1) * 0.128)\nLanes: 0 (Bass <300Hz), 1 (Mids 1200Hz), 2 (Treble >3200Hz)`
        }]
      };
    case 'pim://docs/economy':
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: JSON.stringify({
            rarityTiers: DESIGN_TOKENS.rarities,
            forgeCosts: { targetPull: '500 V⚡', upgradeRarity: '150 V⚡', duplicateFusion: '3 identical cards' }
          }, null, 2)
        }]
      };
    case 'pim://data/catalog-summary':
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            totalSongs: songCatalog.length || 365,
            totalCards: cardCatalog.length || 365,
            masterLogosCount: BRAND_LOGOS.length,
            targetNetwork: 'Base Mainnet (8453 / 0x2105)'
          }, null, 2)
        }]
      };
    default:
      throw new Error(`Resource not found: ${uri}`);
  }
}

// JSON-RPC 2.0 stdio Interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line || !line.trim()) return;

  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        // acknowledged
      }
      return;
    }

    let response = { jsonrpc: '2.0', id };

    switch (method) {
      case 'initialize': {
        response.result = {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'pim-mcp-server',
            version: '1.0.0'
          },
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        };
        break;
      }

      case 'tools/list': {
        response.result = { tools: TOOLS };
        break;
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        const result = handleToolCall(name, args);
        response.result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
        break;
      }

      case 'resources/list': {
        response.result = { resources: RESOURCES };
        break;
      }

      case 'resources/read': {
        const { uri } = params || {};
        response.result = handleResourceRead(uri);
        break;
      }

      case 'prompts/list': {
        response.result = { prompts: PROMPTS };
        break;
      }

      case 'prompts/get': {
        const { name } = params || {};
        const found = PROMPTS.find(p => p.name === name);
        if (found) {
          response.result = {
            description: found.description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please execute the ${name} workflow following PIM ecosystem specifications.`
                }
              }
            ]
          };
        } else {
          response.error = { code: -32602, message: `Prompt not found: ${name}` };
        }
        break;
      }

      default: {
        response.error = { code: -32601, message: `Method not found: ${method}` };
        break;
      }
    }

    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (err) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: `Parse error: ${err.message}` }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

// Make executable
try {
  fs.chmodSync(__filename, 0o755);
} catch {
  // ignore
}
