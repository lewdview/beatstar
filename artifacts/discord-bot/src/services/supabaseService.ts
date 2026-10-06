import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';

export interface LeaderboardEntry {
  id: string;
  user_id: string;
  song_id: string;
  score: number;
  accuracy: number;
  max_combo: number;
  medal: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  created_at: string;
}

export interface CardSupplyData {
  card_id_rarity: string;
  supply: number;
}

export interface CardSupplyBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  legendary: number;
  mythic: number;
  bombshell_common: number;
  bombshell_uncommon: number;
  bombshell_rare: number;
  bombshell_legendary: number;
  bombshell_mythic: number;
  totalStandard: number;
  totalBombshell: number;
  totalClaimed: number;
}

class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      try {
        this.client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      } catch (err) {
        console.error('[SupabaseService] Failed to initialize Supabase client:', err);
      }
    }
  }

  /**
   * Get card supply counts across all standard & bombshell rarities for a given day
   */
  public async getCardSupply(day: number): Promise<CardSupplyBreakdown> {
    const breakdown: CardSupplyBreakdown = {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      mythic: 0,
      bombshell_common: 0,
      bombshell_uncommon: 0,
      bombshell_rare: 0,
      bombshell_legendary: 0,
      bombshell_mythic: 0,
      totalStandard: 0,
      totalBombshell: 0,
      totalClaimed: 0
    };

    if (!this.client) return breakdown;

    try {
      const dayStr = String(day);
      const targetKeys = [
        `${dayStr}-common`, `${dayStr}-uncommon`, `${dayStr}-rare`, `${dayStr}-legendary`, `${dayStr}-mythic`,
        `card-${dayStr}-common`, `card-${dayStr}-uncommon`, `card-${dayStr}-rare`, `card-${dayStr}-legendary`, `card-${dayStr}-mythic`,
        `bombshell-${dayStr}-common`, `bombshell-${dayStr}-uncommon`, `bombshell-${dayStr}-rare`, `bombshell-${dayStr}-legendary`, `bombshell-${dayStr}-mythic`
      ];

      const { data, error } = await this.client
        .from('global_supply')
        .select('card_id_rarity, supply')
        .in('card_id_rarity', targetKeys);

      if (error) {
        console.error('[SupabaseService] Query error for card supply:', error);
        return breakdown;
      }

      (data || []).forEach((row: CardSupplyData) => {
        const key = row.card_id_rarity || '';
        const qty = Number(row.supply) || 0;
        breakdown.totalClaimed += qty;

        const tiers: Array<'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic'> = [
          'common', 'uncommon', 'rare', 'legendary', 'mythic'
        ];

        for (const tier of tiers) {
          if (key === `${dayStr}-${tier}` || key === `card-${dayStr}-${tier}`) {
            breakdown[tier] += qty;
            breakdown.totalStandard += qty;
            break;
          } else if (key === `bombshell-${dayStr}-${tier}`) {
            const bsKey = `bombshell_${tier}` as const;
            breakdown[bsKey] += qty;
            breakdown.totalBombshell += qty;
            break;
          }
        }
      });

      return breakdown;
    } catch (err) {
      console.warn('[SupabaseService] Failed to fetch card supply:', err);
      return breakdown;
    }
  }

  /**
   * Fetch top leaderboard scores for a given song
   */
  public async getLeaderboard(songId: string, limit = 5): Promise<LeaderboardEntry[]> {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('gameplay_records')
        .select('*')
        .eq('song_id', songId)
        .order('score', { ascending: false })
        .limit(limit);

      if (error || !data) return [];
      return data as LeaderboardEntry[];
    } catch (err) {
      console.warn('[SupabaseService] Failed to fetch leaderboard:', err);
      return [];
    }
  }

  /**
   * Fetch recent global telemetry activity (Voyeur)
   */
  public async getRecentActivity(limit = 5): Promise<LeaderboardEntry[]> {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('gameplay_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];
      return data as LeaderboardEntry[];
    } catch (err) {
      console.warn('[SupabaseService] Failed to fetch recent activity:', err);
      return [];
    }
  }
}

export const supabaseService = new SupabaseService();
