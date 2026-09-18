'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const bridge = require('./player-bridge.js');

const VIDEO_ID = 'dQw4w9WgXcQ';
const TT = `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}`;

function simpleResponse() {
  return {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            baseUrl: `${TT}&lang=en`,
            languageCode: 'en',
            kind: 'asr',
            vssId: '.en',
            name: { simpleText: 'English' },
            isTranslatable: true,
          },
        ],
      },
    },
  };
}

function createWindow(href, options = {}) {
  const listeners = new Map();
  const hrefs = Array.isArray(options.hrefs) ? options.hrefs.slice() : null;
  const win = {
    postMessageCalls: [],
    postMessage(message, origin) {
      win.postMessageCalls.push({ message, origin });
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };
  win.__listeners = listeners;
  win.location = {
    origin: options.origin ?? 'https://www.youtube.com',
    get href() {
      return hrefs ? hrefs.shift() : href;
    },
  };
  win.document = {
    querySelector(selector) {
      return selector === '#movie_player' ? options.player ?? null : null;
    },
  };
  if ('ytInitialPlayerResponse' in options) win.ytInitialPlayerResponse = options.ytInitialPlayerResponse;
  if (options.ytplayer !== undefined) win.ytplayer = options.ytplayer;
  return win;
}

function createPlayer(options = {}) {
  const player = {
    optionCalls: [],
    optionResult: options.selected ?? null,
  };
  if (options.playerResponse !== undefined || options.playerResponseThrows) {
    player.getPlayerResponse = () => {
      if (options.playerResponseThrows) throw new Error('getPlayerResponse failed');
      return options.playerResponse;
    };
  }
  if (options.videoData !== undefined) player.getVideoData = () => options.videoData;
  player.getOption = (scope, name) => {
    player.optionCalls.push([scope, name]);
    return player.optionResult;
  };
  return player;
}

function dispatch(win, event) {
  for (const listener of [...(win.__listeners.get(event.type) ?? [])]) listener(event);
}

function request(requestId, overrides = {}) {
  return { channel: bridge.CHANNEL, type: 'request', requestId, videoId: VIDEO_ID, ...overrides };
}

function message(win, data) {
  return { type: 'message', source: win, origin: win.location.origin, data };
}

test('exposes the expected channel', () => {
  assert.equal(bridge.CHANNEL, 'vision-pip-captions');
});

test('videoIdFromUrl parses watch and shorts URLs', () => {
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=42s`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl(`https://youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl(`https://music.youtube.com/watch?v=${VIDEO_ID}`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/shorts/${VIDEO_ID}`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/shorts/${VIDEO_ID}/`), VIDEO_ID);
  assert.equal(bridge.videoIdFromUrl('https://www.youtube.com/watch?v=ab_-CD12345'), 'ab_-CD12345');
});

test('videoIdFromUrl rejects non-https and non-youtube hosts', () => {
  assert.equal(bridge.videoIdFromUrl(`http://www.youtube.com/watch?v=${VIDEO_ID}`), '');
  assert.equal(bridge.videoIdFromUrl(`https://evil.com/watch?v=${VIDEO_ID}`), '');
  assert.equal(bridge.videoIdFromUrl(`https://evilyoutube.com/watch?v=${VIDEO_ID}`), '');
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com.evil.com/watch?v=${VIDEO_ID}`), '');
  assert.equal(bridge.videoIdFromUrl(`https://www.google.com/watch?v=${VIDEO_ID}`), '');
});

test('videoIdFromUrl rejects malformed ids and paths', () => {
  assert.equal(bridge.videoIdFromUrl('https://www.youtube.com/watch?v=short'), '');
  assert.equal(bridge.videoIdFromUrl('https://www.youtube.com/watch?v=toolongvideoid'), '');
  assert.equal(bridge.videoIdFromUrl('https://www.youtube.com/watch?v=bad!d'), '');
  assert.equal(bridge.videoIdFromUrl('https://www.youtube.com/watch'), '');
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}&v=abcdefghijk`), '');
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/embed/${VIDEO_ID}`), '');
  assert.equal(bridge.videoIdFromUrl(`https://www.youtube.com/shorts/${VIDEO_ID}/extra`), '');
  assert.equal(bridge.videoIdFromUrl('not a url'), '');
});

