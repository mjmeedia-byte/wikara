import type { WikaraSettings } from '@wikara/shared';

// The <style> tag we inject into the Wikipedia page to restyle the article.
const STYLE_ID = 'wikara-typography';

const FONT_SIZES: Record<WikaraSettings['fontSize'], number> = {
  S: 15,
  M: 17,
  L: 19,
  XL: 22,
};

const FONT_FAMILIES: Record<WikaraSettings['fontFamily'], string> = {
  system: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  opendyslexic: '"OpenDyslexic", "Comic Sans MS", sans-serif',
};

const LETTER_SPACING: Record<WikaraSettings['letterSpacing'], string> = {
  tight: '-0.01em',
  normal: '0',
  wide: '0.04em',
};

/**
 * Apply the reading settings to the Wikipedia article by injecting (or updating)
 * a <style> tag in the page. Runs on load and on every settings change — no reload.
 * Targets `.mw-parser-output`, the container Wikipedia wraps article content in.
 */
export function applySettings(settings: WikaraSettings): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  // If typography is turned off, remove our styles entirely.
  if (!settings.typography) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const fontSize = FONT_SIZES[settings.fontSize];
  const lineHeight = (1.4 + settings.lineHeight * 0.7).toFixed(2); // 1.40 .. 2.10
  const maxWidth = Math.round(600 + settings.lineWidth * 640); // 600 .. 1240 px
  const fontFamily = FONT_FAMILIES[settings.fontFamily];
  const letterSpacing = LETTER_SPACING[settings.letterSpacing];

  const imageRule =
    settings.imageDisplay === 'hide'
      ? '.mw-parser-output img { display: none !important; }'
      : settings.imageDisplay === 'small'
        ? '.mw-parser-output img { max-width: 180px !important; height: auto !important; }'
        : '';

  style.textContent = `
    .mw-parser-output {
      font-size: ${fontSize}px !important;
      line-height: ${lineHeight} !important;
      font-family: ${fontFamily} !important;
      letter-spacing: ${letterSpacing} !important;
    }
    .mw-parser-output p,
    .mw-parser-output li {
      max-width: ${maxWidth}px;
    }
    ${imageRule}
  `;
}
