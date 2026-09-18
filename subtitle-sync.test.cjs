const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const vm = require('node:vm');

const source = process.env.VISIONPIP_TEST_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:content.js'], { cwd: __dirname, encoding: 'utf8' })
  : readFileSync(join(__dirname, 'content.js'), 'utf8');
const start = source.indexOf('  function startSync(video, win) {');
const end = source.indexOf('  // ── Shared Caption Text Filter', start);
assert.ok(start >= 0 && end > start, 'Cannot locate actual startSync implementation');

function harness() {
  const video = { paused: true, currentTime: 10 };
  let content = '';
  let writes = 0;
  const overlay = {
    get innerHTML() { return content; },
    set innerHTML(value) { content = value; writes += 1; },
  };
  const context = vm.createContext({
    video,
    pipSubEl: overlay,
    subtitleRevision: 0,
    subtitlesEnabled: true,
    captionData: [],
    kissLines: ['Original'],
    nativeLines: [],
    hasAttemptedKissKickstart: false,
    attemptCcToggleNudge() {},
    syncInterval: null,
    loadCaptionTracks() {},
    getVideo: () => video,
    setInterval(callback) { context.tick = callback; return 1; },
    escapeHtml: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  });
  vm.runInContext(`
    function getBilingualKissCaptions() { return kissLines; }
    function getNativeYouTubeCaptions() { return nativeLines; }
    ${source.slice(start, end)}
    startSync(video, {});
  `, context);
  return { context, video, overlay, writes: () => writes };
}

for (const paused of [true, false]) {
  test(`three subtitle updates at identical media time, paused=${paused}`, () => {
    const h = harness();
    h.video.paused = paused;
    h.context.tick();
    assert.match(h.overlay.innerHTML, /Original/);
    for (const translation of ['Translation one', 'Translation two', 'Translation three']) {
      h.context.kissLines = ['Original', translation];
      h.context.tick();
      assert.match(h.overlay.innerHTML, new RegExp(translation));
      assert.equal(h.video.currentTime, 10);
      assert.equal(h.video.paused, paused);
    }
  });
}

test('paused JSON3 timing follows currentTime through forward and backward seeks', () => {
  const h = harness();
  h.context.kissLines = [];
  h.context.captionData = [
    { start: 0, end: 5, text: 'First cue' },
    { start: 5, end: 10, text: 'Second cue' },
  ];
  for (const [time, expected] of [[1, 'First cue'], [5, 'Second cue'], [2, 'First cue'], [10, '']]) {
    h.video.currentTime = time;
    h.context.tick();
    assert.equal(h.overlay.innerHTML, expected ? `<span class="pip-line">${expected}</span>` : '');
  }
});

test('unchanged subtitle does not rewrite the overlay', () => {
  const h = harness();
  h.context.tick();
  const writes = h.writes();
  for (let index = 0; index < 20; index += 1) h.context.tick();
  assert.equal(h.writes(), writes);
});

test('late JSON3 data and native DOM changes refresh during pause', () => {
  const h = harness();
  h.context.kissLines = [];
  h.context.nativeLines = ['Native original'];
  h.context.tick();
  h.context.nativeLines = ['Updated native'];
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Updated native/);
  h.context.nativeLines = [];
  h.context.captionData = [{ start: 9, end: 11, text: 'Loaded fallback' }];
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Loaded fallback/);
});

test('clearing captions during pause clears stale overlay', () => {
  const h = harness();
  h.context.tick();
  h.context.kissLines = [];
  h.context.tick();
  assert.equal(h.overlay.innerHTML, '');
});

test('CC disable, re-enable and closed overlay remain safe', () => {
  const h = harness();
  h.context.tick();
  h.context.subtitlesEnabled = false;
  h.context.tick();
  assert.equal(h.overlay.innerHTML, '');
  h.context.subtitlesEnabled = true;
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Original/);
  h.context.pipSubEl = null;
  assert.doesNotThrow(() => h.context.tick());
});

test('subtitleMode filtering respects bilingual, original, and translation settings', () => {
  const h = harness();
  h.context.kissLines = ['Hello world', '你好世界'];

  // Default / bilingual
  h.context.settings = { subtitleMode: 'bilingual' };
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Hello world/);
  assert.match(h.overlay.innerHTML, /你好世界/);

  // Original only
  h.context.settings = { subtitleMode: 'original' };
  h.context.subtitleRevision += 1;
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Hello world/);
  assert.doesNotMatch(h.overlay.innerHTML, /你好世界/);

  // Translation only
  h.context.settings = { subtitleMode: 'translation' };
  h.context.subtitleRevision += 1;
  h.context.tick();
  assert.doesNotMatch(h.overlay.innerHTML, /Hello world/);
  assert.match(h.overlay.innerHTML, /你好世界/);

  // Monolingual fallback survives in translation mode
  h.context.kissLines = ['Single caption line'];
  h.context.subtitleRevision += 1;
  h.context.tick();
  assert.match(h.overlay.innerHTML, /Single caption line/);
});
