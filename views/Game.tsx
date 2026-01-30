import React, { useState, useEffect, useRef } from 'react';
import { LobbyData, Player, GameLog, VoteRecord } from '../types';
import { hostAdvancePhase, submitVote, submitAction, submitDiscussionAction, sendChat, hostResetToLobby } from '../services/firebase';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { SuspicionMeter } from '../components/SuspicionMeter';
import { SuspicionGraph } from '../components/SuspicionGraph';

interface GameProps {
  lobby: LobbyData;
  userId: string;
}

export const Game: React.FC<GameProps> = ({ lobby, userId }) => {
  const game = lobby.game!;
  const player = lobby.players ? lobby.players[userId] : null;
  const players: Player[] = lobby.players ? Object.values(lobby.players) : [];
  const isHost = lobby.hostId === userId;
  
  const [chatMsg, setChatMsg] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [submittedTarget, setSubmittedTarget] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accuse' | 'defend' | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'table' | 'graph'>('table');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const prevLogCount = useRef(0);

  useEffect(() => {
    if (game.logs && game.logs.length > prevLogCount.current) {
        if (isChatOpen) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
            setHasUnread(true);
        }
        prevLogCount.current = game.logs.length;
    }
  }, [game.logs, isChatOpen]);

  useEffect(() => {
      if (isChatOpen) {
          setHasUnread(false);
          setTimeout(() => {
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
      }
  }, [isChatOpen]);

  useEffect(() => {
    setSelectedTarget(null);
    setSubmittedTarget(null);
    setActionType(null);
  }, [game.phase, game.round]);

  useEffect(() => {
    if (game.phase === 'game-over') return;

    const interval = setInterval(() => {
      const now = Date.now();
      const end = game.phaseEndTime || now; 
      const remaining = Math.max(0, Math.ceil((end - now) / 1000));
      
      setTimeLeft(remaining);

      if (isHost && remaining === 0) {
         hostAdvancePhase(lobby);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [game.phaseEndTime, isHost, lobby, game.phase]);

  useEffect(() => {
    if (!isHost || game.phase === 'game-over') return;

    const livingPlayers = players.filter(p => p.isAlive);
    const livingCount = livingPlayers.length;

    if (game.phase === 'voting') {
        const voteCount = Object.keys(game.votes || {}).filter(id => 
            livingPlayers.find(p => p.id === id)
        ).length;
        
        if (voteCount >= livingCount) {
            hostAdvancePhase(lobby);
        }
    } else if (game.phase === 'discussion') {
        const actors = new Set((game.discussionEvents || []).map(e => e.actorId));
        const activeActorCount = livingPlayers.filter(p => actors.has(p.id)).length;

        if (activeActorCount >= livingCount) {
             hostAdvancePhase(lobby);
        }
    } else if (game.phase === 'night') {
        const activeRoles = ['mafia', 'doctor', 'detective'];
        const actingPlayers = livingPlayers.filter(p => activeRoles.includes(p.role || ''));
        
        if (actingPlayers.length > 0) {
             const allActed = actingPlayers.every(p => (game.actions || {})[p.id]);
             if (allActed) {
                 hostAdvancePhase(lobby);
             }
        }
    }
  }, [game.votes, game.discussionEvents, game.actions, game.phase, isHost, players, lobby]);

  const handleNextPhase = () => {
    hostAdvancePhase(lobby);
  };
  
  const handleReturnToLobby = async () => {
      await hostResetToLobby(lobby.code);
  };

  const handleAction = async () => {
    if (!selectedTarget) return;
    
    setSubmittedTarget(selectedTarget); 

    if (game.phase === 'discussion' && actionType) {
        await submitDiscussionAction(lobby.code, userId, selectedTarget, actionType);
        setTimeout(() => setSubmittedTarget(null), 1000); 
    } else if (game.phase === 'voting') {
        await submitVote(lobby.code, userId, selectedTarget);
    } else if (game.phase === 'night') {
        await submitAction(lobby.code, userId, selectedTarget);
    }
  };

  const handleSkip = async () => {
      if (game.phase === 'voting') {
          await submitVote(lobby.code, userId, 'SKIP');
      } else if (game.phase === 'discussion') {
          await submitDiscussionAction(lobby.code, userId, 'SKIP', 'skip');
      }
      setSubmittedTarget('SKIP');
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg.trim() || !player) return;
    await sendChat(lobby.code, userId, player.name, chatMsg);
    setChatMsg('');
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getPhaseColor = () => {
      if (game.phase === 'discussion') return 'from-yellow-400 to-orange-500';
      if (game.phase === 'voting') return 'from-red-500 to-pink-600';
      if (game.phase === 'night') return 'from-indigo-900 to-purple-900';
      return 'from-slate-700 to-slate-900';
  };

  const getRoleStyle = (role: string) => {
    switch(role) {
      case 'mafia': return 'bg-gradient-to-r from-red-600 to-rose-600 shadow-red-500/20';
      case 'doctor': return 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-cyan-500/20';
      case 'detective': return 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/20';
      case 'villager': return 'bg-gradient-to-r from-indigo-500 to-violet-500 shadow-indigo-500/20';
      default: return 'bg-slate-700';
    }
  };

  if (!player) return <div className="h-full flex items-center justify-center text-slate-500 font-bold">Loading Game State...</div>;

  const mySuspicionData = (game.suspicion && game.suspicion[userId]) ? game.suspicion[userId] : {};
  const isActionSubmitted = (selectedTarget !== null && selectedTarget === submittedTarget) || submittedTarget === 'SKIP';

  const voteCounts: Record<string, number> = {};
  if (game.phase === 'voting' && game.votes) {
      (Object.values(game.votes) as VoteRecord[]).forEach(v => {
          voteCounts[v.targetId] = (voteCounts[v.targetId] || 0) + 1;
      });
  }

  // Calculate colors for avatars
  const getAvatarColor = (name: string) => {
    const colors = ['bg-pink-500', 'bg-purple-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-teal-500', 'bg-emerald-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="flex flex-col h-full w-full bg-brand-dark overflow-hidden relative font-sans">
      
      {/* Top HUD */}
      <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-white/5 bg-brand-surface/80 backdrop-blur-md z-20 shrink-0 shadow-lg">
        <div className="flex items-center gap-6">
            <div className="flex flex-col">
                <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full bg-gradient-to-br ${getPhaseColor()} shadow-[0_0_10px_currentColor] animate-pulse`}></span>
                    <h2 className="font-heading font-black text-xl text-white tracking-wide uppercase">
                        {game.phase === 'discussion' && `Day ${game.round}: Discussion`}
                        {game.phase === 'voting' && `Day ${game.round}: Voting`}
                        {game.phase === 'night' && `Night ${game.round}`}
                        {game.phase === 'game-over' && "Game Over"}
                    </h2>
                </div>
            </div>
            
            {/* View Toggle */}
            <div className="hidden lg:flex bg-brand-dark rounded-xl border border-white/10 p-1">
                <button 
                    onClick={() => setViewMode('table')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'table' ? 'bg-brand-surface text-white shadow-sm border border-white/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Grid
                </button>
                <button 
                    onClick={() => setViewMode('graph')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'graph' ? 'bg-brand-surface text-white shadow-sm border border-white/5' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Graph
                </button>
            </div>
        </div>
        
        {/* Timer */}
        {game.phase !== 'game-over' && (
            <div className={`absolute left-1/2 transform -translate-x-1/2 top-1/2 -translate-y-1/2 text-2xl font-mono font-bold tracking-tight bg-black/20 px-4 py-1 rounded-lg border border-white/5 ${timeLeft <= 10 ? 'text-red-500 animate-pulse border-red-500/30' : 'text-slate-200'}`}>
                {formatTime(timeLeft)}
            </div>
        )}

        {/* User Badge */}
        <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-xl text-white text-xs font-bold uppercase tracking-wider shadow-lg border border-white/10 ${getRoleStyle(player.role || '')}`}>
                {player.role || 'Unknown'}
            </div>
            {isHost && game.phase !== 'game-over' && (
                <Button variant="secondary" onClick={handleNextPhase} size="sm" className="hidden sm:flex">
                    Force Next
                </Button>
            )}
        </div>
      </div>

      <div className="flex flex-grow overflow-hidden relative z-10">
        
        {/* MAIN GAME AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 w-full bg-gradient-to-b from-brand-dark to-[#050810]">
          
          {viewMode === 'graph' ? (
              <SuspicionGraph history={game.history || []} players={players} userId={userId} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-32 max-w-7xl mx-auto">
                {players.map(p => {
                const suspicion = mySuspicionData[p.id] || 0;
                const isSelected = selectedTarget === p.id;
                const isMe = p.id === userId;
                
                // Interaction Logic
                let canInteract = false;
                if (game.phase === 'discussion' && player.isAlive && p.isAlive && !isMe) canInteract = true;
                if (game.phase === 'voting' && player.isAlive && p.isAlive && !isMe) canInteract = true;
                if (game.phase === 'night' && player.isAlive && p.isAlive) {
                    if (player.role === 'mafia' && !isMe) canInteract = true;
                    if (player.role === 'doctor') canInteract = true;
                    if (player.role === 'detective' && !isMe) canInteract = true;
                }

                const votesReceived = voteCounts[p.id] || 0;

                return (
                    <div 
                    key={p.id}
                    onClick={() => canInteract && setSelectedTarget(p.id)}
                    className={`
                        relative p-5 rounded-2xl border transition-all duration-300 cursor-pointer group flex flex-col gap-4 overflow-hidden
                        ${!p.isAlive ? 'border-transparent bg-brand-surface/30 opacity-60 grayscale' : 'shadow-lg hover:shadow-2xl hover:-translate-y-1'}
                        ${isSelected 
                            ? 'border-brand-accent bg-brand-surface/90 ring-2 ring-brand-accent shadow-[0_0_30px_rgba(6,182,212,0.2)]' 
                            : 'border-white/5 bg-brand-surface/60 hover:bg-brand-surface hover:border-white/10'
                        }
                    `}
                    >
                    {/* Header */}
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md ${getAvatarColor(p.name)}`}>
                                {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                                <span className={`font-bold text-sm tracking-wide ${p.isAlive ? 'text-white' : 'text-slate-500 line-through'}`}>
                                    {p.name} {isMe && <span className="text-brand-accent text-[10px] ml-1">(YOU)</span>}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                    {p.isAlive ? 'Alive' : 'Eliminated'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Meters */}
                    {p.isAlive && !isMe && (
                        <div className="mt-1">
                            <SuspicionMeter value={suspicion} label="Suspicion" />
                        </div>
                    )}

                    {/* Vote Pills */}
                    {game.phase === 'voting' && p.isAlive && votesReceived > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                            {Array.from({length: votesReceived}).map((_, i) => (
                                <div key={i} className="h-2 w-6 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                            ))}
                        </div>
                    )}
                    
                    {/* Discussion Actions Overlay */}
                    {game.phase === 'discussion' && isSelected && (
                        <div className="flex gap-2 mt-2 pt-3 border-t border-white/5 animate-fade-in">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedTarget(p.id); setActionType('accuse'); }}
                                className={`flex-1 text-[10px] uppercase font-bold py-2.5 rounded-lg border transition-all ${actionType === 'accuse' ? 'bg-red-500 text-white border-red-400 shadow-lg' : 'border-white/10 text-slate-400 hover:bg-red-500/10 hover:text-red-400'}`}
                            >
                                Accuse
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setSelectedTarget(p.id); setActionType('defend'); }}
                                className={`flex-1 text-[10px] uppercase font-bold py-2.5 rounded-lg border transition-all ${actionType === 'defend' ? 'bg-blue-500 text-white border-blue-400 shadow-lg' : 'border-white/10 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400'}`}
                            >
                                Defend
                            </button>
                        </div>
                    )}

                    {/* Selection Glow */}
                    {isSelected && !game.phase.includes('discussion') && (
                        <div className="absolute inset-0 border-2 border-brand-accent rounded-2xl pointer-events-none animate-pulse"></div>
                    )}
                    
                    {/* Confirmation Overlay */}
                    {submittedTarget === p.id && (
                        <div className="absolute inset-0 bg-brand-accent/90 backdrop-blur-[2px] flex items-center justify-center rounded-2xl z-20 animate-fade-in">
                            <div className="text-white font-black uppercase tracking-widest text-sm flex flex-col items-center gap-2">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                {game.phase === 'discussion' ? 'Action Sent' : 'Target Locked'}
                            </div>
                        </div>
                    )}
                    </div>
                );
                })}
            </div>
          )}
          
          {/* Bottom Floating Action Bar */}
          <div className="fixed bottom-8 left-0 right-0 pointer-events-none flex justify-center z-50">
             <div className="pointer-events-auto flex gap-4 bg-brand-surface/90 backdrop-blur-xl p-2 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] border border-white/10 transform transition-transform hover:scale-105">
               
               {/* Skip Buttons */}
               {player.isAlive && game.phase === 'discussion' && !submittedTarget && (
                   <Button onClick={handleSkip} variant="ghost" className="text-xs">
                       PASS TURN
                   </Button>
               )}
               
               {player.isAlive && game.phase === 'voting' && !submittedTarget && (
                   <Button onClick={handleSkip} variant="secondary" className="text-xs">
                       SKIP VOTE
                   </Button>
               )}

               {selectedTarget && player.isAlive && game.phase !== 'game-over' && viewMode === 'table' && (
                 <Button 
                   onClick={handleAction} 
                   className={`min-w-[140px] shadow-xl`}
                   disabled={isActionSubmitted && game.phase !== 'discussion'}
                   variant={game.phase === 'discussion' ? (actionType === 'defend' ? 'secondary' : 'primary') : (isActionSubmitted ? 'secondary' : 'primary')}
                 >
                    {game.phase === 'discussion' 
                        ? (actionType ? `CONFIRM ${actionType.toUpperCase()}` : 'SELECT ACTION')
                        : (isActionSubmitted 
                           ? "CONFIRMED" 
                           : (game.phase === 'voting' ? 'CAST VOTE' : 'CONFIRM TARGET')
                        )
                    }
                 </Button>
               )}
               
               {submittedTarget === 'SKIP' && (
                  <Button disabled variant="secondary" className="opacity-75">
                      PASSED
                  </Button>
               )}
             </div>
          </div>
        </div>

        {/* CHAT TOGGLE BUTTON */}
        <div className="fixed bottom-6 right-6 z-50">
           <button 
             onClick={() => setIsChatOpen(!isChatOpen)}
             className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative
               ${isChatOpen ? 'bg-brand-surface text-slate-400 border border-white/10' : 'bg-brand-primary text-white hover:scale-110 hover:rotate-90'}
             `}
           >
             {isChatOpen ? (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                 </svg>
             ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                 </svg>
             )}
             
             {!isChatOpen && hasUnread && (
                 <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-brand-dark animate-bounce"></span>
             )}
           </button>
        </div>

        {/* SLIDE-OUT CHAT DRAWER */}
        <div className={`fixed inset-y-0 right-0 w-full sm:w-[400px] bg-brand-surface/95 backdrop-blur-xl border-l border-white/10 shadow-2xl z-40 transform transition-transform duration-300 flex flex-col ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
           
           <div className="p-4 border-b border-white/5 flex justify-between items-center bg-brand-dark/50">
               <h3 className="font-heading font-bold text-white tracking-wide">COMMS CHANNEL</h3>
               <button onClick={() => setIsChatOpen(false)} className="text-slate-500 hover:text-white">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
           </div>

           <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans text-sm bg-brand-dark/30 scrollbar-thin">
              {(game.logs || []).map(log => {
                if (log.visibleTo && !log.visibleTo.includes(userId)) return null;
                
                if (log.type === 'chat') {
                    const isMe = log.authorName === player.name;
                    return (
                        <div key={log.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-slide-up`}>
                            <span className="text-[10px] text-slate-500 mb-1 px-1">{log.authorName}</span>
                            <div className={`p-3 rounded-2xl max-w-[85%] ${isMe ? 'bg-brand-primary text-white rounded-tr-sm' : 'bg-brand-surface border border-white/10 text-slate-200 rounded-tl-sm'}`}>
                                {log.text}
                            </div>
                        </div>
                    )
                }
                
                return (
                  <div key={log.id} className="w-full py-2 my-2 animate-fade-in flex justify-center">
                       <div className={`
                         text-xs font-bold px-4 py-2 rounded-full border text-center max-w-[90%] shadow-sm
                         ${log.type === 'alert' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 
                           log.type === 'info' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 
                           log.type === 'clue' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                           'bg-slate-800/50 border-white/5 text-slate-500'}
                       `}>
                          {log.text}
                       </div>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
           </div>

           <div className="p-4 border-t border-white/5 bg-brand-surface">
              <form onSubmit={handleChat} className="relative flex gap-2">
                  <Input 
                    placeholder={player.isAlive ? "Message..." : "Dead players cannot speak."}
                    value={chatMsg}
                    onChange={(e) => setChatMsg(e.target.value)}
                    disabled={!player.isAlive}
                    className="pr-10"
                  />
                  <Button 
                    type="submit"
                    disabled={!chatMsg.trim() || !player.isAlive}
                    size="sm"
                    className="aspect-square !px-0 w-12 flex items-center justify-center rounded-xl"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </Button>
              </form>
           </div>
        </div>
      </div>
      
      {/* Game Over Screen */}
      {game.phase === 'game-over' && (
        <div className="absolute inset-0 bg-brand-dark/95 backdrop-blur-xl flex flex-col items-center justify-center z-50 animate-in fade-in duration-700 overflow-y-auto py-10">
           <div className="text-center space-y-8 max-w-4xl w-full px-6 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-brand-primary to-brand-secondary rounded-full blur-[150px] opacity-20 pointer-events-none"></div>
                
                <h1 className="text-6xl sm:text-8xl font-heading font-black tracking-tighter text-white drop-shadow-2xl relative z-10">
                    {game.winner === 'mafia' ? <span className="text-red-500">MAFIA WINS</span> : <span className="text-blue-500">TOWN WINS</span>}
                </h1>
                
                <p className="text-2xl text-slate-300 font-medium relative z-10">
                    "{game.winner === 'mafia' ? 'Chaos reigns supreme.' : 'Order has been restored.'}"
                </p>

                {/* ROLE REVEAL GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 relative z-10 mt-8 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                    {players.map(p => (
                        <div key={p.id} className={`
                            flex items-center justify-between p-3 rounded-xl border backdrop-blur-sm transition-all
                            ${p.role === 'mafia' 
                                ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }
                        `}>
                            <div className="flex items-center gap-3 text-left">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold shadow-lg ${getAvatarColor(p.name)} ${!p.isAlive && 'grayscale opacity-50'}`}>
                                    {p.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-sm font-bold ${p.role === 'mafia' ? 'text-red-200' : 'text-slate-200'}`}>
                                        {p.name}
                                    </span>
                                    <span className="text-[10px] uppercase font-bold text-slate-500">
                                        {p.isAlive ? <span className="text-green-500">Survived</span> : 'Eliminated'}
                                    </span>
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${getRoleStyle(p.role || '')}`}>
                                {p.role}
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="pt-8 relative z-10">
                    {isHost ? (
                        <Button onClick={handleReturnToLobby} size="lg" className="shadow-2xl w-full sm:w-auto">Return to Lobby</Button>
                    ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-500 bg-black/20 py-2 rounded-lg">
                             <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></div>
                             <span className="text-sm font-bold uppercase tracking-widest">Host Controlling</span>
                        </div>
                    )}
                </div>
           </div>
        </div>
      )}
    </div>
  );
};