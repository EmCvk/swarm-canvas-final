import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { User, Shirt, Smile, Plus, Sparkles, BookOpen } from 'lucide-react';

interface CharacterProfile {
  id: string;
  name: string;
  dnaTags: string; // immutable physical features
  outfits: { id: string; name: string; tags: string }[];
  currentOutfitId: string;
  expression: string;
  pose: string;
}

const DEFAULT_PROFILES: CharacterProfile[] = [
  {
    id: 'char-1',
    name: 'Kira (Cyber Tech)',
    dnaTags: '1girl, silver hair, asymmetrical bob cut, amber eyes, piercing on left eyebrow, slender build',
    outfits: [
      {
        id: 'out-1',
        name: 'Tactical Streetwear',
        tags: 'black cropped technical jacket, cargo strap pants, fingerless gloves, combat boots',
      },
      {
        id: 'out-2',
        name: 'Formal Gothic',
        tags: 'corset dress, lace trim, choker with silver pendant, dark satin sleeves',
      },
      {
        id: 'out-3',
        name: 'Casual Lounge',
        tags: 'oversized knit sweater, off-shoulder, striped thigh-high socks',
      },
    ],
    currentOutfitId: 'out-1',
    expression: 'confident smirk, slight blush',
    pose: 'sitting on desk, one knee pulled to chest',
  },
];

export const CharacterDossier: React.FC = () => {
  const { prompt, setPrompt } = useAppStore();
  const [profiles, setProfiles] = useState<CharacterProfile[]>(() => {
    try {
      const saved = localStorage.getItem('swarm_character_dossiers');
      return saved ? JSON.parse(saved) : DEFAULT_PROFILES;
    } catch {
      return DEFAULT_PROFILES;
    }
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(profiles[0]?.id || '');

  useEffect(() => {
    localStorage.setItem('swarm_character_dossiers', JSON.stringify(profiles));
  }, [profiles]);

  const activeChar = profiles.find((p) => p.id === activeProfileId) || profiles[0];

  const updateActiveChar = (updates: Partial<CharacterProfile>) => {
    setProfiles((prev) => prev.map((p) => (p.id === activeChar.id ? { ...p, ...updates } : p)));
  };

  const addOutfit = () => {
    const newOutfit = {
      id: `out-${Date.now()}`,
      name: 'New Wardrobe',
      tags: 'white button-up shirt, pleated black skirt',
    };
    updateActiveChar({
      outfits: [...activeChar.outfits, newOutfit],
      currentOutfitId: newOutfit.id,
    });
  };

  const assembleCharacterPrompt = () => {
    const currentOutfit = activeChar.outfits.find((o) => o.id === activeChar.currentOutfitId);

    const assembledParts = [
      activeChar.dnaTags.trim(),
      currentOutfit ? currentOutfit.tags.trim() : '',
      activeChar.expression.trim(),
      activeChar.pose.trim(),
    ].filter(Boolean);

    const assembledString = assembledParts.join(', ');
    const existing = prompt.trim();
    setPrompt(existing ? `${assembledString}, ${existing}` : assembledString);
  };

  return (
    <div className="h-full w-full bg-[#10121a] p-3.5 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden">
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {/* Profile Header & Selector */}
        <div className="flex items-center justify-between border-b border-[#252a3b] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
            <BookOpen className="w-4 h-4" />
            <span>Character Dossier</span>
          </div>

          <div className="flex gap-1">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setActiveProfileId(p.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition ${
                  activeProfileId === p.id ? 'bg-indigo-600 text-white' : 'bg-[#181b26] text-gray-400 hover:text-white'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* DNA Block */}
        <div className="bg-[#151824] border border-[#272e42] p-2.5 rounded-lg space-y-1.5">
          <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <User className="w-3.5 h-3.5" /> Immutable DNA (Physical Identity)
          </span>
          <textarea
            rows={2}
            value={activeChar.dnaTags}
            onChange={(e) => updateActiveChar({ dnaTags: e.target.value })}
            className="w-full bg-[#0d0f17] border border-[#282f44] rounded p-2 text-gray-200 font-mono text-[11px] outline-none focus:border-indigo-500 resize-none"
            placeholder="Eyes, hair, body traits, scars, piercings..."
          />
        </div>

        {/* Wardrobe Vault */}
        <div className="bg-[#151824] border border-[#272e42] p-2.5 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Shirt className="w-3.5 h-3.5" /> Wardrobe Vault
            </span>
            <button
              onClick={addOutfit}
              className="text-[10px] font-mono text-indigo-300 hover:text-white flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add Outfit
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto scrollbar-none py-0.5">
            {activeChar.outfits.map((outfit) => (
              <button
                key={outfit.id}
                onClick={() => updateActiveChar({ currentOutfitId: outfit.id })}
                className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap cursor-pointer transition border ${
                  activeChar.currentOutfitId === outfit.id
                    ? 'bg-purple-900/40 border-purple-500 text-purple-200'
                    : 'bg-[#181b26] border-[#2b3144] text-gray-400 hover:text-gray-200'
                }`}
              >
                {outfit.name}
              </button>
            ))}
          </div>

          {activeChar.outfits.find((o) => o.id === activeChar.currentOutfitId) && (
            <input
              type="text"
              value={activeChar.outfits.find((o) => o.id === activeChar.currentOutfitId)!.tags}
              onChange={(e) => {
                const updated = activeChar.outfits.map((o) =>
                  o.id === activeChar.currentOutfitId ? { ...o, tags: e.target.value } : o
                );
                updateActiveChar({ outfits: updated });
              }}
              className="w-full bg-[#0d0f17] border border-[#282f44] rounded p-2 text-gray-200 font-mono text-[11px] outline-none focus:border-indigo-500"
              placeholder="Jacket, pants, shoes, fabrics..."
            />
          )}
        </div>

        {/* Emotion & Pose Dial */}
        <div className="grid grid-cols-2 gap-2 bg-[#151824] border border-[#272e42] p-2.5 rounded-lg">
          <div>
            <label className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Smile className="w-3 h-3" /> Expression
            </label>
            <input
              type="text"
              value={activeChar.expression}
              onChange={(e) => updateActiveChar({ expression: e.target.value })}
              className="w-full bg-[#0d0f17] border border-[#282f44] rounded p-1.5 text-gray-200 font-mono text-[10px] outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block mb-1">
              Pose / Action
            </label>
            <input
              type="text"
              value={activeChar.pose}
              onChange={(e) => updateActiveChar({ pose: e.target.value })}
              className="w-full bg-[#0d0f17] border border-[#282f44] rounded p-1.5 text-gray-200 font-mono text-[10px] outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      <button
        onClick={assembleCharacterPrompt}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5 mt-2"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Assemble & Inject Dossier to Active Prompt</span>
      </button>
    </div>
  );
};