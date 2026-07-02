// User-adjustable settings for the Wikara reading experience.
//
// The shape and defaults live here in `shared` because both the extension and
// the website may need to know them. The actual chrome.storage read/write lives
// in the extension, since chrome.storage only exists there.

export type ThemeId = 'default' | 'sepia' | 'dusk' | 'sand' | 'archive' | 'parchment';
export type FontFamily = 'system' | 'serif' | 'opendyslexic';
export type FontSize = 'S' | 'M' | 'L' | 'XL';
export type LetterSpacing = 'tight' | 'normal' | 'wide';
export type ImageDisplay = 'show' | 'small' | 'hide';
export type SidebarPosition = 'left' | 'right';
export type ReadingPreset = 'default' | 'focus' | 'dyslexia' | 'compact';

export interface WikaraSettings {
  // Free feature toggles (wired up to their features in Phase 4)
  typography: boolean;
  darkMode: boolean;
  focusMode: boolean;
  fixedTOC: boolean;
  bannerSuppression: boolean;
  citationPreviews: boolean;
  // Appearance controls (the settings panel)
  theme: ThemeId;
  fontFamily: FontFamily;
  fontSize: FontSize;
  lineHeight: number; // slider value 0..1
  lineWidth: number; // slider value 0..1
  letterSpacing: LetterSpacing;
  imageDisplay: ImageDisplay;
  sidebarPosition: SidebarPosition;
}

export const defaultSettings: WikaraSettings = {
  typography: true,
  darkMode: false,
  focusMode: false,
  fixedTOC: true,
  bannerSuppression: true,
  citationPreviews: true,
  theme: 'default',
  fontFamily: 'system',
  fontSize: 'M',
  lineHeight: 0.5,
  lineWidth: 0.5,
  letterSpacing: 'normal',
  imageDisplay: 'show',
  sidebarPosition: 'right',
};

// A reading preset applies a bundle of typography settings in one click.
export const readingPresets: Record<ReadingPreset, Partial<WikaraSettings>> = {
  default: { fontFamily: 'system', fontSize: 'M', lineHeight: 0.5, lineWidth: 0.5, letterSpacing: 'normal' },
  focus: { fontFamily: 'serif', fontSize: 'L', lineHeight: 0.7, lineWidth: 0.4, letterSpacing: 'normal' },
  dyslexia: { fontFamily: 'opendyslexic', fontSize: 'L', lineHeight: 0.8, lineWidth: 0.5, letterSpacing: 'wide' },
  compact: { fontFamily: 'system', fontSize: 'S', lineHeight: 0.3, lineWidth: 0.7, letterSpacing: 'tight' },
};
