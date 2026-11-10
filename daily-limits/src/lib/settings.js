// Settings: defaults, validation, and the rule that sorts every change into
// "tightening" (applies now) or "loosening" (typing challenge + delay).
// Pure functions, no chrome APIs.

import { FRICTION_BOUNDS, LIMIT_MAX, UNIT_SHORT } from './config.js';
import {
  hostMatches,
  isChannelId,
  isYouTubeHost,
  normalizeDomain,
  normalizeHandle,
  parseChannelInput,
} from './domains.js';

// Channel IDs are what get matched; a handle on an entry that has an ID is
// only a label. IDs checked against public channel listings, November 2026.
export const SEED_CHANNELS = [
  { id: 'UC4a-Gbdw7vOaccHmFo40b9g', handle: '@khanacademy', name: 'Khan Academy' },
  { id: 'UCYO_jab_esuFRV4b17AJtAw', handle: '@3blue1brown', name: '3Blue1Brown' },
  { id: 'UCX6b17PVsYBQ0ip5gyeme-Q', handle: '@crashcourse', name: 'CrashCourse' },
  { id: 'UCEBb1b_L6zDS3xTUrIALZOw', handle: '@mitocw', name: 'MIT OpenCourseWare' },
  {
    id: 'UCEWpbFLzoYGPfuWUMFPSaoA',
    handle: '@theorganicchemistrytutor',
    name: 'The Organic Chemistry Tutor',
  },
  { id: 'UCHnyfMqiRRG1u-2MsSQLbXA', handle: '@veritasium', name: 'Veritasium' },
  { id: 'UCsXVk37bltHxD1rDPwtNM8Q', handle: '@kurzgesagt', name: 'Kurzgesagt – In a Nutshell' },
  { id: 'UC8butISFwT-Wl7EV0hUK0BQ', handle: '@freecodecamp', name: 'freeCodeCamp.org' },
  { id: 'UCoHhuummRZaIVX7bD4t2czg', handle: '@professorleonard', name: 'Professor Leonard' },
  { id: 'UCsooa4yRKGN_zEE8iknghZA', handle: '@teded', name: 'TED-Ed' },
];

export const SEED_ALLOWED = ['khanacademy.org', 'wikipedia.org'];

export function defaultSettings() {
  return {
    version: 1,
    sites: {},
    ytLimit: 30,
    eduChannels: SEED_CHANNELS.map((c) => ({ ...c })),
    allowed: [...SEED_ALLOWED],
    friction: {
      challengeLength: FRICTION_BOUNDS.challengeLength.default,
      delayHours: FRICTION_BOUNDS.delayHours.default,
    },
  };
}

export function parseLimit(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= LIMIT_MAX ? n : null;
}

function parseBounded(value, bounds) {
  const n = Number(value);
  return Number.isInteger(n) && n >= bounds.min && n <= bounds.max ? n : null;
}

export function channelKey(c) {
  return c.id || c.handle;
}

export function channelLabel(c) {
  return c.name || c.handle || c.id;
}

function cleanChannel(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = isChannelId(raw.id) ? raw.id : null;
  const handle = normalizeHandle(raw.handle || '');
  if (!id && !handle) return null;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  return { id, handle, name };
}

/**
 * Rebuild a settings object from untrusted input (storage or an import file).
 * Anything invalid is dropped and reported in `problems`.
 */
export function sanitizeSettings(raw) {
  const problems = [];
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { settings: out, problems: ['Settings must be an object.'] };
  }

  out.allowed = [];
  if (Array.isArray(raw.allowed)) {
    for (const entry of raw.allowed) {
      const d = normalizeDomain(entry);
      if (!d || isYouTubeHost(d)) problems.push(`Always-allowed entry not accepted: ${entry}`);
      else if (!out.allowed.includes(d)) out.allowed.push(d);
    }
  } else {
    problems.push('Missing always-allowed list.');
  }

  out.sites = {};
  if (raw.sites && typeof raw.sites === 'object' && !Array.isArray(raw.sites)) {
    for (const [name, value] of Object.entries(raw.sites)) {
      const d = normalizeDomain(name);
      const limit = parseLimit(value);
      if (!d || limit === null || isYouTubeHost(d)) problems.push(`Site not accepted: ${name}`);
      else out.sites[d] = limit;
    }
  } else {
    problems.push('Missing site list.');
  }

  const yt = parseLimit(raw.ytLimit);
  if (yt === null) problems.push('Missing or invalid YouTube limit.');
  else out.ytLimit = yt;

  out.eduChannels = [];
  if (Array.isArray(raw.eduChannels)) {
    for (const entry of raw.eduChannels) {
      const c = cleanChannel(entry);
      if (!c) problems.push('Educational channel without a valid ID or handle.');
      else if (!out.eduChannels.some((e) => channelKey(e) === channelKey(c))) {
        out.eduChannels.push(c);
      }
    }
  } else {
    problems.push('Missing educational channel list.');
  }

  const f = raw.friction || {};
  const len = parseBounded(f.challengeLength, FRICTION_BOUNDS.challengeLength);
  const hours = parseBounded(f.delayHours, FRICTION_BOUNDS.delayHours);
  if (len === null || hours === null) problems.push('Missing or invalid friction settings.');
  else out.friction = { challengeLength: len, delayHours: hours };

  return { settings: out, problems };
}

