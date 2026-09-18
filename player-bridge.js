(function () {
  'use strict';

  const CHANNEL = 'vision-pip-captions';
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  function videoIdFromUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*youtube\.com$/.test(url.hostname)) return '';
      const id = url.pathname === '/watch'
        ? (url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : '')
        : /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
      return VIDEO_ID.test(id || '') ? id : '';
    } catch {
      return '';
    }
  }

  function timedtextUrl(value, videoId) {
    if (typeof value !== 'string' || value.length > 16384 || !VIDEO_ID.test(videoId || '')) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
        || !/^(?:[a-z0-9-]+\.)*youtube\.com$/.test(url.hostname)
        || url.pathname !== '/api/timedtext'
        || url.searchParams.getAll('v').length !== 1 || url.searchParams.get('v') !== videoId) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function shortString(value, limit = 256) {
    return typeof value === 'string' ? value.slice(0, limit) : '';
  }

  function serializeResponse(response, selected, videoId) {
    if (!VIDEO_ID.test(videoId || '') || response?.videoDetails?.videoId !== videoId) return null;
    const rawTracks = response.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const tracks = [];
    for (const track of Array.isArray(rawTracks) ? rawTracks.slice(0, 200) : []) {
      const baseUrl = timedtextUrl(track?.baseUrl, videoId);
      const languageCode = shortString(track?.languageCode, 64);
      if (!baseUrl || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(languageCode)) continue;
      const kind = shortString(track.kind, 32);
      const id = shortString(track.vssId) || `${languageCode}:${kind}:${tracks.length}`;
      if (tracks.some(item => item.id === id)) continue;
      const name = track.name;
      const label = shortString(name?.simpleText || (Array.isArray(name?.runs)
        ? name.runs.slice(0, 20).map(run => shortString(run?.text)).join('') : '')) || languageCode;
      tracks.push({ id, label, languageCode, baseUrl, kind, isTranslatable: track.isTranslatable === true });
    }
    const selectedId = shortString(selected?.vssId || selected?.id);
    const selectedLanguage = shortString(selected?.languageCode, 64);
    const selectedKind = shortString(selected?.kind, 32);
    const matched = tracks.find(track => selectedId ? track.id === selectedId
      : track.languageCode === selectedLanguage && track.kind === selectedKind);
    return {
      videoId,
      tracks,
      selectedTrack: matched ? { id: matched.id, languageCode: matched.languageCode, kind: matched.kind } : null,
      defaultAudioLanguage: shortString(response.videoDetails.defaultAudioLanguage, 64),
    };
  }

  function readMetadata(win, videoId) {
    if (videoIdFromUrl(win.location.href) !== videoId) return null;
    const player = win.document.querySelector('#movie_player');
    let response = null;
    let playerMatches = false;
    try {
      const candidate = player?.getPlayerResponse?.();
      playerMatches = candidate?.videoDetails?.videoId === videoId;
      if (playerMatches) response = candidate;
    } catch {}
    if (!response) {
      const readers = [
        () => win.ytInitialPlayerResponse,
        () => {
          const raw = win.ytplayer?.config?.args?.player_response;
          return typeof raw === 'string' && raw.length <= 2000000 ? JSON.parse(raw) : raw;
        },
      ];
      for (const read of readers) {
        try {
          const candidate = read();
          if (candidate?.videoDetails?.videoId === videoId) {
            response = candidate;
            break;
          }
        } catch {}
      }
    }
    let selected = null;
    try {
      if (playerMatches || player?.getVideoData?.()?.video_id === videoId) {
        selected = player?.getOption?.('captions', 'track');
      }
    } catch {}
    if (videoIdFromUrl(win.location.href) !== videoId) return null;
    return serializeResponse(response, selected, videoId);
  }

  function install(win) {
    const key = Symbol.for('VisionPiP.captionBridge');
    if (win[key]) return win[key];
    const listener = event => {
      const message = event.data;
      if (event.source !== win || event.origin !== win.location.origin
        || !message || message.channel !== CHANNEL || message.type !== 'request'
        || typeof message.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(message.requestId)
        || !VIDEO_ID.test(message.videoId || '') || videoIdFromUrl(win.location.href) !== message.videoId) return;
      let payload = null;
      try {
        payload = readMetadata(win, message.videoId);
      } catch {}
      win.postMessage({ channel: CHANNEL, type: 'response', requestId: message.requestId,
        videoId: message.videoId, payload }, win.location.origin);
    };
    win.addEventListener('message', listener);
    const rateListener = event => {
      try {
        const target = event.target;
        if (target && (target.tagName === 'VIDEO' || target.nodeName === 'VIDEO')) {
          const rate = target.playbackRate;
          if (typeof rate === 'number' && rate > 0) {
            win.postMessage({ channel: CHANNEL, type: 'ratechange', rate }, win.location.origin);
          }
        }
      } catch {}
    };
    if (win.document?.addEventListener) {
      win.document.addEventListener('ratechange', rateListener, true);
    }
    const remove = () => {
      win.removeEventListener('message', listener);
      if (win.document?.removeEventListener) {
        win.document.removeEventListener('ratechange', rateListener, true);
      }
      delete win[key];
    };
    win[key] = remove;
    return remove;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CHANNEL, videoIdFromUrl, timedtextUrl, serializeResponse, readMetadata, install };
  } else if (typeof window !== 'undefined') {
    install(window);
  }
})();
