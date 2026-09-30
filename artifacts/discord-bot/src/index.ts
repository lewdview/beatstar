import { Client, GatewayIntentBits, Collection, Interaction, Events } from 'discord.js';
import { CONFIG } from './config.js';
import { SchedulerService } from './services/schedulerService.js';
import { deployCommands } from './deploy-commands.js';

// Import commands
import * as todayCommand from './commands/today.js';
import * as songCommand from './commands/song.js';
import * as cardCommand from './commands/card.js';
import * as gachaCommand from './commands/gacha.js';
import * as forgeCommand from './commands/forge.js';
import * as leaderboardCommand from './commands/leaderboard.js';
import * as helpCommand from './commands/help.js';
import * as dropCommand from './commands/drop.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Setup command registry
const commands = new Collection<string, any>();
const commandList = [
  todayCommand,
  songCommand,
  cardCommand,
  gachaCommand,
  forgeCommand,
  leaderboardCommand,
  helpCommand,
  dropCommand
];

for (const cmd of commandList) {
  if ('data' in cmd && 'execute' in cmd) {
    commands.set(cmd.data.name, cmd);
  }
}

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`\n======================================================`);
  console.log(`⚡ PIM : th3v4ult Discord Bot is ONLINE!`);
  console.log(`🤖 Logged in as: ${c.user.tag} (ID: ${c.user.id})`);
  console.log(`📊 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`======================================================\n`);

  // Auto-deploy slash commands on startup if token is valid
  try {
    await deployCommands();
  } catch (err) {
    console.warn('[Bot] Note: Slash command deployment will run when token is configured.');
  }

  // Start daily drop scheduler
  const scheduler = new SchedulerService(client);
  scheduler.start();
});

// Slash Command Interaction Handler
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    console.error(`[Interaction] No command matching ${interaction.commandName} found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Interaction] Error executing ${interaction.commandName}:`, error);
    const replyOptions = {
      content: '❌ An unexpected error occurred while executing this command.',
      ephemeral: true
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
});

// Start bot
if (!CONFIG.BOT_TOKEN) {
  console.warn('\n⚠️  WARNING: DISCORD_BOT_TOKEN is not set in artifacts/discord-bot/.env!');
  console.warn('   Please copy artifacts/discord-bot/.env.example to .env and insert your bot token.\n');
} else {
  client.login(CONFIG.BOT_TOKEN).catch((err) => {
    console.error('❌ Failed to login to Discord:', err);
  });
}
