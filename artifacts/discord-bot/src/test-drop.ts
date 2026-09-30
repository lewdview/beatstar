import { Client, GatewayIntentBits, Events } from 'discord.js';
import { SchedulerService } from './services/schedulerService.js';
import { CONFIG } from './config.js';

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] 
});

client.once(Events.ClientReady, async () => {
  console.log('[TestDrop] Logged in as', client.user?.tag);
  const scheduler = new SchedulerService(client);
  const targetChannel = CONFIG.DAILY_ANNOUNCEMENT_CHANNEL_ID || '1476799520225366107';
  console.log(`[TestDrop] Broadcasting drop to channel ${targetChannel}...`);
  await scheduler.postDailyDrop(targetChannel);
  console.log('[TestDrop] Finished! Exiting.');
  client.destroy();
  process.exit(0);
});

client.login(CONFIG.BOT_TOKEN);
