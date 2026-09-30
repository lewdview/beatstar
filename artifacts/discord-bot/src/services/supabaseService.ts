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
   * Get card supply counts across rarities for a given day
   */
  public async getCardSupply(day: number): Promise<Record<string, number>> {
    const defaultSupplies: Record<string, number> = {
      common: 0,
      uncommon: 0,
      rare: 0,
      legendary: 0,
      mythic: 0
    };

    if (!this.client) return defaultSupplies;

    try {
      const cardPrefix = `card-${day}-`;
      const { data, error } = await this.client
        .from('global_supply')
        .select('card_id_rarity, supply')
        .like('card_id_rarity', `${cardPrefix}%`);

      if (error || !data) {
        return defaultSupplies;
      }

      data.forEach((row: CardSupplyData) => {
        const parts = row.card_id_rarity.split('-');
        const rarity = parts[parts.length - 1]?.toLowerCase();
        if (rarity && rarity in defaultSupplies) {
          defaultSupplies[rarity] = row.supply;
        }
      });

      return defaultSupplies;
    } catch (err) {
      console.warn('[SupabaseService] Failed to fetch card supply:', err);
      return defaultSupplies;
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
