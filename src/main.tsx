import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import './theme-hive.css';
import './theme-tower.css';
import './theme-genko.css';
import './studio-shared.css';
import './hive-studio.css';
import 'dockview-react/dist/styles/dockview.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);