test('timedtextUrl accepts matching youtube timedtext URLs', () => {
  assert.equal(bridge.timedtextUrl(TT, VIDEO_ID), TT);
  assert.equal(bridge.timedtextUrl(`${TT}&lang=en&kind=asr`, VIDEO_ID), `${TT}&lang=en&kind=asr`);
  assert.equal(bridge.timedtextUrl(`https://music.youtube.com/api/timedtext?v=${VIDEO_ID}`, VIDEO_ID),
    `https://music.youtube.com/api/timedtext?v=${VIDEO_ID}`);
});

test('timedtextUrl rejects mismatched or duplicated video params', () => {
  assert.equal(bridge.timedtextUrl('https://www.youtube.com/api/timedtext?v=abcdefghijk', VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`${TT}&v=${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl('https://www.youtube.com/api/timedtext', VIDEO_ID), '');
});

test('timedtextUrl rejects non-https, foreign hosts, credentials, ports and hashes', () => {
  assert.equal(bridge.timedtextUrl(`http://www.youtube.com/api/timedtext?v=${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`https://evil.com/api/timedtext?v=${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`https://user:pass@www.youtube.com/api/timedtext?v=${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`https://www.youtube.com:8443/api/timedtext?v=${VIDEO_ID}`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`${TT}#fragment`, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(`https://www.youtube.com/api/timedtextx?v=${VIDEO_ID}`, VIDEO_ID), '');
});

test('timedtextUrl guards inputs and length', () => {
  assert.equal(bridge.timedtextUrl(null, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(123, VIDEO_ID), '');
  assert.equal(bridge.timedtextUrl(TT, 'bad'), '');
  assert.equal(bridge.timedtextUrl(TT, ''), '');
  assert.equal(bridge.timedtextUrl('not a url', VIDEO_ID), '');
  const base = `${TT}&pad=`;
  const max = base + 'a'.repeat(16384 - base.length);
  assert.equal(bridge.timedtextUrl(max, VIDEO_ID), max);
  assert.equal(bridge.timedtextUrl(max + 'a', VIDEO_ID), '');
});

test('serializeResponse rejects invalid videoId and mismatched responses', () => {
  assert.equal(bridge.serializeResponse(simpleResponse(), null, 'short'), null);
  assert.equal(bridge.serializeResponse(simpleResponse(), null, ''), null);
  assert.equal(bridge.serializeResponse(null, null, VIDEO_ID), null);
  assert.equal(bridge.serializeResponse(undefined, null, VIDEO_ID), null);
  assert.equal(bridge.serializeResponse({}, null, VIDEO_ID), null);
  assert.equal(bridge.serializeResponse({ videoDetails: { videoId: 'abcdefghijk' } }, null, VIDEO_ID), null);
});

test('serializeResponse maps caption tracks and selected match', () => {
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'zh-Hans' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: `${TT}&lang=en`, languageCode: 'en', kind: 'asr', vssId: '.en',
            name: { simpleText: 'English (auto)' }, isTranslatable: true },
          { baseUrl: `${TT}&lang=zh-Hans`, languageCode: 'zh-Hans',
            name: { runs: [{ text: '中文' }, { text: '字幕' }] } },
        ],
      },
    },
  };
  assert.deepEqual(bridge.serializeResponse(response, { vssId: '.en' }, VIDEO_ID), {
    videoId: VIDEO_ID,
    tracks: [
      { id: '.en', label: 'English (auto)', languageCode: 'en', baseUrl: `${TT}&lang=en`, kind: 'asr', isTranslatable: true },
      { id: 'zh-Hans::1', label: '中文字幕', languageCode: 'zh-Hans', baseUrl: `${TT}&lang=zh-Hans`, kind: '', isTranslatable: false },
    ],
    selectedTrack: { id: '.en', languageCode: 'en', kind: 'asr' },
    defaultAudioLanguage: 'zh-Hans',
  });
});

