import { LobbyData, Player, Role, GameState, SuspicionMatrix, VoteRecord, DiscussionEvent } from '../types';

// --- CONSTANTS: THE "HIGH ENTROPY" BELIEF MODEL ---

const EPSILON = 5; // Bounded suspicion (5% - 95%)
const BASE_SUSPICION = 35; // Starting suspicion for strangers

// Memory Drift: How much we cling to old beliefs vs returning to baseline
const MEMORY_DRIFT_LAMBDA = 0.85; 

// Event Base Weights (Log-odds influence)
const WEIGHTS = {
  // Collective (Voting)
  VOTE_FOR_INNOCENT: 0.25,   
  VOTE_FOR_MAFIA: -0.30,     
  DEFEND_MAFIA: 0.35,        
  
  // Advanced Voting Patterns
  BANDWAGON_PENALTY: 0.15, // Voting late on the winner
  LURKER_PENALTY: 0.12,    // Doing nothing in discussion
  
  // Historical Vindication (Long Term)
  VINDICATION_BONUS: -0.40, // I voted for the dead Mafia previously -> I am trusted
  WRONG_ACCUSATION: 0.25,   // I voted for the dead Innocent -> I am sus
  COMPLICITY_PENALTY: 0.30, // I never voted for the dead Mafia -> I am sus

  // Hypocrisy (Consistency Check)
  HYPOCRITE_PENALTY: 0.30, 
  CONSISTENT_BONUS: -0.10, 

  // Private Roles
  DETECTIVE_FOUND_MAFIA: 1.2,   
  DETECTIVE_FOUND_INNOCENT: -1.2, 
  DOCTOR_SAVED_INNOCENT: -0.8,    
  DOCTOR_PROTECT_BIAS: -0.2,      
  GUARDIAN_ANGEL_EFFECT: -0.4,    
  
  // Discussion (Base weights, now modified by Trust)
  ACTION_ACCUSE: 0.20,
  ACTION_DEFEND: -0.15
};

// Noise Widths
const NOISE_WIDTHS = {
  VOTE: 0.40,        
  DISCUSSION: 0.30,  
  PRIVATE_LEAK: 0.80, 
  HYPOCRITE: 0.20,
  HISTORY: 0.10 // History is harder to misinterpret
};

// --- TIMERS ---
const DURATION_NIGHT = 30 * 1000; 
const DURATION_DISCUSSION = 3 * 60 * 1000; // 3 minutes
const DURATION_VOTING = 30 * 1000;

// --- HELPERS ---

const shuffle = <T>(array: T[]): T[] => array.sort(() => Math.random() - 0.5);

const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);

/**
 * The Core Engine: Updates belief with heavy noise integration.
 */
const updateBelief = (
  currentSuspicion: number, // 0-100
  baseWeight: number, 
  noiseWidth: number
): number => {
  if (typeof currentSuspicion !== 'number' || isNaN(currentSuspicion)) {
      currentSuspicion = BASE_SUSPICION;
  }

  const p = currentSuspicion / 100;
  
  const noiseMultiplier = 1 + (Math.random() * (2 * noiseWidth) - noiseWidth);

  // Occasional Misinterpretation
  let effectiveWeight = baseWeight;
  if (Math.random() < 0.05) {
      effectiveWeight = -baseWeight * 0.5;
  }

  const biasStrength = 0.2; 
  let contextMultiplier = 1.0;
  
  if (p > 0.6 && effectiveWeight > 0) contextMultiplier += biasStrength; 
  else if (p > 0.6 && effectiveWeight < 0) contextMultiplier -= biasStrength; 
  else if (p < 0.4 && effectiveWeight < 0) contextMultiplier += biasStrength; 
  else if (p < 0.4 && effectiveWeight > 0) contextMultiplier -= biasStrength; 

  const change = effectiveWeight * noiseMultiplier * contextMultiplier;
  
  let newP = p;
  
  // Learning Rate
  if (change > 0) {
      newP = p + (1 - p) * (change * 0.3); 
  } else {
      newP = p + (p) * (change * 0.3);
  }

  const min = EPSILON / 100;
  const max = (100 - EPSILON) / 100;
  newP = clamp(newP, min, max);

  return newP * 100;
};

