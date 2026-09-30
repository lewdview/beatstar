import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { catalogService } from '../services/catalogService.js';
import { supabaseService } from '../services/supabaseService.js';
import { CONFIG } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View top high scores and platinum runs for any 365 track')
  .addIntegerOption(opt => 
    opt.setName('day')
      .setDescription('Day of the song release (1-365)')
      .setMinValue(1)
      .setMaxValue(365)
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const day = interaction.options.getInteger('day') || catalogService.getCurrentDayOfYear();
  const song = catalogService.getSongByDay(day);

  if (!song) {
    await interaction.reply({
      content: `❌ Song for **Day ${day}** not found.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  const records = await supabaseService.getLeaderboard(song.id, 5);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 LEADERBOARD // DAY ${String(day).padStart(3, '0')}: ${song.title.toUpperCase()}`)
    .setDescription(`*Top rhythmic performances on the 3-lane perspective highway.*`)
    .setColor(CONFIG.COLORS.GOLD);

  if (records.length === 0) {
    embed.addFields({
      name: 'NO SCORES RECORDED YET',
      value: 'Be the first player to achieve a Platinum run on this track!',
      inline: false
    });
  } else {
    const medalIcons: Record<string, string> = {
      PLATINUM: '💎 PLATINUM',
      GOLD: '🥇 GOLD',
      SILVER: '🥈 SILVER',
      BRONZE: '🥉 BRONZE',
      NONE: '⚪ RECORD'
    };

    const leaderboardText = records.map((r, index) => {
      const medalStr = medalIcons[r.medal] || '⚪';
      const userShort = r.user_id ? `${r.user_id.slice(0, 6)}...${r.user_id.slice(-4)}` : 'Anonymous';
      const acc = (r.accuracy * 100).toFixed(1);
      return `**#${index + 1}** \`${userShort}\` — **${r.score.toLocaleString()} pts** (${acc}% acc, max combo: ${r.max_combo}x) [${medalStr}]`;
    }).join('\n');

    embed.addFields({
      name: 'TOP RECORDED RUNS',
      value: leaderboardText,
      inline: false
    });
  }

  if (song.coverArt) {
    embed.setThumbnail(song.coverArt);
  }

  embed.setFooter({
    text: `PIM Telemetry Engine • Base EVM`,
    iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('▶ Beat This Score in Vault')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/game?song=${song.id}`),
    new ButtonBuilder()
      .setLabel('📡 Global Voyeur Feed')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/voyeur`)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}
