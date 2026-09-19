import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Clock, Plus, Trash2, Sparkles } from 'lucide-react';

interface MorphSchedule {
  id: string;
  type: 'morph' | 'delayed_add' | 'early_stop' | 'alternate';
  fromTag: string;
  toTag: string;
  switchStep: number; // e.g. at step 10 out of 28
}

export const PromptMorphScheduler: React.FC = () => {
  const { steps, prompt, setPrompt } = useAppStore();
  const maxSteps = steps || 28;

  const [schedules, setSchedules] = useState<MorphSchedule[]>([
    {
      id: 'morph-1',
      type: 'morph',
      fromTag: 'rough pencil sketch',
      toTag: 'hyperdetailed lineart, clean ink',
      switchStep: Math.round(maxSteps * 0.35),
    },
    {
      id: 'morph-2',
      type: 'delayed_add',
      fromTag: '',
      toTag: 'volumetric rim light, particle glow',
      switchStep: Math.round(maxSteps * 0.6),
    }
  ]);

  const addSchedule = () => {
    setSchedules((prev) => [
      ...prev,
      {
        id: `morph-${Date.now()}`,
        type: 'morph',
        fromTag: 'flat colors',
        toTag: 'intricate painterly shading',
        switchStep: Math.round(maxSteps * 0.5),
      }
    ]);
  };

  const removeSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSchedule = (id: string, updates: Partial<MorphSchedule>) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const compileScheduleSyntax = (s: MorphSchedule): string => {
    const from = s.fromTag.trim();
    const to = s.toTag.trim();
    const st = s.switchStep;

    switch (s.type) {
      case 'morph':
        return `[${from}:${to}:${st}]`;
      case 'delayed_add':
        return `[${to}:${st}]`;
      case 'early_stop':
        return `[${from}::${st}]`;
      case 'alternate':
        return `[${from}|${to}]`;
      default:
        return '';
    }
  };

  const injectIntoPrompt = () => {
    const compiledTokens = schedules.map(compileScheduleSyntax).filter(Boolean);
    if (compiledTokens.length === 0) return;

    const additions = compiledTokens.join(', ');
    const current = prompt.trim();
    setPrompt(current ? `${current}, ${additions}` : additions);
  };

  return (
    <div className="h-full w-full bg-[#11131a] p-3.5 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#252a3b] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
            <Clock className="w-4 h-4" />
            <span>Prompt Morph & Step Scheduler</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            Total Steps: <strong className="text-cyan-300">{maxSteps}</strong>
          </span>
        </div>

        {/* Schedule Cards */}
        <div className="space-y-2.5">
          {schedules.map((s) => {
            const pct = Math.min(100, Math.max(0, (s.switchStep / maxSteps) * 100));

            return (
              <div key={s.id} className="bg-[#161924] border border-[#272e42] p-2.5 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <select
                    value={s.type}
                    onChange={(e) => updateSchedule(s.id, { type: e.target.value as any })}
                    className="bg-[#0e1017] border border-[#272e42] text-[11px] font-mono text-cyan-300 px-2 py-0.5 rounded outline-none"
                  >
                    <option value="morph">Morph: [From : To : Step]</option>
                    <option value="delayed_add">Delayed Start: [Tag : Step]</option>
                    <option value="early_stop">Early Stop: [Tag :: Step]</option>
                    <option value="alternate">Alternate Steps: [Tag A | Tag B]</option>
                  </select>

                  <button
                    onClick={() => removeSchedule(s.id)}
                    className="text-gray-500 hover:text-rose-400 p-1 cursor-pointer transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Input Fields */}
                <div className="grid grid-cols-2 gap-2">
                  {s.type !== 'delayed_add' && (
                    <input
                      type="text"
                      value={s.fromTag}
                      onChange={(e) => updateSchedule(s.id, { fromTag: e.target.value })}
                      placeholder={s.type === 'alternate' ? 'Step 1, 3, 5 Tag...' : 'Initial Phase Tag...'}
                      className="bg-[#0e1017] border border-[#272e42] rounded px-2 py-1 text-[11px] font-mono text-gray-200 outline-none focus:border-cyan-500"
                    />
                  )}
                  {s.type !== 'early_stop' && (
                    <input
                      type="text"
                      value={s.toTag}
                      onChange={(e) => updateSchedule(s.id, { toTag: e.target.value })}
                      placeholder={s.type === 'alternate' ? 'Step 2, 4, 6 Tag...' : 'Refinement Phase Tag...'}
                      className={`bg-[#0e1017] border border-[#272e42] rounded px-2 py-1 text-[11px] font-mono text-gray-200 outline-none focus:border-cyan-500 ${
                        s.type === 'delayed_add' ? 'col-span-2' : ''
                      }`}
                    />
                  )}
                </div>

                {/* Visual Timestep Ribbon Slider */}
                {s.type !== 'alternate' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-gray-400">
                      <span>Timeline Switch: Step {s.switchStep}</span>
                      <span>{pct.toFixed(0)}% of trajectory</span>
                    </div>

                    <div className="relative w-full flex items-center">
                      <input
                        type="range"
                        min="1"
                        max={maxSteps}
                        value={s.switchStep}
                        onChange={(e) => updateSchedule(s.id, { switchStep: Number(e.target.value) })}
                        className="w-full accent-cyan-400 cursor-ew-resize"
                      />
                    </div>
                  </div>
                )}

                {/* Preview token */}
                <div className="bg-[#0c0d14] px-2 py-1 rounded text-[10px] font-mono text-gray-400 flex items-center justify-between">
                  <span>Syntax:</span>
                  <span className="text-cyan-300 font-bold">{compileScheduleSyntax(s)}</span>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={addSchedule}
          className="w-full py-1.5 border border-dashed border-[#2f3750] text-gray-400 hover:text-cyan-300 hover:border-cyan-500/50 rounded-lg text-xs cursor-pointer transition flex items-center justify-center gap-1 font-mono"
        >
          <Plus className="w-3.5 h-3.5" /> Add Step Schedule
        </button>
      </div>

      <button
        onClick={injectIntoPrompt}
        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-cyan-900/30 transition flex items-center justify-center gap-1.5 mt-2"
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Inject Timestep Tags to Prompt</span>
      </button>
    </div>
  );
};