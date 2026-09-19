import React, { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { danbooru } from '../../api/danbooruService';
import { BarChart3 } from 'lucide-react';

interface AnalyzedTag {
  raw: string;
  clean: string;
  postCount: number | null;
  tier: 'Anchor' | 'Mainstay' | 'Niche' | 'Obscure';
  tierColor: string;
}

export const TagRarityInspector: React.FC = () => {
  const prompt = useAppStore((s) => s.prompt);

  const analyzedTags = useMemo<AnalyzedTag[]>(() => {
    if (!prompt || !prompt.trim()) return [];

    // Strip inline comments first
    const uncommented = prompt.replace(/\/\*[\s\S]*?\*\//g, '');

    const tokens = uncommented
      .split(',')
      .map((t) => t.trim())
      .filter((t) => Boolean(t) && !t.startsWith('<'));

    return tokens.map((t) => {
      // Strip weights, parentheses, colons, and normalize underscores
      const clean = t
        .replace(/^[\(\[\{]+|[\)\]\}]+$/g, '')
        .split(':')[0]
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

      const count = danbooru?.getPostCount ? danbooru.getPostCount(clean) : null;

      let tier: 'Anchor' | 'Mainstay' | 'Niche' | 'Obscure' = 'Obscure';
      let tierColor = 'text-purple-400 bg-purple-950/40 border-purple-800/50';

      if (count !== null && count !== undefined) {
        if (count >= 500_000) {
          tier = 'Anchor';
          tierColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
        } else if (count >= 50_000) {
          tier = 'Mainstay';
          tierColor = 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50';
        } else if (count >= 5_000) {
          tier = 'Niche';
          tierColor = 'text-amber-400 bg-amber-950/40 border-amber-800/50';
        } else {
          tier = 'Obscure';
          tierColor = 'text-rose-400 bg-rose-950/40 border-rose-800/50';
        }
      }

      return {
        raw: t,
        clean,
        postCount: count,
        tier,
        tierColor,
      };
    });
  }, [prompt]);

  const metrics = useMemo(() => {
    const total = analyzedTags.length;
    if (total === 0) return { anchors: 0, obscureCount: 0, balanceRating: 'Empty' };

    const obscureCount = analyzedTags.filter((t) => t.tier === 'Obscure').length;
    const anchors = analyzedTags.filter((t) => t.tier === 'Anchor').length;

    let balanceRating = 'Well Balanced';
    if (obscureCount > total * 0.4) balanceRating = 'High Latent Drift Risk';
    else if (anchors === 0 && total > 5) balanceRating = 'Weak Anatomical Anchor';

    return { anchors, obscureCount, balanceRating };
  }, [analyzedTags]);

  const formatCount = (n: number | null) => {
    if (n === null || n === undefined || n === 0) return 'Unindexed';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
    return `${n}`;
  };

  return (
    <div className="h-full w-full bg-[#11131a] p-3 flex flex-col justify-between text-xs text-gray-200 select-none overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
        <div className="flex items-center justify-between border-b border-[#252a3b] pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-fuchsia-400">
            <BarChart3 className="w-4 h-4" />
            <span>Tag Frequency & Rarity</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400">
            Active Tokens: <strong className="text-fuchsia-300">{analyzedTags.length}</strong>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-[#161824] border border-[#262c3e] p-2 rounded-lg font-mono text-[10px]">
          <div>
            <span className="text-gray-500 block">Balance Rating:</span>
            <span
              className={`font-bold ${
                metrics.balanceRating === 'Well Balanced' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {metrics.balanceRating}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block">Obscure Ratio:</span>
            <span className="text-gray-200 font-bold">
              {metrics.obscureCount} / {analyzedTags.length} tags
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[9px] font-mono text-gray-500 border-b border-[#202434] pb-1">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> &gt;500k</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 50k–500k</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 5k–50k</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> &lt;5k</span>
        </div>

        <div className="space-y-1">
          {analyzedTags.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-[11px]">
              No active prompt tokens found.
            </div>
          ) : (
            analyzedTags.map((item, idx) => (
              <div
                key={`${item.clean}-${idx}`}
                className="p-1.5 rounded bg-[#161822] border border-[#252a3b] flex items-center justify-between font-mono text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="text-gray-600 text-[10px]">#{idx + 1}</span>
                  <span className="text-gray-200 truncate">{item.raw}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-400">{formatCount(item.postCount)}</span>
                  <span className={`px-1.5 py-0.2 rounded border text-[9px] font-bold ${item.tierColor}`}>
                    {item.tier}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};