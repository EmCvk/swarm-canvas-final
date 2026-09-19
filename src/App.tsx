import React, { useState } from 'react';
import { Activity, Film, Image as ImageIcon } from 'lucide-react';
import { Workspace } from './components/Workspace';
import { AnimationLab } from './components/AnimationLab';

type AppTab = 'canvas' | 'animation';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('canvas');

  return (
    <div className="sc-app-shell w-screen h-screen overflow-hidden flex flex-col">
      <header className="sc-app-nav">
        <div className="flex items-center gap-2 min-w-0">
          <div className="sc-app-brand">
            <span className="sc-app-brand-mark"><Activity className="w-3.5 h-3.5" /></span>
            <span>SwarmCanvas</span>
          </div>
          <div className="sc-app-tabs" role="tablist" aria-label="Application workspace">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'canvas'}
              onClick={() => setActiveTab('canvas')}
              className={`sc-app-tab ${activeTab === 'canvas' ? 'is-active' : ''}`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Canvas</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'animation'}
              onClick={() => setActiveTab('animation')}
              className={`sc-app-tab ${activeTab === 'animation' ? 'is-active is-animation' : ''}`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Animation Lab</span>
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-500">
          <span className="sc-app-hint">Right-click for workspace actions</span>
          <span className="h-4 w-px bg-white/10" />
          <span className="font-mono">v1</span>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {activeTab === 'canvas' ? <Workspace /> : <AnimationLab />}
      </main>
    </div>
  );
};

export default App;
