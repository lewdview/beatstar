/**
 * Authoritative Catalog Service for PIM Cloudflare Worker
 *
 * Resolves song metadata, card collections, bombshell cover artwork variants,
 * pack configurations, and live Supabase card claim numbers.
 */

import { Env } from './types';

let cachedSongs: any[] | null = null;
let cachedCards: any[] | null = null;
let cachedBombshellCovers: Record<string, any> | null = null;
let cachedPacks: Record<string, any> | null = null;
let cachedGlobalSupply: any[] | null = null;
let cachedVaultSources: Record<string, number> | null = null;

let lastFetchTime = 0;
let lastSupplyFetchTime = 0;
let lastSourcesFetchTime = 0;

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour edge in-memory TTL
const SUPPLY_CACHE_TTL_MS = 1000 * 30; // 30 seconds live claim cache

export const CDN_BASE = 'https://files.th3scr1b3.art';
export const PIM_BASE = 'https://pim.th3scr1b3.art';
export const DEFAULT_SUPABASE_URL = 'https://toemkhrfsbkfkutwcjkd.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZW1raHJmc2JrZmt1dHdjamtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTQxNTQsImV4cCI6MjEwMzE5MDE1NH0.nAtlMU_ukqXMkIhKppwv1mxDKpxuwHa6ddQBBwK3Iu8';

export async function getSongCatalog(): Promise<any[]> {
  const now = Date.now();
  if (cachedSongs && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedSongs;
  }

  try {
    const res = await fetch(`${PIM_BASE}/data/song_catalog.json`, {
      cf: { cacheEverything: true, cacheTtl: 86400 } as any
    });
    if (res.ok) {
      cachedSongs = await res.json();
      lastFetchTime = now;
      return cachedSongs || [];
    }
  } catch (err) {
    console.error('Failed to fetch song catalog from edge:', err);
  }

  return cachedSongs || [];
}

export async function getCardCatalog(): Promise<any[]> {
  const now = Date.now();
  if (cachedCards && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedCards;
  }

  try {
    const res = await fetch(`${PIM_BASE}/data/card_catalog.json`, {
      cf: { cacheEverything: true, cacheTtl: 86400 } as any
    });
    if (res.ok) {
      cachedCards = await res.json();
      lastFetchTime = now;
      return cachedCards || [];
    }
  } catch (err) {
    console.error('Failed to fetch card catalog from edge:', err);
  }

  return cachedCards || [];
}

export async function getBombshellCoversMap(): Promise<Record<string, any>> {
  const now = Date.now();
  if (cachedBombshellCovers && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedBombshellCovers;
  }

  try {
    const res = await fetch(`${PIM_BASE}/data/bombshell_covers_map.json`, {
      cf: { cacheEverything: true, cacheTtl: 86400 } as any
    });
    if (res.ok) {
      cachedBombshellCovers = await res.json();
      return cachedBombshellCovers || {};
    }
  } catch (err) {
    console.error('Failed to fetch bombshell covers map from edge:', err);
  }

  return cachedBombshellCovers || {};
}

export async function getPacksCatalog(): Promise<Record<string, any>> {
  const now = Date.now();
  if (cachedPacks && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedPacks;
  }

  try {
    const res = await fetch(`${PIM_BASE}/data/packs.json`, {
      cf: { cacheEverything: true, cacheTtl: 86400 } as any
    });
    if (res.ok) {
      cachedPacks = await res.json();
      return cachedPacks || {};
    }
  } catch (err) {
    console.error('Failed to fetch packs catalog from edge:', err);
  }

  return cachedPacks || {};
}

export async function getGlobalSupplyData(env?: Env): Promise<any[]> {
  const now = Date.now();
  if (cachedGlobalSupply && (now - lastSupplyFetchTime < SUPPLY_CACHE_TTL_MS)) {
    return cachedGlobalSupply;
  }

  const supabaseUrl = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = env?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/global_supply?select=card_id_rarity,supply&limit=2000`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });

    if (res.ok) {
      cachedGlobalSupply = await res.json();
      lastSupplyFetchTime = now;
      return cachedGlobalSupply || [];
    }
  } catch (err) {
    console.error('Failed to query Supabase global_supply:', err);
  }

  return cachedGlobalSupply || [];
}

export async function getVaultSourcesData(env?: Env): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedVaultSources && (now - lastSourcesFetchTime < SUPPLY_CACHE_TTL_MS)) {
    return cachedVaultSources;
  }

  const supabaseUrl = env?.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = env?.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/vault_collections?select=source&limit=2000`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });

    if (res.ok) {
      const rows: Array<{ source: string }> = await res.json();
      const counts: Record<string, number> = {};
      rows.forEach(r => {
        const src = r.source || 'unknown';
        counts[src] = (counts[src] || 0) + 1;
      });
      cachedVaultSources = counts;
      lastSourcesFetchTime = now;
      return counts;
    }
  } catch (err) {
    console.error('Failed to query Supabase vault_collections sources:', err);
  }

  return cachedVaultSources || {};
}

