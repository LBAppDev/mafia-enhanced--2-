import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled,
  size = 'md',
  ...props 
}) => {
  const baseStyles = "relative overflow-hidden font-heading font-bold tracking-wide transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2";
  
  const sizeStyles = {
    sm: "px-4 py-1.5 text-xs rounded-lg",
    md: "px-6 py-3 text-sm rounded-xl",
    lg: "px-8 py-4 text-base rounded-2xl"
  };

  const variants = {
    primary: "bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-[0_4px_20px_rgba(99,102,241,0.4)] hover:shadow-[0_4px_25px_rgba(236,72,153,0.5)] border border-transparent hover:border-white/20",
    secondary: "bg-brand-surface border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 hover:border-white/20 shadow-lg",
    danger: "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-[0_4px_15px_rgba(239,68,68,0.4)] hover:shadow-[0_4px_25px_rgba(239,68,68,0.6)] border border-transparent",
    ghost: "bg-transparent text-slate-400 hover:text-white hover:bg-white/5"
  };

  return (
    <button 
      className={`${baseStyles} ${sizeStyles[size]} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {/* Loading Spinner */}
      {isLoading ? (
        <>
          <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Wait...</span>
        </>
      ) : children}
      
      {/* Shine effect on hover for primary/danger */}
      {(variant === 'primary' || variant === 'danger') && !disabled && (
        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent z-10 pointer-events-none" />
      )}
    </button>
  );
};