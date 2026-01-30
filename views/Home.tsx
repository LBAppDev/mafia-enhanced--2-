import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { createLobby, joinLobby } from '../services/firebase';

interface HomeProps {
  onJoin: (code: string, name: string, id: string) => void;
  userId: string;
}

export const Home: React.FC<HomeProps> = ({ onJoin, userId }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter your alias.");
      return;
    }
    setError('');
    setIsCreating(true);
    try {
      const newCode = await createLobby(name, userId);
      onJoin(newCode, name, userId);
    } catch (e: any) {
      setError(e.message || "Failed to create lobby.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !code.trim()) {
      setError("Name and Lobby Code required.");
      return;
    }
    setError('');
    setIsJoining(true);
    try {
      await joinLobby(code.toUpperCase(), name, userId);
      onJoin(code.toUpperCase(), name, userId);
    } catch (e: any) {
      setError(e.message || "Failed to join lobby.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full w-full p-4 relative overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-primary/20 rounded-full blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-brand-secondary/20 rounded-full blur-[100px] animate-pulse-slow delay-1000"></div>

      <div className="w-full max-w-md mx-auto z-10 flex flex-col items-center animate-slide-up">
        <div className="mb-10 text-center relative group">
             <div className="absolute inset-0 bg-gradient-to-r from-brand-primary to-brand-secondary blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
             <h1 className="text-6xl sm:text-7xl font-heading font-black tracking-tighter text-white drop-shadow-2xl relative z-10">
                MAFIA
             </h1>
             <span className="block text-2xl sm:text-3xl font-heading font-bold gradient-text tracking-[0.3em] -mt-2 relative z-10">
                ENHANCED
             </span>
             <p className="text-slate-400 font-medium mt-4 tracking-wide text-sm">AI-Powered Social Deduction</p>
        </div>

        <div className="w-full glass-panel rounded-3xl p-8 shadow-2xl border border-white/10 flex flex-col gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent"></div>
            
            <Input 
                label="Codename" 
                placeholder="Ex. 'The Don' or 'Alice'" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg text-center font-bold"
                autoFocus
            />
            
            {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-200 text-xs font-bold text-center py-3 px-4 rounded-xl animate-fade-in flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    {error}
                </div>
            )}

            <div className="flex flex-col gap-4 mt-2">
                <Button onClick={handleCreate} isLoading={isCreating} size="lg" className="w-full shadow-brand-primary/20">
                    Create New Game
                </Button>

                <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-white/10"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-bold uppercase tracking-wider">OR JOIN</span>
                    <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div className="flex gap-3">
                    <Input 
                        placeholder="CODE" 
                        value={code} 
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        maxLength={4}
                        className="text-center tracking-[0.2em] uppercase font-black text-xl w-32"
                    />
                    <Button variant="secondary" onClick={handleJoin} isLoading={isJoining} className="flex-1">
                        Enter
                    </Button>
                </div>
            </div>
        </div>
        
        <p className="mt-8 text-slate-600 text-xs font-medium">
            v2.0 • Powered by Google Gemini
        </p>
      </div>
    </div>
  );
};