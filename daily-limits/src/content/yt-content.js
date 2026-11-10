// YouTube content script (isolated world, top frame, document_start).
//
// - Covers and pauses the player on every watch page until the service worker
//   has classified the video. Nothing plays before the check completes.
// - Re-runs the check on every in-page navigation (YouTube is a single page app).
// - Adds a class to <html> when the entertainment limit is used up; yt.css
//   uses it to hide the home feed and recommendations.
//
// The decision itself (allowlist, category, limit) is made by the service
// worker. This script only gathers metadata and applies the answer.

(() => {
  'use strict';
  if (window.top !== window) return;

  const REQUEST = 'daily-limits:request';
  const REPLY = 'daily-limits:meta';
  const POLL_MS = 250;
  const GIVE_UP_MS = 8000;
  const TRANSITION_MS = 3000;

  const root = document.documentElement;
  let current = null; // { videoId, state: 'pending' | 'allowed' | 'blocked', startedAt, best, sent }
  let transitionTimer = null;
  let lastHref = null;
  let lastPlaying = null;
  let dead = false;
  const pausedByUs = new Set();

  // --- talking to the service worker --------------------------------------

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(chrome.runtime.lastError ? null : response);
        });
      } catch {
        // The extension was reloaded or removed. This copy is orphaned.
        shutDown();
        resolve(null);
      }
    });
  }

  function shutDown() {
    dead = true;
    current = null;
    clearTimeout(transitionTimer);
    root.classList.remove('dl-pending', 'dl-cover', 'dl-exhausted');
    resume();
  }

  // --- page kind (copy of ytPage in src/lib/domains.js; keep in step) ------

  function pageKind() {
    const host = location.hostname.toLowerCase();
    if (/^(accounts|consent|studio)\.youtube\.com$/.test(host)) return { kind: 'neutral' };
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.some((p) => p.toLowerCase() === 'shorts')) return { kind: 'shorts' };
    const first = (parts[0] || '').toLowerCase();
    if (first === 'watch') {
      const v = new URLSearchParams(location.search).get('v');
      return v ? { kind: 'watch', videoId: v } : { kind: 'other' };
    }
    if ((first === 'embed' || first === 'live' || first === 'v') && parts[1]) {
      return { kind: 'watch', videoId: parts[1] };
    }
    return { kind: 'other' };
  }

  // --- holding the player --------------------------------------------------

  function holding() {
    return root.classList.contains('dl-pending') || root.classList.contains('dl-cover');
  }

  function pauseAll() {
    for (const video of document.querySelectorAll('video')) {
      if (!video.paused) {
        pausedByUs.add(video);
        video.pause();
      }
    }
  }

  function resume() {
    for (const video of pausedByUs) {
      if (video.isConnected && video.paused) video.play().catch(() => {});
    }
    pausedByUs.clear();
  }

  function hold() {
    root.classList.add('dl-pending');
    pauseAll();
  }

  function release() {
    root.classList.remove('dl-pending');
    resume();
  }

  // Media events do not bubble, but they can be captured at the document.
  function onMediaEvent(event) {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement)) return;
    if (holding() && (event.type === 'play' || event.type === 'playing') && !video.paused) {
      pausedByUs.add(video);
      video.pause();
    }
    reportPlaying();
  }
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied']) {
    document.addEventListener(type, onMediaEvent, true);
  }

  // Lets the worker count a silent video that is playing while the user is "idle".
  function reportPlaying() {
    if (dead) return;
    const playing = [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended);
    if (playing === lastPlaying) return;
    lastPlaying = playing;
    send({ type: 'yt-playing', playing });
  }

  // --- classification ------------------------------------------------------

  function begin(videoId) {
    current = { videoId, state: 'pending', startedAt: Date.now(), best: null, sent: '' };
    hold();
    poll(current);
  }

  function poll(job) {
    if (dead || current !== job || job.state !== 'pending') return;
    if (Date.now() - job.startedAt >= GIVE_UP_MS) {
      // Could not classify in time: report what we have as final. Without a
      // category and without an allowlisted channel this is entertainment.
      submit(job, job.best, true);
      return;
    }
    document.dispatchEvent(new CustomEvent(REQUEST, { detail: job.videoId }));
    const fromDom = metaFromDom(job.videoId);
    if (fromDom) consider(job, fromDom);
    setTimeout(() => poll(job), POLL_MS);
  }

  // Fallback: the microdata YouTube ships in the HTML of a full page load.
  function metaFromDom(videoId) {
    const get = (prop) => {
      const el = document.querySelector(`meta[itemprop="${prop}"]`);
      return el ? el.getAttribute('content') || '' : '';
    };
    const id = get('identifier') || get('videoId');
    if (id !== videoId) return null; // stale after an in-page navigation
    const owner = document.querySelector('span[itemprop="author"] link[itemprop="url"]');
    return {
      videoId,
      channelId: get('channelId'),
      category: get('genre'),
      ownerUrl: owner ? owner.getAttribute('href') || '' : '',
    };
  }

  document.addEventListener(REPLY, (event) => {
    if (!current || current.state !== 'pending') return;
    let meta;
    try {
      meta = JSON.parse(event.detail);
    } catch {
      return;
    }
    if (meta && meta.videoId === current.videoId) consider(current, meta);
  });

  function consider(job, meta) {
    const signature = `${meta.channelId}|${meta.category}|${meta.ownerUrl}`;
    if (job.sent === signature) return;
    job.sent = signature;
    job.best = meta;
    submit(job, meta, false);
  }

  async function submit(job, meta, final) {
    const answer = await send({ type: 'yt-meta', videoId: job.videoId, meta, final });
    if (dead || current !== job || job.state !== 'pending') return;
    if (!answer || !answer.ok) {
      // The worker did not answer. Keep the cover on and let the poll retry;
      // if the extension is gone, `send` has already shut this script down.
      job.sent = '';
      if (final) setTimeout(() => poll(job), POLL_MS);
      return;
    }
    setExhausted(answer.exhausted);
    if (answer.verdict !== 'edu' && !answer.final) return; // keep looking for a category
    if (answer.blocked) {
      job.state = 'blocked'; // stay covered; the worker is swapping in the block page
      return;
    }
    job.state = 'allowed';
    release();
  }

  // --- navigation ----------------------------------------------------------

  function check() {
    if (dead) return;
    lastHref = location.href;
    clearTimeout(transitionTimer);
    transitionTimer = null;
    const page = pageKind();

    if (page.kind === 'shorts') {
      // The worker redirects Shorts by URL. Hide the page until it does.
      current = null;
      root.classList.add('dl-cover');
      pauseAll();
      return;
    }
    root.classList.remove('dl-cover');

    if (page.kind === 'watch') {
      if (current && current.videoId === page.videoId) {
        if (current.state === 'allowed') release();
      } else {
        begin(page.videoId);
      }
    } else {
      current = null;
      release();
    }
    refreshStatus();
  }

  // An in-page navigation has started but the URL has not changed yet. Hold
  // the player so the next video cannot start before it has been checked.
  document.addEventListener('yt-navigate-start', () => {
    if (dead) return;
    hold();
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(check, TRANSITION_MS);
  });
  document.addEventListener('yt-navigate-finish', check);
  document.addEventListener('yt-page-data-updated', check);
  window.addEventListener('popstate', check);
  // Safety net for anything the events above miss.
  setInterval(() => {
    if (!dead && location.href !== lastHref) check();
  }, 500);

  // --- limit state ---------------------------------------------------------

  function setExhausted(exhausted) {
    root.classList.toggle('dl-exhausted', Boolean(exhausted));
  }

  async function refreshStatus() {
    const answer = await send({ type: 'yt-status' });
    if (answer && answer.ok) setExhausted(answer.exhausted);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (dead || !message) return;
    if (message.type === 'yt-exhausted') setExhausted(message.exhausted);
    if (message.type === 'yt-url-changed') check();
  });
  setInterval(() => {
    if (!dead && document.visibilityState === 'visible') refreshStatus();
  }, 30_000);
  window.addEventListener('pagehide', () => {
    if (!dead && lastPlaying) send({ type: 'yt-playing', playing: false });
  });

  check();
})();
