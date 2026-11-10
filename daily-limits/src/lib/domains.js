// Domain, YouTube URL and channel parsing. Pure functions, no chrome APIs.

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/**
 * Turn whatever the user typed ("https://www.Reddit.com/r/x", "*.reddit.com")
 * into a bare domain ("reddit.com"), or null if it is not a domain.
 */
export function normalizeDomain(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  if (!s || /\s/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^.*@/, '').replace(/:\d+$/, '');
  s = s.replace(/^\*\./, '').replace(/\.$/, '');
  let host;
  try {
    // Lets the URL parser canonicalise international names to punycode.
    host = new URL(`http://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  if (host.length > 253 || !DOMAIN_RE.test(host)) return null;
  return host;
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Hostname of an http(s) URL, or null for anything else. */
export function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

const YT_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];
// Parts of youtube.com that are not for watching anything.
const YT_NEUTRAL_HOSTS = ['accounts.youtube.com', 'consent.youtube.com', 'studio.youtube.com'];

export function isYouTubeHost(host) {
  return YT_DOMAINS.some((d) => hostMatches(host, d));
}

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** "@Handle" -> "@handle", or null if it is not a plausible handle. */
export function normalizeHandle(raw) {
  if (typeof raw !== 'string') return null;
  const s = safeDecode(raw.trim()).toLowerCase();
  return /^@[^\s/?#@]{3,60}$/u.test(s) ? s : null;
}

/**
 * What kind of YouTube page a URL is.
 * NOTE: src/content/yt-content.js carries a copy of this logic (content
 * scripts cannot import modules). Keep the two in step.
 *
 * @returns {{kind: 'neutral'|'shorts'|'watch'|'search'|'channel'|'browse',
 *            videoId?: string, channel?: {id?: string, handle?: string}}}
 */
export function ytPage(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'neutral' };
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (hostMatches(host, 'youtu.be') || YT_NEUTRAL_HOSTS.includes(host)) return { kind: 'neutral' };
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === 'shorts')) return { kind: 'shorts' };
  const first = (parts[0] || '').toLowerCase();
  if (first === 'watch') {
    const v = u.searchParams.get('v');
    return v ? { kind: 'watch', videoId: v } : { kind: 'browse' };
  }
  if ((first === 'embed' || first === 'live' || first === 'v') && parts[1]) {
    return { kind: 'watch', videoId: parts[1] };
  }
  if (first === 'results') return { kind: 'search' };
  if (first.startsWith('@')) {
    const handle = normalizeHandle(parts[0]);
    return handle ? { kind: 'channel', channel: { handle } } : { kind: 'browse' };
  }
  if (first === 'channel' && parts[1] && CHANNEL_ID_RE.test(parts[1])) {
    return { kind: 'channel', channel: { id: parts[1] } };
  }
  return { kind: 'browse' };
}

/**
 * Parse what the user typed for a channel: a UC… ID, an @handle, or a channel
 * URL containing either. Display names are refused on purpose: they can be
 * copied by anyone.
 * @returns {{id: string|null, handle: string|null}|null}
 */
export function parseChannelInput(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  if (CHANNEL_ID_RE.test(s)) return { id: s, handle: null };
  const idInUrl = s.match(/\/channel\/(UC[A-Za-z0-9_-]{22})(?:[/?#]|$)/);
  if (idInUrl) return { id: idInUrl[1], handle: null };
  const handleInUrl = s.match(/(?:^|\/)(@[^\s/?#]+)/);
  if (handleInUrl) {
    const handle = normalizeHandle(handleInUrl[1]);
    if (handle) return { id: null, handle };
  }
  return null;
}

/** Handle from the owner URL in YouTube's video metadata, e.g. "http://www.youtube.com/@veritasium". */
export function handleFromOwnerUrl(ownerUrl) {
  if (typeof ownerUrl !== 'string') return null;
  const m = ownerUrl.match(/\/(@[^\s/?#]+)\/?$/);
  return m ? normalizeHandle(m[1]) : null;
}

export function isChannelId(s) {
  return typeof s === 'string' && CHANNEL_ID_RE.test(s);
}