const propagateIntuition = (
    suspicionMatrix: SuspicionMatrix, 
    knowerId: string, 
    targetId: string, 
    direction: 'good' | 'bad',
    playerIds: string[],
    strength: number = 1.0 
) => {
    const baseMagnitude = direction === 'bad' ? 0.08 : -0.08; 
    const leakMagnitude = baseMagnitude * strength;
    
    playerIds.forEach(observerId => {
        if (observerId === knowerId) return; 
        if (observerId === targetId) return;
        
        if (!suspicionMatrix[observerId]) suspicionMatrix[observerId] = {};
        
        const current = suspicionMatrix[observerId][targetId];
        suspicionMatrix[observerId][targetId] = updateBelief(current, leakMagnitude, NOISE_WIDTHS.PRIVATE_LEAK);
    });
};

const generateRumor = (suspicionMatrix: SuspicionMatrix, playerIds: string[]) => {
    if (playerIds.length < 2) return null;
    
    const target = playerIds[Math.floor(Math.random() * playerIds.length)];
    const isBadRumor = Math.random() > 0.4; 
    const magnitude = isBadRumor ? 0.25 : -0.20; 

    playerIds.forEach(observerId => {
        if (observerId === target) return;
        if (!suspicionMatrix[observerId]) suspicionMatrix[observerId] = {};
        
        suspicionMatrix[observerId][target] = updateBelief(
            suspicionMatrix[observerId][target], 
            magnitude, 
            0.5 
        );
    });
    
    return { target, type: isBadRumor ? 'suspicious' : 'trusted' };
};

// --- INITIALIZATION ---

export const initializeGame = (lobby: LobbyData): LobbyData => {
  const playerIds = lobby.players ? Object.keys(lobby.players) : [];
  const playerCount = playerIds.length;
  
  const mafiaCount = Math.max(1, Math.floor(playerCount / 3));
  const hasDoctor = playerCount >= 4;
  const hasDetective = playerCount >= 5;
  
  const roles: Role[] = Array(mafiaCount).fill('mafia');
  if (hasDoctor) roles.push('doctor');
  if (hasDetective) roles.push('detective');
  while (roles.length < playerCount) roles.push('villager');
  
  const shuffledRoles = shuffle(roles);
  const players = { ...lobby.players };
  const suspicion: SuspicionMatrix = {};
  const votingHistory: Record<string, string[]> = {};

  playerIds.forEach((id, index) => {
    players[id].role = shuffledRoles[index];
    players[id].isAlive = true;
    votingHistory[id] = [];
  });

  playerIds.forEach(observerId => {
    suspicion[observerId] = {};
    const observerRole = players[observerId].role;

    playerIds.forEach(targetId => {
       if (observerId === targetId) return;
       const targetRole = players[targetId].role;

       if (observerRole === 'mafia' && targetRole === 'mafia') {
           suspicion[observerId][targetId] = 0; 
       } else {
           const startupNoise = (Math.random() - 0.5) * 20;
           suspicion[observerId][targetId] = BASE_SUSPICION + startupNoise;
       }
    });
  });

  const now = Date.now();

  const gameState: GameState = {
    phase: 'night',
    round: 1,
    phaseStartTime: now,
    phaseEndTime: now + DURATION_NIGHT,
    logs: [{
      id: now.toString(),
      timestamp: now,
      text: `Night has fallen. Trust no one.`,
      type: 'system'
    }],
    votes: {},
    actions: {},
    discussionEvents: [],
    suspicion,
    history: [JSON.parse(JSON.stringify(suspicion))], 
    votingHistory,
    mafiaCount,
    villagerCount: playerCount - mafiaCount
  };

  return { ...lobby, status: 'in-game', players, game: gameState };
};

