// Options page. It never writes settings itself: every change is sent to the
// service worker, which decides whether it applies now (tightening) or needs
// the typing challenge and the delay (loosening).

import { fmtDateTime, fmtDuration, h, send } from './util.js';

const $ = (id) => document.getElementById(id);

let state = null;
let signature = '';
let statusTimer = null;
const live = new Map(); // usage key -> { text, bar, fill }
const countdowns = new Map(); // pending id -> { node, applyAt }

// --- status line -----------------------------------------------------------

function say(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'error' : '';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    el.textContent = '';
  }, 7000);
}

function fmtDelay(ms) {
  const hours = ms / 3_600_000;
  if (Number.isInteger(hours) && hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return fmtDuration(ms, 'ceil');
}

// --- sending a change ------------------------------------------------------

async function request(op) {
  const res = await send({ type: 'apply-op', op });
  if (!res) {
    say('The extension did not respond. Try again.', true);
    return false;
  }
  if (!res.ok) {
    say(res.error, true);
    return false;
  }
  if (res.noop) {
    say('No change.');
    return true;
  }
  if (res.applied) {
    say(`Done. ${res.summary}.`);
    await refresh();
    return true;
  }
  openChallenge(res);
  return true;
}

// --- rendering -------------------------------------------------------------

function usageCell(key) {
  const text = h('div', { class: 'num' });
  const fill = h('div', { class: 'fill' });
  const bar = h('div', { class: 'bar' }, fill);
  live.set(key, { text, bar, fill });
  return h('div', { class: 'usage' }, text, bar);
}

/** A number box with a button that says what saving will do. */
function limitControl(current, label, onSave) {
  const input = h('input', {
    type: 'number',
    min: '0',
    max: String(state.limitMax),
    value: String(current),
    'aria-label': label,
  });
  const button = h('button', { type: 'button', text: 'Save', disabled: true });
  const parsed = () => {
    const raw = input.value.trim();
    const n = Number(raw);
    return raw !== '' && Number.isInteger(n) && n >= 0 && n <= state.limitMax ? n : null;
  };
  const update = () => {
    const n = parsed();
    button.disabled = n === null || n === current;
    button.className = '';
    if (n === null || n === current) button.textContent = 'Save';
    else if (n < current) {
      button.textContent = 'Lower now';
      button.className = 'primary';
    } else button.textContent = 'Raise…';
  };
  const save = () => {
    if (!button.disabled) onSave(parsed());
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save();
  });
  button.addEventListener('click', save);
  return h(
    'span',
    { class: 'field' },
    input,
    h('span', { class: 'muted', text: state.unitShort }),
    button,
  );
}

function renderSites() {
  const list = $('siteList');
  list.replaceChildren(
    ...state.sites.map((site) =>
      h(
        'li',
        {},
        h('div', { class: 'grow' }, h('div', { class: 'title', text: site.name })),
        usageCell(site.key),
        limitControl(site.limit, `Daily limit for ${site.name}`, (limit) =>
          request({ kind: 'setLimit', domain: site.name, limit }),
        ),
        h('button', {
          type: 'button',
          class: 'quiet',
          text: 'Remove…',
          'aria-label': `Remove ${site.name}`,
          onclick: () => request({ kind: 'removeSite', domain: site.name }),
        }),
      ),
    ),
  );
  $('siteEmpty').hidden = state.sites.length > 0;
}

function renderYouTube() {
  const yt = state.youtube;
  $('ytList').replaceChildren(
    h(
      'li',
      {},
      h('div', { class: 'grow' }, h('div', { class: 'title', text: 'Entertainment allowance' })),
      usageCell(yt.key),
      limitControl(yt.limit, 'Daily YouTube entertainment limit', (limit) =>
        request({ kind: 'setYtLimit', limit }),
      ),
    ),
  );
}

function renderChannels() {
  const channels = state.settings.eduChannels;
  $('channelList').replaceChildren(
    ...channels.map((c) => {
      const key = c.id || c.handle;
      const title = c.name || c.handle || c.id;
      const detail = [c.handle, c.id].filter((part) => part && part !== title).join(' · ');
      return h(
        'li',
        {},
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'title', text: title }),
          detail && h('div', { class: 'detail', text: detail }),
        ),
        h('button', {
          type: 'button',
          class: 'quiet',
          text: 'Remove',
          'aria-label': `Remove ${title}`,
          onclick: () => request({ kind: 'removeChannel', key }),
        }),
      );
    }),
  );
  $('channelEmpty').hidden = channels.length > 0;
}

