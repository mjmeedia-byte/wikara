import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIFY_GRACE_MS, UNIT_MS, YT_KEY } from '../src/lib/config.js';
import { evaluate, isEducational, isExhausted } from '../src/lib/rules.js';
import { defaultSettings } from '../src/lib/settings.js';
import { freshUsage } from '../src/lib/usage.js';

const NOW = new Date(2026, 10, 10, 12).getTime();
const VERITASIUM = 'UCHnyfMqiRRG1u-2MsSQLbXA';

function setup(used = {}) {
  const settings = defaultSettings();
  settings.sites = { 'reddit.com': 30, 'old.reddit.com': 10, 'tiktok.com': 0 };
  settings.ytLimit = 20;
  const usage = freshUsage(NOW);
  for (const [k, minutes] of Object.entries(used)) usage.used[k] = minutes * UNIT_MS;
  return { settings, usage, now: NOW };
}
const report = (videoId, meta, final = true) => ({ report: { videoId, meta, final, at: NOW } });

test('unlisted sites and non-web pages are ignored', () => {
  const ctx = setup();
  for (const url of ['https://example.com/', 'chrome://extensions', 'about:blank', 'file:///x']) {
    assert.deepEqual(evaluate(url, ctx), { keys: [], block: null, recheckAt: null });
  }
});

test('subdomains count toward the listed site', () => {
  const ctx = setup();
  assert.deepEqual(evaluate('https://www.reddit.com/r/all', ctx).keys, ['reddit.com']);
  assert.deepEqual(evaluate('https://m.reddit.com/', ctx).keys, ['reddit.com']);
  assert.deepEqual(evaluate('https://notreddit.com/', ctx).keys, []);
});

test('a host under two entries counts toward both and is blocked when either runs out', () => {
  let ctx = setup();
  assert.deepEqual(evaluate('https://old.reddit.com/', ctx).keys, ['reddit.com', 'old.reddit.com']);
  ctx = setup({ 'old.reddit.com': 10 });
  assert.deepEqual(evaluate('https://old.reddit.com/', ctx).block, {
    key: 'old.reddit.com',
    reason: 'limit',
  });
  assert.equal(evaluate('https://www.reddit.com/', ctx).block, null);
});

test('a site is blocked once its limit is used, and a limit of 0 is always blocked', () => {
  assert.equal(evaluate('https://reddit.com/', setup({ 'reddit.com': 29.9 })).block, null);
  assert.deepEqual(evaluate('https://reddit.com/', setup({ 'reddit.com': 30 })).block, {
    key: 'reddit.com',
    reason: 'limit',
  });
  assert.deepEqual(evaluate('https://www.tiktok.com/', setup()).block, {
    key: 'tiktok.com',
    reason: 'limit',
  });
});

test('always-allowed sites are never counted or blocked', () => {
  const ctx = setup();
  ctx.settings.sites['wikipedia.org'] = 0; // even if one slipped into the list
  assert.deepEqual(evaluate('https://en.wikipedia.org/wiki/Time', ctx), {
    keys: [],
    block: null,
    recheckAt: null,
  });
});

test('Shorts are blocked no matter how much time is left', () => {
  for (const url of [
    'https://www.youtube.com/shorts/abc',
    'https://m.youtube.com/shorts/abc',
    'https://www.youtube.com/@veritasium/shorts',
  ]) {
    assert.deepEqual(evaluate(url, setup()).block, { key: YT_KEY, reason: 'shorts' }, url);
  }
});

