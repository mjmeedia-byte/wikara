// Time accounting. Pure functions over the stored `usage` record:
//
//   day      { key, start, end }  the local day being counted, as absolute timestamps
//   used     { key: ms }          time used today, per site (and YT_KEY)
//   warned   { key: {5, 1} }      which "time left" warnings have been shown
//   lastTick ms                   wall clock when time was last banked
//   active   [key]                keys that were being counted as of lastTick
//   hwm      ms                   the latest wall-clock time ever seen
//
// Nothing here lives only in memory: the worker can die between any two calls
// and the next call picks up exactly where the last one stopped.

import { REANCHOR_MS } from './config.js';

const pad = (n) => String(n).padStart(2, '0');

/** The local calendar day containing `now`, midnight to midnight. */
export function dayWindow(now) {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return {
    key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    start: start.getTime(),
    end: end.getTime(),
  };
}

export function freshUsage(now) {
  return { day: dayWindow(now), used: {}, warned: {}, lastTick: now, active: [], hwm: now };
}

export function isValidUsage(u) {
  return Boolean(
    u &&
    u.day &&
    Number.isFinite(u.day.start) &&
    Number.isFinite(u.day.end) &&
    u.day.end > u.day.start &&
    u.used &&
    typeof u.used === 'object' &&
    Number.isFinite(u.lastTick) &&
    Array.isArray(u.active),
  );
}

/**
 * Bank the time between `usage.lastTick` and `now` against the keys that were
 * active, then move the record forward. Mutates `usage`.
 *
 * - A gap longer than `maxGap` is trimmed: the worker could not run, so that
 *   time was not spent on the site.
 * - The day rolls over only when the clock passes the stored end of the day.
 *   If the clock moves backwards, nothing is added and nothing is reset, so
 *   today's usage stays as it was.
 *
 * @returns {{rolled: boolean, clockWentBack: boolean, added: number}}
 */
export function advanceUsage(usage, now, maxGap) {
  const info = { rolled: false, clockWentBack: false, added: 0 };
  let delta = now - usage.lastTick;
  if (delta < 0) {
    info.clockWentBack = true;
    delta = 0;
  }
  delta = Math.min(delta, maxGap);

  if (now >= usage.day.end) {
    // New day. Only the part of the gap that falls after midnight belongs to it.
    usage.day = dayWindow(now);
    usage.used = {};
    usage.warned = {};
    delta = Math.min(delta, Math.max(0, now - usage.day.start));
    info.rolled = true;
  } else if (now < usage.day.start - REANCHOR_MS) {
    // The clock is far behind the stored day (it was set well into the future
    // and then corrected). Re-anchor to the real day but keep the usage, so
    // the correction does not hand back any time.
    usage.day = dayWindow(now);
  }

  if (delta > 0) {
    for (const key of usage.active) {
      usage.used[key] = (usage.used[key] || 0) + delta;
    }
    info.added = delta;
  }
  usage.lastTick = now;
  usage.hwm = Math.max(usage.hwm || 0, now);
  if (!usage.warned) usage.warned = {};
  return info;
}
