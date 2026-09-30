# PIM & 365 Discord Bot (`@workspace/discord-bot`)

A specialized Discord bot for the **PIM : th3v4ult - poetry in motion** ecosystem and the **365 Calendar Track Releases**.

## ⚡ Features
- **365 Daily Drops**: Automatically posts the daily track release to your announcements channel at 00:00 midnight UTC with direct links to the playable HTML5 canvas highway.
- **`/today`**: View today's track drop, artwork, BPM, mood, and card unlock.
- **`/song [day] [query]`**: Search and inspect any of the 365 calendar tracks with direct CDN MP3 streams.
- **`/card [day]`**: View collectible card holographic rarities, token burn yield ($V\text{⚡}$), and live Supabase minted supply.
- **`/gacha [pack]`**: Interactive in-chat pack opener supporting Free, Bombshell, Taste, Light, and Dark packs with Economy v2.1 drop rates and jackpot rolls.
- **`/forge`**: Look up burn token values, rarity upgrades, and duplicate fusion formulas.
- **`/leaderboard [day]`**: Global high score leaderboard and Platinum medals.

---

## 🚀 Setup & Installation

### 1. Developer Portal Configuration
1. In the **Discord Developer Portal** under your application (`1554837255514755092`):
   - **OAuth2 / Installation**:
     - Check **Guild Install**.
     - Guild Install Scopes: Select `bot` and `applications.commands`.
     - Permissions: Select `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`, `Use External Emojis`, `Add Reactions`.
   - **Bot Tab**:
     - Click **Reset Token** and copy your **Bot Token**.
     - Enable **Privileged Gateway Intents**: `Message Content Intent` and `Server Members Intent`.

2. **Invite the Bot to your Discord Server**:
   [Click here to invite the bot with one click](https://discord.com/oauth2/authorize?client_id=1554837255514755092&permissions=277025778752&scope=bot%20applications.commands)

### 2. Configure `.env`
Create `.env` in `artifacts/discord-bot/.env`:
```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=1554837255514755092
DISCORD_GUILD_ID=your_discord_server_id_here
DAILY_ANNOUNCEMENT_CHANNEL_ID=your_announcement_channel_id_here
```

### 3. Run the Bot
```bash
# From workspace root:
pnpm --filter @workspace/discord-bot dev

# Or direct:
cd artifacts/discord-bot
pnpm dev
```
