// Service worker. The only place that reads or writes state.
//
// Chrome can stop this worker at any moment, so nothing important lives in
// variables. Every operation is: load state from storage -> change it ->
// bank elapsed time and enforce blocks -> save -> set alarms. Operations run
// one at a time through `serial`, so two events can never count the same
// seconds twice.

import {
  CHALLENGE_TTL_MS,
  DELAY_HOUR_MS,
  DEV_FAST_MODE,
  FRICTION_BOUNDS,
  IDLE_SECONDS,
  LIMIT_MAX,
  MAX_GAP_MS,
  TICK_MS,
  UNIT_LONG,
  UNIT_MS,
  UNIT_SHORT,
  WARN_UNITS,
  YT_KEY,
  YT_NAME,
} from './lib/config.js';
import { handleFromOwnerUrl, hostOf, isChannelId, isYouTubeHost, ytPage } from './lib/domains.js';
import {
  evaluate,
  isAllowedHost,
  isEducational,
  isExhausted,
  limitMs,
  usedMs,
} from './lib/rules.js';
import {
  applyOp,
  classifyOp,
  defaultSettings,
  migrateSettings,
  sanitizeSettings,
  splitDue,
} from './lib/settings.js';
import { advanceUsage, freshUsage, isValidUsage } from './lib/usage.js';

const EXT_PREFIX = chrome.runtime.getURL('');
const BLOCK_PAGE = chrome.runtime.getURL('src/pages/blocked.html');
const ICON = chrome.runtime.getURL('icons/icon128.png');
const YT_TAB_PATTERNS = ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'];

// A video report can reach the worker a moment before the tab's URL does.
const REPORT_KEEP_MS = 5000;
const CHALLENGE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

// ---------------------------------------------------------------------------
// Serial queue
// ---------------------------------------------------------------------------

let queue = Promise.resolve();

function serial(task) {
  const result = queue.then(task);
  queue = result.catch((err) => console.error('[daily-limits]', err));
  return result;
}

let kickQueued = false;

/** Run a plain sync soon. Bursts of events collapse into one run. */
function kick() {
  if (kickQueued) return;
  kickQueued = true;
  serial(() => {
    kickQueued = false;
    return run();
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function loadState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['settings', 'pending', 'usage']),
    chrome.storage.session.get(['ytTabs', 'ytExhausted', 'alive']),
  ]);
  const st = {
    settings: local.settings
      ? migrateSettings(sanitizeSettings(local.settings).settings, local.settings.version)
      : defaultSettings(),
    pending: Array.isArray(local.pending) ? local.pending.filter(isValidPending) : [],
    usage: isValidUsage(local.usage) ? local.usage : freshUsage(Date.now()),
    ytTabs: session.ytTabs || {},
    ytExhausted: session.ytExhausted,
    // storage.session is wiped when Chrome restarts or the extension reloads.
    newSession: !session.alive,
  };
  st.saved = {
    settings: JSON.stringify(local.settings),
    pending: JSON.stringify(local.pending),
    usage: JSON.stringify(local.usage),
    ytTabs: JSON.stringify(session.ytTabs),
    ytExhausted: session.ytExhausted,
  };
  return st;
}

function isValidPending(p) {
  return Boolean(p && typeof p.id === 'string' && p.op && Number.isFinite(p.applyAt));
}

async function saveState(st) {
  const local = {};
  for (const name of ['settings', 'pending', 'usage']) {
    if (JSON.stringify(st[name]) !== st.saved[name]) local[name] = st[name];
  }
  const session = {};
  if (JSON.stringify(st.ytTabs) !== st.saved.ytTabs) session.ytTabs = st.ytTabs;
  if (st.ytExhausted !== st.saved.ytExhausted) session.ytExhausted = st.ytExhausted;
  if (st.newSession) session.alive = true;
  await Promise.all([
    Object.keys(local).length ? chrome.storage.local.set(local) : null,
    Object.keys(session).length ? chrome.storage.session.set(session) : null,
  ]);
}

/**
 * One full operation. `mutate` may change `st` before the sync. It can return
 * a value, or a function that builds the value from the state after the sync.
 */
async function run(mutate) {
  const st = await loadState();
  const after = mutate ? await mutate(st) : undefined;
  const plan = await reconcile(st);
  await saveState(st);
  await schedule(st, plan);
  return typeof after === 'function' ? after(st) : after;
}

