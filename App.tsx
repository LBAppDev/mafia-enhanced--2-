import React, { useState, useEffect } from 'react';
import { Home } from './views/Home';
import { Lobby } from './views/Lobby';
import { ViewState } from './types';
import { joinLobby } from './services/firebase';

const getUserId = () => {
  try {
    const stored = localStorage.getItem('mafia_user_id');
    if (stored) return stored;
    const newId = `user_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('mafia_user_id', newId);
    return newId;
  } catch (e) {
    // Explicitly log this error so it appears in the console for debugging
    console.error("LocalStorage Access Error (Preview Mode Issue):", e);
    // Fallback for environments where localStorage is blocked
    return `user_${Math.random().toString(36).substr(2, 9)}`;
  }
};

interface AppUser {
  id: string;
  name: string;
  isBot: boolean;
}

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.HOME);
  const [lobbyCode, setLobbyCode] = useState<string>('');
  
  const [isTestMode, setIsTestMode] = useState(false);
  // Initialize user ID safely
  const [users, setUsers] = useState<AppUser[]>(() => [{ id: getUserId(), name: 'You', isBot: false }]);
  const [activeUserIndex, setActiveUserIndex] = useState(0);

  const currentUser = users[activeUserIndex];

  const handleJoinLobby = (code: string, name: string) => {
    setLobbyCode(code);
    setView(ViewState.LOBBY);
    
    if (activeUserIndex === 0) {
        setUsers(prev => {
            const newUsers = [...prev];
            newUsers[0].name = name;
            return newUsers;
        });
    }
  };

  const handleLeaveLobby = () => {
    if (activeUserIndex === 0) {
        setLobbyCode('');
        setView(ViewState.HOME);
    }
  };

  const addTestUser = async () => {
    if (!lobbyCode) {
        alert("Create or Join a lobby first.");
        return;
    }

    const botId = `bot_${Math.random().toString(36).substr(2, 9)}`;
    const botName = `Bot ${users.length}`;
    
    try {
        await joinLobby(lobbyCode, botName, botId);
        setUsers(prev => [...prev, { id: botId, name: botName, isBot: true }]);
    } catch (e: any) {
        alert(`Failed to add bot: ${e.message}`);
    }
  };

  return (
    <div className="h-screen w-screen bg-brand-dark text-slate-100 flex flex-col overflow-hidden font-sans">
       <div className="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-primary via-transparent to-transparent z-0"></div>
       
       {/* Minimal Top Bar */}
       <div className="absolute top-0 left-0 p-4 z-50 flex gap-2">
            {isTestMode && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold uppercase shadow-lg shadow-red-500/20">Dev Mode</span>}
            <button 
               onClick={() => setIsTestMode(!isTestMode)}
               className="text-[10px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-widest"
            >
               {isTestMode ? 'Hide Dev' : 'Dev'}
            </button>
       </div>

       <main className="flex-grow flex flex-col relative z-10 overflow-hidden">
        <div key={currentUser.id} className="h-full w-full">
            {view === ViewState.HOME ? (
            <div className="h-full overflow-y-auto">
                <Home onJoin={(code, name) => handleJoinLobby(code, name)} userId={currentUser.id} />
            </div>
            ) : (
            <Lobby 
                lobbyCode={lobbyCode} 
                userId={currentUser.id} 
                onLeave={handleLeaveLobby} 
            />
            )}
        </div>
       </main>

       {/* Dev Toolbar */}
       {isTestMode && (
         <div className="shrink-0 bg-brand-surface border-t border-white/10 p-2 z-50 flex gap-2 overflow-x-auto pb-6 sm:pb-2 shadow-2xl">
            <button 
                onClick={addTestUser}
                disabled={!lobbyCode}
                className="whitespace-nowrap px-3 py-2 bg-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-white border border-brand-primary/50 text-xs font-bold uppercase rounded-lg disabled:opacity-50 transition-colors"
            >
                + Bot
            </button>
            <div className="w-px bg-white/10 mx-2"></div>
            {users.map((u, idx) => (
                <button
                    key={u.id}
                    onClick={() => setActiveUserIndex(idx)}
                    className={`whitespace-nowrap px-3 py-2 border rounded-lg text-xs font-bold transition-all
                        ${idx === activeUserIndex 
                            ? 'bg-brand-primary border-brand-primary text-white shadow-lg shadow-brand-primary/30' 
                            : 'bg-transparent border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }
                    `}
                >
                    {u.name}
                </button>
            ))}
         </div>
       )}
    </div>
  );
};

export default App;