// Block page. Says what is blocked, how much was used and when it resets.
// Deliberately has no settings link, no "more time" button and no override.

import { fmtDuration, fmtTime, send } from './util.js';

const params = new URLSearchParams(location.search);
const key = params.get('k') || '';
const reason = params.get('r') || 'limit';
const original = params.get('u') || '';

const $ = (id) => document.getElementById(id);
let resetTimer = null;

function safeOriginal() {
  try {
    const u = new URL(original);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function paint(info) {
  const name = info.name || key || 'This site';
  const zero = info.limitMs === 0;
  document.title = `Blocked · ${name}`;

  if (!info.blocked) {
    $('title').textContent = `${name} is available again`;
    $('detail').textContent = 'The limit no longer applies.';
    $('facts').hidden = true;
    const url = safeOriginal();
    if (url) {
      $('backLink').href = url.href;
      $('backLink').textContent = `Continue to ${url.hostname}`;
      $('back').hidden = false;
    }
    return;
  }
  $('back').hidden = true;

  if (reason === 'shorts') {
    $('title').textContent = 'YouTube Shorts are blocked';
    $('detail').textContent =
      'Shorts are always off. They have no time allowance and do not reset.';
    $('facts').hidden = true;
    return;
  }

  if (reason === 'yt') {
    $('title').textContent = zero
      ? 'YouTube entertainment is blocked'
      : 'YouTube entertainment is done for today';
    $('detail').textContent = zero
      ? 'The entertainment limit is set to 0. Search and educational videos still work.'
      : 'You have used today’s allowance. Search and educational videos still work.';
  } else {
    $('title').textContent = zero ? `${name} is blocked` : `${name} is done for today`;
    $('detail').textContent = zero
      ? 'This site has a daily limit of 0, so it is always blocked.'
      : 'You have used today’s allowance for this site.';
  }

  $('facts').hidden = false;
  $('used').textContent = fmtDuration(info.usedMs);
  $('limit').textContent = zero ? '0' : fmtDuration(info.limitMs || 0);
  $('resetRow').hidden = zero;
  const wait = info.resetAt - info.now;
  $('reset').textContent = `at ${fmtTime(info.resetAt)} (in ${fmtDuration(wait, 'ceil')})`;

  // Check again the moment the day rolls over.
  clearTimeout(resetTimer);
  if (!zero && wait > 0 && wait < 2 ** 31 - 2000) resetTimer = setTimeout(refresh, wait + 1000);
}

async function refresh() {
  const info = await send({ type: 'block-info', key, reason, url: original });
  if (info && info.ok) paint(info);
}

refresh();
setInterval(refresh, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refresh();
});