test('serializeResponse matches selected by id or language and kind', () => {
  const response = simpleResponse();
  assert.deepEqual(bridge.serializeResponse(response, { id: '.en' }, VIDEO_ID).selectedTrack,
    { id: '.en', languageCode: 'en', kind: 'asr' });
  assert.deepEqual(bridge.serializeResponse(response, { languageCode: 'en', kind: 'asr' }, VIDEO_ID).selectedTrack,
    { id: '.en', languageCode: 'en', kind: 'asr' });
  assert.equal(bridge.serializeResponse(response, null, VIDEO_ID).selectedTrack, null);
  assert.equal(bridge.serializeResponse(response, undefined, VIDEO_ID).selectedTrack, null);
  assert.equal(bridge.serializeResponse(response, { vssId: '.missing' }, VIDEO_ID).selectedTrack, null);
  assert.equal(bridge.serializeResponse(response, { vssId: '.missing', languageCode: 'en', kind: 'asr' }, VIDEO_ID).selectedTrack, null);
});

test('serializeResponse skips tracks without usable url or language code', () => {
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: '' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { languageCode: 'en', name: { simpleText: 'No url' } },
          { baseUrl: `${TT}&lang=en`, languageCode: 'bad lang' },
          { baseUrl: `${TT}&lang=fr`, languageCode: 'f' },
          { baseUrl: `${TT}&lang=de`, languageCode: 'de', kind: 'asr' },
        ],
      },
    },
  };
  assert.deepEqual(bridge.serializeResponse(response, null, VIDEO_ID).tracks, [
    { id: 'de:asr:0', label: 'de', languageCode: 'de', baseUrl: `${TT}&lang=de`, kind: 'asr', isTranslatable: false },
  ]);
});

test('serializeResponse drops duplicate track ids', () => {
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: `${TT}&lang=en`, languageCode: 'en', vssId: '.en' },
          { baseUrl: `${TT}&lang=en&tlang=es`, languageCode: 'es', vssId: '.en' },
        ],
      },
    },
  };
  const result = bridge.serializeResponse(response, null, VIDEO_ID);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].id, '.en');
});

test('serializeResponse requires strictly true isTranslatable', () => {
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: `${TT}&lang=en`, languageCode: 'en', vssId: '.en', isTranslatable: 'true' },
          { baseUrl: `${TT}&lang=fr`, languageCode: 'fr', vssId: '.fr', isTranslatable: 1 },
          { baseUrl: `${TT}&lang=de`, languageCode: 'de', vssId: '.de', isTranslatable: true },
        ],
      },
    },
  };
  assert.deepEqual(bridge.serializeResponse(response, null, VIDEO_ID).tracks.map(track => track.isTranslatable),
    [false, false, true]);
});

test('serializeResponse caps tracks at 200', () => {
  const captionTracks = [];
  for (let i = 0; i < 205; i += 1) {
    captionTracks.push({ baseUrl: `${TT}&lang=en&index=${i}`, languageCode: 'en', vssId: `.en-${i}` });
  }
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' },
    captions: { playerCaptionsTracklistRenderer: { captionTracks } },
  };
  assert.equal(bridge.serializeResponse(response, null, VIDEO_ID).tracks.length, 200);
});

test('serializeResponse truncates labels and kinds', () => {
  const response = {
    videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: `${TT}&lang=en`, languageCode: 'en', kind: 'k'.repeat(40), name: { simpleText: 'L'.repeat(300) } },
        ],
      },
    },
  };
  const [track] = bridge.serializeResponse(response, null, VIDEO_ID).tracks;
  assert.equal(track.kind, 'k'.repeat(32));
  assert.equal(track.label, 'L'.repeat(256));
});

test('serializeResponse tolerates missing or malformed captions', () => {
  const base = { videoDetails: { videoId: VIDEO_ID, defaultAudioLanguage: 'en' } };
  assert.deepEqual(bridge.serializeResponse(base, null, VIDEO_ID), {
    videoId: VIDEO_ID,
    tracks: [],
    selectedTrack: null,
    defaultAudioLanguage: 'en',
  });
  assert.deepEqual(bridge.serializeResponse({ ...base, captions: {} }, null, VIDEO_ID).tracks, []);
  assert.deepEqual(bridge.serializeResponse({
    ...base,
    captions: { playerCaptionsTracklistRenderer: { captionTracks: 'nope' } },
  }, null, VIDEO_ID).tracks, []);
});

