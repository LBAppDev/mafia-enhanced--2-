import React, { useEffect, useState } from 'react';
import { onValue, ref, set, getDatabase, remove } from 'firebase/database';
import { LobbyData } from '../types';
import { processDiscussionPhase, processVotingPhase, processNightPhase } from '../services/gameEngine';

export const DiscordGameManager: React.FC = () => {
    const [activeLobbies, setActiveLobbies] = useState<Record<string, LobbyData>>({});
    const db = getDatabase();

    // 1. Sync Discord Lobbies from Firebase
    useEffect(() => {
        const lobbiesRef = ref(db, 'discord_lobbies');
        const unsubscribe = onValue(lobbiesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setActiveLobbies(data);
            } else {
                setActiveLobbies({});
            }
        });
        return () => unsubscribe();
    }, []);

    // 2. The Game Loop (Runs every second)
    useEffect(() => {
        const interval = setInterval(async () => {
            const now = Date.now();

            for (const [key, lobby] of Object.entries(activeLobbies)) {
                // Only process games that are running
                if (lobby.status !== 'in-game' || !lobby.game) continue;
                
                const game = lobby.game;
                
                // If Timer Expired -> Advance Phase
                if (now >= game.phaseEndTime) {
                    console.log(`[Discord Engine] Advancing Phase for Channel ${lobby.channelId}`);
                    
                    let nextLobbyState: LobbyData = JSON.parse(JSON.stringify(lobby)); // Deep clone
                    
                    if (game.phase === 'discussion') {
                        nextLobbyState = processDiscussionPhase(nextLobbyState);
                    } else if (game.phase === 'voting') {
                        nextLobbyState = processVotingPhase(nextLobbyState);
                    } else if (game.phase === 'night') {
                        nextLobbyState = processNightPhase(nextLobbyState);
                    }

                    // Commit new state to Firebase
                    if (nextLobbyState.game?.phase === 'game-over') {
                        // Mark finished. The UI will show Game Over.
                        await set(ref(db, `discord_lobbies/${key}`), nextLobbyState);
                        
                        // Optional: Auto-delete lobby after 2 minutes to clean up DB
                        // setTimeout(() => remove(ref(db, `discord_lobbies/${key}`)), 120000);
                    } else {
                        await set(ref(db, `discord_lobbies/${key}`), nextLobbyState);
                    }
                }
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [activeLobbies]);

    const activeCount = Object.values(activeLobbies).filter(l => l.status === 'in-game').length;

    // Render a small status indicator in the bottom left
    if (activeCount === 0) return null;

    return (
        <div className="fixed bottom-4 left-4 z-50 bg-indigo-900/90 text-indigo-100 p-3 rounded-lg border border-indigo-500/50 shadow-lg text-xs font-mono animate-fade-in">
            <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <strong>Discord Host Active</strong>
            </div>
            <div className="mt-1 opacity-75">
                Managing {activeCount} game{activeCount !== 1 ? 's' : ''}
            </div>
        </div>
    );
};