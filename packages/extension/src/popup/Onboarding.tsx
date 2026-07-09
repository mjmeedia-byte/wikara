import { useState } from 'react';
import { readingPresets, type ReadingPreset } from '@wikara/shared';
import { getSettings, saveSettings, saveOnboarding } from '../lib/storage';
import { Mascot } from './Mascot';

const USE_CASES = [
  { value: 'studying', label: 'Studying', icon: '📚' },
  { value: 'research', label: 'Research', icon: '🔬' },
  { value: 'curious', label: 'Just curious', icon: '💭' },
  { value: 'work', label: 'Work', icon: '💼' },
];

const READING_STYLES: { value: ReadingPreset; label: string; hint: string }[] = [
  { value: 'default', label: 'Standard', hint: 'Balanced default' },
  { value: 'focus', label: 'Focus', hint: 'Larger, calmer' },
  { value: 'dyslexia', label: 'Easy-read', hint: 'Dyslexia-friendly' },
  { value: 'compact', label: 'Compact', hint: 'More on screen' },
];

interface Props {
  email: string;
  onDone: () => void;
}

/** A short 2-question onboarding, ending in a celebration screen. */
export function Onboarding({ email, onDone }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [useCase, setUseCase] = useState<string | undefined>(undefined);

  function pickUseCase(value: string) {
    setUseCase(value);
    setStep(2);
  }

  async function pickReadingStyle(value: ReadingPreset) {
    // Apply the chosen reading style to the article settings right away.
    const settings = await getSettings();
    await saveSettings({ ...settings, ...readingPresets[value] });
    await saveOnboarding({ completed: true, useCase, readingStyle: value });
    setStep(3);
  }

  async function skip() {
    await saveOnboarding({ completed: true, useCase });
    setStep(3);
  }

  if (step === 3) {
    const name = email.split('@')[0];
    return (
      <div className="wikara-popup wk-center">
        <div className="wikara-popup-stripe" />
        <Mascot size={96} />
        <h1>You&rsquo;re all set{name ? `, ${name}` : ''}!</h1>
        <p className="wk-sub">Open any Wikipedia article — Wikara&rsquo;s ready on the right.</p>
        <button className="wk-btn" onClick={onDone}>
          Start reading
        </button>
      </div>
    );
  }

  return (
    <div className="wikara-popup wk-onb">
      <div className="wikara-popup-stripe" />

      <div className="wk-progress">
        <span className={`wk-dot ${step >= 1 ? 'is-on' : ''}`} />
        <span className={`wk-dot ${step >= 2 ? 'is-on' : ''}`} />
        <span className="wk-progress-label">{step} of 2</span>
      </div>

      {step === 1 ? (
        <>
          <h2 className="wk-q">What brings you to Wikipedia?</h2>
          <div className="wk-options wk-options-grid">
            {USE_CASES.map((o) => (
              <button key={o.value} className="wk-option" onClick={() => pickUseCase(o.value)}>
                <span className="wk-option-icon">{o.icon}</span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button className="wk-back" onClick={() => setStep(1)}>
            &larr; Back
          </button>
          <h2 className="wk-q">How do you like to read?</h2>
          <div className="wk-options">
            {READING_STYLES.map((o) => (
              <button
                key={o.value}
                className="wk-option wk-option-row"
                onClick={() => void pickReadingStyle(o.value)}
              >
                <span className="wk-option-label">{o.label}</span>
                <span className="wk-option-hint">{o.hint}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button className="wk-link wk-skip" onClick={() => void skip()}>
        Skip for now
      </button>
    </div>
  );
}