test('readMetadata returns null when url videoId mismatches', () => {
  const win = createWindow('https://www.youtube.com/watch?v=abcdefghijk', { ytInitialPlayerResponse: simpleResponse() });
  assert.equal(bridge.readMetadata(win, VIDEO_ID), null);
});

test('readMetadata prefers matching player response and reads selection', () => {
  const player = createPlayer({ playerResponse: simpleResponse(), selected: { vssId: '.en' } });
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    player,
    ytInitialPlayerResponse: { videoDetails: { videoId: 'abcdefghijk' } },
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.deepEqual(player.optionCalls, [['captions', 'track']]);
  assert.deepEqual(result, {
    videoId: VIDEO_ID,
    tracks: [
      { id: '.en', label: 'English', languageCode: 'en', baseUrl: `${TT}&lang=en`, kind: 'asr', isTranslatable: true },
    ],
    selectedTrack: { id: '.en', languageCode: 'en', kind: 'asr' },
    defaultAudioLanguage: 'en',
  });
});

test('readMetadata falls back to ytInitialPlayerResponse when player response throws', () => {
  const player = createPlayer({
    playerResponse: undefined,
    playerResponseThrows: true,
    videoData: { video_id: VIDEO_ID },
    selected: { vssId: '.en' },
  });
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    player,
    ytInitialPlayerResponse: simpleResponse(),
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.deepEqual(player.optionCalls, [['captions', 'track']]);
  assert.equal(result.selectedTrack.id, '.en');
});

test('readMetadata falls back when player response mismatches', () => {
  const player = createPlayer({ playerResponse: { videoDetails: { videoId: 'abcdefghijk' } } });
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    player,
    ytInitialPlayerResponse: simpleResponse(),
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.deepEqual(player.optionCalls, []);
  assert.equal(result.selectedTrack, null);
  assert.equal(result.tracks.length, 1);
});

test('readMetadata reads selection through getVideoData match', () => {
  const player = createPlayer({ videoData: { video_id: VIDEO_ID }, selected: { vssId: '.en' } });
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    player,
    ytInitialPlayerResponse: simpleResponse(),
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.deepEqual(player.optionCalls, [['captions', 'track']]);
  assert.equal(result.selectedTrack.id, '.en');
});

test('readMetadata without player skips selection', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { ytInitialPlayerResponse: simpleResponse() });
  assert.deepEqual(bridge.readMetadata(win, VIDEO_ID), {
    videoId: VIDEO_ID,
    tracks: [
      { id: '.en', label: 'English', languageCode: 'en', baseUrl: `${TT}&lang=en`, kind: 'asr', isTranslatable: true },
    ],
    selectedTrack: null,
    defaultAudioLanguage: 'en',
  });
});

test('readMetadata tolerates player without bridge methods', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    player: {},
    ytInitialPlayerResponse: simpleResponse(),
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.selectedTrack, null);
});

test('readMetadata parses ytplayer config player_response string', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    ytplayer: { config: { args: { player_response: JSON.stringify(simpleResponse()) } } },
  });
  const result = bridge.readMetadata(win, VIDEO_ID);
  assert.equal(result.videoId, VIDEO_ID);
  assert.equal(result.tracks.length, 1);
});

test('readMetadata accepts non-string player_response objects', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    ytplayer: { config: { args: { player_response: simpleResponse() } } },
  });
  assert.equal(bridge.readMetadata(win, VIDEO_ID).videoId, VIDEO_ID);
});

test('readMetadata survives invalid player_response JSON', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    ytplayer: { config: { args: { player_response: '{not-json' } } },
  });
  assert.equal(bridge.readMetadata(win, VIDEO_ID), null);
});

test('readMetadata rejects oversized player_response strings', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    ytplayer: { config: { args: { player_response: 'x'.repeat(2000001) } } },
  });
  assert.equal(bridge.readMetadata(win, VIDEO_ID), null);
});

