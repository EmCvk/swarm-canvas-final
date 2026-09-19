// src/components/ModelPlaceholder.tsx
import React from 'react';
import { Box, Sparkles, Layers } from 'lucide-react';

interface Props {
  name: string;
  type: 'model' | 'lora' | 'embedding' | 'wildcard';
}

export const ModelPlaceholder: React.FC<Props> = ({ name, type }) => {
  const getGradients = () => {
    if (type === 'model') return 'from-cyan-950/80 via-[#101923] to-[#0b1017] text-cyan-400 border-cyan-500/20';
    if (type === 'lora') return 'from-indigo-950/80 via-[#131726] to-[#0d0f18] text-indigo-400 border-indigo-500/20';
    if (type === 'embedding') return 'from-emerald-950/80 via-[#0f1f1d] to-[#0a1413] text-emerald-400 border-emerald-500/20';
    return 'from-purple-950/80 via-[#181324] to-[#0f0b18] text-purple-400 border-purple-500/20';
  };

  const getIcon = () => {
    if (type === 'model') return <Box className="w-8 h-8 opacity-60" />;
    if (type === 'lora') return <Layers className="w-8 h-8 opacity-60" />;
    if (type === 'embedding') return <Sparkles className="w-8 h-8 opacity-60" />;
    return <Box className="w-8 h-8 opacity-60" />;
  };

  return (
    <div className={`w-full h-full bg-linear-to-br ${getGradients()} border flex flex-col items-center justify-center p-3 relative select-none overflow-hidden`}>
      {/* Decorative vector circuit background */}
      <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <pattern id={`pattern-${type}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="currentColor" />
        </pattern>
        <rect width="100%" height="100%" fill={`url(#pattern-${type})`} />
      </svg>

      <div className="z-10 mb-2 p-2 rounded-xl bg-black/30 border border-white/5 shadow-inner">
        {getIcon()}
      </div>

      <span className="z-10 font-mono text-[10px] font-semibold tracking-wider uppercase opacity-80">
        {type}
      </span>
      <span className="z-10 text-[11px] text-gray-300 text-center font-medium line-clamp-2 px-1 mt-0.5" title={name}>
        {name.split('/').pop()?.replace(/\.[^/.]+$/, '')}
      </span>
    </div>
  );
};