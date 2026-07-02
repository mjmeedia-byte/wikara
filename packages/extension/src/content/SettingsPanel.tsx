import {
  readingPresets,
  type WikaraSettings,
  type FontFamily,
  type FontSize,
  type LetterSpacing,
  type ImageDisplay,
  type SidebarPosition,
  type ThemeId,
  type ReadingPreset,
} from '@wikara/shared';

interface Props {
  settings: WikaraSettings;
  onChange: (patch: Partial<WikaraSettings>) => void;
  onClose: () => void;
}

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'sand', label: 'Sand' },
  { id: 'archive', label: 'Archive' },
  { id: 'parchment', label: 'Parchment' },
];

const PRESETS: ReadingPreset[] = ['default', 'focus', 'dyslexia', 'compact'];

// A compact segmented button group used throughout the panel.
function Segmented<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <div className="wk-seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={`wk-seg-btn ${value === o.value ? 'is-active' : ''}`}
          onClick={() => onSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The settings panel — opens from the Aa / gear icons in the sidebar header. */
export function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="wk-settings">
      <div className="wk-settings-head">
        <span>Settings</span>
        <button className="wikara-icon-btn" aria-label="Close settings" onClick={onClose}>
          &#10005;
        </button>
      </div>

      <div className="wk-settings-body">
        <section className="wk-field">
          <label className="wk-label">Reading preset</label>
          <div className="wk-seg">
            {PRESETS.map((p) => (
              <button key={p} className="wk-seg-btn" onClick={() => onChange(readingPresets[p])}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </section>

        <section className="wk-field">
          <label className="wk-label">Theme</label>
          <div className="wk-tiles">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`wk-tile ${settings.theme === t.id ? 'is-active' : ''}`}
                onClick={() => onChange({ theme: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="wk-field">
          <label className="wk-label">Font</label>
          <Segmented<FontFamily>
            options={[
              { value: 'system', label: 'System' },
              { value: 'serif', label: 'Serif' },
              { value: 'opendyslexic', label: 'Dyslexic' },
            ]}
            value={settings.fontFamily}
            onSelect={(v) => onChange({ fontFamily: v })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Font size</label>
          <Segmented<FontSize>
            options={[
              { value: 'S', label: 'S' },
              { value: 'M', label: 'M' },
              { value: 'L', label: 'L' },
              { value: 'XL', label: 'XL' },
            ]}
            value={settings.fontSize}
            onSelect={(v) => onChange({ fontSize: v })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Line height</label>
          <input
            type="range"
            className="wk-slider"
            min={0}
            max={1}
            step={0.1}
            value={settings.lineHeight}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Line width</label>
          <input
            type="range"
            className="wk-slider"
            min={0}
            max={1}
            step={0.1}
            value={settings.lineWidth}
            onChange={(e) => onChange({ lineWidth: Number(e.target.value) })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Letter spacing</label>
          <Segmented<LetterSpacing>
            options={[
              { value: 'tight', label: 'Tight' },
              { value: 'normal', label: 'Normal' },
              { value: 'wide', label: 'Wide' },
            ]}
            value={settings.letterSpacing}
            onSelect={(v) => onChange({ letterSpacing: v })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Images</label>
          <Segmented<ImageDisplay>
            options={[
              { value: 'show', label: 'Show' },
              { value: 'small', label: 'Small' },
              { value: 'hide', label: 'Hide' },
            ]}
            value={settings.imageDisplay}
            onSelect={(v) => onChange({ imageDisplay: v })}
          />
        </section>

        <section className="wk-field">
          <label className="wk-label">Sidebar position</label>
          <Segmented<SidebarPosition>
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            value={settings.sidebarPosition}
            onSelect={(v) => onChange({ sidebarPosition: v })}
          />
        </section>
      </div>
    </div>
  );
}