const fail = (error) => ({ ok: false, error });
const tighten = (op, summary) => ({ ok: true, loosening: false, noop: false, op, summary });
const loosen = (op, summary) => ({ ok: true, loosening: true, noop: false, op, summary });
const noop = () => ({ ok: true, loosening: false, noop: true, op: null, summary: 'No change.' });

const fmtLimit = (n) => (n === 0 ? 'always blocked' : `${n} ${UNIT_SHORT}`);

/**
 * Validate a requested change against the current settings and decide whether
 * it tightens or loosens. Returns a normalised op that `applyOp` understands.
 *
 * Tightening: add a site, lower a limit, remove an educational channel,
 *             remove an always-allowed site.
 * Loosening:  raise a limit, remove a site, add an educational channel,
 *             add an always-allowed site, change friction, import, reset.
 */
export function classifyOp(settings, op) {
  if (!op || typeof op !== 'object') return fail('Unknown change.');
  switch (op.kind) {
    case 'addSite':
    case 'setLimit': {
      const domain = normalizeDomain(op.domain);
      if (!domain) return fail('Enter a domain like reddit.com.');
      const limit = parseLimit(op.limit);
      if (limit === null) return fail(`Enter a whole number of minutes from 0 to ${LIMIT_MAX}.`);
      if (isYouTubeHost(domain)) {
        return fail('YouTube has its own rules. Set its limit in the YouTube section.');
      }
      const current = settings.sites[domain];
      if (current === undefined) {
        if (op.kind === 'setLimit') return fail(`${domain} is not in the site list.`);
        const allowedBy = settings.allowed.find((a) => hostMatches(domain, a));
        if (allowedBy) {
          return fail(`${domain} is covered by the always-allowed entry ${allowedBy}.`);
        }
        return tighten(
          { kind: 'addSite', domain, limit },
          `Add ${domain} (${fmtLimit(limit)} per day)`,
        );
      }
      if (limit === current) return noop();
      const next = { kind: 'setLimit', domain, limit };
      return limit < current
        ? tighten(next, `Lower ${domain} from ${current} to ${limit} ${UNIT_SHORT}`)
        : loosen(next, `Raise ${domain} from ${current} to ${limit} ${UNIT_SHORT}`);
    }

    case 'removeSite': {
      const domain = normalizeDomain(op.domain);
      if (!domain || settings.sites[domain] === undefined) return fail('That site is not listed.');
      return loosen({ kind: 'removeSite', domain }, `Remove ${domain} from the site list`);
    }

    case 'setYtLimit': {
      const limit = parseLimit(op.limit);
      if (limit === null) return fail(`Enter a whole number of minutes from 0 to ${LIMIT_MAX}.`);
      const current = settings.ytLimit;
      if (limit === current) return noop();
      const next = { kind: 'setYtLimit', limit };
      return limit < current
        ? tighten(next, `Lower YouTube entertainment from ${current} to ${limit} ${UNIT_SHORT}`)
        : loosen(next, `Raise YouTube entertainment from ${current} to ${limit} ${UNIT_SHORT}`);
    }

    case 'addChannel': {
      const parsed = parseChannelInput(op.input);
      if (!parsed) {
        return fail(
          'Enter a channel ID (UC…), an @handle, or a channel URL. Display names are not accepted.',
        );
      }
      const exists = settings.eduChannels.some(
        (c) => (parsed.id && c.id === parsed.id) || (parsed.handle && c.handle === parsed.handle),
      );
      if (exists) return fail('That channel is already on the list.');
      const name = typeof op.name === 'string' ? op.name.trim().slice(0, 80) : '';
      const channel = { id: parsed.id, handle: parsed.handle, name };
      return loosen(
        { kind: 'addChannel', channel },
        `Add ${channelLabel(channel)} to the educational channels`,
      );
    }

    case 'removeChannel': {
      const found = settings.eduChannels.find((c) => channelKey(c) === op.key);
      if (!found) return fail('That channel is not listed.');
      return tighten(
        { kind: 'removeChannel', key: op.key },
        `Remove ${channelLabel(found)} from the educational channels`,
      );
    }

    case 'addAllowed': {
      const domain = normalizeDomain(op.domain);
      if (!domain) return fail('Enter a domain like example.org.');
      if (isYouTubeHost(domain)) return fail('YouTube cannot be always allowed.');
      if (settings.allowed.includes(domain)) return fail(`${domain} is already always allowed.`);
      return loosen({ kind: 'addAllowed', domain }, `Add ${domain} to the always-allowed list`);
    }

    case 'removeAllowed': {
      const domain = normalizeDomain(op.domain);
      if (!domain || !settings.allowed.includes(domain)) return fail('That site is not listed.');
      return tighten(
        { kind: 'removeAllowed', domain },
        `Remove ${domain} from the always-allowed list`,
      );
    }

    case 'setFriction': {
      const len = parseBounded(op.challengeLength, FRICTION_BOUNDS.challengeLength);
      const hours = parseBounded(op.delayHours, FRICTION_BOUNDS.delayHours);
      if (len === null) {
        const b = FRICTION_BOUNDS.challengeLength;
        return fail(`Challenge length must be a whole number from ${b.min} to ${b.max}.`);
      }
      if (hours === null) {
        const b = FRICTION_BOUNDS.delayHours;
        return fail(`Delay must be a whole number of hours from ${b.min} to ${b.max}.`);
      }
      const cur = settings.friction;
      if (len === cur.challengeLength && hours === cur.delayHours) return noop();
      // Any change to friction, in either direction, goes through friction.
      return loosen(
        { kind: 'setFriction', challengeLength: len, delayHours: hours },
        `Change friction to a ${len}-character challenge and a ${hours} hour delay`,
      );
    }

    case 'replaceAll': {
      if (op.reset) {
        return loosen(
          { kind: 'replaceAll', reset: true, settings: defaultSettings() },
          'Reset all settings to their defaults',
        );
      }
      const { settings: clean, problems } = sanitizeSettings(op.settings);
      if (problems.length) return fail(`That file was not accepted. ${problems[0]}`);
      const count = Object.keys(clean.sites).length;
      return loosen(
        { kind: 'replaceAll', reset: false, settings: clean },
        `Replace all settings with an imported file (${count} site${count === 1 ? '' : 's'})`,
      );
    }

    default:
      return fail('Unknown change.');
  }
}

