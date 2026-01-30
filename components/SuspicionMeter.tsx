import React from 'react';

interface SuspicionMeterProps {
  value: number; // 0 to 100
  label?: string;
  mini?: boolean;
}

export const SuspicionMeter: React.FC<SuspicionMeterProps> = ({ value, label, mini = false }) => {
  // Gradient calculation
  let gradient = "from-emerald-500 to-emerald-400";
  if (value > 30) gradient = "from-yellow-500 to-amber-500";
  if (value > 60) gradient = "from-orange-500 to-red-500";
  if (value > 85) gradient = "from-red-600 to-rose-600 animate-pulse";

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && !mini && (
        <div className="flex justify-between items-end">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{label}</span>
            <span className="text-[10px] font-mono text-slate-500">{Math.round(value)}%</span>
        </div>
      )}
      <div className={`w-full bg-brand-dark/50 border border-white/5 rounded-full overflow-hidden relative shadow-inner ${mini ? 'h-1.5' : 'h-2.5'}`}>
        <div 
            className={`h-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]`} 
            style={{ width: `${Math.max(5, value)}%` }}
        >
            <div className="absolute inset-0 bg-white/20 w-full h-full opacity-0 hover:opacity-100 transition-opacity"></div>
        </div>
      </div>
    </div>
  );
};