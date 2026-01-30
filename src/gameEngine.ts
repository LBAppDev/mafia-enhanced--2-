import { GameState, Player, Role, SuspicionMatrix, LobbyData } from './types';

// --- CONSTANTS: THE "HIGH ENTROPY" BELIEF MODEL ---
const EPSILON = 5; 
const BASE_SUSPICION = 35; 
const MEMORY_DRIFT_LAMBDA = 0.85; 

const WEIGHTS = {
  VOTE_FOR_INNOCENT: 0.25,   
  VOTE_FOR_MAFIA: -0.30,     
  DEFEND_MAFIA: 0.35,        
  BANDWAGON_PENALTY: 0.15, 
  LURKER_PENALTY: 0.12,    
  VINDICATION_BONUS: -0.40, 
  WRONG_ACCUSATION: 0.25,   
  COMPLICITY_PENALTY: 0.30, 
  HYPOCRITE_PENALTY: 0.30, 
  CONSISTENT_BONUS: -0.10, 
  DETECTIVE_FOUND_MAFIA: 1.2,   
  DETECTIVE_FOUND_INNOCENT: -1.2, 
  DOCTOR_SAVED_INNOCENT: -0.8,    
  DOCTOR_PROTECT_BIAS: -0.2,      
  GUARDIAN_ANGEL_EFFECT: -0.4,    
  ACTION_ACCUSE: 0.20,
  ACTION_DEFEND: -0.15
};

const NOISE_WIDTHS = {
  VOTE: 0.40,        
  DISCUSSION: 0.30,  
  PRIVATE_LEAK: 0.80, 
  HYPOCRITE: 0.20,
  HISTORY: 0.10 
};

// --- HELPERS ---
const shuffle = <T>(array: T[]): T[] => array.sort(() => Math.random() - 0.5);
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

const updateBelief = (currentSuspicion: number, baseWeight: number, noiseWidth: number): number => {
  if (typeof currentSuspicion !== 'number') currentSuspicion = BASE_SUSPICION;
  const p = currentSuspicion / 100;
  const noiseMultiplier = 1 + (Math.random() * (2 * noiseWidth) - noiseWidth);
  let effectiveWeight = baseWeight;
  if (Math.random() < 0.05) effectiveWeight = -baseWeight * 0.5;

  let change = effectiveWeight * noiseMultiplier;
  
  let newP = change > 0 ? p + (1 - p) * (change * 0.3) : p + (p) * (change * 0.3);
  const min = EPSILON / 100;
  const max = (100 - EPSILON) / 100;
  newP = clamp(newP, min, max);

  return newP * 100;
};

// --- INITIALIZATION ---
export const initializeGame = (lobby: LobbyData): LobbyData => {
  const playersMap = lobby.players; 
  const playerIds = Object.keys(playersMap);
  const playerCount = playerIds.length;
  
  const mafiaCount = Math.max(1, Math.floor(playerCount / 3));
  const hasDoctor = playerCount >= 4;
  const hasDetective = playerCount >= 5;
  
  const roles: Role[] = Array(mafiaCount).fill('mafia');
  if (hasDoctor) roles.push('doctor');
  if (hasDetective) roles.push('detective');
  while (roles.length < playerCount) roles.push('villager');
  
  const shuffledRoles = shuffle(roles);
  const suspicion: SuspicionMatrix = {};

  playerIds.forEach((id, index) => {
    playersMap[id].role = shuffledRoles[index];
    playersMap[id].isAlive = true;
  });

  playerIds.forEach(observerId => {
    suspicion[observerId] = {};
    const observerRole = playersMap[observerId].role;

    playerIds.forEach(targetId => {
       if (observerId === targetId) return;
       const targetRole = playersMap[targetId].role;

       if (observerRole === 'mafia' && targetRole === 'mafia') {
           suspicion[observerId][targetId] = 0; 
       } else {
           const startupNoise = (Math.random() - 0.5) * 20;
           suspicion[observerId][targetId] = BASE_SUSPICION + startupNoise;
       }
    });
  });

  const gameState: GameState = {
    phase: 'night',
    round: 1,
    phaseEndTime: Date.now() + 30000,
    votes: {},
    actions: {},
    discussionEvents: [],
    suspicion,
    mafiaCount,
    villagerCount: playerCount - mafiaCount,
    logs: [{ text: "Night has fallen. Check your DMs/Ephemeral messages for roles." }]
  };

  return {
      ...lobby,
      status: 'in-game',
      game: gameState
  };
};

// --- LOGIC HANDLERS ---

