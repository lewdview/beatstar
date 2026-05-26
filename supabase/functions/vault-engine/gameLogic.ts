export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic';
export type ProofType = 'proof_of_first' | 'heard_first' | null;

// ═══════════════════════════════════════════════════════════════
// RC1 TEST MODE FLAG
// ═══════════════════════════════════════════════════════════════
export const RC1_TEST_MODE = true;

export interface ModifierContext {
  streak: number;
  collectionSize: number;
  totalPulls: number;
  pullsSinceRarePlus: number;
  isFirstPack: boolean;
  currentHour: number;
  currentMinute: number;
  currentDayOfWeek: number;  // 0=Sunday, 6=Saturday
  currentVaultDay: number;   // 1-365
}

export function isModifierActive(mod: any, ctx: ModifierContext): boolean {
  if (!mod.enabled) return false;

  const c = mod.condition;

  switch (c.type) {
    case 'streak':
      return ctx.streak >= c.threshold;

    case 'collection_size':
      return ctx.collectionSize >= c.threshold;

    case 'time_of_day': {
      if (!c.timeStart || !c.timeEnd) return false;
      const [sh, sm] = c.timeStart.split(':').map(Number);
      const [eh, em] = c.timeEnd.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const nowMin = ctx.currentHour * 60 + ctx.currentMinute;
      if (startMin <= endMin) {
        return nowMin >= startMin && nowMin < endMin;
      } else {
        return nowMin >= startMin || nowMin < endMin;
      }
    }

    case 'rarity_drought':
      return ctx.pullsSinceRarePlus >= c.threshold;

    case 'first_pack':
      return ctx.isFirstPack;

    case 'milestone':
      return ctx.collectionSize >= c.threshold;

    case 'day_range': {
      // threshold === 6 → weekend mode (Saturday=6 or Sunday=0)
      if (c.threshold === 6) {
        return ctx.currentDayOfWeek === 0 || ctx.currentDayOfWeek === 6;
      }
      // threshold === 7 → lucky 7s (vault days ending in 7)
      if (c.threshold === 7) {
        return ctx.currentVaultDay % 10 === 7;
      }
      // Generic: match if vault day is divisible by threshold
      if (c.threshold > 0) {
        return ctx.currentVaultDay % c.threshold === 0;
      }
      return false;
    }

    default:
      return false;
  }
}

export function applyActiveModifiers(
  baseRates: number[],
  packCategory: string,
  ctx: ModifierContext,
  adminConfig: any
): { adjustedRates: number[]; guaranteedFloor: Rarity | null; bonusCards: number; tokenMultiplier: number } {
  if (!adminConfig || !adminConfig.modifiers) return { adjustedRates: baseRates, guaranteedFloor: null, bonusCards: 0, tokenMultiplier: 1 };
  
  const rates = [...baseRates];
  let guaranteedFloor: Rarity | null = null;
  let bonusCards = 0;
  let tokenMultiplier = 1;

  const RARITY_INDEX: Record<Rarity, number> = {
    common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4,
  };

  for (const mod of adminConfig.modifiers) {
    if (!isModifierActive(mod, ctx)) continue;
    if (mod.effect.packFilter && mod.effect.packFilter !== packCategory) continue;

    switch (mod.effect.type) {
      case 'rate_boost': {
        if (mod.effect.target) {
          const idx = RARITY_INDEX[mod.effect.target as Rarity];
          if (idx !== undefined && idx < rates.length) {
            rates[idx] *= mod.effect.value;
          }
          for (let i = idx + 1; i < rates.length; i++) {
            rates[i] *= mod.effect.value;
          }
        }
        break;
      }

      case 'rate_nerf': {
        if (mod.effect.target) {
          const idx = RARITY_INDEX[mod.effect.target as Rarity];
          if (idx !== undefined && idx < rates.length) {
            rates[idx] /= mod.effect.value;
          }
        }
        break;
      }

      case 'guaranteed_floor': {
        if (mod.effect.target) {
          if (!guaranteedFloor || RARITY_INDEX[mod.effect.target as Rarity] > RARITY_INDEX[guaranteedFloor]) {
            guaranteedFloor = mod.effect.target as Rarity;
          }
        }
        break;
      }

      case 'bonus_card': {
        bonusCards += mod.effect.value;
        break;
      }

      case 'token_multiplier': {
        tokenMultiplier *= mod.effect.value;
        break;
      }
    }
  }

  const sum = rates.reduce((a, b) => a + b, 0);
  if (sum > 0 && sum !== 100) {
    const scale = 100 / sum;
    for (let i = 0; i < rates.length; i++) {
      rates[i] = Math.round(rates[i] * scale * 100) / 100;
    }
  }

  return { adjustedRates: rates, guaranteedFloor, bonusCards, tokenMultiplier };
}

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];

