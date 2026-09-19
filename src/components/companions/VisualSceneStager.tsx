import React, { useState, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Plus, Trash2, Layers, Move, Sparkles } from 'lucide-react';

interface StageRegion {
  id: string;
  name: string;
  x: number; // 0 to 100%
  y: number; // 0 to 100%
  width: number;
  height: number;
  prompt: string;
  weight: number;
  color: string;
}

const REGION_COLORS = [
  'border-cyan-400 bg-cyan-500/15 text-cyan-300',
  'border-amber-400 bg-amber-500/15 text-amber-300',
  'border-purple-400 bg-purple-500/15 text-purple-300',
  'border-emerald-400 bg-emerald-500/15 text-emerald-300',
  'border-rose-400 bg-rose-500/15 text-rose-300',
];

export const VisualSceneStager: React.FC = () => {
  const { width, height, setPrompt } = useAppStore();
  const [regions, setRegions] = useState<StageRegion[]>([
    {
      id: 'reg-base',
      name: 'Background / Setting',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      prompt: 'rainy cyberpunk alleyway, neon signage, wet asphalt reflections, night, atmospheric haze',
      weight: 1.0,
      color: REGION_COLORS[0],
    },
    {
      id: 'reg-subject',
      name: 'Focal Subject',
      x: 25,
      y: 20,
      width: 50,
      height: 70,
      prompt: '1girl, solo, oversized techwear hoodie, reflective trim, relaxed stance, detailed face',
      weight: 1.1,
      color: REGION_COLORS[1],
    },
  ]);

  const [selectedId, setSelectedId] = useState<string>(regions[0]?.id || '');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initX: number; initY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const aspectRatio = width && height ? width / height : 832 / 1216;

  const addRegion = () => {
    const nextIdx = regions.length;
    const newReg: StageRegion = {
      id: `reg-${Date.now()}`,
      name: `Layer ${nextIdx + 1}`,
      x: 20 + (nextIdx * 5) % 40,
      y: 20 + (nextIdx * 5) % 40,
      width: 40,
      height: 40,
      prompt: 'neon rim light, backlit, volumetric glow',
      weight: 1.0,
      color: REGION_COLORS[nextIdx % REGION_COLORS.length],
    };
    setRegions((prev) => [...prev, newReg]);
    setSelectedId(newReg.id);
  };

  const removeRegion = (id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(regions[0]?.id || '');
  };

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedId(id);
    setDraggingId(id);
    const target = regions.find((r) => r.id === id);
    if (!target) return;

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initX: target.x,
      initY: target.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !dragStartRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStartRef.current.mouseX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStartRef.current.mouseY) / rect.height) * 100;

    setRegions((prev) =>
      prev.map((r) => {
        if (r.id !== draggingId) return r;
        const nextX = Math.max(0, Math.min(100 - r.width, dragStartRef.current!.initX + deltaXPercent));
        const nextY = Math.max(0, Math.min(100 - r.height, dragStartRef.current!.initY + deltaYPercent));
        return { ...r, x: Math.round(nextX), y: Math.round(nextY) };
      })
    );
  };

  const compileToPrompt = () => {
    // Orders background first, followed by subject layers separated by BREAK
    const sorted = [...regions].sort((a, b) => b.width * b.height - a.width * a.height);
    const chunks = sorted
      .map((r) => {
        const clean = r.prompt.trim();
        if (!clean) return '';
        return r.weight !== 1.0 ? `(${clean}:${r.weight.toFixed(2)})` : clean;
      })
      .filter(Boolean);

    const compiled = chunks.join(' BREAK\n');
    setPrompt(compiled);
  };

  const selectedRegion = regions.find((r) => r.id === selectedId);

  return (
    <div className="h-full w-full bg-[#10121a] flex flex-col md:flex-row text-xs text-gray-200 select-none overflow-hidden">
      {/* Visual Staging Viewport */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[#0a0b10] border-b md:border-b-0 md:border-r border-[#212534] relative">
        <div className="text-[11px] font-mono text-gray-400 mb-2 flex items-center justify-between w-full max-w-[280px]">
          <span className="flex items-center gap-1.5 font-semibold text-indigo-400">
            <Move className="w-3.5 h-3.5" /> Aspect Grid ({width}×{height})
          </span>
          <button
            onClick={addRegion}
            className="px-2 py-0.5 bg-[#1b1e2c] hover:bg-indigo-600 text-indigo-300 hover:text-white rounded border border-[#2c3246] transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> Region
          </button>
        </div>

        <div
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDraggingId(null)}
          onMouseLeave={() => setDraggingId(null)}
          style={{
            aspectRatio: `${aspectRatio}`,
            maxHeight: '340px',
            width: aspectRatio < 1 ? `${340 * aspectRatio}px` : '320px',
          }}
          className="relative bg-[#141722] border border-[#2d3448] rounded-lg shadow-2xl overflow-hidden cursor-crosshair"
        >
          {regions.map((reg) => {
            const isSelected = reg.id === selectedId;
            return (
              <div
                key={reg.id}
                onMouseDown={(e) => handleMouseDown(reg.id, e)}
                style={{
                  left: `${reg.x}%`,
                  top: `${reg.y}%`,
                  width: `${reg.width}%`,
                  height: `${reg.height}%`,
                }}
                className={`absolute border-2 rounded transition-shadow cursor-move flex flex-col justify-between p-1.5 ${
                  reg.color
                } ${isSelected ? 'ring-2 ring-white shadow-xl z-20' : 'opacity-80 z-10'}`}
              >
                <div className="flex justify-between items-center text-[10px] font-mono font-bold">
                  <span className="truncate">{reg.name}</span>
                  <span>{reg.weight.toFixed(2)}x</span>
                </div>
                <p className="text-[9px] font-mono opacity-85 truncate mt-auto">{reg.prompt}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Layer Settings & Compiler */}
      <div className="w-full md:w-80 p-3.5 flex flex-col justify-between bg-[#12141d] gap-3">
        <div className="flex flex-col gap-2.5 overflow-y-auto pr-1">
          <div className="flex items-center justify-between border-b border-[#252b3e] pb-1.5">
            <span className="font-semibold text-gray-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" /> Active Spatial Zones ({regions.length})
            </span>
          </div>

          {/* Region Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none py-1">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap cursor-pointer transition ${
                  selectedId === r.id ? 'bg-indigo-600 text-white font-medium' : 'bg-[#181b26] text-gray-400 hover:text-white'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>

          {selectedRegion && (
            <div className="flex flex-col gap-2.5 p-2.5 bg-[#171a25] border border-[#272e42] rounded-lg">
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  value={selectedRegion.name}
                  onChange={(e) =>
                    setRegions((prev) =>
                      prev.map((r) => (r.id === selectedRegion.id ? { ...r, name: e.target.value } : r))
                    )
                  }
                  className="bg-transparent font-semibold text-gray-200 text-xs outline-none border-b border-transparent focus:border-indigo-500"
                />
                <button
                  onClick={() => removeRegion(selectedRegion.id)}
                  className="text-gray-500 hover:text-rose-400 p-1 cursor-pointer transition"
                  title="Remove Region"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="text-[10px] font-mono text-gray-400 block mb-1">Zone Prompt Tags:</label>
                <textarea
                  rows={3}
                  value={selectedRegion.prompt}
                  onChange={(e) =>
                    setRegions((prev) =>
                      prev.map((r) => (r.id === selectedRegion.id ? { ...r, prompt: e.target.value } : r))
                    )
                  }
                  className="w-full bg-[#10121a] border border-[#293044] rounded p-2 text-gray-200 font-mono text-[11px] outline-none focus:border-indigo-500 resize-none"
                  placeholder="Insert tags specific to this bounding area..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div>
                  <span className="text-gray-400">Width: {selectedRegion.width}%</span>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    value={selectedRegion.width}
                    onChange={(e) =>
                      setRegions((prev) =>
                        prev.map((r) => (r.id === selectedRegion.id ? { ...r, width: Number(e.target.value) } : r))
                      )
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>
                <div>
                  <span className="text-gray-400">Height: {selectedRegion.height}%</span>
                  <input
                    type="range"
                    min="15"
                    max="100"
                    value={selectedRegion.height}
                    onChange={(e) =>
                      setRegions((prev) =>
                        prev.map((r) => (r.id === selectedRegion.id ? { ...r, height: Number(e.target.value) } : r))
                      )
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono text-gray-400">
                  <span>Emphasis Weight:</span>
                  <span className="text-indigo-400 font-bold">{selectedRegion.weight.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.6"
                  step="0.05"
                  value={selectedRegion.weight}
                  onChange={(e) =>
                    setRegions((prev) =>
                      prev.map((r) => (r.id === selectedRegion.id ? { ...r, weight: Number(e.target.value) } : r))
                    )
                  }
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        <button
          onClick={compileToPrompt}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Compile Scene to Active Prompt</span>
        </button>
      </div>
    </div>
  );
};