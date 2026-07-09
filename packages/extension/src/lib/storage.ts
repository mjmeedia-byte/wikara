import { defaultSettings, type WikaraSettings } from '@wikara/shared';

// ---- Reading settings ----
const SETTINGS_KEY = 'wikara:settings';

/** Read settings from chrome.storage.local, filling missing fields with defaults. */
export async function getSettings(): Promise<WikaraSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Partial<WikaraSettings> | undefined;
  return { ...defaultSettings, ...saved };
}

/** Save the full settings object to chrome.storage.local. */
export async function saveSettings(settings: WikaraSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ---- Onboarding ----
const ONBOARDING_KEY = 'wikara:onboarding';

export interface OnboardingState {
  completed: boolean;
  useCase?: string;
  readingStyle?: string;
}

/** Read whether the user has finished onboarding (and their answers). */
export async function getOnboarding(): Promise<OnboardingState> {
  const stored = await chrome.storage.local.get(ONBOARDING_KEY);
  return (stored[ONBOARDING_KEY] as OnboardingState | undefined) ?? { completed: false };
}

/** Save onboarding state. */
export async function saveOnboarding(state: OnboardingState): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_KEY]: state });
}
