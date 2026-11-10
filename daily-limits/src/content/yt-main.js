// Runs in YouTube's own JavaScript world (manifest "world": "MAIN").
//
// Its only job is to read the video metadata YouTube already has in the page
// (video ID, channel ID, channel URL, category) and hand it to yt-content.js
// as a string. It makes no network requests and changes nothing on the page.

(() => {
  'use strict';

  const REQUEST = 'daily-limits:request';
  const REPLY = 'daily-limits:meta';

  function pick(response) {
    try {
      const details = response && response.videoDetails;
      if (!details || typeof details.videoId !== 'string') return null;
      const micro = (response.microformat && response.microformat.playerMicroformatRenderer) || {};
      return {
        videoId: details.videoId,
        channelId: String(details.channelId || micro.externalChannelId || ''),
        category: String(micro.category || ''),
        ownerUrl: String(micro.ownerProfileUrl || ''),
      };
    } catch {
      return null;
    }
  }

  function reply(meta) {
    if (meta) document.dispatchEvent(new CustomEvent(REPLY, { detail: JSON.stringify(meta) }));
  }

  // The response announced by the most recent in-page navigation.
  let lastNavigation = null;

  // Every place the current player response can live.
  function sources() {
    const found = [lastNavigation];
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getPlayerResponse === 'function') {
        found.push(player.getPlayerResponse());
      }
    } catch {
      /* not ready */
    }
    try {
      const flexy = document.querySelector('ytd-watch-flexy');
      if (flexy) found.push(flexy.playerData, flexy.playerResponse);
    } catch {
      /* not ready */
    }
    try {
      found.push(window.ytInitialPlayerResponse);
    } catch {
      /* not ready */
    }
    return found;
  }

  // yt-content.js asks for one specific video. Prefer an answer that has a category.
  document.addEventListener(REQUEST, (event) => {
    const wanted = event.detail;
    let best = null;
    for (const source of sources()) {
      const meta = pick(source);
      if (!meta || meta.videoId !== wanted) continue;
      if (meta.category) {
        best = meta;
        break;
      }
      best = best || meta;
    }
    reply(best);
  });

  // YouTube announces the new page's data when an in-page navigation ends.
  document.addEventListener('yt-navigate-finish', (event) => {
    try {
      const response = event.detail && event.detail.response;
      lastNavigation = (response && response.playerResponse) || null;
      reply(pick(lastNavigation));
    } catch {
      /* ignore */
    }
  });
})();
