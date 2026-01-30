import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5 w-full group">
      {label && (
        <label className="text-slate-400 font-sans text-xs font-semibold uppercase tracking-wider ml-1 group-focus-within:text-brand-accent transition-colors">
            {label}
        </label>
      )}
      <div className="relative">
        <input
          className={`w-full bg-brand-surface/50 border border-white/10 text-slate-100 px-4 py-3.5 rounded-xl 
            focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary 
            transition-all duration-300 placeholder-slate-600 font-sans shadow-inner
            backdrop-blur-sm ${className}`}
          {...props}
        />
        {/* Glow effect on focus */}
        <div className="absolute inset-0 rounded-xl bg-brand-primary/20 blur-md opacity-0 transition-opacity duration-300 pointer-events-none -z-10 group-focus-within:opacity-100" />
      </div>
    </div>
  );
};