//Version 1.0.0

const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, SlashCommandBuilder, ChannelType, Partials } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const voteThreshold = 7; //Nombres de votes requis
const adminRoleId = 'id_admin_ici'; // ID des administrateurs (facultatif)
const validatedCategoryId = 'id_ici'; // Catégorie pour les demandes validées (archive)
const refusedCategoryId = 'id_ici'; // Catégorie pour les demandes refusées (archive)

client.once('ready', () => {
  console.log(` Hello world ! ${client.user.tag} est connecté`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, member } = interaction;

  if (commandName === 'demande_deban') { // si l'utilisateur ayant le rôle spécifique tape la commande /demande_deban
    // Vérification du rôle
    const requiredRole = 'id_ici'; //id du rôle pour utiliser utiliser cette commande
    if (!member.roles.cache.has(requiredRole)) {
      return interaction.reply({ content: "⭕┃ Vous n'avez pas la permission d'utiliser cette commande.", ephemeral: true }); // si l'utilisateur n'a pas le rôle spéficique
    }

    const username = options.getString('pseudo');
    const userId = options.getString('id');
    const desc = options.getString('description');
    const attachment = options.getAttachment('attachment');

    // Création d'un nouveau salon dans une catégorie spécifique
    const categoryId = 'id_ici'; //ID de la catégorie (exemple: affaires en cours)
    const category = interaction.guild.channels.cache.get(categoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: '⭕┃ Catégorie invalide. Veuillez contacter un administrateur.', ephemeral: true });
    }

    const channelName = `⏳┃affaire-${username}`;
    const debanChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      rateLimitPerUser: category.rateLimitPerUser,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: 'id_ici', // ID du rôle - pour une création d'un'salon privé et accessible aux personnes ayant le rôle spéficique
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
      ],
    });

    
    await interaction.reply({ content: `✅┃ Le salon ${debanChannel} a été créé pour cette demande.`, ephemeral: true });

    // Création de l'embed avec les informations fournies
    const embed = new EmbedBuilder()
      .setTitle('Nouvelle Demande de Deban')
      .setDescription(desc)
      .addFields(
        { name: 'Pseudo', value: username, inline: true },
        { name: 'ID', value: userId, inline: true },
        { name: 'Votes', value: `Acceptations: 0/${voteThreshold}
Refus: 0/${voteThreshold}`, inline: false }
      )
      .setColor('Blue')
      .setTimestamp();

    if (attachment && (attachment.contentType.startsWith('image/') || attachment.contentType.startsWith('video/'))) {
      embed.setImage(attachment.url);
      embed.addFields({ name: 'Pièce Jointe', value: '[Voir la pièce jointe](' + attachment.url + ')', inline: false });
    }
    //ajout de la réaction
    const debanMessage = await debanChannel.send({ embeds: [embed] });
    await debanMessage.react('✅');
    await debanMessage.react('⭕');

    const filter = (reaction, user) => {
      return ['✅', '⭕'].includes(reaction.emoji.name) && !user.bot;
    };

    const collector = debanMessage.createReactionCollector({ filter, time: 604800000 }); // 7 jours
// ici permet que les membres ajoute une vote en cliquant sur une réaction, iels peuvent changer d'avis ou se retirer, ça modifie automatiquement avec un délai de 2sec pour éviter les surcharges de l'app.
    const votes = { accept: new Set(), decline: new Set() };
    let updateTimeout;

    collector.on('collect', async (reaction, user) => {
      const userId = user.id;
      if (reaction.emoji.name === '✅') {
        votes.accept.add(userId);
        votes.decline.delete(userId);
      } else if (reaction.emoji.name === '⭕') {
        votes.decline.add(userId);
        votes.accept.delete(userId);
      }

      // Limiter la fréquence de mise à jour de l'embed pour éviter des surcharges
      if (!updateTimeout) {
        updateTimeout = setTimeout(async () => {
          embed.spliceFields(2, 1, {
            name: 'Votes',
            value: `Acceptations: ${votes.accept.size}/${voteThreshold}
Refus: ${votes.decline.size}/${voteThreshold}`,
            inline: false,
          });
          await debanMessage.edit({ embeds: [embed] });
          updateTimeout = null;

          // Vérification des seuils de vote

          //si le vote est majoritairement "validé"
          if (votes.accept.size >= voteThreshold) {
            await debanChannel.setParent(validatedCategoryId, { lockPermissions: true });
            await debanChannel.setName(`✅┃affaire-${username}-validé`);
            await debanChannel.send('✅┃La demande a été validée par le STAFF. Affaire classée.');
            collector.stop();
          // dans le cas de contraire si le vote est majoritairement "refusé"
          } else if (votes.decline.size >= voteThreshold) {
            await debanChannel.setParent(refusedCategoryId, { lockPermissions: true });
            await debanChannel.setName(`⭕┃affaire-${username}-refusé`);
            await debanChannel.send('⭕┃ La demande a été refusée par le STAFF. Affaire classée.');
            collector.stop();
          }
        }, 2000); // Mise à jour toutes les 2 secondes max
      }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
      if (reaction.message.id === debanMessage.id && ['✅', '⭕'].includes(reaction.emoji.name) && !user.bot) {
        const userId = user.id;
        if (reaction.emoji.name === '✅') {
          votes.accept.delete(userId);
        } else if (reaction.emoji.name === '⭕') {
          votes.decline.delete(userId);
        }

        // Limiter la fréquence de mise à jour de l'embed pour éviter des surcharges
        if (!updateTimeout) {
          updateTimeout = setTimeout(async () => {
            embed.spliceFields(2, 1, {
              name: 'Votes',
              value: `Acceptations: ${votes.accept.size}/${voteThreshold}
Refus: ${votes.decline.size}/${voteThreshold}`,
              inline: false,
            });
            await debanMessage.edit({ embeds: [embed] });
            updateTimeout = null;
          }, 2000); // Mise à jour toutes les 2 secondes max
        }
      }
    });

    
  }
});
//création de la commande slash lors du démarrage du bot
client.on('ready', async () => {
  const guild = client.guilds.cache.get('id_ici'); // ID du serveur
  if (!guild) return;

  const debanCommand = new SlashCommandBuilder()
    .setName('demande_deban')// nom de la commande
    .setDescription("Ouvre une affaire de demande de déban")
    .addStringOption(option =>
      option.setName('pseudo')
        .setDescription('Pseudo du membre banni')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Identifiant du membre banni(e)')
        .setRequired(true))
    .addAttachmentOption(option =>
      option.setName('attachment')
        .setDescription('Pièce jointe (image/vidéo) uniquement')
        .setRequired(true))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Description de la situation')
            .setRequired(false));

  await guild.commands.create(debanCommand);

});

client.login(process.env.TOKEN);