export function formatDayPath(day: number): { audioUrl: string; coverUrl: string } {
  return {
    audioUrl: `${CDN_BASE}/audio/day-${day}.mp3`,
    coverUrl: `${CDN_BASE}/covers/day-${day}.jpg`
  };
}

export function buildBombshellCoverUrls(day: number, data: any): { normal: string[]; letterbox: string[]; total: number } {
  if (!data) {
    return { normal: [], letterbox: [], total: 0 };
  }

  const normal = (data.normalFiles || []).map((file: string) => 
    `${CDN_BASE}/rare_covers/day%20${day}/${encodeURIComponent(file)}`
  );

  const letterbox = (data.lbFiles || []).map((file: string) => 
    `${CDN_BASE}/rare_covers/day%20${day}/${encodeURIComponent(file)}`
  );

  return {
    normal,
    letterbox,
    total: (normal.length + letterbox.length) || data.totalCovers || 0
  };
}

const RARITY_CAPS: Record<string, number> = {
  common: 2000,
  uncommon: 500,
  rare: 100,
  legendary: 10,
  mythic: 1
};

export async function getDailyClaimsSummary(day?: number, options?: { source_breakdown?: boolean; top_limit?: number }, env?: Env): Promise<any> {
  const supplyData = await getGlobalSupplyData(env);
  const songCatalog = await getSongCatalog();

  // If specific day requested
  if (day !== undefined && day !== null && !isNaN(day)) {
    const dayStr = String(day);
    const dayRows = supplyData.filter(r => {
      const key = r.card_id_rarity || '';
      return (
        key === `${dayStr}-common` || key === `${dayStr}-uncommon` || key === `${dayStr}-rare` || key === `${dayStr}-legendary` || key === `${dayStr}-mythic` ||
        key.startsWith(`bombshell-${dayStr}-`) ||
        key.startsWith(`card-${dayStr}-`)
      );
    });

    const song = songCatalog.find((s: any) => s.day === day);

    const breakdown: Record<string, any> = {
      // Standard Gen-0 Card Set
      common: { claimed: 0, maxSupply: RARITY_CAPS.common, remaining: RARITY_CAPS.common, pctClaimed: '0.0%' },
      uncommon: { claimed: 0, maxSupply: RARITY_CAPS.uncommon, remaining: RARITY_CAPS.uncommon, pctClaimed: '0.0%' },
      rare: { claimed: 0, maxSupply: RARITY_CAPS.rare, remaining: RARITY_CAPS.rare, pctClaimed: '0.0%' },
      legendary: { claimed: 0, maxSupply: RARITY_CAPS.legendary, remaining: RARITY_CAPS.legendary, pctClaimed: '0.0%' },
      mythic: { claimed: 0, maxSupply: RARITY_CAPS.mythic, remaining: RARITY_CAPS.mythic, pctClaimed: '0.0%' },

      // Bombshell Archive Collector Set (All 5 Rarity Tiers)
      bombshell_common: { claimed: 0, maxSupply: RARITY_CAPS.common, remaining: RARITY_CAPS.common, pctClaimed: '0.0%' },
      bombshell_uncommon: { claimed: 0, maxSupply: RARITY_CAPS.uncommon, remaining: RARITY_CAPS.uncommon, pctClaimed: '0.0%' },
      bombshell_rare: { claimed: 0, maxSupply: RARITY_CAPS.rare, remaining: RARITY_CAPS.rare, pctClaimed: '0.0%' },
      bombshell_legendary: { claimed: 0, maxSupply: RARITY_CAPS.legendary, remaining: RARITY_CAPS.legendary, pctClaimed: '0.0%' },
      bombshell_mythic: { claimed: 0, maxSupply: RARITY_CAPS.mythic, remaining: RARITY_CAPS.mythic, pctClaimed: '0.0%' }
    };

    let totalDayClaims = 0;

    dayRows.forEach(r => {
      const key = r.card_id_rarity || '';
      const qty = r.supply || 0;
      totalDayClaims += qty;

      if (key === `${dayStr}-common` || key === `card-${dayStr}-common`) {
        breakdown.common.claimed += qty;
      } else if (key === `${dayStr}-uncommon` || key === `card-${dayStr}-uncommon`) {
        breakdown.uncommon.claimed += qty;
      } else if (key === `${dayStr}-rare` || key === `card-${dayStr}-rare`) {
        breakdown.rare.claimed += qty;
      } else if (key === `${dayStr}-legendary` || key === `card-${dayStr}-legendary`) {
        breakdown.legendary.claimed += qty;
      } else if (key === `${dayStr}-mythic` || key === `card-${dayStr}-mythic`) {
        breakdown.mythic.claimed += qty;
      } else if (key === `bombshell-${dayStr}-common`) {
        breakdown.bombshell_common.claimed += qty;
      } else if (key === `bombshell-${dayStr}-uncommon`) {
        breakdown.bombshell_uncommon.claimed += qty;
      } else if (key === `bombshell-${dayStr}-rare`) {
        breakdown.bombshell_rare.claimed += qty;
      } else if (key === `bombshell-${dayStr}-legendary`) {
        breakdown.bombshell_legendary.claimed += qty;
      } else if (key === `bombshell-${dayStr}-mythic`) {
        breakdown.bombshell_mythic.claimed += qty;
      }
    });

    // Compute remaining and percentages for both Standard and Bombshell tiers
    ['common', 'uncommon', 'rare', 'legendary', 'mythic'].forEach(tier => {
      const cap = RARITY_CAPS[tier];

      const stdClaimed = breakdown[tier].claimed;
      breakdown[tier].remaining = Math.max(0, cap - stdClaimed);
      breakdown[tier].pctClaimed = `${((stdClaimed / cap) * 100).toFixed(1)}%`;

      const bsKey = `bombshell_${tier}`;
      const bsClaimed = breakdown[bsKey].claimed;
      breakdown[bsKey].remaining = Math.max(0, cap - bsClaimed);
      breakdown[bsKey].pctClaimed = `${((bsClaimed / cap) * 100).toFixed(1)}%`;
    });

    return {
      success: true,
      day,
      title: song?.title || `Day ${day}`,
      totalCardsClaimed: totalDayClaims,
      claimBreakdown: {
        ...breakdown,
        standard: {
          common: breakdown.common,
          uncommon: breakdown.uncommon,
          rare: breakdown.rare,
          legendary: breakdown.legendary,
          mythic: breakdown.mythic
        },
        bombshell: {
          common: breakdown.bombshell_common,
          uncommon: breakdown.bombshell_uncommon,
          rare: breakdown.bombshell_rare,
          legendary: breakdown.bombshell_legendary,
          mythic: breakdown.bombshell_mythic
        }
      },
      isSoldOut: (
        breakdown.common.remaining === 0 &&
        breakdown.uncommon.remaining === 0 &&
        breakdown.rare.remaining === 0 &&
        breakdown.legendary.remaining === 0 &&
        breakdown.mythic.remaining === 0 &&
        breakdown.bombshell_common.remaining === 0 &&
        breakdown.bombshell_uncommon.remaining === 0 &&
        breakdown.bombshell_rare.remaining === 0 &&
        breakdown.bombshell_legendary.remaining === 0 &&
        breakdown.bombshell_mythic.remaining === 0
      ),
      dataSource: 'supabase_global_supply (live edge sync)',
      lastSyncTimestamp: new Date().toISOString()
    };
  }

  // Global Claims Overview (Across all 365 days)
  let grandTotalClaims = 0;
  const dayAggregates: Record<number, number> = {};
  const globalTiers: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };
  const standardTiers: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };
  const bombshellTiers: Record<string, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0, mythic: 0 };

  supplyData.forEach(r => {
    const key = r.card_id_rarity || '';
    const qty = r.supply || 0;
    grandTotalClaims += qty;

    // Extract day number
    let d: number | null = null;
    const isBs = key.startsWith('bombshell-');

    if (isBs) {
      const parts = key.replace('bombshell-', '').split('-');
      d = parseInt(parts[0], 10);
    } else if (key.startsWith('card-')) {
      const parts = key.replace('card-', '').split('-');
      d = parseInt(parts[0], 10);
    } else {
      const parts = key.split('-');
      d = parseInt(parts[0], 10);
    }

    if (d && !isNaN(d)) {
      dayAggregates[d] = (dayAggregates[d] || 0) + qty;
    }

    // Tier tally
    const targetMap = isBs ? bombshellTiers : standardTiers;
    if (key.includes('-common')) { targetMap.common += qty; globalTiers.common += qty; }
    else if (key.includes('-uncommon')) { targetMap.uncommon += qty; globalTiers.uncommon += qty; }
    else if (key.includes('-rare')) { targetMap.rare += qty; globalTiers.rare += qty; }
    else if (key.includes('-legendary')) { targetMap.legendary += qty; globalTiers.legendary += qty; }
    else if (key.includes('-mythic')) { targetMap.mythic += qty; globalTiers.mythic += qty; }
  });

  const topLimit = options?.top_limit || 10;
  const sortedDays = Object.entries(dayAggregates)
    .map(([dayNum, total]) => {
      const dayInt = parseInt(dayNum, 10);
      const song = songCatalog.find((s: any) => s.day === dayInt);
      return {
        day: dayInt,
        title: song?.title || `Day ${dayInt}`,
        totalClaimed: total
      };
    })
    .sort((a, b) => b.totalClaimed - a.totalClaimed);

  const result: any = {
    success: true,
    totalCardsClaimed: grandTotalClaims,
    uniqueCardsMinted: supplyData.length,
    globalRarityTotals: globalTiers,
    standardRarityTotals: standardTiers,
    bombshellRarityTotals: bombshellTiers,
    mostClaimedDays: sortedDays.slice(0, topLimit),
    dataSource: 'supabase_global_supply (live edge sync)',
    lastSyncTimestamp: new Date().toISOString()
  };

  if (options?.source_breakdown) {
    result.claimSources = await getVaultSourcesData(env);
  }

  return result;
}
