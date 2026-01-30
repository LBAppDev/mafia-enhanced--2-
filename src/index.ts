import { Client, GatewayIntentBits, Events, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ComponentType, Interaction, UserSelectMenuBuilder } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as firebase from "firebase/app";
import { getDatabase, ref, set, get, update, remove, onValue, Database } from "firebase/database";
import { LobbyData, Player, GameState } from './types';
import { initializeGame } from './gameEngine';
import { generateFlavorText } from './gemini';

dotenv.config();

// --- WEB SERVER CONFIGURATION ---
const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

// Serve Frontend
app.use('/', express.static(distPath));
app.get('*', (req, res) => {
  // If requesting a file that exists, let express.static handle it.
  // Otherwise serve index.html for client-side routing.
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🌐 Web Server running on port ${PORT}`);
});

// --- FIREBASE CONFIGURATION (Bot Instance) ---
const firebaseConfig = {
  apiKey: "AIzaSyBuTatBkHL1m0Kz2LqHfqIHeQq8C3hpdkA",
  authDomain: "mafiaenhanced2.firebaseapp.com",
  projectId: "mafiaenhanced2",
  storageBucket: "mafiaenhanced2.firebasestorage.app",
  messagingSenderId: "746188840363",
  appId: "1:746188840363:web:c8364b324d33977f1b06ee",
  measurementId: "G-3Y4D2MN46E"
};

const fbApp = firebase.initializeApp(firebaseConfig, "DiscordBot"); 
const db: Database = getDatabase(fbApp);

// --- DISCORD BOT CONFIGURATION ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, c => {
  console.log(`🤖 Bot Ready! Logged in as ${c.user.tag}`);
  console.log(`NOTE: Game Logic Loop is DISABLED here. Logic must be run by an active Frontend client.`);
});

// --- VIEW UPDATER ---
// The Bot simply listens to Firebase. If the Frontend updates the game state, 
// the Bot reflects that change in the Discord Channel.
const lobbiesRef = ref(db, 'discord_lobbies');
onValue(lobbiesRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
        Object.keys(data).forEach(async (channelId) => {
            const lobby = data[channelId] as LobbyData;
            try {
                const channel = await client.channels.fetch(channelId) as TextChannel;
                
                if (channel && lobby.status === 'in-game') {
                   await updateGameView(channel, lobby);
                }
            } catch (e) {
                // Channel might have been deleted or bot kicked
                // console.warn(`Could not update view for ${channelId}`);
            }
        });
    }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'mafia') {
        const sub = interaction.options.getSubcommand();
        const channelId = interaction.channelId;

        if (sub === 'create') {
            const lobbySnapshot = await get(ref(db, `discord_lobbies/${channelId}`));
            
            if (lobbySnapshot.exists()) {
                await interaction.reply({ content: 'A game is already running here.', ephemeral: true });
                return;
            }

            const host = interaction.user;
            const initialPlayers: Record<string, Player> = {};
            initialPlayers[host.id] = { 
                id: host.id, 
                username: host.username, 
                name: host.username,
                isHost: true, 
                isAlive: true 
            };

            const newLobby: LobbyData = {
                channelId,
                hostId: host.id,
                status: 'waiting',
                players: initialPlayers
            };

            await set(ref(db, `discord_lobbies/${channelId}`), newLobby);

            await interaction.reply({ 
                content: '🕵️ **Mafia Lobby Created!**', 
                embeds: [renderLobbyEmbed(newLobby)],
                components: [renderLobbyButtons()]
            });
        }
    }
  }

  // --- BUTTON HANDLERS ---
  if (interaction.isButton()) {
      const channelId = interaction.channelId;
      const lobbyRef = ref(db, `discord_lobbies/${channelId}`);
      const snapshot = await get(lobbyRef);
      const lobby = snapshot.val() as LobbyData;

      if (!lobby) {
          return interaction.reply({content: "Game not found or expired.", ephemeral: true});
      }

      if (interaction.customId === 'join_game') {
          if (lobby.status !== 'waiting') return interaction.reply({ content: 'Game already started.', ephemeral: true });
          if (lobby.players && lobby.players[interaction.user.id]) return interaction.reply({ content: 'You already joined.', ephemeral: true });

          const newPlayer: Player = {
              id: interaction.user.id,
              username: interaction.user.username,
              name: interaction.user.username,
              isHost: false,
              isAlive: true
          };

          await update(ref(db, `discord_lobbies/${channelId}/players`), {
              [interaction.user.id]: newPlayer
          });
          
          const updatedLobby = (await get(lobbyRef)).val();
          await interaction.update({ embeds: [renderLobbyEmbed(updatedLobby)], components: [renderLobbyButtons()] });
      }

      if (interaction.customId === 'start_game') {
          if (lobby.players[interaction.user.id]?.isHost === false) {
              return interaction.reply({ content: 'Only host can start.', ephemeral: true });
          }
          const playerCount = Object.keys(lobby.players).length;
          if (playerCount < 3) { 
            return interaction.reply({ content: 'Need at least 3 players.', ephemeral: true });
          }

          // Initial Setup
          let initializedLobby = initializeGame(lobby); 

          const intro = await generateFlavorText(`Intro for Mafia game with players: ${Object.values(lobby.players).map((p:any) => p.username).join(', ')}.`);
          
          await interaction.update({ components: [] }); 
          
          if (interaction.channel) {
              await interaction.channel.send({ content: `**THE GAME BEGINS**\n*${intro}*\n(Ensure the Game Website is OPEN to process turns!)` });
          }

          // Send Roles Privately
          for (const p of Object.values(initializedLobby.players) as Player[]) {
              try {
                const user = await client.users.fetch(p.id);
                const roleText = `**Your Role:** ${p.role?.toUpperCase()}\nObjective: ${p.role === 'mafia' ? 'Kill everyone.' : 'Find the Mafia.'}`;
                await user.send({ content: roleText });
              } catch (e) {
                console.error(`Could not DM ${p.username}`);
              }
          }

          // Save Initial Game State to Firebase -> Triggers Frontend Engine
          await set(ref(db, `discord_lobbies/${channelId}`), initializedLobby);
      }

      // GAME ACTIONS (Just write to Firebase)
      if (lobby.game) {
          const game = lobby.game;
          const player = lobby.players[interaction.user.id];
          
          if (!player || !player.isAlive) {
              if (interaction.customId.startsWith('action_') || interaction.customId === 'night_check') {
                  return interaction.reply({ content: 'You are dead or not playing.', ephemeral: true });
              }
          }

          if (interaction.customId === 'action_accuse') {
              const row = new ActionRowBuilder<UserSelectMenuBuilder>()
                  .addComponents(new UserSelectMenuBuilder().setCustomId('target_select_accuse').setPlaceholder('Who looks sus?'));
              await interaction.reply({ content: 'Select target to Accuse:', components: [row], ephemeral: true });
          }
          
          if (interaction.customId === 'action_vote') {
               const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                  .addComponents(new StringSelectMenuBuilder().setCustomId('target_vote').setPlaceholder('Cast your vote').addOptions(
                      Object.values(lobby.players).filter((p:any) => p.isAlive).map((p:any) => ({ label: p.username, value: p.id }))
                  ).addOptions({ label: 'SKIP', value: 'SKIP' }));
               await interaction.reply({ content: 'Cast your vote:', components: [row], ephemeral: true });
          }

          if (interaction.customId === 'night_check') {
              if (game.phase !== 'night') return interaction.reply({ content: 'Not night phase.', ephemeral: true });
              
              const role = player?.role;
              const alivePlayers = Object.values(lobby.players).filter((p:any) => p.isAlive);
              
              if (role === 'villager') {
                  return interaction.reply({ content: 'You are a Villager. You sleep peacefully.', ephemeral: true });
              }
    
              const options = alivePlayers.map((p:any) => ({
                  label: p.username,
                  value: p.id,
                  description: p.id === interaction.user.id ? 'Yourself' : undefined
              }));
    
              const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
                  .addComponents(
                      new StringSelectMenuBuilder()
                          .setCustomId('night_action')
                          .setPlaceholder(
                              role === 'mafia' ? 'Select victim' : 
                              role === 'doctor' ? 'Select person to save' : 
                              'Select person to investigate'
                          )
                          .addOptions(options)
                  );
              
              await interaction.reply({ 
                  content: `**Role: ${role?.toUpperCase()}**\nPerform your night action.`,
                  components: [selectRow],
                  ephemeral: true
              });
          }
      }
  }

  // --- SELECT MENU HANDLERS ---
  if (interaction.isUserSelectMenu() || interaction.isStringSelectMenu()) {
      const channelId = interaction.channelId;
      const targetId = interaction.values[0];

      if (interaction.customId === 'target_select_accuse') {
          const newEvent = { actorId: interaction.user.id, targetId, type: 'accuse', timestamp: Date.now() };
          
          const lobbyRef = ref(db, `discord_lobbies/${channelId}`);
          const snap = await get(lobbyRef);
          const lobby = snap.val() as LobbyData;
          if(!lobby.game) return;

          const events = lobby.game.discussionEvents || [];
          events.push(newEvent as any);
          
          await update(ref(db, `discord_lobbies/${channelId}/game`), { discussionEvents: events });

          await interaction.reply({ content: `You accused <@${targetId}>.`, ephemeral: true });
          if (interaction.channel) {
            await interaction.channel.send({ content: `<@${interaction.user.id}> points a finger at <@${targetId}>!` });
          }
      }

      if (interaction.customId === 'target_vote') {
          await update(ref(db, `discord_lobbies/${channelId}/game/votes/${interaction.user.id}`), { targetId, timestamp: Date.now() });
          await interaction.reply({ content: `Vote cast for ${targetId === 'SKIP' ? 'Skip' : `<@${targetId}>`}`, ephemeral: true });
      }

      if (interaction.customId === 'night_action') {
          await update(ref(db, `discord_lobbies/${channelId}/game/actions/${interaction.user.id}`), targetId);
          await interaction.reply({ content: 'Night action confirmed.', ephemeral: true });
      }
  }
});

// --- RENDERERS ---

function renderLobbyEmbed(lobby: LobbyData) {
    const players = Object.values(lobby.players);
    return new EmbedBuilder()
        .setTitle('🕵️ Mafia Lobby')
        .setDescription(`Players (${players.length}):\n${players.map((p:any) => `- ${p.username}`).join('\n')}`)
        .setColor(0x6366f1);
}

function renderLobbyButtons() {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder().setCustomId('join_game').setLabel('Join').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('start_game').setLabel('Start Game').setStyle(ButtonStyle.Success)
        );
}

async function updateGameView(channel: TextChannel, lobby: LobbyData) {
    const game = lobby.game!;
    
    // 1. Process Logs (Distribute Public vs Private)
    if (game.logs && game.logs.length > 0) {
        const publicLogs: string[] = [];
        
        for (const log of game.logs) {
            if (log.visibleTo && log.visibleTo.length > 0) {
                // Private Log (DM)
                for (const userId of log.visibleTo) {
                    try {
                        const user = await client.users.fetch(userId);
                        await user.send({ content: `**GAME INFO:** ${log.text}` });
                    } catch (e) {
                        // ignore
                    }
                }
            } else {
                // Public Log
                publicLogs.push(log.text);
            }
        }
        
        if (publicLogs.length > 0) {
            const content = publicLogs.join('\n');
            await channel.send({ content });
        }
        
        // Clear logs in Firebase so they don't resend on re-render/re-fetch
        await set(ref(db, `discord_lobbies/${lobby.channelId}/game/logs`), []);
    }

    if (game.phase === 'game-over') {
        const embed = new EmbedBuilder()
            .setTitle('GAME OVER')
            .setDescription(`Winner: **${game.winner?.toUpperCase()}**`)
            .setColor(game.winner === 'mafia' ? 0xef4444 : 0x3b82f6);
        
        const fields = Object.values(lobby.players).map((p:any) => ({
            name: p.username,
            value: `${p.role} (${p.isAlive ? 'Alive' : 'Dead'})`,
            inline: true
        }));
        embed.addFields(fields);
        await channel.send({ embeds: [embed] });
        return;
    }

    // 2. Main Game Embed
    const embed = new EmbedBuilder()
        .setTitle(`Phase: ${game.phase.toUpperCase()}`)
        .setDescription(`Time remaining: <t:${Math.floor(game.phaseEndTime / 1000)}:R>`)
        .setColor(game.phase === 'night' ? 0x1e1b4b : 0xf59e0b);

    // List Players
    const aliveList = Object.values(lobby.players).filter((p:any) => p.isAlive).map((p:any) => `🟢 ${p.username}`).join('\n');
    const deadList = Object.values(lobby.players).filter((p:any) => !p.isAlive).map((p:any) => `💀 ${p.username}`).join('\n');
    
    embed.addFields(
        { name: 'Alive', value: aliveList || 'None', inline: true },
        { name: 'Graveyard', value: deadList || 'None', inline: true }
    );

    // Suspicion
    if (game.suspicion) {
        const suspicionSummary = Object.entries(game.suspicion)
            .map(([obsId, targets]) => {
                const observerName = lobby.players[obsId]?.username;
                if (!observerName) return null;
                // Find highest suspicion target
                const sortedTargets = Object.entries(targets).sort((a,b) => b[1] - a[1]);
                const mostSus = sortedTargets[0];
                if (!mostSus) return null;
                
                const targetName = lobby.players[mostSus[0]]?.username;
                const val = Math.round(mostSus[1]);
                if (val < 50) return null; 
                return `${observerName} suspects ${targetName} (${val}%)`;
            })
            .filter(s => s)
            .slice(0, 5)
            .join('\n');

        if (suspicionSummary) {
            embed.addFields({ name: '👀 Suspicion Meter', value: suspicionSummary });
        }
    }

    // 3. Components
    const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

    if (game.phase === 'discussion') {
        const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('action_accuse').setLabel('Accuse').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('action_defend').setLabel('Defend').setStyle(ButtonStyle.Secondary)
        );
        rows.push(btnRow);
    } else if (game.phase === 'voting') {
        const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('action_vote').setLabel('Open Voting Booth').setStyle(ButtonStyle.Primary)
        );
        rows.push(btnRow);
    } else if (game.phase === 'night') {
        const nightRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
             new ButtonBuilder().setCustomId('night_check').setLabel('Perform Night Action').setStyle(ButtonStyle.Secondary)
        );
        rows.push(nightRow);
    }

    await channel.send({ embeds: [embed], components: rows as any });
}

client.login(process.env.DISCORD_TOKEN);