import React, { useEffect, useState } from 'react';
import { Player, LobbyData } from '../types';
import { subscribeToLobby, leaveLobby, hostStartGame, kickPlayer } from '../services/firebase';
import { Button } from '../components/Button';
import { generateLobbyIntro } from '../services/geminiService';
import { Game } from './Game';

interface LobbyProps {
  lobbyCode: string;
  userId: string;
  onLeave: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ lobbyCode, userId, onLeave }) => {
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [introText, setIntroText] = useState<string>('');
  const [generatingIntro, setGeneratingIntro] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToLobby(lobbyCode, (data) => {
      if (!data) {
          onLeave();
          return;
      }
      if (data.players && !data.players[userId]) {
          onLeave();
          return;
      }
      setLobby(data);
    });
    return () => unsubscribe();
  }, [lobbyCode, userId, onLeave]);

  const handleLeave = async () => {
    await leaveLobby(lobbyCode, userId);
    onLeave();
  };

  const handleKick = async (playerId: string) => {
      if (!lobby) return;
      await kickPlayer(lobbyCode, playerId);
  };

  const handleGenerateIntro = async () => {
    if (!lobby || !lobby.players) return;
    setGeneratingIntro(true);
    const names = (Object.values(lobby.players) as Player[]).map(p => p.name);
    const text = await generateLobbyIntro(names);
    setIntroText(text);
    setGeneratingIntro(false);
  };

  const handleStartGame = async () => {
    if (lobby) {
      await hostStartGame(lobby);
    }
  };

  if (!lobby) return <div className="flex h-full items-center justify-center text-slate-500 font-bold animate-pulse">CONNECTING...</div>;
  
  if (lobby.status === 'in-game' && lobby.game) {
     return <Game lobby={lobby} userId={userId} />;
  }

  const players: Player[] = lobby.players ? Object.values(lobby.players) : [];
  const isHost = lobby.hostId === userId;

  // Generate a stable color based on name for avatar
  const getAvatarColor = (name: string) => {
    const colors = [
        'bg-rose-500', 'bg-pink-500', 'bg-fuchsia-500', 'bg-purple-500', 'bg-violet-500', 
        'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500', 'bg-emerald-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-6 z-10">
                <div className="bg-brand-surface p-4 rounded-2xl border border-white/5 shadow-inner">
                    <h2 className="text-4xl font-heading font-black tracking-widest text-white">{lobby.code}</h2>
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Lobby</h1>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-sm text-slate-400 font-medium">Waiting for players...</span>
                    </div>
                </div>
            </div>
            
            <div className="flex gap-3 z-10 w-full md:w-auto">
               <Button variant="danger" onClick={handleLeave} className="w-full md:w-auto">Exit Lobby</Button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow">
            {/* Player List */}
            <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-lg font-bold text-slate-300 flex items-center gap-2">
                        Players
                        <span className="bg-brand-surface text-brand-primary px-2 py-0.5 rounded text-xs border border-brand-primary/20">
                            {players.length}
                        </span>
                    </h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {players.map((player) => (
                        <div 
                            key={player.id} 
                            className={`
                                relative p-3 rounded-2xl border transition-all duration-300 flex items-center gap-4 group
                                ${player.id === userId 
                                    ? 'bg-brand-primary/10 border-brand-primary/50 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                                    : 'bg-brand-surface border-white/5 hover:border-white/20'
                                }
                            `}
                        >
                            {/* Avatar */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl text-white shadow-lg ${getAvatarColor(player.name)}`}>
                                {player.name.charAt(0).toUpperCase()}
                            </div>
                            
                            <div className="flex flex-col min-w-0 flex-1">
                                <span className={`font-bold truncate ${player.id === userId ? 'text-white' : 'text-slate-300'}`}>
                                    {player.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    {player.id === userId && <span className="text-[10px] bg-brand-primary/20 text-brand-primary px-1.5 py-0.5 rounded font-bold uppercase">YOU</span>}
                                    {player.isHost && <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase">HOST</span>}
                                </div>
                            </div>

                            {isHost && !player.isHost && (
                                <button 
                                    onClick={() => handleKick(player.id)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    title="Kick Player"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))}
                    
                    {/* Empty Slots */}
                    {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                        <div key={i} className="p-4 border border-white/5 border-dashed rounded-2xl flex items-center justify-center opacity-30">
                            <span className="text-xs uppercase font-bold tracking-widest text-slate-500">Empty Slot</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Game Controls Panel */}
            <div className="glass-panel rounded-3xl p-6 flex flex-col gap-6 h-fit shadow-lg border-t-4 border-t-brand-accent">
                <div>
                     <h3 className="text-xl font-heading font-bold text-white mb-1">Briefing Room</h3>
                     <p className="text-xs text-slate-400">Setup and launch operation.</p>
                </div>
                
                <div className="bg-black/30 rounded-xl p-4 min-h-[120px] border border-white/5 relative overflow-hidden">
                    {introText ? (
                        <div className="text-slate-300 text-sm leading-relaxed italic animate-fade-in relative z-10">
                            "{introText}"
                        </div>
                    ) : (
                         <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                            <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            <span className="text-xs italic opacity-50">Waiting for intel...</span>
                        </div>
                    )}
                </div>

                {isHost ? (
                    <div className="flex flex-col gap-3 mt-auto">
                        <Button 
                            variant="secondary" 
                            onClick={handleGenerateIntro}
                            isLoading={generatingIntro}
                            className="w-full"
                        >
                        Generate AI Story
                        </Button>
                        <Button 
                            onClick={handleStartGame}
                            disabled={players.length < 3}
                            className="w-full shadow-lg"
                            size="lg"
                        >
                            START GAME
                        </Button>
                        {players.length < 3 && <p className="text-[10px] text-red-400 text-center font-bold bg-red-500/10 py-2 rounded-lg border border-red-500/20">Needs 3+ Players</p>}
                    </div>
                ) : (
                    <div className="text-center py-6 bg-brand-surface rounded-xl border border-white/5 mt-auto">
                        <div className="flex justify-center mb-2">
                            <span className="relative flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-primary"></span>
                            </span>
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Host is preparing...</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};