// --- PHASE 2: DISCUSSION PROCESSING ---

export const processDiscussionPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;

  const game = { ...lobby.game };
  const events = game.discussionEvents || [];
  const newLogs = [...(game.logs || [])];

  newLogs.push({
    id: Date.now().toString(),
    timestamp: Date.now(),
    text: "Voting booths are open.",
    type: 'system'
  });

  // 1. LURKER DETECTION
  // Identify players who did absolutely nothing during discussion
  const activeActorIds = new Set(events.map(e => e.actorId));
  const livingIds = Object.values(lobby.players).filter(p => p.isAlive).map(p => p.id);
  
  livingIds.forEach(lurkerId => {
      if (!activeActorIds.has(lurkerId)) {
          // This player stayed silent. Punishment!
          Object.keys(game.suspicion).forEach(observerId => {
              if (observerId === lurkerId) return;
              game.suspicion[observerId][lurkerId] = updateBelief(
                  game.suspicion[observerId][lurkerId],
                  WEIGHTS.LURKER_PENALTY,
                  0.2
              );
          });
      }
  });

  // 2. TRUST-WEIGHTED INFLUENCE
  Object.keys(game.suspicion).forEach(observerId => {
    const observerSuspicion = game.suspicion[observerId];

    events.forEach(event => {
      if (event.actorId === observerId) return; 
      if (event.type === 'skip') return; 

      if (event.targetId === observerId) {
        // Defensive Reaction (They attacked ME)
        if (event.type === 'accuse') {
           game.suspicion[observerId][event.actorId] = updateBelief(
             game.suspicion[observerId][event.actorId], 
             0.30, 
             0.2
           );
        }
        return; 
      }

      // Calculate Trust Factor:
      // If I suspect the Actor (80%), Trust is 0.2.
      // If I trust the Actor (20% sus), Trust is 0.8.
      const susOfActor = observerSuspicion[event.actorId] || BASE_SUSPICION;
      const trustFactor = Math.max(0.1, (100 - susOfActor) / 100);
      
      let currentS = observerSuspicion[event.targetId];
      
      if (event.type === 'accuse') {
        // Impact scales with how much I trust the accuser
        const weightedImpact = WEIGHTS.ACTION_ACCUSE * trustFactor;
        
        // If I actively suspect the accuser (>60%), their accusation might act in reverse!
        // "Oh, HE says she's guilty? She's probably innocent."
        if (susOfActor > 60) {
            currentS = updateBelief(currentS, -weightedImpact * 0.5, NOISE_WIDTHS.DISCUSSION);
        } else {
            currentS = updateBelief(currentS, weightedImpact, NOISE_WIDTHS.DISCUSSION);
        }

      } else if (event.type === 'defend') {
        // Defending is risky. 
        const weightedImpact = WEIGHTS.ACTION_DEFEND * trustFactor;
        currentS = updateBelief(currentS, weightedImpact, NOISE_WIDTHS.DISCUSSION);

        // Guilt by Association check:
        // If the Actor defends someone I HATE, I suspect the Actor more.
        const susOfTarget = observerSuspicion[event.targetId];
        if (susOfTarget > 70) {
            game.suspicion[observerId][event.actorId] = updateBelief(
                game.suspicion[observerId][event.actorId],
                0.15, // "Why are you defending this scum?"
                0.2
            );
        }
      }
      
      game.suspicion[observerId][event.targetId] = currentS;
    });
  });

  const newHistory = [...(game.history || []), JSON.parse(JSON.stringify(game.suspicion))];
  const now = Date.now();

  return {
    ...lobby,
    game: {
      ...game,
      phase: 'voting',
      phaseStartTime: now,
      phaseEndTime: now + DURATION_VOTING,
      votes: {}, 
      logs: newLogs,
      history: newHistory
    }
  };
};

// --- PHASE 3: VOTING PROCESSING ---