/**
 * Apply a normalised op and return new settings. Never throws: an op that no
 * longer makes sense (its site was removed while it waited) does nothing.
 */
export function applyOp(settings, op) {
  const s = structuredClone(settings);
  switch (op && op.kind) {
    case 'addSite':
      s.sites[op.domain] =
        s.sites[op.domain] === undefined ? op.limit : Math.min(s.sites[op.domain], op.limit);
      break;
    case 'setLimit':
      if (s.sites[op.domain] !== undefined) s.sites[op.domain] = op.limit;
      break;
    case 'removeSite':
      delete s.sites[op.domain];
      break;
    case 'setYtLimit':
      s.ytLimit = op.limit;
      break;
    case 'addChannel': {
      const c = op.channel;
      const exists = s.eduChannels.some(
        (e) => (c.id && e.id === c.id) || (c.handle && e.handle === c.handle),
      );
      if (!exists) s.eduChannels.push({ id: c.id, handle: c.handle, name: c.name || '' });
      break;
    }
    case 'removeChannel':
      s.eduChannels = s.eduChannels.filter((c) => channelKey(c) !== op.key);
      break;
    case 'addAllowed':
      if (!s.allowed.includes(op.domain)) s.allowed.push(op.domain);
      break;
    case 'removeAllowed':
      s.allowed = s.allowed.filter((d) => d !== op.domain);
      break;
    case 'setFriction':
      s.friction = { challengeLength: op.challengeLength, delayHours: op.delayHours };
      break;
    case 'replaceAll':
      return sanitizeSettings(op.settings).settings;
    default:
      break;
  }
  return s;
}

/** Split the pending queue into changes whose time has come and the rest. */
export function splitDue(pending, now) {
  const due = [];
  const rest = [];
  for (const p of pending) (p.applyAt <= now ? due : rest).push(p);
  due.sort((a, b) => a.applyAt - b.applyAt);
  return { due, rest };
}
