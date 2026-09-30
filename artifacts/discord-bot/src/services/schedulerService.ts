import cron from 'node-cron';
import { 
  Client, 
  ForumChannel, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  ThreadAutoArchiveDuration 
} from 'discord.js';
import { CONFIG } from '../config.js';
import { catalogService } from './catalogService.js';

export class SchedulerService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  public start() {
    // Schedule daily drop announcement at 00:00 UTC every day
    cron.schedule('0 0 * * *', async () => {
      console.log('[SchedulerService] Triggering Midnight 365 Daily Drop Announcement...');
      await this.postDailyDrop();
    }, {
      timezone: 'UTC'
    });

    console.log('[SchedulerService] Daily drop announcer scheduled for 00:00 UTC.');
  }

  public async postDailyDrop(channelIdOverride?: string) {
    const channelId = channelIdOverride || CONFIG.DAILY_ANNOUNCEMENT_CHANNEL_ID;
    if (!channelId) {
      console.log('[SchedulerService] No DAILY_ANNOUNCEMENT_CHANNEL_ID set. Skipping automatic drop.');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        console.warn(`[SchedulerService] Channel ${channelId} not found.`);
        return;
      }

      const currentDay = catalogService.getCurrentDayOfYear();
      const song = catalogService.getSongByDay(currentDay);
      const card = catalogService.getCardByDay(currentDay);

      if (!song) {
        console.warn(`[SchedulerService] No song found for day ${currentDay}`);
        return;
      }

      const durationMin = song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : 'N/A';
      const moodTags = (song.moodTags || []).map(t => `#${t}`).join(' ') || 'N/A';
      const genreFormatted = (song.genre || []).join(' / ') || 'Alternative';

      const embed = new EmbedBuilder()
        .setTitle(`⚡ 365 DAILY DROP // DAY ${String(currentDay).padStart(3, '0')} IS LIVE!`)
        .setDescription(`**"${song.title}"** by **${song.artist}**\n\n*${song.description || 'New daily track unlocked in the PIM Vault!'}*`)
        .setColor(CONFIG.COLORS.PRIMARY)
        .addFields(
          { name: 'TEMPO & DURATION', value: `\`${song.bpm} BPM\` • \`${durationMin}\``, inline: true },
          { name: 'DIFFICULTY', value: `\`LVL ${song.difficultyLevel || 5}/10\``, inline: true },
          { name: 'GENRE', value: `\`${genreFormatted}\``, inline: true },
          { name: 'CARD DROP', value: card ? `\`${card.rarity.toUpperCase()}\` • **${card.title}** (Max Supply: ${card.maxSupply || 100})` : 'Unlocked', inline: false }
        );

      if (song.coverArt) {
        embed.setImage(song.coverArt);
      }

      embed.setFooter({
        text: 'PIM : th3v4ult • 365 Days of Light & Dark',
        iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
      });
      embed.setTimestamp();

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('▶ Play Daily Highway')
          .setStyle(ButtonStyle.Link)
          .setURL(`${CONFIG.PIM_WEB_URL}/game?song=${song.id}`),
        new ButtonBuilder()
          .setLabel('🎧 Listen')
          .setStyle(ButtonStyle.Link)
          .setURL(song.audioUrl || `${CONFIG.PIM_WEB_URL}/listen`),
        new ButtonBuilder()
          .setLabel('🎁 Claim Pack')
          .setStyle(ButtonStyle.Link)
          .setURL(`${CONFIG.PIM_WEB_URL}/shop`)
      );

      // Handle Discord Forum Channel (Type 15) -> Create a new Forum Thread / Post
      if (channel.type === ChannelType.GuildForum || channel instanceof ForumChannel) {
        const forum = channel as ForumChannel;
        const threadName = `⚡ Day ${String(currentDay).padStart(3, '0')}: ${song.title} — ${song.artist}`;
        
        const thread = await forum.threads.create({
          name: threadName,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
          message: {
            content: `🚨 **NEW 365 DAILY RELEASE UNLOCKED!** 🚨\nWelcome to Day **${currentDay} of 365** in the PIM Vault. Discuss the track, post your high scores, and share your card pulls below!`,
            embeds: [embed],
            components: [row]
          }
        });

        console.log(`[SchedulerService] Successfully created Forum Thread "${threadName}" (ID: ${thread.id}) in #${forum.name}`);
        return;
      }

      // Handle standard text or announcement channels
      if (channel.isTextBased() && 'send' in channel) {
        await (channel as any).send({
          content: `🚨 **NEW 365 DAILY RELEASE UNLOCKED!** 🚨`,
          embeds: [embed],
          components: [row]
        });

        console.log(`[SchedulerService] Successfully announced Day ${currentDay} in #${(channel as any).name}`);
        return;
      }

      console.warn(`[SchedulerService] Channel ${channelId} is neither forum nor text-based sendable.`);
    } catch (err: any) {
      console.error('[SchedulerService] Failed to post daily drop:', err);
    }
  }
}
