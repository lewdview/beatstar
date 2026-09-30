import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { catalogService, CardMetadata } from '../services/catalogService.js';
import { CONFIG } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('gacha')
  .setDescription('Simulate opening a PIM Collector Pack with Economy v2.1 drop rates')
  .addStringOption(opt => 
    opt.setName('pack')
      .setDescription('Type of pack to open')
      .setRequired(false)
      .addChoices(
        { name: '🎁 Daily Free Pack', value: 'free' },
        { name: '💖 Bombshell Collector Pack', value: 'bombshell' },
        { name: '🎧 Taste Pack (Recent Catalog)', value: 'taste' },
        { name: '☀️ Light Mood Pack', value: 'light' },
        { name: '🌑 Dark Mood Pack', value: 'dark' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const packType = interaction.options.getString('pack') || 'free';
  const packInfo = catalogService.getPack(packType) || {
    label: 'COLLECTOR PACK',
    rates: [60, 25, 12, 3, 0],
    icon: '📦',
    accent: '#FF1493'
  };

  // Roll rarity based on rates: [Common, Uncommon, Rare, Legendary, Mythic]
  // rates: [60, 25, 12, 3, 0] -> cumulative: 60, 85, 97, 100
  const rand = Math.random() * 100;
  let rolledRarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic' = 'common';
  
  if (rand < 60) {
    rolledRarity = 'common';
  } else if (rand < 85) {
    rolledRarity = 'uncommon';
  } else if (rand < 97) {
    rolledRarity = 'rare';
  } else if (rand < 99.8) {
    rolledRarity = 'legendary';
  } else {
    rolledRarity = 'mythic';
  }

  // Pick a random day 1-365
  const randomDay = Math.floor(Math.random() * 365) + 1;
  const card = catalogService.getCardByDay(randomDay);

  const rarityName = rolledRarity.toUpperCase();
  const color = CONFIG.COLORS.RARITY[rolledRarity] || CONFIG.COLORS.GOLD;
  const isJackpot = rolledRarity === 'legendary' || rolledRarity === 'mythic';

  const embed = new EmbedBuilder()
    .setTitle(`${packInfo.icon || '📦'} GACHA PULL // ${packInfo.label}`)
    .setDescription(
      isJackpot 
        ? `🔥 **JACKPOT PULL!** You unlocked a **${rarityName}** tier collectible!`
        : `You pulled **${rarityName}** rarity from the ${packInfo.label}!`
    )
    .setColor(color)
    .addFields(
      { name: 'CARD NAME', value: `**${card ? card.title : `Day ${randomDay} Drop`}**`, inline: true },
      { name: 'RARITY', value: `\`${rarityName}\``, inline: true },
      { name: 'DAY OF YEAR', value: `\`Day ${randomDay} of 365\``, inline: true }
    );

  if (card && card.coverUrl) {
    embed.setImage(card.coverUrl);
  }

  embed.setFooter({
    text: `PIM Economy v2.1 • Roll: ${rand.toFixed(1)}% | Simulated Gacha Engine`,
    iconURL: 'https://pim.th3scr1b3.art/favicon.ico'
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('🎁 Open Live Pack in Vault')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/shop`),
    new ButtonBuilder()
      .setLabel('🔥 Forge Card')
      .setStyle(ButtonStyle.Link)
      .setURL(`${CONFIG.PIM_WEB_URL}/forge`)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row]
  });
}
