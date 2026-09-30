import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from current directory or project root
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || '1554837255514755092',
  PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY || '7e9dfa50eb834e87097e19961ce4ef68e4a85a46f3b9b0cca852c0d04f439547',
  GUILD_ID: process.env.DISCORD_GUILD_ID || '',
  DAILY_ANNOUNCEMENT_CHANNEL_ID: process.env.DAILY_ANNOUNCEMENT_CHANNEL_ID || '',
  
  // Supabase Integration
  SUPABASE_URL: process.env.SUPABASE_URL || 'https://toemkhrfsbkfkutwcjkd.supabase.co',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvZW1raHJmc2JrZmt1dHdjamtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTQxNTQsImV4cCI6MjEwMzE5MDE1NH0.nAtlMU_ukqXMkIhKppwv1mxDKpxuwHa6ddQBBwK3Iu8',
  
  // PIM Web App Base URLs
  PIM_WEB_URL: process.env.PIM_WEB_URL || 'https://pim.th3scr1b3.art',
  CDN_BASE_URL: 'https://files.th3scr1b3.art',

  // PIM Brutalist Theme Colors (Numbers for Discord Embeds)
  COLORS: {
    PRIMARY: 0xFF1493,      // Hot Pink
    CYAN: 0x00E5FF,         // Neon Cyan
    GREEN: 0x39FF14,        // Neon Green
    GOLD: 0xE5B800,         // Power Gold
    PURPLE: 0xA855F7,       // Prismatic Purple
    ORANGE: 0xFF5500,       // Neon Orange
    DARK: 0x0C0C14,         // Corridor Charcoal
    WHITE: 0xFFFFFF,
    
    // Rarity Color Mapping
    RARITY: {
      common: 0x8E8E93,
      uncommon: 0x00E5FF,
      rare: 0x39FF14,
      legendary: 0xE5B800,
      mythic: 0xA855F7
    } as Record<string, number>
  }
};
