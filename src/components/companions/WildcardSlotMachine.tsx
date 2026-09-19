import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Dices, Lock, Unlock, Plus, Trash2, RotateCw, Sparkles, Search } from 'lucide-react';

interface WildcardSlot {
  id: string;
  wildcardName: string;
  selectedValue: string;
  isLocked: boolean;
}

export const WildcardSlotMachine: React.FC = () => {
  const { wildcardsList, prompt, setPrompt } = useAppStore();
  const [searchFilter, setSearchFilter] = useState('');
  const [showWildcardPicker, setShowWildcardPicker] = useState(false);

  // Default active slots
  const [slots, setSlots] = useState<WildcardSlot[]>([
    {
      id: 'slot-1',
      wildcardName: 'outfit',
      selectedValue: 'gothic lolita dress',
      isLocked: false,
    },
    {
      id: 'slot-2',
      wildcardName: 'hair_color',
      selectedValue: 'silver hair',
      isLocked: true,
    },
    {
      id: 'slot-3',
      wildcardName: 'environment',
      selectedValue: 'neon alleyway with rain puddles',
      isLocked: false,
    },
  ]);

  const filteredWildcardFiles = useMemo(() => {
    if (!searchFilter.trim()) return wildcardsList.slice(0, 80);
    const q = searchFilter.toLowerCase();
    return wildcardsList.filter((w) => w.toLowerCase().includes(q)).slice(0, 80);
  }, [wildcardsList, searchFilter]);

  const addSlot = (wildcardName: string) => {
    const cleanName = wildcardName.replace(/\.txt$/i, '');
    const newSlot: WildcardSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      wildcardName: cleanName,
      selectedValue: `__${cleanName}__`,
      isLocked: false,
    };
    setSlots((prev) => [...prev, newSlot]);
    setShowWildcardPicker(false);
    setSearchFilter('');
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleLock = (id: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isLocked: !s.isLocked } : s))
    );
  };

  // Roll un-locked slots
  const spinUnlockedSlots = () => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.isLocked) return slot;
        return {
          ...slot,
          selectedValue: `__${slot.wildcardName}__`,
        };
      })
    );
  };

  // Inject current slots into active prompt
  const injectSlotsToPrompt = () => {
    const wildcardTokens = slots.map((s) => `__${s.wildcardName}__`);
    if (wildcardTokens.length === 0) return;

    let current = prompt.trim();
    // Append wildcards if they are not already in the prompt
    wildcardTokens.forEach((token) => {
      if (!current.includes(token)) {
        current = current ? `${current}, ${token}` : token;
      }
    });

    setPrompt(current);
  };

  return (
    <div className="h-full w-full bg-[#10121a] p-3.5 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#252a3b] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400">
            <Dices className="w-4 h-4" />
            <span>Wildcard Slot Machine</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowWildcardPicker(!showWildcardPicker)}
              className="px-2 py-0.5 rounded bg-[#181b26] hover:bg-amber-600 hover:text-white border border-[#2c3246] text-amber-300 font-mono text-[10px] cursor-pointer transition flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Slot
            </button>
            <button
              onClick={spinUnlockedSlots}
              className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 font-bold text-white font-mono text-[10px] cursor-pointer transition shadow-md flex items-center gap-1"
            >
              <RotateCw className="w-3 h-3" /> Spin
            </button>
          </div>
        </div>

        {/* Wildcard Quick Picker Modal / Drawer */}
        {showWildcardPicker && (
          <div className="bg-[#151824] border border-amber-500/40 p-2.5 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-300">
              <span className="font-semibold text-amber-400">Add from Installed Wildcards</span>
              <span className="text-gray-500">({wildcardsList.length} files)</span>
            </div>

            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-2 text-gray-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search wildcard name..."
                className="w-full bg-[#0d0f17] border border-[#272e42] rounded pl-6 pr-2 py-1 text-[11px] text-gray-200 outline-none focus:border-amber-500"
              />
            </div>

            <div className="max-h-36 overflow-y-auto flex flex-wrap gap-1">
              {filteredWildcardFiles.length === 0 ? (
                <span className="text-gray-500 text-[10px] p-2">No matching wildcard files found.</span>
              ) : (
                filteredWildcardFiles.map((w) => (
                  <button
                    key={w}
                    onClick={() => addSlot(w)}
                    className="px-2 py-0.5 rounded bg-[#1c202e] hover:bg-amber-600 hover:text-white border border-[#2c3246] text-[10px] font-mono text-gray-300 cursor-pointer transition truncate max-w-[150px]"
                    title={w}
                  >
                    __{w.replace(/\.txt$/i, '')}__
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Active Reel Slots */}
        <div className="space-y-2">
          {slots.map((slot, index) => (
            <div
              key={slot.id}
              className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                slot.isLocked
                  ? 'bg-[#151922] border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                  : 'bg-[#161824] border-[#282f44]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-gray-500 font-bold">#{index + 1}</span>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-[11px] font-bold text-amber-300 truncate">
                    __{slot.wildcardName}__
                  </span>
                  <span className="font-mono text-[10px] text-gray-400 truncate">
                    {slot.isLocked ? `Locked: ${slot.selectedValue}` : 'Reel Unlocked (Rolls dynamic)'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleLock(slot.id)}
                  className={`p-1.5 rounded cursor-pointer transition border ${
                    slot.isLocked
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-[#1a1e2b] text-gray-400 hover:text-white border-[#2b3246]'
                  }`}
                  title={slot.isLocked ? 'Slot is Frozen' : 'Slot will spin'}
                >
                  {slot.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => removeSlot(slot.id)}
                  className="p-1.5 rounded bg-[#1a1e2b] hover:bg-rose-900/50 text-gray-500 hover:text-rose-300 border border-[#2b3246] cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={injectSlotsToPrompt}
        className="w-full py-2 bg-amber-600 hover:bg-amber-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-amber-900/30 transition flex items-center justify-center gap-1.5 mt-2"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Inject Slot Machine to Prompt</span>
      </button>
    </div>
  );
};