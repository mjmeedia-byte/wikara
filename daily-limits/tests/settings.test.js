import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyOp,
  classifyOp,
  defaultSettings,
  migrateSettings,
  sanitizeSettings,
  splitDue,
} from '../src/lib/settings.js';

const base = () => {
  const s = defaultSettings();
  s.sites = { 'reddit.com': 30, 'netflix.com': 60 };
  return s;
};
const apply = (s, op) => applyOp(s, classifyOp(s, op).op);

test('defaults: seeded channels and always-allowed sites', () => {
  const s = defaultSettings();
  assert.equal(s.eduChannels.length, 10);
  assert.ok(s.eduChannels.every((c) => /^UC[\w-]{22}$/.test(c.id)));
  assert.deepEqual(s.allowed, ['khanacademy.org', 'wikipedia.org']);
  assert.deepEqual(s.friction, { challengeLength: 10, delayHours: 0 });
  assert.deepEqual(sanitizeSettings(s), { settings: s, problems: [] });
});

test('tightening changes are not loosening', () => {
  const s = base();
  const tightening = [
    { kind: 'addSite', domain: 'instagram.com', limit: 10 },
    { kind: 'addSite', domain: 'https://www.TikTok.com/foryou', limit: 0 },
    { kind: 'setLimit', domain: 'reddit.com', limit: 29 },
    { kind: 'setLimit', domain: 'reddit.com', limit: 0 },
    { kind: 'setYtLimit', limit: 5 },
    { kind: 'removeChannel', key: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
    { kind: 'removeAllowed', domain: 'wikipedia.org' },
  ];
  for (const op of tightening) {
    const c = classifyOp(s, op);
    assert.ok(c.ok && !c.loosening && !c.noop, JSON.stringify(op));
  }
});

test('loosening changes are loosening', () => {
  const s = base();
  const loosening = [
    { kind: 'setLimit', domain: 'reddit.com', limit: 31 },
    { kind: 'addSite', domain: 'reddit.com', limit: 500 }, // re-adding with a higher limit is a raise
    { kind: 'removeSite', domain: 'reddit.com' },
    { kind: 'setYtLimit', limit: 31 },
    { kind: 'addChannel', input: '@somechannel' },
    { kind: 'addAllowed', domain: 'example.org' },
    { kind: 'setFriction', challengeLength: 50, delayHours: 24 },
    { kind: 'setFriction', challengeLength: 150, delayHours: 48 }, // stricter still counts
    { kind: 'replaceAll', settings: defaultSettings() },
    { kind: 'replaceAll', reset: true },
  ];
  for (const op of loosening) {
    const c = classifyOp(s, op);
    assert.ok(c.ok && c.loosening, JSON.stringify(op));
  }
});

test('no-ops and invalid requests', () => {
  const s = base();
  assert.ok(classifyOp(s, { kind: 'setLimit', domain: 'reddit.com', limit: 30 }).noop);
  assert.ok(classifyOp(s, { kind: 'setYtLimit', limit: 30 }).noop);
  const bad = [
    { kind: 'addSite', domain: 'not a domain', limit: 5 },
    { kind: 'addSite', domain: 'reddit.org', limit: -1 },
    { kind: 'addSite', domain: 'reddit.org', limit: 1.5 },
    { kind: 'addSite', domain: 'reddit.org', limit: '' },
    { kind: 'addSite', domain: 'reddit.org', limit: 100000 },
    { kind: 'setLimit', domain: 'unknown.com', limit: 5 },
    { kind: 'removeSite', domain: 'unknown.com' },
    { kind: 'addChannel', input: 'Khan Academy' }, // display names are refused
    { kind: 'addChannel', input: 'UC4a-Gbdw7vOaccHmFo40b9g' }, // already listed
    { kind: 'setFriction', challengeLength: 1, delayHours: 24 },
    { kind: 'setFriction', challengeLength: 9, delayHours: 0 },
    { kind: 'setFriction', challengeLength: 150, delayHours: -1 },
    { kind: 'replaceAll', settings: { sites: 'nope' } },
    { kind: 'nonsense' },
    null,
  ];
  for (const op of bad) assert.equal(classifyOp(s, op).ok, false, JSON.stringify(op));
});

test('always-allowed sites and YouTube cannot be added to the limit list', () => {
  const s = base();
  for (const domain of [
    'wikipedia.org',
    'en.wikipedia.org',
    'khanacademy.org',
    'youtube.com',
    'm.youtube.com',
  ]) {
    assert.equal(classifyOp(s, { kind: 'addSite', domain, limit: 5 }).ok, false, domain);
  }
  assert.equal(classifyOp(s, { kind: 'addAllowed', domain: 'youtube.com' }).ok, false);
});

test('applying ops', () => {
  let s = base();
  s = apply(s, { kind: 'addSite', domain: 'instagram.com', limit: 10 });
  assert.equal(s.sites['instagram.com'], 10);
  s = apply(s, { kind: 'setLimit', domain: 'reddit.com', limit: 5 });
  assert.equal(s.sites['reddit.com'], 5);
  s = apply(s, { kind: 'removeSite', domain: 'netflix.com' });
  assert.equal(s.sites['netflix.com'], undefined);
  s = apply(s, { kind: 'addChannel', input: 'https://www.youtube.com/@NewChannel', name: 'New' });
  assert.deepEqual(s.eduChannels.at(-1), { id: null, handle: '@newchannel', name: 'New' });
  s = apply(s, { kind: 'removeChannel', key: '@newchannel' });
  assert.equal(s.eduChannels.length, 10);
  s = apply(s, { kind: 'addAllowed', domain: 'example.org' });
  assert.ok(s.allowed.includes('example.org'));
  s = apply(s, { kind: 'replaceAll', reset: true });
  assert.deepEqual(s, defaultSettings());
});

test('applyOp does not mutate its input, and a stale op does nothing', () => {
  const s = base();
  const frozen = JSON.stringify(s);
  const raise = classifyOp(s, { kind: 'setLimit', domain: 'reddit.com', limit: 90 }).op;
  const without = applyOp(s, { kind: 'removeSite', domain: 'reddit.com' });
  assert.equal(JSON.stringify(s), frozen);
  // The site was removed while the raise waited in the queue.
  assert.deepEqual(applyOp(without, raise), without);
});

test('sanitizeSettings drops junk and reports it', () => {
  const { settings, problems } = sanitizeSettings({
    sites: { 'Reddit.com': 30, 'youtube.com': 5, 'bad domain': 3, 'x.com': -4 },
    ytLimit: 20,
    eduChannels: [{ id: 'UC4a-Gbdw7vOaccHmFo40b9g', name: 'Khan' }, { name: 'Just a name' }],
    allowed: ['wikipedia.org', 'youtube.com'],
    friction: { challengeLength: 150, delayHours: 24 },
  });
  assert.deepEqual(settings.sites, { 'reddit.com': 30 });
  assert.equal(settings.eduChannels.length, 1);
  assert.deepEqual(settings.allowed, ['wikipedia.org']);
  assert.equal(problems.length, 5);
});

test('splitDue', () => {
  const pending = [
    { id: 'a', applyAt: 300 },
    { id: 'b', applyAt: 100 },
    { id: 'c', applyAt: 900 },
  ];
  const { due, rest } = splitDue(pending, 300);
  assert.deepEqual(
    due.map((p) => p.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    rest.map((p) => p.id),
    ['c'],
  );
});

test('migration: old default friction moves to the new defaults, custom friction is kept', () => {
  const old = {
    ...defaultSettings(),
    version: 1,
    friction: { challengeLength: 150, delayHours: 24 },
  };
  old.sites = { 'reddit.com': 30 };
  const moved = migrateSettings(old, 1);
  assert.deepEqual(moved.friction, { challengeLength: 10, delayHours: 0 });
  assert.deepEqual(moved.sites, { 'reddit.com': 30 });
  assert.equal(moved.version, 2);
  assert.deepEqual(old.friction, { challengeLength: 150, delayHours: 24 }, 'input not mutated');

  const custom = { ...old, friction: { challengeLength: 300, delayHours: 48 } };
  assert.deepEqual(migrateSettings(custom, 1).friction, { challengeLength: 300, delayHours: 48 });

  // Once on version 2, a deliberate choice of 150 / 24 is left alone.
  assert.deepEqual(migrateSettings(old, 2).friction, { challengeLength: 150, delayHours: 24 });
});