// ---------------------------------------------------------------------------
// The sync: bank time, apply due changes, look at every tab, enforce
// ---------------------------------------------------------------------------

async function reconcile(st) {
  const now = Date.now();
  const { usage } = st;

  // Chrome was closed (or the extension reloaded) since the last save, so the
  // gap is not usage on anything.
  if (st.newSession) usage.active = [];
  advanceUsage(usage, now, MAX_GAP_MS);

  const { due, rest } = splitDue(st.pending, now);
  for (const change of due) st.settings = applyOp(st.settings, change.op);
  st.pending = rest;
  const { settings } = st;

  const [tabs, windows, idleState] = await Promise.all([
    chrome.tabs.query({}),
    chrome.windows.getAll({ windowTypes: ['normal', 'popup', 'app'] }),
    chrome.idle.queryState(IDLE_SECONDS),
  ]);
  const focused = new Set(windows.filter((w) => w.focused).map((w) => w.id));
  const liveTabs = new Set(tabs.map((t) => String(t.id)));
  for (const id of Object.keys(st.ytTabs)) {
    if (!liveTabs.has(id)) delete st.ytTabs[id];
  }

  const active = new Set();
  const redirects = [];
  let tracked = false;
  let recheckAt = Infinity;

  for (const tab of tabs) {
    // A navigation in progress is judged by where it is going.
    const target = tab.pendingUrl || tab.url;
    if (!target || target.startsWith(EXT_PREFIX)) continue;
    const rec = trackWatchPage(st.ytTabs, tab.id, target, now);
    const ctx = { settings, usage, now, rec };
    const verdict = evaluate(target, ctx);
    if (verdict.block) {
      redirects.push(showBlockPage(tab, target, verdict.block, st));
      continue;
    }
    if (verdict.recheckAt) {
      tracked = true;
      recheckAt = Math.min(recheckAt, verdict.recheckAt);
    }
    // Time is counted for the page that is actually loaded.
    const loaded = tab.url && tab.url !== target ? evaluate(tab.url, ctx) : verdict;
    if (!loaded.keys.length) continue;
    tracked = true;
    const inUse =
      (tab.active && focused.has(tab.windowId) && idleState === 'active') ||
      // Audio counts in the background, and while "idle" (watching, no input).
      tab.audible === true ||
      // A silent video playing in a visible YouTube tab also counts.
      (tab.active && Boolean(rec && rec.playing));
    if (inUse) for (const key of loaded.keys) active.add(key);
  }
  await Promise.all(redirects);
  usage.active = [...active].sort();

  warn(st);

  const ytExhausted = isExhausted(YT_KEY, settings, usage);
  if (ytExhausted !== st.ytExhausted) {
    st.ytExhausted = ytExhausted;
    for (const tab of tabs) {
      const host = hostOf(tab.url || '');
      if (host && isYouTubeHost(host)) {
        chrome.tabs
          .sendMessage(tab.id, { type: 'yt-exhausted', exhausted: ytExhausted })
          .catch(() => {});
      }
    }
  }

  return { now, tracked, boundaryAt: nextBoundary(st, now, recheckAt) };
}

/** Keep the per-tab YouTube record in step with the tab's URL. */
function trackWatchPage(ytTabs, tabId, url, now) {
  const host = hostOf(url);
  if (!host || !isYouTubeHost(host)) {
    delete ytTabs[tabId];
    return undefined;
  }
  const page = ytPage(url);
  let rec = ytTabs[tabId];
  if (page.kind !== 'watch') {
    if (!rec) return undefined;
    delete rec.seen;
    if (rec.report && now - rec.report.at > REPORT_KEEP_MS) delete rec.report;
    if (!rec.report && !rec.playing) delete ytTabs[tabId];
    return ytTabs[tabId];
  }
  if (!rec) rec = ytTabs[tabId] = {};
  if (!rec.seen || rec.seen.videoId !== page.videoId) {
    rec.seen = { videoId: page.videoId, firstSeen: now };
  }
  return rec;
}

async function showBlockPage(tab, target, block, st) {
  const params = new URLSearchParams({ k: block.key, r: block.reason, u: target });
  try {
    await chrome.tabs.update(tab.id, { url: `${BLOCK_PAGE}?${params}` });
  } catch {
    // The tab closed or is being dragged. The next sync tries again.
    return;
  }
  // Chrome will not render an extension's page inside an Incognito tab, so
  // there the tab shows Chrome's own "blocked" error. Say why in a notification.
  if (tab.incognito)
    announce(`block:${block.key}:${block.reason}`, 'Blocked', blockMessage(block, st));
}

