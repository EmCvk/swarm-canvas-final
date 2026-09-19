import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Sliders, RotateCcw, Zap } from 'lucide-react';

interface MacroFader {
  id: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  value: number; // 0 to 100 (50 is neutral)
  posTokens: string[];
  negTokens: string[];
}

const DEFAULT_FADERS: MacroFader[] = [
  {
    id: 'atmosphere',
    label: 'Atmosphere & Volumetrics',
    lowLabel: 'Clean / Studio',
    highLabel: 'Dense Haze / Rays',
    value: 50,
    posTokens: ['volumetric fog', 'sunbeam rays', 'hazy dust particles', 'cinematic atmosphere', 'depth of field'],
    negTokens: ['flat lighting', 'harsh studio backdrop'],
  },
  {
    id: 'tension',
    label: 'Dynamic Motion & Drama',
    lowLabel: 'Static Portrait',
    highLabel: 'Action Foreshortening',
    value: 50,
    posTokens: ['dynamic action pose', 'foreshortening', 'dramatic angle', 'motion blur', 'flying debris'],
    negTokens: ['static pose', 'stiff', 'symmetrical portrait'],
  },
  {
    id: 'lighting',
    label: 'Chiaroscuro & Contrast',
    lowLabel: 'Soft Ambient',
    highLabel: 'Hard Rim Light',
    value: 50,
    posTokens: ['deep shadows', 'dramatic rim lighting', 'high contrast', 'strong backlight'],
    negTokens: ['washed out', 'low contrast', 'flat shading'],
  },
  {
    id: 'finish',
    label: 'Art Finish / Texture',
    lowLabel: 'Flat Anime Cel',
    highLabel: 'Intricate Painterly',
    value: 50,
    posTokens: ['painterly texture', 'intricate fine lines', 'detailed shading', 'layered brushstrokes'],
    negTokens: ['flat colors', 'simple shading', 'minimalist'],
  },
  {
    id: 'detail',
    label: 'Detail Saturation',
    lowLabel: 'Minimalist Focus',
    highLabel: 'Micro Filigree',
    value: 50,
    posTokens: ['extremely detailed ornaments', 'filigree accents', 'complex patterns', 'hyperdetailed surface'],
    negTokens: ['plain surfaces', 'simple background'],
  },
];

export const LatentSynthesizer: React.FC = () => {
  const { prompt, negativePrompt, setPrompt, setNegativePrompt } = useAppStore();
  const [faders, setFaders] = useState<MacroFader[]>(DEFAULT_FADERS);

  const handleSliderChange = (id: string, val: number) => {
    setFaders((prev) => prev.map((f) => (f.id === id ? { ...f, value: val } : f)));
  };

  const resetAll = () => {
    setFaders(DEFAULT_FADERS.map((f) => ({ ...f, value: 50 })));
  };

  const applyMixerToPrompts = () => {
    let currentPos = prompt;
    let currentNeg = negativePrompt;

    faders.forEach((f) => {
      // Deviation from neutral (50)
      const diff = (f.value - 50) / 50; // -1.0 to +1.0

      if (diff > 0.15) {
        // Apply positive tokens with weight
        const weight = (1.0 + diff * 0.4).toFixed(2);
        const tokensToInject = f.posTokens.slice(0, Math.ceil(diff * f.posTokens.length));
        const tokenString = `(${tokensToInject.join(', ')}:${weight})`;

        if (!currentPos.includes(tokensToInject[0])) {
          currentPos = `${currentPos.trim()}, ${tokenString}`;
        }

        // Apply counter negatives
        f.negTokens.forEach((neg) => {
          if (!currentNeg.toLowerCase().includes(neg.toLowerCase())) {
            currentNeg = currentNeg.trim() ? `${currentNeg.trim()}, ${neg}` : neg;
          }
        });
      }
    });

    setPrompt(currentPos);
    setNegativePrompt(currentNeg);
  };

  return (
    <div className="h-full w-full bg-[#11131a] p-4 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#242939] pb-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-indigo-400">
          <Sliders className="w-4 h-4" />
          <span>Latent Macro Console</span>
        </div>
        <button
          onClick={resetAll}
          className="text-gray-400 hover:text-white flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-[#181b26] border border-[#2b3042] cursor-pointer transition"
        >
          <RotateCcw className="w-3 h-3" /> Reset 50%
        </button>
      </div>

      {/* Faders Array */}
      <div className="flex-1 py-3 overflow-y-auto space-y-4">
        {faders.map((f) => {
          const intensity = Math.abs(f.value - 50) * 2; // 0 to 100%
          const isBoosted = f.value > 50;

          return (
            <div key={f.id} className="bg-[#161924] border border-[#262c3e] p-2.5 rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-mono">
                <span className="font-semibold text-gray-200">{f.label}</span>
                <span className={isBoosted ? 'text-indigo-400 font-bold' : 'text-gray-500'}>
                  {f.value === 50 ? 'Neutral' : `${f.value}% (+${intensity}%)`}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                value={f.value}
                onChange={(e) => handleSliderChange(f.id, Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-ew-resize"
              />

              <div className="flex justify-between text-[10px] font-mono text-gray-500">
                <span>{f.lowLabel}</span>
                <span>{f.highLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={applyMixerToPrompts}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5"
      >
        <Zap className="w-3.5 h-3.5" />
        <span>Bake Synthesizer Weights to Prompts</span>
      </button>
    </div>
  );
};