import { useEffect, useState } from 'react';
import { defaultSettings, type WikaraSettings, type Plan } from '@wikara/shared';
import { getSettings, saveSettings, getCachedPlan } from '../lib/storage';
import { applySettings } from '../lib/applySettings';
import { SettingsPanel } from './SettingsPanel';

type Tab = 'ai' | 'sources' | 'reading';

const TAB_LABELS: Record<Tab, string> = {
  ai: 'AI',
  sources: 'Sources',
  reading: 'Reading',
};

/**
 * The Wikara sidebar. Phase 2–3:
 *  - the shell (header, tabs, footer)
 *  - a working settings panel that changes the article live and persists
 *  - the upgrade button hides for paid (pro/team) users.
 */
export function Sidebar() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>('reading');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<WikaraSettings>(defaultSettings);
  const [plan, setPlan] = useState<Plan>('free');

  // Load saved settings and the cached plan, then apply settings to the article.
  useEffect(() => {
    let active = true;
    void getSettings().then((saved) => {
      if (!active) return;
      setSettings(saved);
      applySettings(saved);
    });
    void getCachedPlan().then((p) => {
      if (active) setPlan(p);
    });
    return () => {
      active = false;
    };
  }, []);

  // Merge a change into settings, save it, and apply it live.
  function update(patch: Partial<WikaraSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(next);
    applySettings(next);
  }

  if (!open) {
    return (
      <button className="wikara-reopen" onClick={() => setOpen(true)} aria-label="Open Wikara">
        W
      </button>
    );
  }

  return (
    <aside className={`wikara-sidebar pos-${settings.sidebarPosition}`} aria-label="Wikara sidebar">
      <div className="wikara-stripe" />

      <header className="wikara-header">
        <div className="wikara-title-row">
          <span className="wikara-title">Article title</span>
          <span className="wikara-badge" title="Article quality (coming soon)">
            &mdash;
          </span>
        </div>
        <div className="wikara-header-actions">
          <button
            className={`wikara-icon-btn ${showSettings ? 'is-active' : ''}`}
            aria-label="Typography settings"
            onClick={() => setShowSettings((s) => !s)}
          >
            Aa
          </button>
          <button
            className={`wikara-icon-btn ${showSettings ? 'is-active' : ''}`}
            aria-label="Settings"
            onClick={() => setShowSettings((s) => !s)}
          >
            &#9881;
          </button>
          <button className="wikara-icon-btn" aria-label="Close Wikara" onClick={() => setOpen(false)}>
            &#10005;
          </button>
        </div>
      </header>

      {showSettings ? (
        <SettingsPanel settings={settings} onChange={update} onClose={() => setShowSettings(false)} />
      ) : (
        <>
          <nav className="wikara-tabs" role="tablist">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={`wikara-tab ${tab === t ? 'is-active' : ''}`}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>

          <div className="wikara-body">
            {tab === 'ai' && <div className="wikara-empty">AI tools will appear here.</div>}
            {tab === 'sources' && <div className="wikara-empty">Source tools will appear here.</div>}
            {tab === 'reading' && <div className="wikara-empty">Reading tools will appear here.</div>}
          </div>

          <footer className="wikara-footer">
            {plan === 'free' && <button className="wikara-upgrade">Upgrade to Pro</button>}
            <div className="wikara-footer-meta">
              <span>v0.1.0</span>
              <button className="wikara-link" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            </div>
          </footer>
        </>
      )}
    </aside>
  );
}