export const processVotingPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;
  
  const game = { ...lobby.game };
  const players = { ...lobby.players };
  const votes = game.votes || {};
  const votingHistory = game.votingHistory || {};
  const discussionEvents = game.discussionEvents || [];
  const newLogs = [...(game.logs || [])];

  const livingPlayers = Object.values(players).filter(p => p.isAlive);
  const totalLiving = livingPlayers.length;

  // 1. Tally Votes
  const voteCounts: Record<string, number> = {};
  let submittedCount = 0;

  Object.values(votes).forEach(v => {
    voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
    submittedCount++;
  });

  let eliminatedId: string | null = null;
  let maxVotes = 0;
  
  Object.entries(voteCounts).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      eliminatedId = id;
    } else if (count === maxVotes) {
      eliminatedId = null; // Tie
    }
  });

  if (eliminatedId === 'SKIP') eliminatedId = null; 

  newLogs.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: `Voting ended. ${submittedCount}/${totalLiving} cast ballots.`,
      type: 'info'
  });

  // 2. BANDWAGON ANALYSIS
  // Detect who voted for the eliminated player late in the timeline
  let bandwagonVoters: string[] = [];
  if (eliminatedId) {
      const votersForWinner = Object.entries(votes)
        .filter(([_, v]) => v.targetId === eliminatedId)
        .sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by time

      // The last 40% of voters are considered "Bandwagoners"
      const cutOffIndex = Math.floor(votersForWinner.length * 0.6);
      bandwagonVoters = votersForWinner.slice(cutOffIndex).map(v => v[0]);
  }

  // 3. Consistency & Logic Application
  Object.keys(game.suspicion).forEach(observerId => {
      Object.keys(players).forEach(voterId => {
         if (voterId === observerId) return;
         if (!votes[voterId] || votes[voterId].targetId === 'SKIP') return;
         
         const votedTarget = votes[voterId].targetId;
         const userActions = discussionEvents.filter(e => e.actorId === voterId);
         let hypocrisyScore = 0;

         userActions.forEach(action => {
             // Hypocrisy: Accused X, Voted Y
             if (action.type === 'accuse' && action.targetId !== votedTarget) hypocrisyScore += 1;
             // Hypocrisy: Defended X, Voted X
             if (action.type === 'defend' && action.targetId === votedTarget) hypocrisyScore += 1.5;
         });

         let currentSusOfVoter = game.suspicion[observerId][voterId];
         
         if (hypocrisyScore > 0) {
             currentSusOfVoter = updateBelief(currentSusOfVoter, WEIGHTS.HYPOCRITE_PENALTY, NOISE_WIDTHS.HYPOCRITE);
         } else if (userActions.length > 0) {
             currentSusOfVoter = updateBelief(currentSusOfVoter, WEIGHTS.CONSISTENT_BONUS, NOISE_WIDTHS.HYPOCRITE);
         }

         // Apply Bandwagon Penalty
         if (bandwagonVoters.includes(voterId)) {
             currentSusOfVoter = updateBelief(currentSusOfVoter, WEIGHTS.BANDWAGON_PENALTY, NOISE_WIDTHS.VOTE);
         }
         
         game.suspicion[observerId][voterId] = currentSusOfVoter;
      });
  });
  
  // 4. ELIMINATION & HISTORICAL VINDICATION
  if (eliminatedId) {
    const victim = players[eliminatedId as string];
    victim.isAlive = false;
    
    newLogs.push({
      id: (Date.now() + 1).toString(),
      timestamp: Date.now(),
      text: `${victim.name} was executed. Role: ${victim.role?.toUpperCase()}`,
      type: 'alert'
    });

    if (victim.role === 'mafia') game.mafiaCount--;
    else game.villagerCount--;

    // --- HISTORICAL ANALYSIS ---
    // Look back at ALL past rounds. How did people treat this specific dead player?
    
    Object.keys(game.suspicion).forEach(observerId => {
        Object.keys(players).forEach(targetId => {
            if (targetId === observerId) return;
            if (targetId === eliminatedId) return; // Don't update suspicion of the dead guy

            let currentS = game.suspicion[observerId][targetId];
            
            // Check History: Did targetId vote for eliminatedId in the past?
            const pastVotesForVictim = (votingHistory[targetId] || []).filter(vid => vid === eliminatedId).length;
            const currentVoteForVictim = votes[targetId]?.targetId === eliminatedId ? 1 : 0;
            const totalVotesForVictim = pastVotesForVictim + currentVoteForVictim;

            if (victim.role === 'mafia') {
                if (totalVotesForVictim > 0) {
                    // VINDICATION: They tried to kill this mafia before. Trust them.
                    currentS = updateBelief(currentS, WEIGHTS.VINDICATION_BONUS * totalVotesForVictim, NOISE_WIDTHS.HISTORY);
                } else {
                    // COMPLICITY: They never voted for this mafia. Suspicious.
                    currentS = updateBelief(currentS, WEIGHTS.COMPLICITY_PENALTY, NOISE_WIDTHS.HISTORY);
                }
            } else {
                // VICTIM WAS INNOCENT
                if (totalVotesForVictim > 0) {
                    // WRONG ACCUSATION: They helped kill an innocent.
                    currentS = updateBelief(currentS, WEIGHTS.WRONG_ACCUSATION * totalVotesForVictim, NOISE_WIDTHS.HISTORY);
                }
            }

            game.suspicion[observerId][targetId] = currentS;
        });
    });

  } else {
    newLogs.push({
      id: (Date.now() + 1).toString(),
      timestamp: Date.now(),
      text: `No consensus reached.`,
      type: 'system'
    });
  }

  // 5. THE RUMOR MILL
  const livingIds = Object.values(players).filter(p => p.isAlive).map(p => p.id);
  const rumor = generateRumor(game.suspicion, livingIds);
  
  if (rumor) {
      newLogs.push({
          id: (Date.now() + 2).toString(),
          timestamp: Date.now(),
          text: rumor.type === 'suspicious' 
            ? `Whispers circulate about ${players[rumor.target].name}...`
            : `${players[rumor.target].name} seems unusually calm, reassuring some.`,
          type: 'info'
      });
  }

  // 6. Memory Drift
  Object.keys(game.suspicion).forEach(obs => {
      Object.keys(game.suspicion[obs]).forEach(target => {
          const val = game.suspicion[obs][target];
          // Drift towards base suspicion over time
          game.suspicion[obs][target] = (val * MEMORY_DRIFT_LAMBDA) + (BASE_SUSPICION * (1 - MEMORY_DRIFT_LAMBDA));
      });
  });
  
  // Update History
  Object.entries(votes).forEach(([pid, record]) => {
      if (!votingHistory[pid]) votingHistory[pid] = [];
      votingHistory[pid].push(record.targetId);
  });

  const newHistory = [...(game.history || []), JSON.parse(JSON.stringify(game.suspicion))];

  let winner: 'mafia' | 'villager' | null = null;
  if (game.mafiaCount === 0) winner = 'villager';
  else if (game.mafiaCount >= game.villagerCount) winner = 'mafia';

  const now = Date.now();

  return {
    ...lobby,
    players,
    game: {
      ...game,
      phase: winner ? 'game-over' : 'night',
      phaseStartTime: now,
      phaseEndTime: now + DURATION_NIGHT,
      votes: {}, 
      actions: {},
      discussionEvents: [], 
      votingHistory,
      history: newHistory,
      logs: newLogs,
      winner: winner || null
    }
  };
};

