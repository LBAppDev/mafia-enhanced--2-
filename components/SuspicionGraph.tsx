import React from 'react';
import { SuspicionMatrix, Player } from '../types';

interface SuspicionGraphProps {
  history: SuspicionMatrix[];
  players: Player[];
  userId: string;
}

export const SuspicionGraph: React.FC<SuspicionGraphProps> = ({ history, players, userId }) => {
  if (!history || history.length === 0) return <div>No data</div>;

  const width = 800;
  const height = 400;
  const paddingLeft = 50;
  const paddingRight = 100; // Extra space for names
  const paddingY = 50;
  
  const rounds = history.length;
  // X range: paddingLeft -> width - paddingRight
  const xScale = (index: number) => paddingLeft + (index / (rounds - 1 || 1)) * (width - paddingLeft - paddingRight);
  // Y range: height - paddingY -> paddingY
  const yScale = (value: number) => (height - paddingY) - (value / 100) * (height - paddingY * 2);

  const targets = players.filter(p => p.id !== userId);

  // Modern Neon Palette
  const colors = [
    '#f472b6', // Pink 400
    '#22d3ee', // Cyan 400
    '#a78bfa', // Violet 400
    '#fbbf24', // Amber 400
    '#34d399', // Emerald 400
    '#f87171', // Red 400
  ];

  return (
    <div className="w-full h-full glass-panel rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary to-brand-accent"></div>
      <h3 className="text-white font-heading font-bold text-lg mb-6 flex items-center gap-2">
        <span className="w-2 h-6 bg-brand-accent rounded-full"></span>
        Suspicion Trends
      </h3>
      
      <div className="relative flex-grow flex items-center justify-center">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" style={{filter: 'drop-shadow(0 0 20px rgba(0,0,0,0.3))'}}>
          {/* Grid Lines */}
          <line x1={paddingLeft} y1={yScale(0)} x2={width - paddingRight} y2={yScale(0)} stroke="#334155" strokeWidth="1" />
          <line x1={paddingLeft} y1={yScale(25)} x2={width - paddingRight} y2={yScale(25)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
          <line x1={paddingLeft} y1={yScale(50)} x2={width - paddingRight} y2={yScale(50)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />
          <line x1={paddingLeft} y1={yScale(75)} x2={width - paddingRight} y2={yScale(75)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
          <line x1={paddingLeft} y1={yScale(100)} x2={width - paddingRight} y2={yScale(100)} stroke="#334155" strokeWidth="1" />

          {/* Lines for each player */}
          {targets.map((target, i) => {
            const color = colors[i % colors.length];
            const opacity = target.isAlive ? 1 : 0.3;
            
            const points = history.map((matrix, roundIndex) => {
              const suspicion = matrix[userId] ? matrix[userId][target.id] : 35; 
              return `${xScale(roundIndex)},${yScale(suspicion || 35)}`;
            }).join(' ');

            const lastIndex = history.length - 1;
            const lastSuspicion = history[lastIndex][userId]?.[target.id] || 35;
            const endX = xScale(lastIndex);
            const endY = yScale(lastSuspicion);

            return (
              <g key={target.id} style={{ opacity }}>
                <path 
                  d={`M ${points}`} 
                  fill="none" 
                  stroke={color} 
                  strokeWidth="3"
                  className="transition-all duration-500"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Glow effect for line */}
                <path 
                  d={`M ${points}`} 
                  fill="none" 
                  stroke={color} 
                  strokeWidth="8"
                  opacity="0.2"
                  className="transition-all duration-500 blur-sm"
                />
                {/* End Dot */}
                <circle 
                   cx={endX} 
                   cy={endY} 
                   r="4" 
                   fill={color} 
                   stroke="#0f172a"
                   strokeWidth="2"
                />
                {/* Name Label on Line */}
                <text 
                  x={endX + 10} 
                  y={endY + 4} 
                  fill={color} 
                  fontSize="14" 
                  fontWeight="bold"
                  className="font-sans drop-shadow-md"
                >
                  {target.name}
                </text>
              </g>
            );
          })}
          
          {/* Axis Labels */}
          <text x={(width - paddingRight + paddingLeft)/2} y={height - 15} fill="#94a3b8" fontSize="12" textAnchor="middle" fontWeight="bold">TIMELINE (ROUNDS)</text>
          <text x={15} y={height/2} fill="#94a3b8" fontSize="12" transform={`rotate(-90 15,${height/2})`} textAnchor="middle" fontWeight="bold">SUSPICION LEVEL</text>
        </svg>
      </div>
    </div>
  );
};