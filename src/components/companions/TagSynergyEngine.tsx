import React, { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Zap, Plus, Check, ShieldAlert } from 'lucide-react';

interface SynergyRule {
  trigger: string[];
  suggested: string[];
  explanation: string;
}

interface AntagonismRule {
  setA: string[];
  setB: string[];
  reason: string;
}

const SYNERGY_KNOWLEDGE_BASE: SynergyRule[] = [
  {
    trigger: ['cyberpunk', 'techwear', 'futuristic', 'sci-fi'],
    suggested: ['neon rim light', 'hologram', 'mechanical details', 'reflective vinyl', 'dark rainy street'],
    explanation: 'Reinforces hard-surface specular highlights and atmospheric depth.'
  },
  {
    trigger: ['holding_sword', 'sword', 'katana', 'blade'],
    suggested: ['sheath on hip', 'combat ready stance', 'motion blur', 'hand on hilt', 'sword glare'],
    explanation: 'Stabilizes hand grip and improves blade orientation.'
  },
  {
    trigger: ['gothic', 'vampire', 'dark_fantasy', 'victorian'],
    suggested: ['corset', 'silver filigree', 'velvet texture', 'dim candlelight', 'ornate stone archway'],
    explanation: 'Deepens contrast and historical fabric fidelity.'
  },
  {
    trigger: ['wet', 'rain', 'puddle', 'water'],
    suggested: ['water droplets on face', 'soaked clothes', 'specular highlights', 'misty background'],
    explanation: 'Ensures full-body material consistency under rainfall.'
  },
  {
    trigger: ['sunlight', 'golden_hour', 'sunset'],
    suggested: ['lens flare', 'warm light shafts', 'soft dappled shadows', 'subsurface scattering'],
    explanation: 'Enhances skin lighting realism and natural color temperature.'
  }
];

const ANTAGONISM_RULES: AntagonismRule[] = [
  {
    setA: ['flat colors', 'retro anime', 'cel shading'],
    setB: ['volumetric raytracing', 'photorealistic', 'unreal engine 5', 'octane render'],
    reason: 'Mixing 2D cel shading with 3D raytracing engines leads to muddy shading artifacts.'
  },
  {
    setA: ['monochrome', 'greyscale', 'sketch'],
    setB: ['vibrant neon', 'rainbow hair', 'iridescent'],
    reason: 'Color saturation tags directly conflict with monochrome/greyscale base tokens.'
  },
  {
    setA: ['night', 'starry sky', 'moonlight'],
    setB: ['noon', 'bright sunlight', 'blue sunny sky'],
    reason: 'Conflicting lighting sources confuse sky generation and shadow directions.'
  }
];

export const TagSynergyEngine: React.FC = () => {
  const { prompt, setPrompt } = useAppStore();

  const cleanPromptLower = useMemo(() => {
    return (prompt || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .toLowerCase();
  }, [prompt]);

  const activeSynergies = useMemo(() => {
    return SYNERGY_KNOWLEDGE_BASE.filter((rule) =>
      rule.trigger.some((t) => cleanPromptLower.includes(t.toLowerCase()))
    );
  }, [cleanPromptLower]);

  const detectedClashes = useMemo(() => {
    const clashes: { a: string; b: string; reason: string }[] = [];

    ANTAGONISM_RULES.forEach((rule) => {
      const matchA = rule.setA.find((item) => cleanPromptLower.includes(item.toLowerCase()));
      const matchB = rule.setB.find((item) => cleanPromptLower.includes(item.toLowerCase()));
      if (matchA && matchB) {
        clashes.push({ a: matchA, b: matchB, reason: rule.reason });
      }
    });

    return clashes;
  }, [cleanPromptLower]);

  const appendSuggestion = (tag: string) => {
    const current = (prompt || '').trim();
    if (cleanPromptLower.includes(tag.toLowerCase())) return;
    setPrompt(current ? `${current}, ${tag}` : tag);
  };

  const removeClashingTag = (tag: string) => {
    const tokens = (prompt || '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => {
        const raw = t.replace(/^[\(\[\{]+|[\)\]\}]+$/g, '').split(':')[0].trim().toLowerCase();
        return raw !== tag.toLowerCase();
      });
    setPrompt(tokens.join(', '));
  };

  return (
    <div className="h-full w-full bg-[#11131a] p-3 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
        <div className="flex items-center justify-between border-b border-[#252a3b] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <Zap className="w-4 h-4" />
            <span>Tag Synergy & Antagonism</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            Hooks: <strong className="text-emerald-300">{activeSynergies.length}</strong>
          </span>
        </div>

        {detectedClashes.length > 0 && (
          <div className="p-2.5 bg-rose-950/30 border border-rose-500/50 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] font-mono">
              <ShieldAlert className="w-4 h-4" />
              <span>Aesthetic Clashes Detected</span>
            </div>

            {detectedClashes.map((c, i) => (
              <div key={i} className="text-[11px] bg-[#140b10] p-2 rounded border border-rose-900/50 space-y-1">
                <p className="text-gray-300">{c.reason}</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => removeClashingTag(c.a)}
                    className="px-2 py-0.5 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-200 font-mono text-[10px] cursor-pointer"
                  >
                    Drop "{c.a}"
                  </button>
                  <button
                    onClick={() => removeClashingTag(c.b)}
                    className="px-2 py-0.5 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-200 font-mono text-[10px] cursor-pointer"
                  >
                    Drop "{c.b}"
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">
            Recommended Harmonizers
          </span>

          {activeSynergies.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-[11px]">
              Add core themes (e.g. techwear, sword, gothic, rain) to surface matching clusters.
            </div>
          ) : (
            activeSynergies.map((syn, idx) => (
              <div key={idx} className="bg-[#161924] border border-[#272e42] p-2.5 rounded-lg space-y-1.5">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-emerald-400 font-bold">Trigger: {syn.trigger.join(', ')}</span>
                </div>
                <p className="text-[10px] text-gray-400 leading-tight">{syn.explanation}</p>

                <div className="flex flex-wrap gap-1 pt-1">
                  {syn.suggested.map((sug) => {
                    const isAlreadyAdded = cleanPromptLower.includes(sug.toLowerCase());
                    return (
                      <button
                        key={sug}
                        disabled={isAlreadyAdded}
                        onClick={() => appendSuggestion(sug)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition ${
                          isAlreadyAdded
                            ? 'bg-emerald-950/40 text-emerald-500 border border-emerald-800/40 cursor-default'
                            : 'bg-[#1b2030] hover:bg-emerald-600 hover:text-white text-gray-300 border border-[#2f3750] cursor-pointer'
                        }`}
                      >
                        {isAlreadyAdded ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                        <span>{sug}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};