function blockMessage(block, st) {
  if (block.reason === 'shorts') return 'YouTube Shorts are always blocked.';
  const name = block.key === YT_KEY ? YT_NAME : block.key;
  const limit = limitMs(block.key, st.settings) || 0;
  if (limit === 0) return `${name} is always blocked (limit 0).`;
  const reset = new Date(st.usage.day.end).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${name} is done for today: ${limit / UNIT_MS} ${UNIT_SHORT} used. Resets at ${reset}.`;
}

function announce(id, title, message) {
  try {
    const done = chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: ICON,
      title,
      message,
      priority: 1,
    });
    if (done && done.catch) done.catch(() => {});
  } catch {
    // Notifications are a courtesy. Blocking does not depend on them.
  }
}

/** Show "5 left" / "1 left" notifications for sites in use. */
function warn(st) {
  const { settings, usage } = st;
  for (const key of usage.active) {
    const limit = limitMs(key, settings);
    if (limit === null) continue;
    const remaining = limit - usedMs(key, usage);
    const shown = usage.warned[key] || (usage.warned[key] = {});
    let due = null;
    for (const mark of WARN_UNITS) {
      const threshold = mark * UNIT_MS;
      if (remaining > threshold) {
        delete shown[mark]; // the limit was raised; warn again next time
      } else if (limit > threshold && remaining > 0 && !shown[mark]) {
        shown[mark] = true;
        due = mark; // WARN_UNITS is descending, so the smallest one wins
      }
    }
    if (due !== null) notify(key, due);
  }
}

function notify(key, mark) {
  const name = key === YT_KEY ? YT_NAME : key;
  const amount = `${mark} ${UNIT_LONG}${mark === 1 ? '' : 's'}`;
  announce(`warn:${key}:${mark}`, `${amount} left`, `${name}: ${amount} left today.`);
}

/** The next moment something changes on its own: a warning, a limit, a grace deadline. */
function nextBoundary(st, now, recheckAt) {
  let at = recheckAt;
  const marks = [0, ...WARN_UNITS.map((u) => u * UNIT_MS)];
  for (const key of st.usage.active) {
    const limit = limitMs(key, st.settings);
    if (limit === null) continue;
    const remaining = limit - usedMs(key, st.usage);
    for (const mark of marks) {
      const wait = remaining - mark;
      if (wait > 0) at = Math.min(at, now + wait);
    }
  }
  return at;
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

let boundaryTimer = null;

async function ensureAlarm(name, when) {
  const existing = await chrome.alarms.get(name);
  if (!existing || Math.abs(existing.scheduledTime - when) > 250) {
    await chrome.alarms.create(name, { when });
  }
}

async function schedule(st, plan) {
  // Tick only while a tracked site is open somewhere. Each tick banks at most
  // one period, and MAX_GAP_MS trims anything a missed tick would add.
  const tick = await chrome.alarms.get('tick');
  if (plan.tracked && !tick) {
    await chrome.alarms.create('tick', { periodInMinutes: TICK_MS / 60_000 });
  } else if (!plan.tracked && tick) {
    await chrome.alarms.clear('tick');
  }

  await ensureAlarm('midnight', st.usage.day.end + 200);

  if (st.pending.length) {
    await ensureAlarm('pending', Math.min(...st.pending.map((p) => p.applyAt)) + 50);
  } else {
    await chrome.alarms.clear('pending');
  }

  clearTimeout(boundaryTimer);
  boundaryTimer = null;
  if (Number.isFinite(plan.boundaryAt)) {
    const at = Math.ceil(plan.boundaryAt) + 20;
    await ensureAlarm('boundary', at);
    // Alarms can run late. While the worker is awake a timer is exact.
    const wait = at - Date.now();
    if (wait < 28_000) boundaryTimer = setTimeout(kick, Math.max(wait, 0));
  } else {
    await chrome.alarms.clear('boundary');
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function randomId() {
  return crypto.randomUUID();
}

function randomText(length) {
  const n = CHALLENGE_ALPHABET.length;
  const cap = 256 - (256 % n);
  let out = '';
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < cap && out.length < length) out += CHALLENGE_ALPHABET[b % n];
    }
  }
  return out;
}

function view(st) {
  const { settings, usage } = st;
  const row = (key, name, limit) => ({
    key,
    name,
    limit,
    limitMs: limit * UNIT_MS,
    usedMs: usedMs(key, usage),
    blocked: isExhausted(key, settings, usage),
  });
  return {
    ok: true,
    now: Date.now(),
    dev: DEV_FAST_MODE,
    unitMs: UNIT_MS,
    unitShort: UNIT_SHORT,
    limitMax: LIMIT_MAX,
    bounds: FRICTION_BOUNDS,
    resetAt: usage.day.end,
    delayMs: settings.friction.delayHours * DELAY_HOUR_MS,
    settings,
    pending: st.pending,
    sites: Object.keys(settings.sites)
      .sort()
      .map((d) => row(d, d, settings.sites[d])),
    youtube: row(YT_KEY, YT_NAME, settings.ytLimit),
  };
}

function blockInfo(st, msg) {
  const { settings, usage } = st;
  const now = Date.now();
  const key = String(msg.key || '');
  let blocked;
  if (msg.reason === 'shorts') blocked = true;
  else if (key === YT_KEY) blocked = isExhausted(YT_KEY, settings, usage);
  else blocked = Boolean(evaluate(String(msg.url || ''), { settings, usage, now }).block);
  return {
    ok: true,
    blocked,
    name: key === YT_KEY ? YT_NAME : key,
    usedMs: usedMs(key, usage),
    limitMs: limitMs(key, settings),
    resetAt: usage.day.end,
    now,
  };
}

function cleanMeta(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    channelId: isChannelId(raw.channelId) ? raw.channelId : '',
    handle: handleFromOwnerUrl(String(raw.ownerUrl || '')) || '',
    category: String(raw.category || '').slice(0, 60),
  };
}

/**
 * An allowlist entry added by handle learns its channel ID the first time one
 * of its videos is seen. From then on it matches by ID, so a handle that
 * later changes hands cannot inherit the entry.
 */
function pinChannelId(settings, meta) {
  if (!meta || !meta.channelId || !meta.handle) return;
  if (settings.eduChannels.some((c) => c.id === meta.channelId)) return;
  const entry = settings.eduChannels.find((c) => !c.id && c.handle === meta.handle);
  if (entry) entry.id = meta.channelId;
}

// Requests from the popup, options page and block page.
const pageHandlers = {
  'get-state': () => run(() => view),

  'apply-op': (msg) =>
    run(async (st) => {
      const verdict = classifyOp(st.settings, msg.op);
      if (!verdict.ok) return { ok: false, error: verdict.error };
      if (verdict.noop) return { ok: true, noop: true };
      if (!verdict.loosening) {
        st.settings = applyOp(st.settings, verdict.op);
        return { ok: true, applied: true, summary: verdict.summary };
      }
      const challenge = {
        id: randomId(),
        text: randomText(st.settings.friction.challengeLength),
        op: verdict.op,
        summary: verdict.summary,
        createdAt: Date.now(),
      };
      await chrome.storage.session.set({ challenge });
      return {
        ok: true,
        challenge: { id: challenge.id, text: challenge.text },
        summary: verdict.summary,
        delayMs: st.settings.friction.delayHours * DELAY_HOUR_MS,
      };
    }),

  'confirm-op': (msg) =>
    run(async (st) => {
      const { challenge } = await chrome.storage.session.get('challenge');
      const now = Date.now();
      const age = challenge ? now - challenge.createdAt : -1;
      if (!challenge || challenge.id !== msg.id || age < 0 || age > CHALLENGE_TTL_MS) {
        return { ok: false, expired: true, error: 'This challenge has expired. Start again.' };
      }
      const typed = String(msg.typed || '').replace(/\s+/g, '');
      if (typed !== challenge.text) return { ok: false, error: 'The text does not match yet.' };
      await chrome.storage.session.remove('challenge');
      if (st.settings.friction.delayHours === 0) {
        st.settings = applyOp(st.settings, challenge.op);
        return { ok: true, applied: true, summary: challenge.summary };
      }
      // Measured from the latest time ever seen, so winding the clock back
      // before queueing does not shorten the wait.
      const createdAt = Math.max(now, st.usage.hwm || 0);
      const entry = {
        id: randomId(),
        op: challenge.op,
        summary: challenge.summary,
        createdAt,
        applyAt: createdAt + st.settings.friction.delayHours * DELAY_HOUR_MS,
      };
      st.pending.push(entry);
      return { ok: true, pending: entry };
    }),

  'cancel-pending': (msg) =>
    run((st) => {
      st.pending = st.pending.filter((p) => p.id !== msg.id);
      return { ok: true };
    }),

  'block-info': (msg) => run(() => (st) => blockInfo(st, msg)),
};

// Requests from content scripts. `sender.tab` is always set here.
const tabHandlers = {
  'yt-meta': (msg, sender) =>
    run((st) => {
      const videoId = String(msg.videoId || '').slice(0, 64);
      if (!videoId) return { ok: false };
      const meta = cleanMeta(msg.meta);
      // A report is final once it carries a category, or the page gave up waiting.
      const final = msg.final === true || Boolean(meta && meta.category);
      const rec = st.ytTabs[sender.tab.id] || (st.ytTabs[sender.tab.id] = {});
      rec.report = { videoId, meta, final, at: Date.now() };
      pinChannelId(st.settings, meta);
      return (after) => {
        const educational = isEducational(meta, after.settings);
        const exhausted = isExhausted(YT_KEY, after.settings, after.usage);
        return {
          ok: true,
          verdict: educational ? 'edu' : 'ent',
          final: final || educational,
          exhausted,
          blocked: !educational && final && exhausted,
        };
      };
    }),

  'yt-status': () =>
    run(() => (st) => ({ ok: true, exhausted: isExhausted(YT_KEY, st.settings, st.usage) })),

  'yt-playing': (msg, sender) =>
    run((st) => {
      const host = hostOf(sender.tab.url || '');
      if (host && isYouTubeHost(host)) {
        const rec = st.ytTabs[sender.tab.id] || (st.ytTabs[sender.tab.id] = {});
        if (msg.playing) rec.playing = true;
        else delete rec.playing;
      }
      return { ok: true };
    }),

  // An embedded player asks whether the page around it is always allowed.
  'embed-check': (msg, sender) =>
    run(() => (st) => {
      const host = hostOf(sender.tab.url || '');
      const allow = Boolean(host && (isYouTubeHost(host) || isAllowedHost(host, st.settings)));
      return { ok: true, allow };
    }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) return false;
  const fromPage = typeof sender.url === 'string' && sender.url.startsWith(EXT_PREFIX);
  // Settings can only be changed from the extension's own pages, never from a
  // content script running inside a website.
  const handler = fromPage ? pageHandlers[msg.type] : sender.tab && tabHandlers[msg.type];
  if (!handler) return false;
  serial(() => handler(msg, sender)).then(sendResponse, (err) =>
    sendResponse({ ok: false, error: String((err && err.message) || err) }),
  );
  return true;
});

// ---------------------------------------------------------------------------
// Events. Each one just triggers a sync; the sync looks at the real state.
// ---------------------------------------------------------------------------

chrome.idle.setDetectionInterval(IDLE_SECONDS);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  kick();
  if (reason !== 'install' && reason !== 'update') return;
  // YouTube tabs that were already open have no content script yet.
  const tabs = await chrome.tabs.query({ url: YT_TAB_PATTERNS });
  for (const tab of tabs) chrome.tabs.reload(tab.id).catch(() => {});
});
chrome.runtime.onStartup.addListener(kick);
chrome.alarms.onAlarm.addListener(kick);
chrome.idle.onStateChanged.addListener(kick);
chrome.windows.onFocusChanged.addListener(kick);
chrome.tabs.onActivated.addListener(kick);
chrome.tabs.onRemoved.addListener(kick);
chrome.tabs.onReplaced.addListener(kick);
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url !== undefined || change.audible !== undefined) kick();
});

const onTopFrame = (details) => {
  if (details.frameId === 0) kick();
};
chrome.webNavigation.onBeforeNavigate.addListener(onTopFrame);
chrome.webNavigation.onCommitted.addListener(onTopFrame);
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  kick();
  // YouTube changes pages without loading: tell its content script to re-check.
  const host = hostOf(details.url);
  if (host && isYouTubeHost(host)) {
    chrome.tabs.sendMessage(details.tabId, { type: 'yt-url-changed' }).catch(() => {});
  }
});
