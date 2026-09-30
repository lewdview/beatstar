import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits
} from 'discord.js';
import { SchedulerService } from '../services/schedulerService.js';

export const data = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Test or manually trigger the 365 daily track announcement in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply({
    content: '⚡ Broadcasting 365 Daily Track Announcement...',
    ephemeral: true
  });

  const scheduler = new SchedulerService(interaction.client);
  await scheduler.postDailyDrop(interaction.channelId);
}
