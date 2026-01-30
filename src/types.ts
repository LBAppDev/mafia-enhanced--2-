export type Role = 'villager' | 'mafia' | 'doctor' | 'detective';

export interface Player {
  id: string; // Discord User ID or Web ID
  username: string; // fallback for name
  name?: string; // Web uses name
  isHost: boolean;
  isAlive: boolean;
  role?: Role;
  joinedAt?: number;
}

export interface VoteRecord {
  targetId: string;
  timestamp: number;
}

export interface DiscussionEvent {
  id?: string;
  actorId: string;
  targetId: string;
  type: 'accuse' | 'defend' | 'skip';
  timestamp: number;
}

// Suspicion Matrix: observerId -> targetId -> value
export interface SuspicionMatrix {
  [observerId: string]: {
    [targetId: string]: number;
  };
}

export interface GameLog {
  id?: string;
  timestamp?: number;
  text: string;
  type?: 'system' | 'chat' | 'alert' | 'clue' | 'info';
  authorName?: string;
  visibleTo?: string[]; // If undefined, visible to all
}

export interface GameState {
  phase: 'night' | 'discussion' | 'voting' | 'game-over';
  round: number;
  phaseEndTime: number;
  phaseStartTime?: number;
  winner?: 'mafia' | 'villager' | null;
  votes: Record<string, VoteRecord>;
  actions: Record<string, string>; // Night actions
  discussionEvents: DiscussionEvent[];
  suspicion: SuspicionMatrix;
  history?: SuspicionMatrix[];
  votingHistory?: Record<string, string[]>;
  mafiaCount: number;
  villagerCount: number;
  logs: GameLog[];
}

export interface LobbyData {
  code?: string; // Web uses code
  channelId?: string; // Discord uses channelId
  hostId: string;
  status: 'waiting' | 'in-game' | 'finished';
  players: Record<string, Player>; // Changed from Map to Record for Firebase
  createdAt?: number;
  game?: GameState;
}

export enum ViewState {
  HOME = 'HOME',
  LOBBY = 'LOBBY',
  GAME = 'GAME'
}