/** Degrade a rarity by N tiers (clamped to Common floor). Used by echo system. */
export function degradeRarity(rarity: Rarity, steps: number = 1): Rarity {
  const idx = RARITY_ORDER.indexOf(rarity);
  const degraded = Math.max(0, idx - steps);
  return RARITY_ORDER[degraded];
}

/** Upgrade a rarity by 1 tier (clamped to Legendary — Mythic cannot be upgraded to). */
export function upgradeRarity(rarity: Rarity): Rarity {
  const idx = RARITY_ORDER.indexOf(rarity);
  const upgraded = Math.min(3, idx + 1); // 3 = legendary index, max upgrade target
  return RARITY_ORDER[upgraded];
}

// ═══════════════════════════════════════════════════════════════
// V2 BURN VALUES (rebalanced for deflation)
// ═══════════════════════════════════════════════════════════════

export const RARITY_CONFIG: Record<Rarity, number> = {
  common: 3,
  uncommon: 10,
  rare: 30,
  legendary: 80,
  mythic: 200,
};

// ═══════════════════════════════════════════════════════════════
// ECHO SYSTEM V2 — Generational Decay
// ═══════════════════════════════════════════════════════════════

/** Get echo spawn chance based on generation (replaces flat 50%). */
export function getEchoSpawnChance(generation: number, adminConfig?: any): number {
  // Admin multiplier override
  const multiplier = adminConfig?.echoSpawnMultiplier ?? 1;

  const BASE_RATES: Record<number, number> = {
    0: 25,  // Gen 0 → 25% chance to spawn Gen 1 echo
    1: 15,  // Gen 1 → 15% chance to spawn Gen 2 echo
    2: 8,   // Gen 2 → 8% chance to spawn Gen 3 echo
  };

  // Gen 3+ = terminal destruction, no further echo
  if (generation >= 3) return 0;

  const baseRate = BASE_RATES[generation] ?? 0;
  return Math.min(100, baseRate * multiplier);
}

/** Echo burn bonus: +15% token yield when burning an echo. */
export const ECHO_BURN_BONUS = 0.15;

/** Get effective burn yield with echo bonus applied. */
export function getEffectiveBurnYield(
  rarity: Rarity,
  isEcho: boolean,
  dailyBurns: number,
  adminConfig?: any
): number {
  let baseVal = RARITY_CONFIG[rarity] || 3;

  // Echo burn bonus (+15%)
  if (isEcho) {
    baseVal = Math.ceil(baseVal * (1 + ECHO_BURN_BONUS));
  }

  // Admin token yield multiplier (RC1 control)
  const yieldMultiplier = adminConfig?.tokenYieldMultiplier ?? 1;
  baseVal = Math.ceil(baseVal * yieldMultiplier);

  // Anti-grind friction
  if (dailyBurns >= 30) {
    baseVal = Math.ceil(baseVal * 0.6); // -40% yield
  } else if (dailyBurns >= 20) {
    baseVal = Math.ceil(baseVal * 0.8); // -20% yield
  }

  return Math.max(1, baseVal); // Always earn at least 1
}

// ═══════════════════════════════════════════════════════════════
// PITY COUNTER — Guaranteed Rare+ every 25 pulls
// ═══════════════════════════════════════════════════════════════

export const PITY_THRESHOLD = 25;