test('readMetadata returns null when location changes during read', () => {
  const player = createPlayer({ playerResponse: simpleResponse() });
  const win = createWindow('', {
    player,
    hrefs: [`https://www.youtube.com/watch?v=${VIDEO_ID}`, 'https://www.youtube.com/watch?v=abcdefghijk'],
  });
  assert.equal(bridge.readMetadata(win, VIDEO_ID), null);
});

test('readMetadata returns null without any matching response source', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    ytInitialPlayerResponse: { videoDetails: { videoId: 'abcdefghijk' } },
  });
  assert.equal(bridge.readMetadata(win, VIDEO_ID), null);
});

test('install answers valid requests', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { ytInitialPlayerResponse: simpleResponse() });
  const remove = bridge.install(win);
  dispatch(win, message(win, request('req-1')));
  assert.equal(win.postMessageCalls.length, 1);
  assert.deepEqual(win.postMessageCalls[0], {
    origin: 'https://www.youtube.com',
    message: {
      channel: 'vision-pip-captions',
      type: 'response',
      requestId: 'req-1',
      videoId: VIDEO_ID,
      payload: {
        videoId: VIDEO_ID,
        tracks: [
          { id: '.en', label: 'English', languageCode: 'en', baseUrl: `${TT}&lang=en`, kind: 'asr', isTranslatable: true },
        ],
        selectedTrack: null,
        defaultAudioLanguage: 'en',
      },
    },
  });
  remove();
});

test('install ignores messages failing source, origin or request validation', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { ytInitialPlayerResponse: simpleResponse() });
  const remove = bridge.install(win);
  const invalidEvents = [
    { ...message(win, request('req-2')), source: null },
    { ...message(win, request('req-2')), source: {} },
    { ...message(win, request('req-2')), origin: 'https://evil.example' },
    { ...message(win, request('req-2')), data: null },
    message(win, { type: 'request', requestId: 'req-2', videoId: VIDEO_ID }),
    message(win, request('req-2', { channel: 'other-channel' })),
    message(win, request('req-2', { type: 'response' })),
    message(win, request('req-2', { requestId: 42 })),
    message(win, request('req-2', { requestId: 'bad id' })),
    message(win, request('req-2', { requestId: 'bad!id' })),
    message(win, request('req-2', { requestId: '' })),
    message(win, request('req-2', { requestId: 'a'.repeat(101) })),
    message(win, request('req-2', { videoId: 'abcdefghijk' })),
    message(win, request('req-2', { videoId: 'short' })),
    message(win, request('req-2', { videoId: undefined })),
    message(win, request('req-2', { videoId: null })),
  ];
  for (const event of invalidEvents) {
    dispatch(win, event);
    assert.equal(win.postMessageCalls.length, 0);
  }
  dispatch(win, message(win, request('a'.repeat(100))));
  assert.equal(win.postMessageCalls.length, 1);
  remove();
});

test('install responds with null payload when metadata unavailable', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`);
  const remove = bridge.install(win);
  dispatch(win, message(win, request('req-3')));
  assert.deepEqual(win.postMessageCalls[0].message, {
    channel: 'vision-pip-captions',
    type: 'response',
    requestId: 'req-3',
    videoId: VIDEO_ID,
    payload: null,
  });
  remove();
});

test('install is idempotent and cleanup is reversible', () => {
  const win = createWindow(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { ytInitialPlayerResponse: simpleResponse() });
  const key = Symbol.for('VisionPiP.captionBridge');
  const first = bridge.install(win);
  const second = bridge.install(win);
  assert.equal(typeof first, 'function');
  assert.equal(first, second);
  assert.equal(key in win, true);

  first();
  assert.equal(key in win, false);
  dispatch(win, message(win, request('req-4')));
  assert.equal(win.postMessageCalls.length, 0);
  assert.doesNotThrow(() => second());

  const third = bridge.install(win);
  assert.notEqual(third, first);
  assert.equal(key in win, true);
  dispatch(win, message(win, request('req-5')));
  assert.equal(win.postMessageCalls.length, 1);
  third();
  assert.equal(key in win, false);
  dispatch(win, message(win, request('req-6')));
  assert.equal(win.postMessageCalls.length, 1);
});
