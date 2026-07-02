import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './Sidebar';
import tokenStyles from '../styles/tokens.css?inline';
import sidebarStyles from './sidebar.css?inline';

// This is the content script: it runs on every Wikipedia article page and
// injects the Wikara sidebar into it.
//
// We mount the sidebar inside a "shadow root" — an isolated bubble — so that
// Wikipedia's CSS can't affect our styles and ours can't affect Wikipedia's.

const HOST_ID = 'wikara-root';

function mountSidebar(): void {
  // Don't mount twice if the script somehow runs again.
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject our design tokens + sidebar styles into the shadow root.
  const style = document.createElement('style');
  style.textContent = `${tokenStyles}\n${sidebarStyles}`;
  shadow.appendChild(style);

  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <StrictMode>
      <Sidebar />
    </StrictMode>,
  );
}

mountSidebar();
