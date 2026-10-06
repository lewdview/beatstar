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
  .setName('card')
  .setDescription('Inspect collectible card specs, live supply, burn tokens, and holographic rarities')
  .addIntegerOption(opt => 
    opt.setName('day')
      .setDescription('Day of the card release (1-365)')
      .setMinValue(1)
      .setMaxValue(365)
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const day = interaction.options.getInteger('day') || catalogService.getCurrentDayOfYear();
  const card = catalogService.getCardByDay(day);

  if (!card) {
    await interaction.reply({
      content: `❌ Card for **Day ${day}** not found in vault registry.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  // Query Supabase for live supply
  const supplies = await supabaseService.getCardSupply(day);
  const rarityUpper = card.rarity.toUpperCase();
  const color = CONFIG.COLORS.RARITY[card.rarity.toLowerCase()] || CONFIG.COLORS.GOLD;

  // Economy Burn Rates: Common: 3, Uncommon: 10, Rare: 30, Legendary: 80, Mythic: 200
  const burnValues: Record<string, number> = {
    common: 3,
    uncommon: 10,
    rare: 30,
    legendary: 80,
    mythic: 200
  };
  const burnValue = burnValues[card.rarity.toLowerCase()] || 10;

  const embed = new EmbedBuilder()
    .setTitle(`🃏 VAULT CARD // DAY ${String(card.day).padStart(3, '0')}: ${card.title.toUpperCase()}`)
    .setDescription(`*${card.description || 'PIM digital collectible card with audio stem access.'}*`)
    .setColor(color)
    .addFields(
      { name: 'BASE RARITY', value: `\`${rarityUpper}\``, inline: true },
      { name: 'BURN YIELD', value: `\`+${burnValue} V⚡\``, inline: true },
      { name: 'MOOD / TEMPO', value: `\`${card.mood || 'dark'}\` • \`${card.tempo || 120} BPM\``, inline: true },
      { 
        name: `⚡ TOTAL CARDS CLAIMED: ${supplies.totalClaimed}`,
        value: `\`${supplies.totalStandard} Standard Minted\` • \`${supplies.totalBombshell} Bombshell Minted\``,
        inline: false
      },
      { 
        name: 'STANDARD EDITIONS (MINTED / CAP)', 
        value: [
          `• Common: \`${supplies.common} / 2,000\``,
          `• Uncommon: \`${supplies.uncommon} / 500\``,
          `• Rare: \`${supplies.rare} / 100\``,
          `• Legendary: \`${supplies.legendary} / 10\``,
          `• Mythic: \`${supplies.mythic} / 1\``
        ].join('\n'), 
        inline: true 
      }
    );

  if (supplies.totalBombshell > 0) {
    embed.addFields({
      name: 'BOMBSHELL EDITIONS (MINTED / CAP)',
      value: [
        `• Common: \`${supplies.bombshell_common} / 2,000\``,
        `• Uncommon: \`${supplies.bombshell_uncommon} / 500\``,
        `• Rare: \`${supplies.bombshell_rare} / 100\``,
        `• Legendary: \`${supplies.bombshell_legendary} / 10\``,
        `• Mythic: \`${supplies.bombshell_mythic} / 1\``
      ].join('\n'),
      inline: true
    });
  }

  if (card.coverUrl) {
    embed.setImage(card.coverUrl);
  }

  embed.setFooter({
    text: `PIM Economy v2.1 • Card ID: ${card.id} • Live Edge Sync`,
    iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('🔥 Open Forge')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/forge`),
    new ButtonBuilder()
      .setLabel('📖 View in Codex')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/codex`)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}