export const processDiscussionPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;
  const game = { ...lobby.game };
  // No deep clone of players needed if we don't modify them here
  
  game.logs.push({ text: "Voting booths are open." });
  
  Object.keys(game.suspicion).forEach(observerId => {
    const observerSuspicion = game.suspicion[observerId];
    game.discussionEvents.forEach(event => {
       if (event.actorId === observerId) return;
       if (event.type === 'skip') return;

       const susOfActor = observerSuspicion[event.actorId] || BASE_SUSPICION;
       const trustFactor = Math.max(0.1, (100 - susOfActor) / 100);
       let currentS = observerSuspicion[event.targetId];

       if (event.type === 'accuse') {
         const weightedImpact = WEIGHTS.ACTION_ACCUSE * trustFactor;
         currentS = updateBelief(currentS, weightedImpact, NOISE_WIDTHS.DISCUSSION);
       } else if (event.type === 'defend') {
         const weightedImpact = WEIGHTS.ACTION_DEFEND * trustFactor;
         currentS = updateBelief(currentS, weightedImpact, NOISE_WIDTHS.DISCUSSION);
       }
       game.suspicion[observerId][event.targetId] = currentS;
    });
  });

  // Memory Drift
  Object.keys(game.suspicion).forEach(obs => {
      Object.keys(game.suspicion[obs]).forEach(target => {
          const val = game.suspicion[obs][target];
          game.suspicion[obs][target] = (val * MEMORY_DRIFT_LAMBDA) + (BASE_SUSPICION * (1 - MEMORY_DRIFT_LAMBDA));
      });
  });

  game.phase = 'voting';
  game.phaseEndTime = Date.now() + 30000; // 30s vote
  game.votes = {};
  
  return { ...lobby, game };
};

export const processVotingPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;
  const game = { ...lobby.game };
  const players = lobby.players;

  const voteCounts: Record<string, number> = {};
  Object.values(game.votes).forEach(v => {
    voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
  });

  let eliminatedId: string | null = null;
  let maxVotes = 0;
  
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      eliminatedId = id;
    } else if (count === maxVotes) eliminatedId = null;
  });

  if (eliminatedId === 'SKIP') eliminatedId = null;

  if (eliminatedId) {
    const victim = players[eliminatedId];
    victim.isAlive = false;
    game.logs.push({ text: `${victim.username} was executed. Role: ${victim.role?.toUpperCase()}` });
    
    if (victim.role === 'mafia') game.mafiaCount--;
    else game.villagerCount--;
  } else {
    game.logs.push({ text: "No consensus reached. No one was executed." });
  }

  if (game.mafiaCount === 0) game.winner = 'villager';
  else if (game.mafiaCount >= game.villagerCount) game.winner = 'mafia';
  
  game.phase = game.winner ? 'game-over' : 'night';
  game.phaseEndTime = Date.now() + 30000;
  game.actions = {};
  game.discussionEvents = [];

  return { ...lobby, game };
};

export const processNightPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;
  const game = { ...lobby.game };
  const players = lobby.players;

  const mafiaVotes: Record<string, number> = {};
  let doctorTargetId: string | null = null;
  let detectiveTargetId: string | null = null;
  let detectiveActorId: string | null = null;
  let doctorActorId: string | null = null;

  // Process Actions
  Object.entries(game.actions).forEach(([actorId, targetId]) => {
    const actor = players[actorId];
    if (!actor || !actor.isAlive) return;

    if (actor.role === 'mafia') mafiaVotes[targetId] = (mafiaVotes[targetId] || 0) + 1;
    if (actor.role === 'doctor') { doctorTargetId = targetId; doctorActorId = actorId; }
    if (actor.role === 'detective') { detectiveTargetId = targetId; detectiveActorId = actorId; }
  });

  // Calculate Mafia Kill
  let maxVotes = 0;
  let mafiaTargetId: string | null = null;
  Object.entries(mafiaVotes).forEach(([target, count]) => {
    if (count > maxVotes) { maxVotes = count; mafiaTargetId = target; }
    else if (count === maxVotes) mafiaTargetId = null;
  });

  let victimId: string | null = null;
  
  if (mafiaTargetId && mafiaTargetId !== 'SKIP') {
      if (mafiaTargetId !== doctorTargetId) {
          victimId = mafiaTargetId;
      } else {
          game.logs.push({ text: "The Doctor saved someone tonight!" });
          if (doctorActorId) {
              game.suspicion[doctorActorId][mafiaTargetId] = 0; // Doc trusts saved person
          }
      }
  }

  // Resolve Death
  if (victimId) {
    const victim = players[victimId];
    victim.isAlive = false;
    game.logs.push({ text: `${victim.username} was found dead. Role: ${victim.role?.toUpperCase()}` });
    if (victim.role === 'mafia') game.mafiaCount--;
    else game.villagerCount--;
  } else {
    game.logs.push({ text: "A quiet night. No one died." });
  }

  // Detective Logic
  if (detectiveActorId && detectiveTargetId) {
      const target = players[detectiveTargetId];
      const result = target.role === 'mafia' ? 'MAFIA' : 'INNOCENT';
      
      // Send private log to detective
      game.logs.push({
          text: `🔍 Investigation Result: ${target.username} is **${result}**.`,
          visibleTo: [detectiveActorId]
      });

      // Update internal belief
      game.suspicion[detectiveActorId][detectiveTargetId] = target.role === 'mafia' ? 99 : 1;
  }

  if (game.mafiaCount === 0) game.winner = 'villager';
  else if (game.mafiaCount >= game.villagerCount) game.winner = 'mafia';

  game.phase = game.winner ? 'game-over' : 'discussion';
  game.round++;
  game.phaseEndTime = Date.now() + 180000; // 45s discussion -> 180000 (3m)
  game.logs.push({ text: `Day ${game.round} begins! Discuss.` });

  return { ...lobby, game };
};