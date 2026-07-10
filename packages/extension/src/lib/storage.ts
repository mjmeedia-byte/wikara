import { defaultSettings, type WikaraSettings, type Plan } from '@wikara/shared';

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

// ---- Plan (cached copy of the user's Supabase plan) ----
// Kept here (no Supabase import) so the content script can read it without
// bundling the whole auth library.
const PLAN_KEY = 'wikara:plan';

/** Read the cached plan. Defaults to 'free'. */
export async function getCachedPlan(): Promise<Plan> {
  const stored = await chrome.storage.local.get(PLAN_KEY);
  return (stored[PLAN_KEY] as Plan | undefined) ?? 'free';
}

/** Cache the plan locally. */
export async function setCachedPlan(plan: Plan): Promise<void> {
  await chrome.storage.local.set({ [PLAN_KEY]: plan });
}
