import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Eraser,
  Gauge,
  Info,
  RefreshCw,
  Search,
  Terminal,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

import {
  swarmClient,
  SwarmDiagnosticEvent,
} from '../api/swarmClient';

type ConsoleLevel = SwarmDiagnosticEvent['level'];

const levelMeta: Record<
  ConsoleLevel,
  {
    label: string;
    icon: React.ReactNode;
    className: string;
  }
> = {
  debug: {
    label: 'DEBUG',
    icon: <Bug className="w-3.5 h-3.5" />,
    className: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  },
  info: {
    label: 'INFO',
    icon: <Info className="w-3.5 h-3.5" />,
    className: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  },
  success: {
    label: 'OK',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  },
  warn: {
    label: 'WARN',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    className: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  },
  error: {
    label: 'ERROR',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    className: 'text-rose-300 bg-rose-500/10 border-rose-500/20',
  },
};

function formatDetails(details: unknown) {
  if (details === undefined) return '';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const base = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${base}.${ms}`;
}

export const DebugConsole: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const [entries, setEntries] = useState<SwarmDiagnosticEvent[]>([]);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | ConsoleLevel>('all');
  const [scope, setScope] = useState<'all' | SwarmDiagnosticEvent['scope']>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'telemetry' | 'perf'>('telemetry');
  const [, setPerfTick] = useState(0);

  useEffect(() => {
    if (!open || activeTab !== 'perf') return;
    const interval = setInterval(() => setPerfTick((t) => t + 1), 250);
    return () => clearInterval(interval);
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = swarmClient.subscribeDiagnostics((event) => {
      setEntries((current) => [...current.slice(-499), event]);
    });
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const emit = (entryLevel: ConsoleLevel, args: unknown[]) => {
      const details = args.length === 1 && typeof args[0] === 'object' ? args[0] : undefined;
      const message = args
        .map((value) => {
          if (typeof value === 'string') return value;
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })
        .join(' ');

      setEntries((current) => [
        ...current.slice(-499),
        {
          id: `console-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          time: new Date().toISOString(),
          level: entryLevel,
          scope: 'system',
          message,
          details,
        },
      ]);
    };

    console.log = (...args) => {
      originalLog(...args);
      emit('info', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      emit('warn', args);
    };

    console.error = (...args) => {
      originalError(...args);
      emit('error', args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (scope !== 'all' && entry.scope !== scope) return false;
      if (!q) return true;
      return [
        entry.message,
        entry.endpoint,
        entry.method,
        entry.scope,
        formatDetails(entry.details),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, query, level, scope]);

  const counts = useMemo(
    () => ({
      total: entries.length,
      error: entries.filter((entry) => entry.level === 'error').length,
      warn: entries.filter((entry) => entry.level === 'warn').length,
      success: entries.filter((entry) => entry.level === 'success').length,
    }),
    [entries]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-[1180px] h-[min(820px,92vh)] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f16]/95 shadow-[0_30px_100px_rgba(0,0,0,.6)] flex flex-col">
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/10 bg-gradient-to-r from-[#121927] to-[#0d131d]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center text-violet-300">
              <Terminal className="w-4 h-4" />
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-100">SwarmUI Diagnostics</div>
              <div className="text-[10px] text-slate-500 font-mono">Live HTTP / WebSocket / workflow telemetry</div>
            </div>

            <div className="hidden md:flex items-center gap-1.5 ml-3 text-[10px] font-mono">
              <span className="px-2 py-1 rounded-md bg-slate-500/10 border border-white/5 text-slate-300">
                {counts.total} events
              </span>
              <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/10 text-emerald-300">
                {counts.success} ok
              </span>
              <span className="px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/10 text-amber-300">
                {counts.warn} warn
              </span>
              <span className="px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/10 text-rose-300">
                {counts.error} error
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-black/40 border border-white/10 p-0.5 rounded-lg text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('telemetry')}
                className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'telemetry'
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-400/30 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Telemetry</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('perf')}
                className={`px-3 py-1 rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'perf'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>Performance Profiler</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'perf' ? (
          <div className="flex-1 overflow-y-auto p-4 bg-[#060a0f] flex flex-col gap-4 font-mono select-none">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-amber-400" /> Component Latency & Dispatch Benchmark
                </span>
                <span className="text-[10px] text-slate-500">
                  Real-time render execution times, wheel events, and re-calculation delays
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if ((window as any).__swarm_perf) {
                    (window as any).__swarm_perf.timings = {};
                    setPerfTick((t) => t + 1);
                  }
                }}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 text-[11px] cursor-pointer transition"
              >
                Clear Metrics
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 pb-2 text-[10px] text-slate-500 font-bold border-b border-white/5 uppercase tracking-wider">
              <span className="col-span-2">Operation / Target</span>
              <span className="text-right">Calls</span>
              <span className="text-right">Avg (ms)</span>
              <span className="text-right">Peak (ms)</span>
            </div>

            <div className="flex-1 divide-y divide-white/5 overflow-y-auto">
              {!Object.keys((window as any).__swarm_perf?.timings || {}).length ? (
                <div className="py-16 text-center text-slate-600 text-xs flex flex-col items-center gap-2">
                  <Gauge className="w-8 h-8 text-slate-700" />
                  <span>No benchmark events recorded yet. Scroll tags or adjust params to profile.</span>
                </div>
              ) : (
                Object.entries((window as any).__swarm_perf?.timings || {}).map(([key, val]: any) => (
                  <div key={key} className="grid grid-cols-5 gap-2 py-2 text-xs items-center">
                    <span className="col-span-2 text-slate-200 font-semibold truncate">{key}</span>
                    <span className="text-right text-slate-400 font-mono text-[11px]">{val.count}</span>
                    <span
                      className={`text-right font-mono font-bold text-[11px] ${
                        val.avgTime > 16 ? 'text-rose-400' : val.avgTime > 8 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {val.avgTime}ms
                    </span>
                    <span
                      className={`text-right font-mono font-bold text-[11px] ${
                        val.maxTime > 16 ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {val.maxTime}ms
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
        <div className="px-4 py-3 border-b border-white/10 bg-[#0d141e] flex flex-wrap items-center gap-2">
          <div className="relative min-w-[230px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter endpoint, error, model, parameter..."
              className="w-full h-9 pl-8 pr-3 text-[11px] bg-[#090e15] border border-white/10 rounded-lg text-slate-200 placeholder:text-slate-600 outline-none"
            />
          </div>

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as 'all' | ConsoleLevel)}
            className="h-9 px-2 text-[11px] bg-[#090e15] border border-white/10 rounded-lg text-slate-300 outline-none"
          >
            <option value="all">All levels</option>
            {Object.keys(levelMeta).map((key) => (
              <option key={key} value={key}>
                {levelMeta[key as ConsoleLevel].label}
              </option>
            ))}
          </select>

          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'all' | SwarmDiagnosticEvent['scope'])}
            className="h-9 px-2 text-[11px] bg-[#090e15] border border-white/10 rounded-lg text-slate-300 outline-none"
          >
            <option value="all">All scopes</option>
            {['connection', 'assets', 'queue', 'workflow', 'image', 'system'].map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>

          <button
            onClick={() => swarmClient.testConnection()}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 text-[11px] flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Ping
          </button>

          <button
            onClick={() => {
              navigator.clipboard.writeText(
                filtered.map((entry) => JSON.stringify(entry)).join('\n')
              );
            }}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 text-[11px] flex items-center gap-1.5"
          >
            <Clipboard className="w-3.5 h-3.5" />
            Copy
          </button>

          <button
            onClick={() => setEntries([])}
            className="h-9 px-3 rounded-lg border border-rose-500/15 bg-rose-500/5 hover:bg-rose-500/10 text-rose-300 text-[11px] flex items-center gap-1.5"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        <div className="px-4 py-2 border-b border-white/5 bg-[#091018] flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              {swarmClient.getBaseUrl()}
            </span>
            <span className="hidden sm:inline">
              Showing {filtered.length} / {entries.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            Live
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 bg-[#060a0f] space-y-1.5">
          {filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-sm">
                <Terminal className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <div className="text-sm text-slate-400">No diagnostic events match current filter.</div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Start an image generation to produce telemetry.
                </div>
              </div>
            </div>
          ) : (
            filtered.map((entry) => {
              const meta = levelMeta[entry.level];
              const isExpanded = !!expanded[entry.id];
              const hasDetails = entry.details !== undefined || entry.endpoint;

              return (
                <div
                  key={entry.id}
                  className={`rounded-xl border border-white/[0.06] bg-[#0c121a] overflow-hidden ${
                    entry.level === 'error' ? 'border-rose-500/15' : ''
                  }`}
                >
                  <div className="min-h-11 px-3 py-2 flex items-start gap-2">
                    <span className="w-[68px] shrink-0 text-[9px] text-slate-600 font-mono pt-1">
                      {formatTime(entry.time)}
                    </span>

                    <span
                      className={`shrink-0 px-1.5 py-1 rounded-md border flex items-center gap-1 text-[9px] font-bold ${meta.className}`}
                    >
                      {meta.icon}
                      {meta.label}
                    </span>

                    <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-white/[0.035] text-[9px] text-slate-500 font-mono">
                      {entry.scope}
                    </span>

                    <div className="flex-1 min-w-0 text-[11px] text-slate-300 leading-5 break-words">
                      {entry.message}
                    </div>

                    {entry.durationMs !== undefined && (
                      <span className="shrink-0 text-[9px] text-slate-600 font-mono pt-1">
                        {entry.durationMs}ms
                      </span>
                    )}

                    {hasDetails && (
                      <button
                        onClick={() =>
                          setExpanded((state) => ({
                            ...state,
                            [entry.id]: !isExpanded,
                          }))
                        }
                        className="shrink-0 w-6 h-6 rounded-md hover:bg-white/5 text-slate-600 hover:text-slate-300 flex items-center justify-center cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2 text-[10px] font-mono">
                        {entry.endpoint && (
                          <div>
                            <span className="text-violet-400">ENDPOINT</span>{' '}
                            <span className="text-slate-300">
                              {entry.method || 'POST'} {entry.endpoint}
                            </span>
                          </div>
                        )}

                        {entry.status !== undefined && (
                          <div>
                            <span className="text-sky-400">STATUS</span>{' '}
                            <span className="text-slate-300">HTTP {entry.status}</span>
                          </div>
                        )}

                        {entry.details !== undefined && (
                          <pre className="whitespace-pre-wrap break-all text-slate-400 leading-5">
                            {formatDetails(entry.details)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
};