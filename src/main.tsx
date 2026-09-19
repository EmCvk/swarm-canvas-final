import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import 'dockview-react/dist/styles/dockview.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);