import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { catalogService, SongMetadata } from '../services/catalogService.js';
import { CONFIG } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('song')
  .setDescription('Look up any of the 365 daily track releases by Day or Title query')
  .addIntegerOption(opt => 
    opt.setName('day')
      .setDescription('Calendar day of release (1-365)')
      .setMinValue(1)
      .setMaxValue(365)
      .setRequired(false)
  )
  .addStringOption(opt => 
    opt.setName('query')
      .setDescription('Search by track title, artist, or tag')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const day = interaction.options.getInteger('day');
  const query = interaction.options.getString('query');

  let song: SongMetadata | undefined;

  if (day) {
    song = catalogService.getSongByDay(day);
    if (!song) {
      await interaction.reply({
        content: `❌ No track found for **Day ${day}**.`,
        ephemeral: true
      });
      return;
    }
  } else if (query) {
    const results = catalogService.searchSongs(query, 1);
    if (results.length === 0) {
      await interaction.reply({
        content: `❌ No songs found matching **"${query}"**.`,
        ephemeral: true
      });
      return;
    }
    song = results[0];
  } else {
    // Default to current day
    song = catalogService.getSongByDay(catalogService.getCurrentDayOfYear());
  }

  if (!song) {
    await interaction.reply({
      content: `❌ Could not locate song data.`,
      ephemeral: true
    });
    return;
  }

  const durationMin = song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : 'N/A';
  const stagesSummary = song.stages 
    ? song.stages.map(s => `• **${s.name}**: \`${s.difficulty}\` (${s.noteCount} notes)`).join('\n')
    : 'Standard 3-lane rhythmic road';

  const embed = new EmbedBuilder()
    .setTitle(`🎵 TRACK // DAY ${String(song.day).padStart(3, '0')}: ${song.title.toUpperCase()}`)
    .setDescription(`*Artist:* **${song.artist}**\n${song.description || ''}`)
    .setColor(CONFIG.COLORS.CYAN)
    .addFields(
      { name: 'TEMPO', value: `\`${song.bpm} BPM\``, inline: true },
      { name: 'DURATION', value: `\`${durationMin}\``, inline: true },
      { name: 'DIFFICULTY', value: `\`LVL ${song.difficultyLevel || 5}/10\``, inline: true },
      { name: 'STAGES BREAKDOWN', value: stagesSummary, inline: false }
    );

  if (song.coverArt) {
    embed.setImage(song.coverArt);
  }

  embed.setFooter({
    text: `PIM 365 Architecture • ID: ${song.id}`,
    iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('▶ Launch Playable Highway')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/game?song=${song.id}`),
    new ButtonBuilder()
      .setLabel('🎧 Stream MP3')
      .setStyle(ButtonStyle.Link)
      .setURL(song.audioUrl || `${CONFIG.PIM_WEB_URL}/listen`)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}
