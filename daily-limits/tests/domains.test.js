import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  handleFromOwnerUrl,
  hostMatches,
  hostOf,
  isYouTubeHost,
  normalizeDomain,
  parseChannelInput,
  ytPage,
} from '../src/lib/domains.js';

test('normalizeDomain accepts the forms people type', () => {
  assert.equal(normalizeDomain('reddit.com'), 'reddit.com');
  assert.equal(normalizeDomain('  https://www.Reddit.com/r/all?x=1 '), 'reddit.com');
  assert.equal(normalizeDomain('*.netflix.com'), 'netflix.com');
  assert.equal(normalizeDomain('old.reddit.com:443'), 'old.reddit.com');
  assert.equal(normalizeDomain('bbc.co.uk.'), 'bbc.co.uk');
});

test('normalizeDomain rejects things that are not domains', () => {
  for (const bad of ['', 'reddit', 'localhost', '192.168.0.1', 'two words.com', 'a..b', null, 5]) {
    assert.equal(normalizeDomain(bad), null, String(bad));
  }
});

test('subdomains match their parent, lookalikes do not', () => {
  assert.ok(hostMatches('m.reddit.com', 'reddit.com'));
  assert.ok(hostMatches('reddit.com', 'reddit.com'));
  assert.ok(!hostMatches('notreddit.com', 'reddit.com'));
  assert.ok(!hostMatches('reddit.com.evil.org', 'reddit.com'));
});

test('hostOf only understands http and https', () => {
  assert.equal(hostOf('https://Old.Reddit.com/r/x'), 'old.reddit.com');
  assert.equal(hostOf('chrome://extensions'), null);
  assert.equal(hostOf('chrome-extension://abc/page.html'), null);
  assert.equal(hostOf('not a url'), null);
});

test('YouTube hosts', () => {
  assert.ok(isYouTubeHost('www.youtube.com'));
  assert.ok(isYouTubeHost('m.youtube.com'));
  assert.ok(isYouTubeHost('www.youtube-nocookie.com'));
  assert.ok(!isYouTubeHost('youtube.com.example.org'));
});

test('ytPage classifies YouTube URLs', () => {
  const kind = (u) => ytPage(u).kind;
  assert.equal(kind('https://www.youtube.com/shorts/abc123'), 'shorts');
  assert.equal(kind('https://www.youtube.com/shorts'), 'shorts');
  assert.equal(kind('https://m.youtube.com/SHORTS/abc'), 'shorts');
  assert.equal(kind('https://www.youtube.com/@someone/shorts'), 'shorts');
  assert.equal(kind('https://www.youtube.com/feed/subscriptions/shorts'), 'shorts');
  assert.deepEqual(ytPage('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), {
    kind: 'watch',
    videoId: 'dQw4w9WgXcQ',
  });
  assert.deepEqual(ytPage('https://www.youtube.com/embed/abc'), { kind: 'watch', videoId: 'abc' });
  assert.deepEqual(ytPage('https://www.youtube.com/live/abc'), { kind: 'watch', videoId: 'abc' });
  assert.equal(kind('https://www.youtube.com/watch'), 'browse');
  assert.equal(kind('https://www.youtube.com/results?search_query=shorts'), 'search');
  assert.equal(kind('https://www.youtube.com/'), 'browse');
  assert.equal(kind('https://www.youtube.com/feed/subscriptions'), 'browse');
  assert.deepEqual(ytPage('https://www.youtube.com/@Veritasium/videos'), {
    kind: 'channel',
    channel: { handle: '@veritasium' },
  });
  assert.deepEqual(ytPage('https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA'), {
    kind: 'channel',
    channel: { id: 'UCHnyfMqiRRG1u-2MsSQLbXA' },
  });
  assert.equal(kind('https://accounts.youtube.com/signin'), 'neutral');
  assert.equal(kind('https://youtu.be/abc'), 'neutral');
});

test('parseChannelInput takes IDs, handles and URLs, never display names', () => {
  const id = 'UCHnyfMqiRRG1u-2MsSQLbXA';
  assert.deepEqual(parseChannelInput(id), { id, handle: null });
  assert.deepEqual(parseChannelInput(`https://www.youtube.com/channel/${id}/videos`), {
    id,
    handle: null,
  });
  assert.deepEqual(parseChannelInput('@Veritasium'), { id: null, handle: '@veritasium' });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/@Veritasium/featured'), {
    id: null,
    handle: '@veritasium',
  });
  assert.equal(parseChannelInput('Veritasium'), null);
  assert.equal(parseChannelInput('Khan Academy'), null);
  assert.equal(parseChannelInput(''), null);
});

test('handleFromOwnerUrl', () => {
  assert.equal(handleFromOwnerUrl('http://www.youtube.com/@KhanAcademy'), '@khanacademy');
  assert.equal(handleFromOwnerUrl('http://www.youtube.com/channel/UCxyz'), null);
  assert.equal(handleFromOwnerUrl(''), null);
});
