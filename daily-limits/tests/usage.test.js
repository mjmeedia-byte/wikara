import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceUsage, dayWindow, freshUsage } from '../src/lib/usage.js';

const MAX_GAP = 70_000;
const at = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();

test('dayWindow runs from local midnight to local midnight', () => {
  const w = dayWindow(at(2026, 11, 10, 15, 30));
  assert.equal(w.key, '2026-11-10');
  assert.equal(w.start, at(2026, 11, 10));
  assert.equal(w.end, at(2026, 11, 11));
});

test('elapsed time is added to every active key and to nothing else', () => {
  const t0 = at(2026, 11, 10, 12);
  const u = freshUsage(t0);
  u.active = ['reddit.com', '@youtube'];
  advanceUsage(u, t0 + 30_000, MAX_GAP);
  assert.deepEqual(u.used, { 'reddit.com': 30_000, '@youtube': 30_000 });
  u.active = [];
  advanceUsage(u, t0 + 60_000, MAX_GAP);
  assert.deepEqual(u.used, { 'reddit.com': 30_000, '@youtube': 30_000 });
});

test('a worker restart neither loses nor double counts time', () => {
  // The record round-trips through storage between calls, as it does when the worker dies.
  const t0 = at(2026, 11, 10, 12);
  let u = freshUsage(t0);
  u.active = ['reddit.com'];
  for (let i = 1; i <= 10; i += 1) {
    u = JSON.parse(JSON.stringify(u));
    advanceUsage(u, t0 + i * 20_000, MAX_GAP);
    advanceUsage(u, t0 + i * 20_000, MAX_GAP); // two events landing on the same instant
  }
  assert.equal(u.used['reddit.com'], 200_000);
});

test('a long gap (sleep, frozen browser) is trimmed', () => {
  const t0 = at(2026, 11, 10, 12);
  const u = freshUsage(t0);
  u.active = ['reddit.com'];
  advanceUsage(u, t0 + 3 * 3_600_000, MAX_GAP);
  assert.equal(u.used['reddit.com'], MAX_GAP);
});

test('usage resets at local midnight and only time after midnight counts for the new day', () => {
  const t0 = at(2026, 11, 10, 23, 59, 50);
  const u = freshUsage(t0);
  u.used = { 'reddit.com': 1_200_000 };
  u.warned = { 'reddit.com': { 5: true } };
  u.active = ['reddit.com'];
  const info = advanceUsage(u, at(2026, 11, 11, 0, 0, 20), MAX_GAP);
  assert.ok(info.rolled);
  assert.equal(u.day.key, '2026-11-11');
  assert.deepEqual(u.used, { 'reddit.com': 20_000 });
  assert.deepEqual(u.warned, {});
});

test('moving the clock backwards keeps today’s usage and does not reset it', () => {
  const t0 = at(2026, 11, 10, 20);
  const u = freshUsage(t0);
  u.used = { 'reddit.com': 1_800_000 };
  u.active = ['reddit.com'];
  // Clock set back three hours, then back to "yesterday 23:59", then a minute passes.
  let info = advanceUsage(u, at(2026, 11, 10, 17), MAX_GAP);
  assert.ok(info.clockWentBack);
  assert.equal(u.used['reddit.com'], 1_800_000);
  advanceUsage(u, at(2026, 11, 9, 23, 59, 30), MAX_GAP);
  info = advanceUsage(u, at(2026, 11, 10, 0, 0, 30), MAX_GAP);
  assert.ok(!info.rolled, 'crossing a midnight that is behind the stored day is not a reset');
  assert.equal(u.day.key, '2026-11-10');
  assert.equal(u.used['reddit.com'], 1_800_000 + 60_000);
  assert.equal(u.hwm, t0);
});

test('time keeps counting after a backwards jump', () => {
  const t0 = at(2026, 11, 10, 20);
  const u = freshUsage(t0);
  u.active = ['reddit.com'];
  advanceUsage(u, t0 - 3_600_000, MAX_GAP);
  advanceUsage(u, t0 - 3_600_000 + 30_000, MAX_GAP);
  assert.equal(u.used['reddit.com'], 30_000);
});

test('a clock corrected from far in the future keeps usage instead of freezing for years', () => {
  const future = at(2031, 1, 1, 12);
  const u = freshUsage(future);
  u.used = { 'reddit.com': 600_000 };
  const now = at(2026, 11, 10, 12);
  const info = advanceUsage(u, now, MAX_GAP);
  assert.ok(!info.rolled);
  assert.equal(u.day.key, '2026-11-10');
  assert.equal(u.used['reddit.com'], 600_000);
});
