export type Role = 'villager' | 'mafia' | 'doctor' | 'detective';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isAlive: boolean;
  joinedAt: number;
  role?: Role; // Only visible to self (and host logic)
}

export interface GameLog {
  id: string;
  timestamp: number;
  text: string;
  type: 'system' | 'chat' | 'alert' | 'clue' | 'info';
  authorName?: string;
  visibleTo?: string[]; // If undefined, visible to all
}

export interface SuspicionMatrix {
  // observerId -> targetId -> probability (0-100)
  [observerId: string]: {
    [targetId: string]: number;
  };
}

export interface VoteRecord {
  targetId: string;
  timestamp: number;
}

export interface DiscussionEvent {
  id: string;
  actorId: string;
  targetId: string;
  type: 'accuse' | 'defend' | 'skip';
  timestamp: number;
}

export interface GameState {
  phase: 'night' | 'discussion' | 'voting' | 'game-over';
  round: number;
  phaseEndTime: number; // Timestamp when phase auto-ends
  phaseStartTime: number; // Added to calculate relative vote timing
  winner?: 'mafia' | 'villager' | null;
  logs: GameLog[];
  votes: Record<string, VoteRecord>; // voterId -> { targetId, timestamp }
  actions: Record<string, string>; // actorId -> targetId (Night phase)
  discussionEvents: DiscussionEvent[]; // Track Accuse/Defend actions
  suspicion: SuspicionMatrix;
  history: SuspicionMatrix[]; // Array of suspicion matrices (snapshot per round)
  votingHistory: Record<string, string[]>; // playerId -> array of targetIds (past rounds)
  mafiaCount: number;
  villagerCount: number;
}

export interface LobbyData {
  code: string;
  hostId: string;
  status: 'waiting' | 'in-game' | 'finished';
  players: Record<string, Player>;
  createdAt: number;
  game?: GameState;
}

export enum ViewState {
  HOME = 'HOME',
  LOBBY = 'LOBBY',
  GAME = 'GAME'
}