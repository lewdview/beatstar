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
  .setName('today')
  .setDescription('View today\'s 365 calendar track release and collectible card drop');

export async function execute(interaction: ChatInputCommandInteraction) {
  const currentDay = catalogService.getCurrentDayOfYear();
  const song = catalogService.getSongByDay(currentDay);
  const card = catalogService.getCardByDay(currentDay);

  if (!song) {
    await interaction.reply({
      content: `❌ Could not find track metadata for Day ${currentDay}.`,
      ephemeral: true
    });
    return;
  }

  const durationMin = song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : 'N/A';
  const moodTagsFormatted = (song.moodTags || []).map(t => `#${t}`).join(' ') || 'N/A';
  const genreFormatted = (song.genre || []).join(' / ') || 'Alternative';

  const embed = new EmbedBuilder()
    .setTitle(`⚡ TODAY'S DROP // DAY ${String(currentDay).padStart(3, '0')} OF 365`)
    .setDescription(`**"${song.title}"** by **${song.artist}**\n*${song.description || 'PIM Poetry in Motion daily calendar release.'}*`)
    .setColor(CONFIG.COLORS.PRIMARY)
    .addFields(
      { name: 'TEMPO & DURATION', value: `\`${song.bpm} BPM\` • \`${durationMin}\``, inline: true },
      { name: 'DIFFICULTY', value: `\`LVL ${song.difficultyLevel || 5}/10\``, inline: true },
      { name: 'GENRE', value: `\`${genreFormatted}\``, inline: true },
      { name: 'MOOD & TAGS', value: `\`${song.mood || 'neutral'}\` • ${moodTagsFormatted}`, inline: false }
    );

  if (song.coverArt) {
    embed.setImage(song.coverArt);
  }

  const supplies = await supabaseService.getCardSupply(currentDay);

  if (card) {
    embed.addFields({
      name: 'COLLECTIBLE CARD UNLOCK',
      value: `**${card.title}** • Rarity: \`${card.rarity.toUpperCase()}\` • \`${supplies.totalClaimed} Claimed\` (${supplies.totalStandard} Standard • ${supplies.totalBombshell} Bombshell)`,
      inline: false
    });
  }

  embed.setFooter({
    text: `PIM : th3v4ult — 365 Days of Light & Dark • Base EVM`,
    iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
  });
  embed.setTimestamp();

  // Action Buttons
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('▶ Play in PIM Vault')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/game?song=${song.id}`),
    new ButtonBuilder()
      .setLabel('🎧 Listen Audio')
      .setStyle(ButtonStyle.Link)
      .setURL(song.audioUrl || `${CONFIG.PIM_WEB_URL}/listen`),
    new ButtonBuilder()
      .setLabel('🃏 Open Codex')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/codex`)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}