function renderAllowed() {
  const allowed = state.settings.allowed;
  $('allowedList').replaceChildren(
    ...allowed.map((domain) =>
      h(
        'li',
        {},
        h('div', { class: 'grow' }, h('div', { class: 'title', text: domain })),
        h('button', {
          type: 'button',
          class: 'quiet',
          text: 'Remove',
          'aria-label': `Remove ${domain}`,
          onclick: () => request({ kind: 'removeAllowed', domain }),
        }),
      ),
    ),
  );
  $('allowedEmpty').hidden = allowed.length > 0;
}

function renderPending() {
  countdowns.clear();
  const pending = [...state.pending].sort((a, b) => a.applyAt - b.applyAt);
  $('pendingList').replaceChildren(
    ...pending.map((p) => {
      const countdown = h('span', { class: 'num' });
      countdowns.set(p.id, { node: countdown, applyAt: p.applyAt });
      return h(
        'li',
        {},
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'title', text: p.summary }),
          h('div', { class: 'detail' }, `Takes effect ${fmtDateTime(p.applyAt)} · in `, countdown),
        ),
        h('button', {
          type: 'button',
          text: 'Cancel',
          'aria-label': `Cancel: ${p.summary}`,
          onclick: async () => {
            await send({ type: 'cancel-pending', id: p.id });
            say('Cancelled.');
            refresh();
          },
        }),
      );
    }),
  );
  $('pendingEmpty').hidden = pending.length > 0;
}

function renderFriction() {
  const { bounds, settings } = state;
  const length = $('frictionLength');
  const hours = $('frictionHours');
  length.min = bounds.challengeLength.min;
  length.max = bounds.challengeLength.max;
  length.value = settings.friction.challengeLength;
  hours.min = bounds.delayHours.min;
  hours.max = bounds.delayHours.max;
  hours.value = settings.friction.delayHours;
}

function renderAll() {
  live.clear();
  $('dev').hidden = !state.dev;
  $('delayLabel').textContent =
    state.delayMs > 0 ? ` and then wait ${fmtDelay(state.delayMs)}` : '';
  $('siteUnit').textContent = state.unitShort;
  renderPending();
  renderSites();
  renderYouTube();
  renderChannels();
  renderAllowed();
  renderFriction();
}

/** Numbers that move every second: usage and countdowns. */
function paintLive() {
  for (const row of [...state.sites, state.youtube]) {
    const parts = live.get(row.key);
    if (!parts) continue;
    const ratio = row.limitMs > 0 ? Math.min(1, row.usedMs / row.limitMs) : 1;
    parts.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    parts.bar.className = `bar${row.blocked ? ' over' : ratio >= 0.8 ? ' low' : ''}`;
    parts.text.textContent =
      row.limitMs === 0
        ? 'Always blocked'
        : `${fmtDuration(row.usedMs)} of ${fmtDuration(row.limitMs)} today`;
  }
  for (const { node, applyAt } of countdowns.values()) {
    node.textContent = fmtDuration(applyAt - state.now, 'ceil');
  }
}

async function refresh() {
  const next = await send({ type: 'get-state' });
  if (!next || !next.ok) return;
  state = next;
  // Rebuild the lists only when something structural changed, so a half-typed
  // number is not wiped by the once-a-second refresh.
  const sig = JSON.stringify([next.settings, next.pending, next.dev]);
  if (sig !== signature) {
    signature = sig;
    renderAll();
  }
  paintLive();
}

// --- forms -----------------------------------------------------------------

$('addSite').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ok = await request({
    kind: 'addSite',
    domain: $('siteDomain').value,
    limit: $('siteLimit').value.trim(),
  });
  if (ok) $('siteDomain').value = '';
});

$('addChannel').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ok = await request({
    kind: 'addChannel',
    input: $('channelInput').value,
    name: $('channelName').value,
  });
  if (ok) {
    $('channelInput').value = '';
    $('channelName').value = '';
  }
});

$('addAllowed').addEventListener('submit', async (event) => {
  event.preventDefault();
  const ok = await request({ kind: 'addAllowed', domain: $('allowedDomain').value });
  if (ok) $('allowedDomain').value = '';
});

$('frictionForm').addEventListener('submit', (event) => {
  event.preventDefault();
  request({
    kind: 'setFriction',
    challengeLength: $('frictionLength').value.trim(),
    delayHours: $('frictionHours').value.trim(),
  });
});

