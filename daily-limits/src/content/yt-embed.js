// Embedded YouTube players on other sites (every frame at /embed/).
//
// An embed has no category data, so it cannot be classified, and time spent
// in it cannot be attributed. Rather than leave that as a way round the
// limit, embeds are replaced with a link to the video on youtube.com, where
// the normal rules apply. Pages on the always-allowed list keep their embeds
// (Khan Academy lessons are YouTube embeds).

(() => {
  'use strict';
  if (window.top === window) return; // opened directly: yt-content.js handles it

  const hide = document.createElement('style');
  hide.textContent = 'body { display: none !important; }';
  document.documentElement.appendChild(hide);

  let covered = true;
  document.addEventListener(
    'play',
    (event) => {
      if (covered && event.target instanceof HTMLMediaElement) event.target.pause();
    },
    true,
  );

  function uncover() {
    covered = false;
    hide.remove();
  }

  function showLink() {
    const videoId = location.pathname.split('/').filter(Boolean)[1] || '';
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:8px;background:#16181c;color:#c9ced6;text-align:center;' +
      'font:14px/1.4 system-ui,sans-serif;padding:12px;';
    const text = document.createElement('div');
    text.textContent = 'Embedded YouTube players are turned off by Daily Limits.';
    box.appendChild(text);
    if (/^[\w-]{6,20}$/.test(videoId)) {
      const link = document.createElement('a');
      link.href = `https://www.youtube.com/watch?v=${videoId}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open this video on YouTube';
      link.style.cssText = 'color:#8ab4f8;';
      box.appendChild(link);
    }
    document.documentElement.appendChild(box);
  }

  try {
    chrome.runtime.sendMessage({ type: 'embed-check' }, (answer) => {
      if (chrome.runtime.lastError || !answer || !answer.ok) {
        uncover(); // the extension is not running; nothing to enforce
        return;
      }
      if (answer.allow) uncover();
      else showLink();
    });
  } catch {
    uncover();
  }
})();
