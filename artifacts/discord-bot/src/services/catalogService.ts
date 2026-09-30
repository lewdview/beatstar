import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SongMetadata {
  id: string;
  day: number;
  date?: string;
  title: string;
  artist: string;
  bpm: number;
  duration?: number;
  mood?: string;
  valence?: number;
  moodTags?: string[];
  description?: string;
  audioUrl?: string;
  coverArt?: string;
  difficultyLevel?: number;
  genre?: string[];
  stages?: Array<{
    stage: number;
    name: string;
    difficulty: string;
    startTime: number;
    endTime: number;
    noteCount: number;
  }>;
}

export interface CardMetadata {
  id: string;
  day: number;
  title: string;
  storageTitle?: string;
  mood?: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic';
  energy?: number;
  valence?: number;
  tempo?: number;
  genre?: string[];
  tags?: string[];
  coverUrl?: string;
  audioUrl?: string;
  description?: string;
  claimedCount?: number;
  maxSupply?: number;
  song?: string;
}

export interface PackMetadata {
  category: string;
  label: string;
  description: string;
  icon: string;
  accent: string;
  rates: number[]; // [common, uncommon, rare, legendary, mythic]
  tiers: Array<{
    size: string;
    cardCount: number;
    price: string;
    priceValue: number;
  }>;
}

class CatalogService {
  private songs: SongMetadata[] = [];
  private cards: CardMetadata[] = [];
  private packs: Record<string, PackMetadata> = {};
  private initialized = false;

  constructor() {
    this.loadCatalogs();
  }

  private loadCatalogs() {
    try {
      // Possible data locations (bundled local data vs monorepo workspace)
      const candidateDataDirs = [
        path.resolve(__dirname, '../../data'),
        path.resolve(__dirname, '../data'),
        path.resolve(process.cwd(), 'data'),
        path.resolve(__dirname, '../../../beatstar-vault/src/data')
      ];

      const candidatePublicDirs = [
        path.resolve(__dirname, '../../data'),
        path.resolve(__dirname, '../data'),
        path.resolve(process.cwd(), 'data'),
        path.resolve(__dirname, '../../../beatstar-vault/public/data')
      ];

      // 1. Load Songs
      for (const dir of candidateDataDirs) {
        const songPath = path.join(dir, 'song_catalog.json');
        if (fs.existsSync(songPath)) {
          this.songs = JSON.parse(fs.readFileSync(songPath, 'utf8'));
          break;
        }
      }

      // 2. Load Cards
      for (const dir of candidateDataDirs) {
        const cardPath = path.join(dir, 'card_catalog.json');
        if (fs.existsSync(cardPath)) {
          this.cards = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
          break;
        }
      }

      // 3. Load Packs
      for (const dir of candidatePublicDirs) {
        const packPath = path.join(dir, 'packs.json');
        if (fs.existsSync(packPath)) {
          this.packs = JSON.parse(fs.readFileSync(packPath, 'utf8'));
          break;
        }
      }

      this.initialized = true;
      console.log(`[CatalogService] Loaded ${this.songs.length} songs, ${this.cards.length} cards, ${Object.keys(this.packs).length} pack tiers.`);
    } catch (err) {
      console.error('[CatalogService] Error loading catalog files:', err);
    }
  }

  /**
   * Get current calendar Day of Year (1 - 365) in UTC
   */
  public getCurrentDayOfYear(): number {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    return Math.min(Math.max(day, 1), 365);
  }

  public getSongByDay(day: number): SongMetadata | undefined {
    return this.songs.find(s => s.day === day);
  }

  public getCardByDay(day: number): CardMetadata | undefined {
    return this.cards.find(c => c.day === day);
  }

  public searchSongs(query: string, limit = 5): SongMetadata[] {
    const q = query.toLowerCase().trim();
    return this.songs
      .filter(s => 
        s.title.toLowerCase().includes(q) || 
        s.artist.toLowerCase().includes(q) ||
        (s.moodTags && s.moodTags.some(t => t.toLowerCase().includes(q))) ||
        (s.genre && s.genre.some(g => g.toLowerCase().includes(q)))
      )
      .slice(0, limit);
  }

  public getPack(category: string): PackMetadata | undefined {
    return this.packs[category.toLowerCase()];
  }

  public getAllPacks(): Record<string, PackMetadata> {
    return this.packs;
  }

  public getSongCount(): number {
    return this.songs.length;
  }

  public getCardCount(): number {
    return this.cards.length;
  }
}

export const catalogService = new CatalogService();