test('educational: allowlisted channel by ID, or an educational category', () => {
  const { settings } = setup();
  assert.ok(isEducational({ channelId: VERITASIUM, category: 'Entertainment' }, settings));
  assert.ok(
    isEducational({ channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', category: 'Education' }, settings),
  );
  assert.ok(isEducational({ channelId: '', category: 'Science & Technology' }, settings));
  assert.ok(isEducational({ channelId: '', category: 'science &amp; technology' }, settings));
  assert.ok(!isEducational({ channelId: '', category: 'Gaming' }, settings));
  assert.ok(!isEducational({ channelId: '', category: '' }, settings));
  assert.ok(!isEducational(null, settings));
});

test('an entry with a channel ID cannot be matched by handle alone', () => {
  const { settings } = setup();
  // Someone else's channel presenting the seeded handle but a different ID.
  const spoof = {
    channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz',
    handle: '@veritasium',
    category: 'Comedy',
  };
  assert.ok(!isEducational(spoof, settings));
  settings.eduChannels.push({ id: null, handle: '@handleonly', name: '' });
  assert.ok(isEducational({ channelId: '', handle: '@handleonly', category: '' }, settings));
  assert.ok(
    isEducational(
      { channelId: '', ownerUrl: 'http://www.youtube.com/@HandleOnly', category: '' },
      settings,
    ),
  );
});

test('watch pages: educational is free, everything else counts, unclassified counts', () => {
  const ctx = setup();
  const url = 'https://www.youtube.com/watch?v=vid1';
  const edu = { ...ctx, rec: report('vid1', { channelId: VERITASIUM, category: 'Education' }) };
  assert.deepEqual(evaluate(url, edu).keys, []);
  const ent = { ...ctx, rec: report('vid1', { channelId: '', category: 'Gaming' }) };
  assert.deepEqual(evaluate(url, ent).keys, [YT_KEY]);
  assert.deepEqual(evaluate(url, ctx).keys, [YT_KEY], 'no report yet');
  const stale = { ...ctx, rec: report('other', { channelId: VERITASIUM, category: 'Education' }) };
  assert.deepEqual(
    evaluate(url, stale).keys,
    [YT_KEY],
    'a report for another video does not apply',
  );
});

test('entertainment limit used up', () => {
  const ctx = setup({ [YT_KEY]: 20 });
  assert.ok(isExhausted(YT_KEY, ctx.settings, ctx.usage));
  const url = 'https://www.youtube.com/watch?v=vid1';

  const edu = { ...ctx, rec: report('vid1', { channelId: VERITASIUM, category: '' }) };
  assert.deepEqual(evaluate(url, edu), { keys: [], block: null, recheckAt: null });

  const ent = { ...ctx, rec: report('vid1', { channelId: '', category: 'Music' }) };
  assert.deepEqual(evaluate(url, ent).block, { key: YT_KEY, reason: 'yt' });

  // Search and the home page stay reachable (the feed is hidden by CSS instead).
  assert.equal(evaluate('https://www.youtube.com/results?search_query=x', ctx).block, null);
  assert.deepEqual(evaluate('https://www.youtube.com/', ctx), {
    keys: [],
    block: null,
    recheckAt: null,
  });
});

test('an unclassified watch page gets a short grace, then fails closed', () => {
  const ctx = setup({ [YT_KEY]: 20 });
  const url = 'https://www.youtube.com/watch?v=vid1';
  const seen = { seen: { videoId: 'vid1', firstSeen: NOW - 1000 } };
  const early = evaluate(url, { ...ctx, rec: seen });
  assert.equal(early.block, null);
  assert.equal(early.recheckAt, NOW - 1000 + CLASSIFY_GRACE_MS);
  const late = evaluate(url, { ...ctx, now: NOW + CLASSIFY_GRACE_MS, rec: seen });
  assert.deepEqual(late.block, { key: YT_KEY, reason: 'yt' });
  // A report that is not final yet (no category so far) also waits for the grace.
  const partial = { ...seen, ...report('vid1', { channelId: '', category: '' }, false) };
  assert.equal(evaluate(url, { ...ctx, rec: partial }).block, null);
});

test('browsing: search is free, allowlisted channel pages are free, feeds count', () => {
  const ctx = setup();
  assert.deepEqual(evaluate('https://www.youtube.com/results?search_query=x', ctx).keys, []);
  assert.deepEqual(evaluate('https://www.youtube.com/@veritasium/videos', ctx).keys, []);
  assert.deepEqual(evaluate(`https://www.youtube.com/channel/${VERITASIUM}`, ctx).keys, []);
  assert.deepEqual(evaluate('https://www.youtube.com/@randomgamer', ctx).keys, [YT_KEY]);
  assert.deepEqual(evaluate('https://www.youtube.com/', ctx).keys, [YT_KEY]);
  assert.deepEqual(evaluate('https://www.youtube.com/feed/subscriptions', ctx).keys, [YT_KEY]);
});

test('a YouTube limit of 0 blocks entertainment from the start', () => {
  const ctx = setup();
  ctx.settings.ytLimit = 0;
  const ent = { ...ctx, rec: report('vid1', { channelId: '', category: 'Music' }) };
  assert.deepEqual(evaluate('https://www.youtube.com/watch?v=vid1', ent).block, {
    key: YT_KEY,
    reason: 'yt',
  });
  const edu = { ...ctx, rec: report('vid1', { channelId: '', category: 'Education' }) };
  assert.equal(evaluate('https://www.youtube.com/watch?v=vid1', edu).block, null);
});
