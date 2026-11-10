// Popup: today's time used and left for each site and for YouTube entertainment.

import { fmtDuration, fmtTime, h, send } from './util.js';

const rowsEl = document.getElementById('rows');
const rowNodes = new Map();

function buildRow(row) {
  const left = h('span', { class: 'left num' });
  const fill = h('div', { class: 'fill' });
  const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0' }, fill);
  const sub = h('div', { class: 'sub num' });
  const node = h(
    'li',
    {},
    h('div', { class: 'top' }, h('span', { class: 'name', text: row.name }), left),
    bar,
    sub,
  );
  return { node, left, fill, bar, sub };
}

function paintRow(parts, row) {
  const { usedMs, limitMs } = row;
  const remaining = Math.max(0, limitMs - usedMs);
  const ratio = limitMs > 0 ? Math.min(1, usedMs / limitMs) : 1;
  parts.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
  parts.bar.className = `bar${row.blocked ? ' over' : ratio >= 0.8 ? ' low' : ''}`;
  parts.bar.setAttribute('aria-valuemax', String(Math.round(limitMs / 1000)));
  parts.bar.setAttribute('aria-valuenow', String(Math.round(Math.min(usedMs, limitMs) / 1000)));
  if (limitMs === 0) {
    parts.left.textContent = 'Always blocked';
    parts.sub.textContent = 'Limit is 0';
  } else if (row.blocked) {
    parts.left.textContent = 'Done for today';
    parts.sub.textContent = `${fmtDuration(limitMs)} used`;
  } else {
    parts.left.textContent = `${fmtDuration(remaining, 'ceil')} left`;
    parts.sub.textContent = `${fmtDuration(usedMs)} of ${fmtDuration(limitMs)} used`;
  }
}

async function refresh() {
  const state = await send({ type: 'get-state' });
  if (!state || !state.ok) return;
  document.getElementById('dev').hidden = !state.dev;
  document.getElementById('reset').textContent = `Resets at ${fmtTime(state.resetAt)}`;

  const rows = [...state.sites, state.youtube];
  const wanted = new Set(rows.map((r) => r.key));
  for (const [key, parts] of rowNodes) {
    if (!wanted.has(key)) {
      parts.node.remove();
      rowNodes.delete(key);
    }
  }
  for (const row of rows) {
    let parts = rowNodes.get(row.key);
    if (!parts) {
      parts = buildRow(row);
      rowNodes.set(row.key, parts);
    }
    rowsEl.append(parts.node); // keeps the order: sites A–Z, then YouTube
    paintRow(parts, row);
  }
}

document.getElementById('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
setInterval(refresh, 1000);