$('exportBtn').addEventListener('click', () => {
  if (!state) return;
  const data = {
    app: 'daily-limits',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = h('a', { href: url, download: 'daily-limits-settings.json' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    say('That file is not valid JSON.', true);
    return;
  }
  request({ kind: 'replaceAll', settings: data && data.settings ? data.settings : data });
});

$('resetBtn').addEventListener('click', () => request({ kind: 'replaceAll', reset: true }));

// --- typing challenge ------------------------------------------------------

const dialog = $('challenge');
const input = $('chInput');
let challenge = null; // { id, text }
let lastValue = '';

const PER_LINE = 30;
const GROUP = 5;
const FONT_PX = 19;
const LINE_PX = 34;
const PAD_PX = 18;
const FONT = `500 ${FONT_PX}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;

/**
 * The text is painted onto a canvas, so there is nothing to select or copy.
 * `done` characters are dimmed; the next one (or the wrong one) is underlined.
 */
function drawChallenge(done, bad) {
  const canvas = $('chCanvas');
  const ctx = canvas.getContext('2d');
  const { text } = challenge;
  ctx.font = FONT;
  const cell = Math.ceil(ctx.measureText('M').width) + 3;
  const gap = Math.round(cell * 0.7);
  const width = PAD_PX * 2 + PER_LINE * cell + (PER_LINE / GROUP - 1) * gap;
  const lines = Math.ceil(text.length / PER_LINE);
  const height = PAD_PX * 2 + lines * LINE_PX - (LINE_PX - FONT_PX);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = 'auto';

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cursor = bad >= 0 ? bad : done;
  for (let i = 0; i < text.length; i += 1) {
    const col = i % PER_LINE;
    const x = PAD_PX + col * cell + Math.floor(col / GROUP) * gap + cell / 2;
    const y = PAD_PX + Math.floor(i / PER_LINE) * LINE_PX + FONT_PX / 2;
    ctx.globalAlpha = i < done ? 0.35 : 1;
    ctx.fillStyle = i === bad ? color('--over') : color('--text');
    ctx.fillText(text[i], x, y);
    if (i === cursor) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = bad >= 0 ? color('--over') : color('--accent');
      ctx.fillRect(x - cell / 2 + 1, y + FONT_PX / 2 + 4, cell - 2, 2);
    }
  }
  ctx.globalAlpha = 1;
}

function updateProgress() {
  const typed = input.value.replace(/\s+/g, '');
  const { text } = challenge;
  let done = 0;
  while (done < typed.length && done < text.length && typed[done] === text[done]) done += 1;
  const bad = done < typed.length ? done : -1;
  drawChallenge(done, bad);
  const progress = $('chProgress');
  progress.textContent =
    bad >= 0 ? `Character ${bad + 1} does not match.` : `${done} of ${text.length} typed`;
  progress.className = `grow num ${bad >= 0 ? 'error-text' : 'muted'}`;
  $('chSubmit').disabled = typed !== text;
}

// The page-level status line sits behind the modal, so the dialog has its own.
function note(text) {
  $('chNote').textContent = text;
}

function openChallenge(res) {
  note('');
  challenge = { id: res.challenge.id, text: res.challenge.text };
  $('chSummary').textContent = `${res.summary}.`;
  $('chWhen').textContent =
    res.delayMs > 0
      ? `When you finish, the change is queued and takes effect after ${fmtDelay(res.delayMs)}. You can cancel it any time before then.`
      : 'When you finish, the change applies immediately.';
  $('chSubmit').textContent = res.delayMs > 0 ? 'Queue change' : 'Apply change';
  input.value = '';
  lastValue = '';
  if (!dialog.open) dialog.showModal();
  updateProgress();
  input.focus();
}

function closeChallenge() {
  challenge = null;
  input.value = '';
  if (dialog.open) dialog.close();
}

const refuse = (event) => event.preventDefault();
input.addEventListener('paste', refuse);
input.addEventListener('drop', refuse);
input.addEventListener('dragover', refuse);
input.addEventListener('beforeinput', (event) => {
  const blocked = ['insertFromPaste', 'insertFromDrop', 'insertFromYank', 'insertReplacementText'];
  if (blocked.includes(event.inputType)) event.preventDefault();
});
input.addEventListener('input', () => {
  if (!challenge) return;
  // Several characters arriving in one step is not typing (auto-fill, text expanders).
  if (input.value.length - lastValue.length > 2) {
    input.value = lastValue;
    note('Type it out. Pasting and auto-fill are disabled.');
  } else {
    note('');
  }
  lastValue = input.value;
  updateProgress();
});

$('chCancel').addEventListener('click', closeChallenge);
dialog.addEventListener('close', () => {
  challenge = null;
});

$('chSubmit').addEventListener('click', async () => {
  if (!challenge) return;
  const res = await send({ type: 'confirm-op', id: challenge.id, typed: input.value });
  if (res && res.ok) {
    closeChallenge();
    say(
      res.applied
        ? `Done. ${res.summary}.`
        : `Queued. Takes effect ${fmtDateTime(res.pending.applyAt)}.`,
    );
    refresh();
    return;
  }
  const message = (res && res.error) || 'The extension did not respond. Try again.';
  if (res && res.expired) {
    closeChallenge();
    say(message, true);
  } else {
    note(message);
  }
});

refresh();
setInterval(refresh, 1000);
