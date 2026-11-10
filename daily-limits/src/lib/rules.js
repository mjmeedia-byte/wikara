// The verdict for one URL: which usage keys it counts toward, and whether it
// must be blocked. Pure functions, no chrome APIs.

import { CLASSIFY_GRACE_MS, UNIT_MS, YT_KEY } from './config.js';
import { handleFromOwnerUrl, hostMatches, hostOf, isYouTubeHost, ytPage } from './domains.js';

const EDU_CATEGORIES = new Set(['education', 'science & technology']);

/** Limit for a usage key in ms, or null if the key has no limit (site was removed). */
export function limitMs(key, settings) {
  if (key === YT_KEY) return settings.ytLimit * UNIT_MS;
  const limit = settings.sites[key];
  return limit === undefined ? null : limit * UNIT_MS;
}

export function usedMs(key, usage) {
  return usage.used[key] || 0;
}

/** A limit of 0 is exhausted from the first moment. */
export function isExhausted(key, settings, usage) {
  const limit = limitMs(key, settings);
  return limit !== null && usedMs(key, usage) >= limit;
}

export function isAllowedHost(host, settings) {
  return settings.allowed.some((d) => hostMatches(host, d));
}

/**
 * The allowlist entry a video's channel matches, or null.
 * An entry that has a channel ID matches by ID only. An entry with only a
 * handle matches by handle. Display names are never compared.
 */
export function matchChannel(meta, settings) {
  if (!meta) return null;
  const handle = meta.handle || handleFromOwnerUrl(meta.ownerUrl);
  for (const c of settings.eduChannels) {
    if (c.id) {
      if (meta.channelId && c.id === meta.channelId) return c;
    } else if (c.handle && handle && c.handle === handle) {
      return c;
    }
  }
  return null;
}

/** Rule 1: allowlisted channel. Rule 2: educational category. Otherwise no. */
export function isEducational(meta, settings) {
  if (!meta) return false;
  if (matchChannel(meta, settings)) return true;
  const category = String(meta.category || '')
    .replace(/&amp;/g, '&')
    .trim()
    .toLowerCase();
  return EDU_CATEGORIES.has(category);
}

const NONE = Object.freeze({ keys: [], block: null, recheckAt: null });

/**
 * @param {string} url
 * @param {object} ctx
 * @param {object} ctx.settings
 * @param {object} ctx.usage
 * @param {number} ctx.now
 * @param {object} [ctx.rec] what is known about this tab's YouTube video:
 *        { report: {videoId, meta, final}, seen: {videoId, firstSeen} }
 * @returns {{keys: string[], block: {key: string, reason: string}|null, recheckAt: number|null}}
 *          keys:      usage keys this page counts toward while it is in use
 *          block:     set when the tab must show the block page
 *          recheckAt: when an unclassified watch page runs out of grace
 */
export function evaluate(url, ctx) {
  const host = hostOf(url);
  if (!host) return NONE;
  if (isYouTubeHost(host)) return evaluateYouTube(url, ctx);
  const { settings, usage } = ctx;
  if (isAllowedHost(host, settings)) return NONE;

  // A host can fall under several entries (reddit.com and old.reddit.com).
  // It counts toward all of them and is blocked when any one runs out, so
  // adding an entry can never loosen anything.
  const keys = Object.keys(settings.sites).filter((d) => hostMatches(host, d));
  if (!keys.length) return NONE;
  const spent = keys.find((k) => isExhausted(k, settings, usage));
  if (spent) return { keys: [], block: { key: spent, reason: 'limit' }, recheckAt: null };
  return { keys, block: null, recheckAt: null };
}

function evaluateYouTube(url, { settings, usage, now, rec }) {
  const page = ytPage(url);
  if (page.kind === 'neutral') return NONE;
  if (page.kind === 'shorts') {
    return { keys: [], block: { key: YT_KEY, reason: 'shorts' }, recheckAt: null };
  }
  // Search always works and is never counted.
  if (page.kind === 'search') return NONE;

  const exhausted = isExhausted(YT_KEY, settings, usage);
  const count = { keys: [YT_KEY], block: null, recheckAt: null };

  if (page.kind === 'channel') {
    const { id, handle } = page.channel;
    const listed = settings.eduChannels.some(
      (c) => (id && c.id === id) || (handle && c.handle === handle),
    );
    return listed || exhausted ? NONE : count;
  }

  if (page.kind === 'watch') {
    const report = rec && rec.report && rec.report.videoId === page.videoId ? rec.report : null;
    if (report && isEducational(report.meta, settings)) return NONE;
    if (!exhausted) return count;
    if (report && report.final) {
      return { keys: [], block: { key: YT_KEY, reason: 'yt' }, recheckAt: null };
    }
    // Out of time and not classified yet. The content script keeps the player
    // covered meanwhile. Give it a short grace, then fail closed.
    const firstSeen =
      rec && rec.seen && rec.seen.videoId === page.videoId ? rec.seen.firstSeen : now;
    const deadline = firstSeen + CLASSIFY_GRACE_MS;
    if (now >= deadline) return { keys: [], block: { key: YT_KEY, reason: 'yt' }, recheckAt: null };
    return { keys: [], block: null, recheckAt: deadline };
  }

  // Home, subscriptions, playlists, other channels: entertainment browsing.
  // Once the limit is gone the feed is hidden by the content script instead.
  return exhausted ? NONE : count;
}
