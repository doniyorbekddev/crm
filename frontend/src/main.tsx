import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('index.html ichida #root elementi topilmadi');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