/** Check if pity should trigger and return a guaranteed floor. */
export function getPityFloor(pullsSinceRarePlus: number): Rarity | null {
  if (pullsSinceRarePlus >= PITY_THRESHOLD) {
    return 'rare';
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// DAY CALCULATION
// ═══════════════════════════════════════════════════════════════

const EPOCH = new Date('2026-01-01T00:00:00');
export function getCurrentDay(): number {
  const now = new Date();
  const diff = now.getTime() - EPOCH.getTime();
  const day = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(365, day));
}

// Deterministic seeded RNG to match frontend trait derivation
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function getCardMood(dayNum: number): 'light' | 'dark' {
  const rng = seededRandom(dayNum * 7919 + 31337);
  return rng() > 0.5 ? 'light' : 'dark';
}

export function getRarityRoll(packCategory: string, ctx?: ModifierContext, adminConfig?: any): { rarity: Rarity; proof: ProofType } {
  // Hardcoded defaults matching frontend if admin_config isn't present
  const ROLL_RATES: Record<string, number[]> = {
    free:           [60, 25, 12, 3],
    taste:          [60, 25, 12, 3],
    light:          [60, 25, 12, 3],
    dark:           [60, 25, 12, 3],
    month:          [60, 25, 12, 3],
    miss_out:       [55, 25, 14, 6],
    special_picks:  [50, 27, 16, 7],
    prophecy:       [63, 22, 10, 5],
    alpha:          [43, 30, 20, 5, 2],
    vault_token:    [30, 28, 25, 14, 3],
  };

  const PROOF_RATES: Record<string, number> = {
    prophecy: 3,
    alpha: 8,
  };

  let baseRates = ROLL_RATES[packCategory] || ROLL_RATES.taste;
  
  // Admin drop rate overrides
  if (adminConfig?.rollRates?.[packCategory]) {
    baseRates = adminConfig.rollRates[packCategory];
  }
  if (adminConfig?.dropRateOverrides?.[packCategory]) {
    baseRates = adminConfig.dropRateOverrides[packCategory];
  }
  
  let proofRate = PROOF_RATES[packCategory] || 0;
  if (adminConfig?.proofRates?.[packCategory] !== undefined) {
    proofRate = adminConfig.proofRates[packCategory];
  }

  if (proofRate > 0 && Math.random() * 100 < proofRate) {
    const proof: ProofType = packCategory === 'prophecy' ? 'proof_of_first' : 'heard_first';
    return { rarity: 'legendary', proof };
  }

  let finalRates = baseRates;
  let guaranteedFloor: Rarity | null = null;
  if (ctx && adminConfig) {
    const mods = applyActiveModifiers(baseRates, packCategory, ctx, adminConfig);
    finalRates = mods.adjustedRates;
    guaranteedFloor = mods.guaranteedFloor;
  }

  // Apply pity counter floor
  if (ctx) {
    const pityFloor = getPityFloor(ctx.pullsSinceRarePlus);
    if (pityFloor) {
      const RARITY_IDX: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
      if (!guaranteedFloor || RARITY_IDX[pityFloor] > RARITY_IDX[guaranteedFloor]) {
        guaranteedFloor = pityFloor;
      }
    }
  }

  const roll = Math.random() * 100;
  let cumulative = 0;
  const rarityPool: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  for (let i = 0; i < rarityPool.length; i++) {
    cumulative += (finalRates[i] || 0);
    if (roll < cumulative) {
       let selectedRarity = rarityPool[i];
       if (packCategory === 'special_picks' && (i === 0 || i === 1)) selectedRarity = 'rare';
       
       if (guaranteedFloor) {
         const RARITY_INDEX: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4 };
         if (RARITY_INDEX[selectedRarity] < RARITY_INDEX[guaranteedFloor]) {
           selectedRarity = guaranteedFloor;
         }
       }
       return { rarity: selectedRarity, proof: null };
    }
  }
  return { rarity: guaranteedFloor || 'common', proof: null };
}

export function rollDailyClaimRarity(adminConfig?: any): Rarity {
  let rates = [42, 30, 18, 10];
  if (adminConfig?.dailyClaimRates?.standard) {
    rates = adminConfig.dailyClaimRates.standard;
  }
  const roll = Math.random() * 100;
  let cumulative = 0;
  const rarityPool: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  for (let i = 0; i < rarityPool.length; i++) {
    cumulative += (rates[i] || 0);
    if (roll < cumulative) return rarityPool[i];
  }
  return 'common';
}

export function drawCardDays(category: string, count: number, today: number, unownedMissedOut: number[]): number[] {
  const chosen: number[] = [];
  
  if (category === 'miss_out') {
    const pool = unownedMissedOut.length > 0 ? unownedMissedOut : Array.from({length: today}, (_, i) => i + 1);
    for (let i = 0; i < count; i++) {
      chosen.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return chosen;
  }
  
  if (category === 'prophecy') {
    const futureDays = 365 - today;
    for (let i = 0; i < count; i++) {
      if (futureDays <= 0) chosen.push(today);
      else chosen.push(today + 1 + Math.floor(Math.random() * futureDays));
    }
    return chosen;
  }
  
  // Taste, free, default: pick random up to today
  let pool = Array.from({length: today}, (_, i) => i + 1);
  
  if (category === 'light') {
    pool = pool.filter(d => getCardMood(d) === 'light');
    if (pool.length === 0) pool = [1];
  } else if (category === 'dark') {
    pool = pool.filter(d => getCardMood(d) === 'dark');
    if (pool.length === 0) pool = [1];
  }

  for (let i = 0; i < count; i++) {
    chosen.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return chosen;
}

// ═══════════════════════════════════════════════════════════════
// RC1 DAILY LIMITS (elevated for stress testing)
// ═══════════════════════════════════════════════════════════════

export const RC1_DAILY_STANDARD_LIMIT = 60;
export const RC1_DAILY_PREMIUM_LIMIT = 5;

// ═══════════════════════════════════════════════════════════════
// TOKEN SINK COSTS
// ═══════════════════════════════════════════════════════════════

export const TOKEN_PACK_COST = 275;
export const TARGETED_PULL_COST = 500;
export const RARITY_UPGRADE_COST = 150;

// NFT mint costs (scaffolded, not active in RC1)
export const NFT_MINT_COSTS: Record<Rarity, number> = {
  common: 0,     // Not mintable
  uncommon: 0,   // Not mintable
  rare: 300,
  legendary: 600,
  mythic: 1200,
};
