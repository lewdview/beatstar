import { REST, Routes } from 'discord.js';
import { CONFIG } from './config.js';
import { data as todayCommand } from './commands/today.js';
import { data as songCommand } from './commands/song.js';
import { data as cardCommand } from './commands/card.js';
import { data as gachaCommand } from './commands/gacha.js';
import { data as forgeCommand } from './commands/forge.js';
import { data as leaderboardCommand } from './commands/leaderboard.js';
import { data as helpCommand } from './commands/help.js';
import { data as dropCommand } from './commands/drop.js';

const commands = [
  todayCommand.toJSON(),
  songCommand.toJSON(),
  cardCommand.toJSON(),
  gachaCommand.toJSON(),
  forgeCommand.toJSON(),
  leaderboardCommand.toJSON(),
  helpCommand.toJSON(),
  dropCommand.toJSON()
];

const rest = new REST({ version: '10' }).setToken(CONFIG.BOT_TOKEN);

export async function deployCommands() {
  if (!CONFIG.BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN is missing in environment variables (.env). Cannot deploy slash commands.');
    return;
  }

  try {
    console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands...`);

    if (CONFIG.GUILD_ID) {
      // Guild-specific registration (instant update, perfect for testing)
      console.log(`[Deploy] Registering commands to Guild ID: ${CONFIG.GUILD_ID}...`);
      await rest.put(
        Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Successfully registered application commands to test guild!');
    } else {
      // Global registration (takes a few minutes to propagate across all Discord servers)
      console.log(`[Deploy] Registering commands globally for Application ID: ${CONFIG.CLIENT_ID}...`);
      await rest.put(
        Routes.applicationCommands(CONFIG.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Successfully registered global application commands!');
    }
  } catch (error) {
    console.error('❌ Failed to deploy slash commands:', error);
  }
}

// Allow direct CLI execution: `node dist/deploy-commands.js` or `tsx src/deploy-commands.ts`
if (process.argv[1]?.includes('deploy-commands')) {
  deployCommands();
}
