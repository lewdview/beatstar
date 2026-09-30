import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { CONFIG } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View all available commands for the 365 & PIM Discord Bot');

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('⚡ PIM : th3v4ult — COMMAND DIRECTORY')
    .setDescription('Explore the 365 calendar track catalog, collectible cards, live drop telemetries, and the forge economy.')
    .setColor(CONFIG.COLORS.PRIMARY)
    .addFields(
      {
        name: '🎵 365 TRACK CATALOG',
        value: [
          '`/today` — View today\'s daily track release, audio player, and playable highway.',
          '`/song [day] [query]` — Look up any track across all 365 days by day number or search keyword.'
        ].join('\n'),
        inline: false
      },
      {
        name: '🃏 COLLECTIBLE CARDS & GACHA',
        value: [
          '`/card [day]` — Inspect card rarities, burn token yields, and live Supabase supply numbers.',
          '`/gacha [pack]` — Simulate opening a Collector Pack with Economy v2.1 drop rates and pity.',
          '`/forge` — View token burn yields, rarity upgrades (150 V⚡), and targeted pull costs (500 V⚡).'
        ].join('\n'),
        inline: false
      },
      {
        name: '🏆 LEADERBOARDS & STATUS',
        value: [
          '`/leaderboard [day]` — View top high scores and platinum runs for any song release.'
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({
      text: 'PIM : Poetry in Motion • Base EVM Mainnet',
      iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('🌐 Launch PIM Vault Web App')
      .setStyle(ButtonStyle.Link)
      .setURL(CONFIG.PIM_WEB_URL),
    new ButtonBuilder()
      .setLabel('🎧 Listen Jukebox')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/listen`)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}
