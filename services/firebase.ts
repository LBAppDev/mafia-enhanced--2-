import * as firebase from "firebase/app";
import { getDatabase, ref, set, push, onValue, child, get, update, remove, onDisconnect, Database } from "firebase/database";
import { Player, LobbyData, GameState, GameLog, VoteRecord, DiscussionEvent } from "../types";
import { initializeGame, processDiscussionPhase, processVotingPhase, processNightPhase } from "./gameEngine";

const firebaseConfig = {
  apiKey: "AIzaSyBuTatBkHL1m0Kz2LqHfqIHeQq8C3hpdkA",
  authDomain: "mafiaenhanced2.firebaseapp.com",
  projectId: "mafiaenhanced2",
  storageBucket: "mafiaenhanced2.firebasestorage.app",
  messagingSenderId: "746188840363",
  appId: "1:746188840363:web:c8364b324d33977f1b06ee",
  measurementId: "G-3Y4D2MN46E"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const db: Database = getDatabase(app);

// Helper to generate a short random code
const generateLobbyCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const createLobby = async (hostName: string, hostId: string): Promise<string> => {
  const code = generateLobbyCode();
  const lobbyRef = ref(db, `lobbies/${code}`);
  
  const snapshot = await get(lobbyRef);
  if (snapshot.exists()) {
    return createLobby(hostName, hostId);
  }

  const initialPlayer: Player = {
    id: hostId,
    name: hostName,
    isHost: true,
    isAlive: true,
    joinedAt: Date.now()
  };

  const lobbyData: LobbyData = {
    code,
    hostId,
    status: 'waiting',
    createdAt: Date.now(),
    players: {
      [hostId]: initialPlayer
    }
  };

  await set(lobbyRef, lobbyData);
  
  // Set up disconnect handler for the host immediately
  const playerRef = ref(db, `lobbies/${code}/players/${hostId}`);
  onDisconnect(playerRef).remove();

  return code;
};

export const joinLobby = async (code: string, playerName: string, playerId: string): Promise<boolean> => {
  const lobbyRef = ref(db, `lobbies/${code}`);
  const snapshot = await get(lobbyRef);

  if (!snapshot.exists()) {
    throw new Error("Lobby not found");
  }

  const lobbyData = snapshot.val() as LobbyData;
  if (lobbyData.status !== 'waiting') {
    throw new Error("Game already started");
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName,
    isHost: false,
    isAlive: true,
    joinedAt: Date.now()
  };

  const playerRef = ref(db, `lobbies/${code}/players/${playerId}`);
  await update(ref(db, `lobbies/${code}/players`), {
    [playerId]: newPlayer
  });

  // Automatically remove player if they disconnect (close tab, refresh, etc.)
  onDisconnect(playerRef).remove();

  return true;
};

export const subscribeToLobby = (code: string, callback: (data: LobbyData | null) => void) => {
  const lobbyRef = ref(db, `lobbies/${code}`);
  return onValue(lobbyRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
};

export const leaveLobby = async (code: string, playerId: string) => {
  const playerRef = ref(db, `lobbies/${code}/players/${playerId}`);
  await remove(playerRef);
  
  // Clean up disconnect handler since we left intentionally
  onDisconnect(playerRef).cancel();

  // Check if lobby is empty, if so, delete it
  const playersRef = ref(db, `lobbies/${code}/players`);
  const snapshot = await get(playersRef);
  if (!snapshot.exists()) {
    await remove(ref(db, `lobbies/${code}`));
  }
};

export const kickPlayer = async (code: string, playerId: string) => {
  const playerRef = ref(db, `lobbies/${code}/players/${playerId}`);
  await remove(playerRef);
};

// --- GAME LOGIC TRIGGERS ---

export const hostStartGame = async (lobby: LobbyData) => {
  const newLobbyState = initializeGame(lobby);
  await set(ref(db, `lobbies/${lobby.code}`), newLobbyState);
};

export const hostResetToLobby = async (code: string) => {
    // Reset status to waiting and remove the game state object
    await update(ref(db, `lobbies/${code}`), {
        status: 'waiting',
        game: null
    });
};

export const hostAdvancePhase = async (lobby: LobbyData) => {
  let newLobbyState: LobbyData = lobby;
  const phase = lobby.game?.phase;

  if (phase === 'discussion') {
    newLobbyState = processDiscussionPhase(lobby);
  } else if (phase === 'voting') {
    newLobbyState = processVotingPhase(lobby);
  } else if (phase === 'night') {
    newLobbyState = processNightPhase(lobby);
  }
  
  if (newLobbyState !== lobby) {
    await set(ref(db, `lobbies/${lobby.code}`), newLobbyState);
  }
};

export const submitVote = async (lobbyCode: string, playerId: string, targetId: string) => {
  const voteRecord: VoteRecord = {
    targetId,
    timestamp: Date.now()
  };
  await update(ref(db, `lobbies/${lobbyCode}/game/votes`), {
    [playerId]: voteRecord
  });
};

export const submitAction = async (lobbyCode: string, playerId: string, targetId: string) => {
  await update(ref(db, `lobbies/${lobbyCode}/game/actions`), {
    [playerId]: targetId
  });
};

export const submitDiscussionAction = async (lobbyCode: string, playerId: string, targetId: string, type: 'accuse' | 'defend' | 'skip') => {
  const logsRef = ref(db, `lobbies/${lobbyCode}/game/discussionEvents`);
  const snapshot = await get(logsRef);
  const currentEvents = snapshot.val() || [];

  const newEvent: DiscussionEvent = {
    id: Date.now().toString() + Math.random().toString().slice(2,5),
    actorId: playerId,
    targetId,
    type,
    timestamp: Date.now()
  };

  await update(ref(db, `lobbies/${lobbyCode}/game`), {
    discussionEvents: [...currentEvents, newEvent]
  });
};

export const sendChat = async (lobbyCode: string, playerId: string, name: string, text: string) => {
  const logsRef = ref(db, `lobbies/${lobbyCode}/game/logs`);
  const snapshot = await get(logsRef);
  const currentLogs = snapshot.val() || [];
  
  const newLog: GameLog = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    text,
    type: 'chat',
    authorName: name
  };
  
  await update(ref(db, `lobbies/${lobbyCode}/game`), {
    logs: [...currentLogs, newLog]
  });
};