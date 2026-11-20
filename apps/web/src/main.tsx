import { StrictMode, type ReactElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App';
import { readAppData } from './app-data';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Missing #root element in index.html.');
}

const tree: ReactElement = (
  <StrictMode>
    <App initialData={readAppData()} />
  </StrictMode>
);

// With SSR the markup is already in the document, so attach to it. When the
// page is served without SSR (static fallback), mount from scratch instead.
if (container.firstElementChild) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
