import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Terminal, AlertCircle, Wand2, Settings2, Sparkles } from 'lucide-react';

export const ArtDirectorCopilot: React.FC = () => {
  const { prompt, setPrompt, setNegativePrompt } = useAppStore();
  const [conceptInput, setConceptInput] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('http://localhost:11434/api/generate');
  const [modelName, setModelName] = useState('qwen2.5:3b');
  const [isProcessing, setIsProcessing] = useState(false);
  const [critiqueWarnings, setCritiqueWarnings] = useState<string[]>([]);
  const [showConfig, setShowConfig] = useState(false);

  // Fast offline rule-based prompt compiler (no external models required)
  const compileWithLocalRules = (text: string) => {
    const lower = text.toLowerCase();
    const posTokens: string[] = ['masterpiece', 'best quality', 'absurdres'];
    const negTokens: string[] = ['worst quality', 'low quality', 'blurry'];

    // Rule-based entity extraction
    if (lower.includes('girl') || lower.includes('woman')) posTokens.push('1girl', 'solo');
    if (lower.includes('boy') || lower.includes('man')) posTokens.push('1boy', 'solo');
    if (lower.includes('cyber') || lower.includes('hacker')) {
      posTokens.push('cyberpunk', 'neon lighting', 'mechanical details', 'holographic display');
      negTokens.push('nature', 'rural');
    }
    if (lower.includes('night') || lower.includes('dark')) {
      posTokens.push('night', 'dark lighting', 'ambient shadow', 'cinematic glow');
      negTokens.push('harsh daylight', 'sunny');
    }
    if (lower.includes('rain') || lower.includes('wet')) {
      posTokens.push('rain', 'wet pavement', 'water droplets', 'reflective surfaces');
    }

    // Split remaining words
    const extras = text
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['with', 'from', 'into', 'that', 'this'].includes(w));

    const finalPos = Array.from(new Set([...posTokens, ...extras])).join(', ');
    const finalNeg = negTokens.join(', ');

    setPrompt(finalPos);
    setNegativePrompt(finalNeg);
    analyzePromptQuality(finalPos);
  };

  // Connects to local Ollama / LM Studio instance if running
  const compileWithLocalLLM = async () => {
    if (!conceptInput.trim()) return;
    setIsProcessing(true);

    const systemPrompt = `You are an expert anime and SDXL prompt director. The user will give you an unformatted scene concept. You must respond ONLY with a single JSON object containing "positive" and "negative" keys filled with comma-separated Danbooru/e621 style prompt tags. No explanations.`;

    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          prompt: `${systemPrompt}\n\nScene Concept: "${conceptInput}"\nJSON Output:`,
          stream: false,
          format: 'json',
        }),
      });

      if (!res.ok) throw new Error(`Endpoint returned status ${res.status}`);
      const data = await res.json();
      const parsed = JSON.parse(data.response || data.choices?.[0]?.text);

      if (parsed.positive) setPrompt(parsed.positive);
      if (parsed.negative) setNegativePrompt(parsed.negative);
      analyzePromptQuality(parsed.positive || '');
    } catch {
      // Graceful fallback to built-in rules
      compileWithLocalRules(conceptInput);
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzePromptQuality = (targetPrompt: string) => {
    const warnings: string[] = [];
    const lower = targetPrompt.toLowerCase();

    if (lower.split(',').length > 50) {
      warnings.push('Token saturation warning: prompt exceeds 50 tags, diluting model attention.');
    }
    if (lower.includes('masterpiece') && lower.includes('best quality') && lower.includes('hyperdetailed')) {
      warnings.push('Redundant buzzword stacking: multiple broad quality tags weaken specific subject weighting.');
    }
    if (lower.includes('closed eyes') && lower.includes('looking at viewer')) {
      warnings.push('Contradictory gaze tags: "closed eyes" conflicts with "looking at viewer".');
    }

    setCritiqueWarnings(warnings);
  };

  return (
    <div className="h-full w-full bg-[#10121a] p-3.5 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden">
      <div className="space-y-3 overflow-y-auto pr-1">
        <div className="flex items-center justify-between border-b border-[#242939] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-400">
            <Terminal className="w-4 h-4" />
            <span>Art Director Co-Pilot</span>
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-1 hover:bg-[#202434] text-gray-400 hover:text-white rounded cursor-pointer"
            title="Local Endpoint Settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {showConfig && (
          <div className="p-2.5 bg-[#161924] border border-[#262c3e] rounded-lg space-y-2">
            <div>
              <label className="text-[10px] font-mono text-gray-400 block mb-0.5">Ollama / SLM Endpoint:</label>
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                className="w-full bg-[#0e1017] border border-[#272e42] rounded p-1.5 text-gray-200 font-mono text-[10px]"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-gray-400 block mb-0.5">Model Name:</label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full bg-[#0e1017] border border-[#272e42] rounded p-1.5 text-gray-200 font-mono text-[10px]"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] font-mono text-gray-300 block mb-1">Enter Creative Idea / Scene Pitch:</label>
          <textarea
            rows={3}
            value={conceptInput}
            onChange={(e) => setConceptInput(e.target.value)}
            placeholder="e.g. A tired tech hacker girl eating ramen in a wet neon alleyway during a city power outage..."
            className="w-full bg-[#141722] border border-[#282f42] rounded-lg p-2.5 text-gray-200 font-mono text-[11px] outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Real-time Critique Alerts */}
        {critiqueWarnings.length > 0 && (
          <div className="p-2.5 bg-amber-950/30 border border-amber-600/40 rounded-lg space-y-1">
            <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Composition Critique
            </span>
            {critiqueWarnings.map((w, i) => (
              <p key={i} className="text-[10px] text-amber-200/90 leading-tight">
                • {w}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-[#242939]">
        <button
          disabled={isProcessing}
          onClick={() => compileWithLocalRules(conceptInput || prompt)}
          className="flex-1 py-2 bg-[#1c202e] hover:bg-[#272d42] border border-[#2f3750] text-gray-300 font-semibold rounded-lg text-xs cursor-pointer transition flex items-center justify-center gap-1"
        >
          <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Rule Compiler</span>
        </button>

        <button
          disabled={isProcessing}
          onClick={compileWithLocalLLM}
          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 font-semibold text-white rounded-lg text-xs cursor-pointer shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isProcessing ? 'Directing...' : 'Compile with LLM'}</span>
        </button>
      </div>
    </div>
  );
};