// --- NIGHT PHASE PROCESSING ---

export const processNightPhase = (lobby: LobbyData): LobbyData => {
  if (!lobby.game) return lobby;

  const game = { ...lobby.game };
  const players = { ...lobby.players };
  const actions = game.actions || {};
  const votingHistory = game.votingHistory || {};
  const newLogs = [...(game.logs || [])];

  const mafiaVotes: Record<string, number> = {};
  let doctorTargetId: string | null = null;
  let detectiveTargetId: string | null = null;
  let detectiveActorId: string | null = null;
  let doctorActorId: string | null = null;

  Object.entries(actions).forEach(([actorId, targetId]) => {
    const actor = players[actorId];
    if (!actor || !actor.isAlive) return;

    if (actor.role === 'mafia') {
        mafiaVotes[targetId] = (mafiaVotes[targetId] || 0) + 1;
    }
    if (actor.role === 'doctor') {
        doctorTargetId = targetId;
        doctorActorId = actorId;
    }
    if (actor.role === 'detective') {
        detectiveTargetId = targetId;
        detectiveActorId = actorId;
    }
  });

  let maxVotes = 0;
  let mafiaTargetId: string | null = null;
  
  Object.entries(mafiaVotes).forEach(([target, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      mafiaTargetId = target;
    } else if (count === maxVotes) {
        mafiaTargetId = null;
    }
  });

  if (mafiaTargetId === 'SKIP') mafiaTargetId = null;

  // Doctor Bias
  if (doctorActorId && doctorTargetId) {
      let docVsTarget = game.suspicion[doctorActorId][doctorTargetId];
      docVsTarget = updateBelief(docVsTarget, WEIGHTS.DOCTOR_PROTECT_BIAS, 0.1); 
      game.suspicion[doctorActorId][doctorTargetId] = docVsTarget;
  }

  // Doctor Save Logic
  let victimId: string | null = null;
  let doctorSaved = false;

  if (mafiaTargetId) {
      if (mafiaTargetId !== doctorTargetId) {
          victimId = mafiaTargetId;
      } else {
          doctorSaved = true;
          if (doctorActorId) {
             let docVsTarget = game.suspicion[doctorActorId][mafiaTargetId];
             docVsTarget = updateBelief(docVsTarget, WEIGHTS.DOCTOR_SAVED_INNOCENT, 0.1); 
             game.suspicion[doctorActorId][mafiaTargetId] = docVsTarget;

             let targetVsDoc = game.suspicion[mafiaTargetId][doctorActorId];
             targetVsDoc = updateBelief(targetVsDoc, WEIGHTS.GUARDIAN_ANGEL_EFFECT, 0.2);
             game.suspicion[mafiaTargetId][doctorActorId] = targetVsDoc;

             propagateIntuition(game.suspicion, doctorActorId, mafiaTargetId, 'good', Object.keys(players), 0.7);
          }

          // Mafia Frame Up
          const potentialScapegoats = Object.values(players).filter(p => 
            p.isAlive && p.role !== 'mafia' && p.id !== mafiaTargetId
          );

          if (potentialScapegoats.length > 0) {
            const scapegoat = potentialScapegoats[Math.floor(Math.random() * potentialScapegoats.length)];
            
            Object.keys(game.suspicion).forEach(observerId => {
                if (observerId === scapegoat.id) return;
                game.suspicion[observerId][scapegoat.id] = updateBelief(
                    game.suspicion[observerId][scapegoat.id],
                    0.25, 
                    0.3
                );
            });
            
            const mafiaIds = Object.values(players).filter(p => p.role === 'mafia').map(p => p.id);
            newLogs.push({
                id: (Date.now() + 2).toString(),
                timestamp: Date.now(),
                text: `Hit failed. Framed ${scapegoat.name}.`,
                type: 'clue',
                visibleTo: mafiaIds
            });
          }

          newLogs.push({
              id: Date.now().toString(),
              timestamp: Date.now(),
              text: "A struggle was heard, but the Doctor intervened.",
              type: 'info'
          });

          if (doctorActorId) {
             newLogs.push({
                 id: (Date.now() + 1).toString(),
                 timestamp: Date.now(),
                 text: `SUCCESS: Saved ${players[mafiaTargetId]?.name}.`,
                 type: 'clue',
                 visibleTo: [doctorActorId]
             });
          }
      }
  }

  // Resolve Death
  if (victimId) {
    const victim = players[victimId];
    victim.isAlive = false;
    newLogs.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: `${victim.name} was found dead.`,
      type: 'alert'
    });
    newLogs.push({
      id: (Date.now() + 1).toString(),
      timestamp: Date.now(),
      text: `Role: ${victim.role?.toUpperCase()}`,
      type: 'info'
    });
    if (victim.role === 'mafia') game.mafiaCount--;
    else game.villagerCount--;

    // --- NIGHT DEATH HISTORICAL ANALYSIS ---
    // Same logic as Voting Phase, but applied to Night deaths (which are rare for Mafia to die, but possible if game rules change or self-kill mechanisms exist. 
    // Mostly this applies if an Innocent dies -> those who voted for them look bad.
    
    Object.keys(game.suspicion).forEach(observerId => {
        Object.keys(players).forEach(targetId => {
            if (targetId === observerId) return;
            if (targetId === victimId) return;

            let currentS = game.suspicion[observerId][targetId];
            const pastVotesForVictim = (votingHistory[targetId] || []).filter(vid => vid === victimId).length;

            if (victim.role !== 'mafia') {
                // Innocent died at night.
                // If I voted for this person previously, I look slightly suspicious (wanted them dead).
                if (pastVotesForVictim > 0) {
                    currentS = updateBelief(currentS, WEIGHTS.WRONG_ACCUSATION * pastVotesForVictim * 0.5, NOISE_WIDTHS.HISTORY);
                }
            }
            game.suspicion[observerId][targetId] = currentS;
        });
    });

  } else if (!doctorSaved) {
     newLogs.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: `A quiet night.`,
      type: 'system'
    });
  }

  // Detective Action
  if (detectiveActorId && detectiveTargetId) {
    const target = players[detectiveTargetId];
    const isMafia = target.role === 'mafia';
    
    let currentS = game.suspicion[detectiveActorId][detectiveTargetId] || BASE_SUSPICION;
    
    if (isMafia) {
        currentS = updateBelief(currentS, WEIGHTS.DETECTIVE_FOUND_MAFIA, 0.1);
        propagateIntuition(game.suspicion, detectiveActorId, detectiveTargetId, 'bad', Object.keys(players));
    } else {
        currentS = updateBelief(currentS, WEIGHTS.DETECTIVE_FOUND_INNOCENT, 0.1);
        propagateIntuition(game.suspicion, detectiveActorId, detectiveTargetId, 'good', Object.keys(players));
    }
    
    game.suspicion[detectiveActorId][detectiveTargetId] = currentS;

    newLogs.push({
      id: Date.now().toString(),
      timestamp: Date.now(),
      text: `Investigation on ${target.name}: Suspicion updated to ${Math.round(currentS)}%.`,
      type: 'clue',
      visibleTo: [detectiveActorId]
    });
  }

  // Ambient Paranoia
  Object.keys(players).forEach(observerId => {
    if (!players[observerId].isAlive) return;
    Object.keys(players).forEach(targetId => {
      if (observerId === targetId) return;
      
      const randomWeight = (Math.random() - 0.5) * 0.3; 
      game.suspicion[observerId][targetId] = updateBelief(
          game.suspicion[observerId][targetId],
          randomWeight,
          0.5 
      );
    });
  });

  const newHistory = [...(game.history || []), JSON.parse(JSON.stringify(game.suspicion))];

  let winner: 'mafia' | 'villager' | null = null;
  if (game.mafiaCount === 0) winner = 'villager';
  else if (game.mafiaCount >= game.villagerCount) winner = 'mafia';

  const now = Date.now();

  return {
    ...lobby,
    players,
    game: {
      ...game,
      phase: winner ? 'game-over' : 'discussion',
      phaseStartTime: now,
      phaseEndTime: now + DURATION_DISCUSSION,
      round: game.round + 1,
      actions: {},
      logs: newLogs,
      history: newHistory,
      winner: winner || null
    }
  };
};