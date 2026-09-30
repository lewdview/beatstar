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
  .setName('forge')
  .setDescription('View PIM Forge mechanics, token burn yields, and upgrade formulas');

export async function execute(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle('⚡ THE FORGE // ECONOMY v2.1 PROTOCOL')
    .setDescription('Deconstruct cards, forge upgrades, and convert digital status into Base EVM tokens.')
    .setColor(CONFIG.COLORS.ORANGE)
    .addFields(
      {
        name: '🔥 CARD DECONSTRUCTION (BURN VALUES)',
        value: [
          '• **Common**: `+3 V⚡` *(15s audio preview)*',
          '• **Uncommon**: `+10 V⚡` *(60s audio preview)*',
          '• **Rare**: `+30 V⚡` *(Full track unlock)*',
          '• **Legendary**: `+80 V⚡` *(Full track unlock)*',
          '• **Mythic**: `+200 V⚡` *(Full track + Session Stems)*'
        ].join('\n'),
        inline: false
      },
      {
        name: '🎯 TARGETED PULL',
        value: 'Spend **500 $V⚡** to forge any specific card from the entire 365 catalog directly.',
        inline: false
      },
      {
        name: '⬆ RARITY UPGRADE',
        value: 'Spend **150 $V⚡** to promote an owned card to the next rarity tier.',
        inline: false
      },
      {
        name: '🧬 DUPLICATE FUSION',
        value: 'Combine **3 identical cards** (same day & rarity) to automatically forge 1 card of the superior rarity tier at 0 token cost.',
        inline: false
      }
    )
    .setFooter({
      text: 'PIM Forge Architecture • Base EVM Mainnet',
      iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('🔥 Enter The Forge')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/forge`)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}
