import { defaultSettings, type WikaraSettings } from '@wikara/shared';

// A single key under which we store the whole settings object.
const SETTINGS_KEY = 'wikara:settings';

/**
 * Read settings from chrome.storage.local, filling in any missing fields with
 * defaults. Always returns a complete settings object.
 */
export async function getSettings(): Promise<WikaraSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] as Partial<WikaraSettings> | undefined;
  return { ...defaultSettings, ...saved };
}

/** Save the full settings object to chrome.storage.local. */
export async function saveSettings(settings: WikaraSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
