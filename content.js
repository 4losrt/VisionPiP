/**
 * VisionPiP - YouTube Floating Subtitles v1.0 (Flat Vector Icon Edition)
 * Optimized for minimal CPU/Memory footprint & zero layout thrashing
 */

(function () {
  'use strict';

  // ── State & Caches ─────────────────────────────────────────────────────────
  let pipWindow        = null;
  let pipSubEl         = null;
  let syncInterval     = null;
  let controlsInterval = null;
  let captionData      = [];
  let activeTrack      = null;
  let activeTrackKey   = '';
  let allTracks        = [];
  let subtitleRevision = 0;
  let isStreamMode     = false;
  let subtitlesEnabled = true;

  let cachedVideo      = null;

  const speedRates = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];

  // SVG Flat Icons
  const icons = {
    pip: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><rect x="2" y="3" width="20" height="14" rx="3"/><rect x="11" y="9" width="9" height="7" rx="1.5"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    volumeOn: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    volumeMute: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
    fit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`
  };

  let settings = {
    fontSize: 16, fontFamily: 'Trebuchet MS',
    textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.75)', position: 'bottom',
    subtitleMode: 'bilingual', fitMode: 'contain',
  };

  chrome.storage.sync.get(settings, (s) => { settings = { ...settings, ...s }; });
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) settings[k] = changes[k].newValue;
    if (changes.subtitleMode) {
      subtitleRevision += 1;
      if (pipWindow && !pipWindow.closed) {
        const subBtn = pipWindow.document.getElementById('yt-submode-btn');
        if (subBtn) {
          const shortLabels = { bilingual: '雙語', original: '原文', translation: '譯文' };
          subBtn.textContent = shortLabels[settings.subtitleMode] || '雙語';
        }
      }
    }
    if (changes.fitMode && pipWindow && !pipWindow.closed) {
      const pv = pipWindow.document.querySelector('video');
      if (pv) pv.style.objectFit = settings.fitMode;
      updatePipVideoLayout(pipWindow, getVideo());
      const fitBtn = pipWindow.document.getElementById('yt-fitmode-btn');
      if (fitBtn) fitBtn.textContent = settings.fitMode === 'cover' ? '滿版' : '完整';
    }
    applyStylesToOverlay();
  });

  // ── Keyboard Shortcut 'P' Listener (Main Page) ─────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      const activeEl = document.activeElement;
      const targetEl = e.target;
      const isInput = (el) => el && (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable ||
        el.getAttribute('contenteditable') === 'true' ||
        el.closest('ytd-comments, #search-form, ytd-searchbox')
      );

      if (isInput(activeEl) || isInput(targetEl)) return;

      e.preventDefault();
      handlePipToggle();
    }
  }, { passive: false });

  // ── High-Efficiency YouTube SPA Navigation Listener ────────────────────────
  window.addEventListener('yt-navigate-finish', handlePageNavigation);
  window.addEventListener('spadataupdate', handlePageNavigation);

  function handlePageNavigation() {
    cachedVideo = null;
    captionData = []; activeTrack = null; activeTrackKey = ''; allTracks = [];
    subtitleRevision += 1;
    hasAttemptedKissKickstart = false;
    if (pipSubEl) pipSubEl.innerHTML = '';
    
    setTimeout(() => {
      init();
      if (pipWindow && !pipWindow.closed) {
        refreshPipVideo();
      }
    }, 1000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000))
    : setTimeout(init, 1000);

  // ── YouTube Video ID Parser (Watch and Shorts) ────────────────────────────
  const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

  function getVideoIdFromUrl(value) {
    try {
      const url = new URL(value || location.href);
      if (!/^(?:[a-z0-9-]+\.)*youtube\.com$/.test(url.hostname)) return '';
      const id = url.pathname === '/watch'
        ? (url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : '')
        : /^\/shorts\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
      return VIDEO_ID_REGEX.test(id || '') ? id : '';
    } catch {
      return '';
    }
  }

  // ── Player Bridge Communication (Main World) ─────────────────────────────
  const BRIDGE_CHANNEL = 'vision-pip-captions';
  const bridgeCallbacks = new Map();
  let bridgeListenerInstalled = false;
  let onBridgeRateChange = null;

  function setupBridgeListener() {
    if (bridgeListenerInstalled) return;
    bridgeListenerInstalled = true;
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.channel !== BRIDGE_CHANNEL) return;
      if (msg.type === 'response' && msg.requestId) {
        const callback = bridgeCallbacks.get(msg.requestId);
        if (callback) {
          bridgeCallbacks.delete(msg.requestId);
          callback(msg.payload);
        }
      } else if (msg.type === 'ratechange' && typeof msg.rate === 'number') {
        if (typeof onBridgeRateChange === 'function') {
          onBridgeRateChange(msg.rate);
        }
      }
    });
  }

  function requestBridgeMetadata(videoId) {
    setupBridgeListener();
    return new Promise((resolve) => {
      if (!VIDEO_ID_REGEX.test(videoId || '')) { resolve(null); return; }
      const requestId = 'req_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();
      const timeout = setTimeout(() => {
        bridgeCallbacks.delete(requestId);
        resolve(null);
      }, 2000);

      bridgeCallbacks.set(requestId, (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });

      window.postMessage({
        channel: BRIDGE_CHANNEL,
        type: 'request',
        requestId,
        videoId,
      }, window.location.origin);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    const videoId = getVideoIdFromUrl(location.href);
    if (!videoId) return;
    tryInjectButton();
    loadCaptionTracks();
    startPageKissWatcher();
  }

  // ── Fast Cached Video Element Getter ───────────────────────────────────────
  function getVideo() {
    if (cachedVideo && cachedVideo.isConnected) {
      return cachedVideo;
    }
    cachedVideo = document.querySelector('video.html5-main-video')
               || document.querySelector('#movie_player video')
               || document.querySelector('video');
    return cachedVideo;
  }

  // ── Inject Floating Button ────────────────────────────────────────────────
  function tryInjectButton() {
    if (document.getElementById('pip-sub-float')) return;
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) { setTimeout(tryInjectButton, 800); return; }

    const btn = document.createElement('button');
    btn.id = 'pip-sub-float';
    btn.innerHTML = `${icons.pip}Open VisionPiP (P)`;
    btn.addEventListener('click', handlePipToggle);

    player.addEventListener('mouseover', () => { btn.style.opacity = '1'; }, { passive: true });
    player.addEventListener('mouseout', () => { btn.style.opacity = '0'; }, { passive: true });

    player.style.position = 'relative';
    player.appendChild(btn);
  }

  // ── Caption Track Loading ───────────────────────────────────────────────────
  // KISS may intentionally produce no DOM subtitle when its target language is
  // already the same as YouTube's selected caption language. In that case we
  // follow YouTube's current native caption track instead of guessing a language.
  function getPlayerResponse() {
    try {
      const currentVideoId = getVideoIdFromUrl(location.href);
      const candidates = [];
      const addCandidate = (candidate) => {
        if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
      };

      addCandidate(window.ytInitialPlayerResponse);

      // Content scripts run in an isolated world, so page globals may not be
      // visible. The same response is also present in this DOM JSON script.
      const responseScript = document.getElementById('ytInitialPlayerResponse');
      if (responseScript?.textContent) addCandidate(JSON.parse(responseScript.textContent));

      const raw = window.ytplayer?.config?.args?.player_response;
      if (raw) addCandidate(typeof raw === 'string' ? JSON.parse(raw) : raw);

      const isCurrentVideo = (response) => {
        const responseVideoId = response?.videoDetails?.videoId;
        return !currentVideoId || !responseVideoId || responseVideoId === currentVideoId;
      };

      return candidates.find(response => isCurrentVideo(response) && response?.captions)
        || candidates.find(response => response?.captions)
        || candidates.find(isCurrentVideo)
        || null;
    } catch (e) {}
    return null;
  }

  function getNativeCaptionTrack(tracks, playerResponse) {
    const player = document.querySelector('#movie_player, .html5-video-player');
    let selectedTrack = null;

    // YouTube exposes the currently selected CC track through the player API.
    // This is the most accurate source when the user selected zh-Hant, zh-TW,
    // or another translated/native track in YouTube's own subtitle menu.
    try {
      selectedTrack = player?.getOption?.('captions', 'track') || null;
    } catch (e) {}

    const normalizeLanguage = (languageCode) => {
      const code = String(languageCode || '').toLowerCase().replace('_', '-');
      if (['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo'].includes(code)) return 'zh-hant';
      if (['zh-hans', 'zh-cn', 'zh-sg'].includes(code)) return 'zh-hans';
      return code;
    };

    const sameTrack = (track, candidate) => {
      if (!track || !candidate) return false;
      const candId = candidate.vssId || candidate.id;
      const trackId = track.vssId || track.id;
      return (candId && trackId && candId === trackId)
        || (candidate.languageCode && normalizeLanguage(track.languageCode) === normalizeLanguage(candidate.languageCode)
          && (candidate.kind === undefined || track.kind === candidate.kind));
    };

    if (selectedTrack) {
      const matched = tracks.find(track => sameTrack(track, selectedTrack));
      if (matched) return matched;
    }

    // If YouTube has not exposed a selected track yet, prefer the video's
    // original audio language and then a non-ASR track before using any track.
    const originalLanguage = playerResponse?.videoDetails?.defaultAudioLanguage;
    if (originalLanguage) {
      const original = tracks.find(track =>
        normalizeLanguage(track.languageCode) === normalizeLanguage(originalLanguage)
        && track.kind !== 'asr'
      ) || tracks.find(track =>
        normalizeLanguage(track.languageCode) === normalizeLanguage(originalLanguage)
      );
      if (original) return original;
    }

    // Keep the fallback language preference aligned with the project's
    // Chinese/English use case instead of the previous language preference.
    const preferredLanguages = ['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo', 'zh', 'en'];
    for (const preferredLanguage of preferredLanguages) {
      const preferredTrack = tracks.find(track =>
        normalizeLanguage(track.languageCode) === preferredLanguage
        && track.kind !== 'asr'
      ) || tracks.find(track =>
        normalizeLanguage(track.languageCode) === preferredLanguage
      );
      if (preferredTrack) return preferredTrack;
    }

    return tracks.find(track => track.kind !== 'asr') || tracks[0] || null;
  }

  async function loadCaptionTracks() {
    try {
      const videoId = getVideoIdFromUrl(location.href);
      if (!videoId) return;

      // 1. Try requesting metadata through the player bridge (main world)
      const bridgePayload = await requestBridgeMetadata(videoId);
      if (bridgePayload?.videoId === videoId && Array.isArray(bridgePayload.tracks) && bridgePayload.tracks.length > 0) {
        allTracks = bridgePayload.tracks;
        let nextTrack = null;
        if (bridgePayload.selectedTrack) {
          nextTrack = allTracks.find(t =>
            (bridgePayload.selectedTrack.id && (t.id === bridgePayload.selectedTrack.id || t.vssId === bridgePayload.selectedTrack.id)) ||
            (t.languageCode === bridgePayload.selectedTrack.languageCode && t.kind === bridgePayload.selectedTrack.kind)
          ) || null;
        }
        if (!nextTrack) {
          nextTrack = getNativeCaptionTrack(allTracks, {
            videoDetails: {
              defaultAudioLanguage: bridgePayload.defaultAudioLanguage,
            }
          });
        }
        if (nextTrack) {
          const nextTrackKey = `${nextTrack.languageCode || ''}|${nextTrack.id || nextTrack.vssId || ''}|${nextTrack.baseUrl || ''}`;
          if (nextTrackKey !== activeTrackKey) {
            activeTrack = nextTrack;
            activeTrackKey = nextTrackKey;
            captionData = [];
            prefetchCaptions(nextTrack);
          }
          return;
        }
      }

      // 2. Fallback to DOM/player response
      const pr = getPlayerResponse();
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        allTracks = tracks;
        const nextTrack = getNativeCaptionTrack(allTracks, pr);
        const nextTrackKey = nextTrack
          ? `${nextTrack.languageCode || ''}|${nextTrack.vssId || nextTrack.id || ''}|${nextTrack.baseUrl || ''}`
          : '';

        if (nextTrack && nextTrackKey !== activeTrackKey) {
          activeTrack = nextTrack;
          activeTrackKey = nextTrackKey;
          captionData = [];
          prefetchCaptions(nextTrack);
        }
        return;
      }
    } catch (e) {
      console.warn('[VisionPiP] Unable to load YouTube caption tracks.', e);
    }

    setTimeout(loadCaptionTracks, 2000);
  }

  async function prefetchCaptions(track) {
    try {
      if (!track?.baseUrl) throw new Error('Caption track URL is missing');
      const separator = track.baseUrl.includes('?') ? '&' : '?';
      const url = `${track.baseUrl}${separator}fmt=json3`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (track !== activeTrack) return;
      captionData = parseCaptionJSON3(data);
    } catch (e) {
      if (track === activeTrack) captionData = [];
    }
  }

  function parseCaptionJSON3(data) {
    if (!data?.events) return [];
    return data.events
      .filter(ev => ev.segs && ev.tStartMs !== undefined)
      .map(ev => ({
        start: ev.tStartMs / 1000,
        end:   (ev.tStartMs + (ev.dDurationMs || 3000)) / 1000,
        text:  ev.segs.map(s => s.utf8 || '').join('').trim(),
      }))
      .filter(ev => ev.text && ev.text !== '\n');
  }

  // ── Smart Dynamic PiP Aspect Ratio & Sizing Engine ──────────────────────────
  function getIdealPipDimensions(video, baseWidth = 0) {
    let w = video?.videoWidth || 0;
    let h = video?.videoHeight || 0;

    if (!w || !h) {
      w = video?.clientWidth || 0;
      h = video?.clientHeight || 0;
    }

    const isShorts = window.location.pathname.includes('/shorts/') || (w > 0 && h > 0 && h > w * 1.2);
    if (!w || !h) {
      w = isShorts ? 9 : 16;
      h = isShorts ? 16 : 9;
    }

    const ratio = w / h;
    const screenW = window.screen?.availWidth || 1440;
    const screenH = window.screen?.availHeight || 900;

    let targetW, targetH;

    if (ratio < 1) {
      // Portrait / Shorts (e.g. 9:16)
      targetH = Math.min(Math.round(screenH * 0.58), 560);
      targetH = Math.max(targetH, 420);
      targetW = Math.round(targetH * ratio);
      if (targetW < 260) {
        targetW = 260;
        targetH = Math.round(targetW / ratio);
      }
    } else {
      // Landscape (16:9, 4:3, 21:9)
      if (baseWidth && baseWidth >= 360) {
        targetW = Math.min(baseWidth, Math.round(screenW * 0.55));
      } else {
        targetW = Math.min(Math.round(screenW * 0.38), 560);
        targetW = Math.max(targetW, 440);
      }
      targetH = Math.round(targetW / ratio);

      if (targetH > screenH * 0.65) {
        targetH = Math.round(screenH * 0.65);
        targetW = Math.round(targetH * ratio);
      }
    }

    return { width: Math.round(targetW), height: Math.round(targetH), ratio, isShorts };
  }

  function updatePipVideoLayout(win, video) {
    if (!win?.document) return;
    const subOverlay = win.document.getElementById('pip-sub-overlay');
    if (!subOverlay) return;

    const currentVideo = getVideo() || video;
    const isTop = settings.position === 'top';

    if (settings.fitMode === 'cover') {
      subOverlay.style.left = '0px';
      subOverlay.style.width = '100%';
      if (isTop) {
        subOverlay.style.top = '4%';
        subOverlay.style.bottom = 'auto';
      } else {
        subOverlay.style.bottom = '8%';
        subOverlay.style.top = 'auto';
      }
      return;
    }

    let vw = currentVideo?.videoWidth || 0;
    let vh = currentVideo?.videoHeight || 0;
    if (!vw || !vh) {
      vw = currentVideo?.clientWidth || 16;
      vh = currentVideo?.clientHeight || 9;
    }
    const videoRatio = vw / vh;

    const winW = win.innerWidth;
    const winH = win.innerHeight;
    if (!winW || !winH) return;
    const winRatio = winW / winH;

    let renderedW, renderedH, offsetX, offsetY;
    if (winRatio > videoRatio) {
      // Window is wider than video (pillarbox - bars on left/right)
      renderedH = winH;
      renderedW = Math.round(winH * videoRatio);
      offsetX = Math.round((winW - renderedW) / 2);
      offsetY = 0;
    } else {
      // Window is taller than video (letterbox - bars on top/bottom)
      renderedW = winW;
      renderedH = Math.round(winW / videoRatio);
      offsetX = 0;
      offsetY = Math.round((winH - renderedH) / 2);
    }

    // Anchor subtitle overlay directly to the actual video display frame
    subOverlay.style.left = `${offsetX}px`;
    subOverlay.style.width = `${renderedW}px`;
    if (isTop) {
      subOverlay.style.top = `${offsetY + Math.max(4, Math.round(renderedH * 0.04))}px`;
      subOverlay.style.bottom = 'auto';
    } else {
      subOverlay.style.bottom = `${offsetY + Math.max(8, Math.round(renderedH * 0.08))}px`;
      subOverlay.style.top = 'auto';
    }
  }

  function showVolumeHud(win, volume, muted) {
    if (!win?.document) return;
    let hud = win.document.getElementById('pip-volume-hud');
    if (!hud) {
      hud = win.document.createElement('div');
      hud.id = 'pip-volume-hud';
      win.document.body.appendChild(hud);
    }

    const pct = muted ? 0 : Math.round(volume * 100);
    const volIcon = muted || pct === 0 ? icons.volumeMute : icons.volumeOn;

    hud.innerHTML = `
      <div class="pip-vol-icon">${volIcon}</div>
      <div class="pip-vol-bar"><div class="pip-vol-fill" style="width:${pct}%"></div></div>
      <div class="pip-vol-text">${muted ? 'Muted' : pct + '%'}</div>
    `;
    hud.classList.add('visible');
    clearTimeout(hud._timer);
    hud._timer = setTimeout(() => {
      hud.classList.remove('visible');
    }, 850);
  }

  function cycleSubtitleMode(win) {
    const modes = ['bilingual', 'original', 'translation'];
    const curIdx = modes.indexOf(settings.subtitleMode || 'bilingual');
    const nextMode = modes[(curIdx + 1) % modes.length];
    settings.subtitleMode = nextMode;
    subtitleRevision += 1;

    chrome.storage.sync.set({ subtitleMode: nextMode });

    const labels = {
      bilingual: '雙語對照',
      original: '僅原文',
      translation: '僅譯文'
    };
    const shortLabels = {
      bilingual: '雙語',
      original: '原文',
      translation: '譯文'
    };
    const label = labels[nextMode] || nextMode;
    const shortLabel = shortLabels[nextMode] || nextMode;
    if (win?.document) {
      showPipPill(win, `字幕: ${label}`);
      const btn = win.document.getElementById('yt-submode-btn');
      if (btn) btn.textContent = shortLabel;
    }
  }

  function toggleVideoFitMode(win, video) {
    if (!win || win.closed) return;
    const v = getVideo() || video;
    settings.fitMode = settings.fitMode === 'cover' ? 'contain' : 'cover';

    const pv = win.document.querySelector('video');
    if (pv) pv.style.objectFit = settings.fitMode;

    chrome.storage.sync.set({ fitMode: settings.fitMode });
    const fitLabel = settings.fitMode === 'cover' ? '滿版無黑邊 (Cover)' : '完整畫面 (Contain)';
    showPipPill(win, fitLabel);

    const fitModeBtn = win.document.getElementById('yt-fitmode-btn');
    if (fitModeBtn) fitModeBtn.textContent = settings.fitMode === 'cover' ? '滿版' : '完整';

    updatePipVideoLayout(win, v);
  }

  function showPipPill(win, text) {
    if (!win?.document) return;
    let pill = win.document.getElementById('pip-pill-indicator');
    if (!pill) {
      pill = win.document.createElement('div');
      pill.id = 'pip-pill-indicator';
      win.document.body.appendChild(pill);
    }
    pill.textContent = text;
    pill.classList.add('visible');
    clearTimeout(pill._timer);
    pill._timer = setTimeout(() => {
      pill.classList.remove('visible');
    }, 1200);
  }

  function autoFitPipWindow(win, video) {
    if (!win || win.closed) return;
    const v = getVideo() || video;
    if (!v) return;

    const { width, height, ratio, isShorts } = getIdealPipDimensions(v, win.innerWidth);
    try {
      win.resizeTo(width, height);
      const label = isShorts
        ? 'Shorts 9:16'
        : (Math.abs(ratio - 16 / 9) < 0.08 ? '16:9' : (Math.abs(ratio - 4 / 3) < 0.08 ? '4:3' : `${ratio.toFixed(2)}:1`));
      showPipPill(win, label);
    } catch (e) {
      console.warn('[VisionPiP] autoFitPipWindow resizeTo:', e);
    }
    setTimeout(() => updatePipVideoLayout(win, v), 50);
  }

  // ── PiP Toggle ────────────────────────────────────────────────────────────
  async function handlePipToggle() {
    if (pipWindow && !pipWindow.closed) { pipWindow.close(); return; }

    if (!('documentPictureInPicture' in window)) {
      showToast('Chrome 116+ required (Document PiP API)');
      return;
    }

    const video = getVideo();
    if (!video) { showToast('Video not found'); return; }

    try {
      const { width: pipW, height: pipH } = getIdealPipDimensions(video);

      pipWindow = await documentPictureInPicture.requestWindow({
        width: pipW, height: pipH, preferInitialWindowPlacement: true,
      });

      setupPipWindow(pipWindow, video);

      const floatBtn = document.getElementById('pip-sub-float');
      if (floatBtn) floatBtn.innerHTML = `${icons.close}Close VisionPiP (P)`;

    } catch (err) {
      console.error('[VisionPiP]', err);
      showToast('Error: ' + err.message);
    }
  }

  // ── PiP Window Setup ──────────────────────────────────────────────────────
  function setupPipWindow(win, video) {
    const doc = win.document;
    doc.title = 'VisionPiP Player';

    const style = doc.createElement('style');
    style.id = 'pip-styles';
    style.textContent = buildCSS();
    doc.head.appendChild(style);

    const wrapper = doc.createElement('div');
    wrapper.id = 'pip-wrapper';
    doc.body.appendChild(wrapper);

    attachVideoToPip(win, video, wrapper);

    // Subtitle Overlay
    const overlay = doc.createElement('div');
    overlay.id = 'pip-sub-overlay';
    const subBox = doc.createElement('div');
    subBox.id = 'pip-sub-box';
    subBox.style.display = 'flex';
    subBox.style.visibility = 'visible';
    overlay.appendChild(subBox);
    wrapper.appendChild(overlay);
    pipSubEl = subBox;

    // Dynamic Video Layout Tracking & Resizing
    updatePipVideoLayout(win, video);
    const onResize = () => updatePipVideoLayout(win, getVideo() || video);
    win.addEventListener('resize', onResize);
    video.addEventListener('resize', onResize);
    video.addEventListener('loadedmetadata', onResize);

    // Double-click on PiP window to auto-fit aspect ratio
    win.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input, #yt-controls-overlay')) return;
      autoFitPipWindow(win, getVideo() || video);
    });

    // Mouse Wheel Volume Adjustment
    win.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = getVideo() || video;
      if (!v) return;

      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      const newVol = Math.min(1, Math.max(0, Math.round((v.volume + delta) * 100) / 100));
      v.volume = newVol;
      if (newVol > 0 && v.muted) v.muted = false;
      showVolumeHud(win, newVol, v.muted);
    }, { passive: false });

    // Control Bar Overlay
    setupYouTubeStyleControls(win, wrapper, video);

    // Keyboard Shortcuts inside PiP Window
    setupPipKeyboardShortcuts(win, video);

    startSync(video, win);
    win.addEventListener('pagehide', () => onPipClose(video, win));
  }

  // ── Keyboard Shortcuts Inside PiP Window ──────────────────────────────────
  function setupPipKeyboardShortcuts(win, video) {
    win.addEventListener('keydown', (e) => {
      const v = getVideo() || video;
      if (!v) return;

      if (e.key >= '0' && e.key <= '9' && Number.isFinite(v.duration) && v.duration > 0) {
        e.preventDefault();
        const fraction = parseInt(e.key, 10) / 10;
        v.currentTime = v.duration * fraction;
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          v.currentTime = Math.min(Number.isFinite(v.duration) ? v.duration : v.currentTime + 5, v.currentTime + 5);
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          v.currentTime = Math.min(Number.isFinite(v.duration) ? v.duration : v.currentTime + 10, v.currentTime + 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, Math.round((v.volume + 0.05) * 100) / 100);
          v.muted = false;
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, Math.round((v.volume - 0.05) * 100) / 100);
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          const ccBtn = win.document.getElementById('yt-cc-btn');
          if (ccBtn) ccBtn.click();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          autoFitPipWindow(win, v);
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          cycleSubtitleMode(win);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleVideoFitMode(win, v);
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          win.close();
          break;
      }
    });
  }

  // ── Controls and Click-to-Play ──────────────────────────────────────────────
  function setupYouTubeStyleControls(win, wrapper, mainVideo) {
    const doc = win.document;

    const currentRate = mainVideo.playbackRate || 1;

    const controlsContainer = doc.createElement('div');
    controlsContainer.id = 'yt-controls-overlay';
    controlsContainer.innerHTML = `
      <div class="yt-progress-container">
        <input type="range" id="yt-progress" value="0" min="0" max="100" step="0.1">
      </div>
      <div class="yt-controls-bar">
        <button id="yt-play-btn" class="yt-btn" title="Play/Pause (Space)">${icons.play}</button>
        <button id="yt-rewind-btn" class="yt-btn" title="Rewind 10s (←)">-10s</button>
        <button id="yt-forward-btn" class="yt-btn" title="Forward 10s (→)">+10s</button>
        <button id="yt-mute-btn" class="yt-btn" title="Mute/Unmute (M)">${icons.volumeOn}</button>
        <button id="yt-cc-btn" class="yt-btn ${subtitlesEnabled ? 'yt-cc-active' : ''}" title="Toggle Subtitles (C)">CC</button>
        <button id="yt-submode-btn" class="yt-btn" title="Subtitle Mode: Bilingual/Original/Translation (V)">${settings.subtitleMode === 'original' ? '原文' : settings.subtitleMode === 'translation' ? '譯文' : '雙語'}</button>
        <button id="yt-fitmode-btn" class="yt-btn" title="Display Fit Mode: Contain/Cover (F)">${settings.fitMode === 'cover' ? '滿版' : '完整'}</button>
        <button id="yt-fit-btn" class="yt-btn" title="Auto-fit Aspect Ratio (A)">${icons.fit}</button>
        <button id="yt-speed-btn" class="yt-btn" title="Playback Speed">${currentRate}x</button>
        <span id="yt-time-display">00:00 / 00:00</span>
      </div>
    `;

    const iconOverlay = doc.createElement('div');
    iconOverlay.id = 'pip-play-indicator';
    wrapper.appendChild(iconOverlay);
    wrapper.appendChild(controlsContainer);

    let hideTimer = null;
    const showControls = () => {
      controlsContainer.classList.add('visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        controlsContainer.classList.remove('visible');
      }, 2000);
    };

    wrapper.addEventListener('mousemove', showControls, { passive: true });
    wrapper.addEventListener('mouseenter', showControls, { passive: true });
    wrapper.addEventListener('mouseleave', () => {
      controlsContainer.classList.remove('visible');
    }, { passive: true });

    const playBtn = doc.getElementById('yt-play-btn');
    const rewindBtn = doc.getElementById('yt-rewind-btn');
    const forwardBtn = doc.getElementById('yt-forward-btn');
    const muteBtn = doc.getElementById('yt-mute-btn');
    const ccBtn = doc.getElementById('yt-cc-btn');
    const submodeBtn = doc.getElementById('yt-submode-btn');
    const fitmodeBtn = doc.getElementById('yt-fitmode-btn');
    const fitBtn = doc.getElementById('yt-fit-btn');
    const speedBtn = doc.getElementById('yt-speed-btn');
    const progressInput = doc.getElementById('yt-progress');
    const timeDisplay = doc.getElementById('yt-time-display');

    let animationTimer = null;
    const togglePlay = () => {
      const v = getVideo() || mainVideo;
      if (!v) return;

      if (v.paused) {
        v.play();
        playBtn.innerHTML = icons.pause;
        iconOverlay.innerHTML = icons.play;
      } else {
        v.pause();
        playBtn.innerHTML = icons.play;
        iconOverlay.innerHTML = icons.pause;
      }

      iconOverlay.classList.add('animate');
      clearTimeout(animationTimer);
      animationTimer = setTimeout(() => iconOverlay.classList.remove('animate'), 400);
    };

    wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.yt-btn') || e.target.closest('#yt-progress')) {
        return;
      }
      togglePlay();
    }, true);

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlay();
    });

    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (v) {
        v.muted = !v.muted;
        muteBtn.innerHTML = v.muted ? icons.volumeMute : icons.volumeOn;
      }
    });

    ccBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      subtitlesEnabled = !subtitlesEnabled;
      subtitleRevision += 1;
      hasAttemptedKissKickstart = false;

      const nativeCcBtn = document.querySelector('.ytp-subtitles-button');
      if (nativeCcBtn) {
        const isNativeOn = nativeCcBtn.getAttribute('aria-pressed') === 'true';
        if ((subtitlesEnabled && !isNativeOn) || (!subtitlesEnabled && isNativeOn)) {
          nativeCcBtn.click();
        }
      }

      if (subtitlesEnabled) {
        ccBtn.classList.add('yt-cc-active');
        if (pipSubEl) {
          pipSubEl.style.display = 'flex';
          pipSubEl.style.visibility = 'visible';
        }
      } else {
        ccBtn.classList.remove('yt-cc-active');
        if (pipSubEl) {
          pipSubEl.style.display = 'none';
          pipSubEl.style.visibility = 'hidden';
          pipSubEl.innerHTML = '';
        }
      }
    });

    if (submodeBtn) {
      submodeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cycleSubtitleMode(win);
      });
    }

    if (fitmodeBtn) {
      fitmodeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVideoFitMode(win, getVideo() || mainVideo);
      });
    }

    if (fitBtn) {
      fitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        autoFitPipWindow(win, getVideo() || mainVideo);
      });
    }

    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (!v) return;

      const cur = v.playbackRate || 1;
      let nextIdx = speedRates.indexOf(cur) + 1;
      if (nextIdx >= speedRates.length || nextIdx === -1) nextIdx = 0;

      const nextSpeed = speedRates[nextIdx];
      v.playbackRate = nextSpeed;

      const pipVideo = win.document.querySelector('video');
      if (pipVideo) pipVideo.playbackRate = nextSpeed;

      speedBtn.textContent = `${nextSpeed}x`;
    });

    rewindBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (v) v.currentTime = Math.max(0, v.currentTime - 10);
    });

    forwardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (v) v.currentTime = Math.min(Number.isFinite(v.duration) ? v.duration : v.currentTime + 10, v.currentTime + 10);
    });

    let isDragging = false;
    progressInput.addEventListener('mousedown', (e) => { e.stopPropagation(); isDragging = true; });
    progressInput.addEventListener('mouseup', (e) => { e.stopPropagation(); isDragging = false; });
    progressInput.addEventListener('input', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (v?.duration && Number.isFinite(v.duration)) {
        v.currentTime = (progressInput.value / 100) * v.duration;
      }
    });

    // Optimized diff-based UI timer
    let lastTimeSec = -1;
    let lastPaused = null;
    let lastMuted = null;
    let lastRate = null;

    const syncPlaybackRate = () => {
      const v = getVideo() || mainVideo;
      if (!v) return;
      const curRate = v.playbackRate || 1;
      if (lastRate !== curRate) {
        lastRate = curRate;
        speedBtn.textContent = `${curRate}x`;
        const pipVideo = win.document.querySelector('video');
        if (pipVideo && pipVideo !== v && pipVideo.playbackRate !== curRate) {
          pipVideo.playbackRate = curRate;
        }
      }
    };

    onBridgeRateChange = (rate) => {
      if (typeof rate === 'number' && rate > 0) {
        lastRate = rate;
        speedBtn.textContent = `${rate}x`;
        const pipVideo = win.document.querySelector('video');
        if (pipVideo && pipVideo !== mainVideo && pipVideo.playbackRate !== rate) {
          try { pipVideo.playbackRate = rate; } catch (e) {}
        }
      }
    };

    mainVideo.addEventListener('ratechange', syncPlaybackRate);
    const activeVideo = getVideo();
    if (activeVideo && activeVideo !== mainVideo) {
      activeVideo.addEventListener('ratechange', syncPlaybackRate);
    }

    controlsInterval = setInterval(() => {
      const v = getVideo() || mainVideo;
      if (!v) return;

      if (lastPaused !== v.paused) {
        lastPaused = v.paused;
        playBtn.innerHTML = v.paused ? icons.play : icons.pause;
      }

      if (lastMuted !== v.muted) {
        lastMuted = v.muted;
        muteBtn.innerHTML = v.muted ? icons.volumeMute : icons.volumeOn;
      }

      syncPlaybackRate();

      const curTime = Math.floor(v.currentTime);
      if (!isDragging && curTime !== lastTimeSec) {
        lastTimeSec = curTime;
        const isLive = !Number.isFinite(v.duration) || v.duration <= 0;
        if (isLive) {
          progressInput.value = 100;
          progressInput.disabled = true;
          timeDisplay.textContent = `${formatTime(v.currentTime)} / Live`;
        } else {
          progressInput.disabled = false;
          progressInput.value = (v.currentTime / v.duration) * 100;
          timeDisplay.textContent = `${formatTime(v.currentTime, v.duration)} / ${formatTime(v.duration, v.duration)}`;
        }
      }
    }, 200);
  }

  function formatTime(seconds, totalDuration) {
    if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) return "00:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const hasHours = (Number.isFinite(totalDuration) && totalDuration >= 3600) || h > 0;

    if (hasHours) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }

  // ── Mount Video into PiP Window ─────────────────────────────────────────
  function restoreMovedVideo(win) {
    const movedVideo = win._movedVideo;
    if (!movedVideo || !win._origParent) return;

    if (win._origNext?.parentNode === win._origParent) {
      win._origParent.insertBefore(movedVideo, win._origNext);
    } else {
      win._origParent.appendChild(movedVideo);
    }

    if (win._origStyle === null || win._origStyle === undefined) {
      movedVideo.removeAttribute('style');
    } else {
      movedVideo.setAttribute('style', win._origStyle);
    }

    win._movedVideo = null;
    win._origParent = null;
    win._origNext = null;
    win._origStyle = null;
  }

  function removePipStreamVideo(win) {
    const pipVideo = win._pipVideo;
    if (!pipVideo) return;

    try {
      pipVideo.pause();
      pipVideo.srcObject = null;
    } catch (e) {}
    pipVideo.remove();
    win._pipVideo = null;
  }

  function attachVideoToPip(win, video, wrapper) {
    try {
      const stream = video.captureStream?.();
      if (stream?.getVideoTracks().length > 0) {
        // A node-moved video must be restored before switching to stream mode.
        restoreMovedVideo(win);

        let pipVideo = win._pipVideo;
        if (!pipVideo) {
          pipVideo = win.document.createElement('video');
          pipVideo.autoplay = true;
          pipVideo.muted = true;
          pipVideo.playsInline = true;
          pipVideo.style.cssText = `width:100%;height:100%;display:block;object-fit:${settings.fitMode || 'contain'};`;
          wrapper.appendChild(pipVideo);
          win._pipVideo = pipVideo;
        }
        pipVideo.srcObject = stream;
        pipVideo.playbackRate = video.playbackRate || 1;
        isStreamMode = true;
        return;
      }
    } catch (e) {}

    // If captureStream is unavailable, use the original video node while
    // retaining enough metadata to restore the exact node and style on close.
    removePipStreamVideo(win);
    if (win._movedVideo && win._movedVideo !== video) restoreMovedVideo(win);

    if (!win._movedVideo) {
      win._origParent = video.parentNode;
      win._origNext = video.nextSibling;
      win._origStyle = video.getAttribute('style');
      win._movedVideo = video;
    }

    video.style.cssText = `width:100%;height:100%;display:block;object-fit:${settings.fitMode || 'contain'};background:#000;`;
    wrapper.appendChild(video);
    isStreamMode = false;
  }

  // ── Refresh Video Content in PiP When Switching Videos ────────────────────
  function refreshPipVideo() {
    if (!pipWindow || pipWindow.closed) return;

    const video = getVideo();
    if (!video) return;

    const wrapper = pipWindow.document.getElementById('pip-wrapper');
    if (!wrapper) return;

    if (isStreamMode) {
      try {
        const stream = video.captureStream?.();
        const pv = pipWindow.document.querySelector('video');
        if (pv && stream) {
          pv.srcObject = stream;
          pv.playbackRate = video.playbackRate || 1;
        }
      } catch (e) {
        console.warn('[VisionPiP] Stream refresh failed, falling back to node move.', e);
        attachVideoToPip(pipWindow, video, wrapper);
      }
    } else {
      attachVideoToPip(pipWindow, video, wrapper);
    }

    try {
      const { width, height } = getIdealPipDimensions(video);
      pipWindow.resizeTo(width, height);
    } catch (e) {}
    updatePipVideoLayout(pipWindow, video);
  }

  let hasAttemptedKissKickstart = false;
  let pageKissWatcherTimer = null;

  function attemptCcToggleNudge() {
    if (hasAttemptedKissKickstart) return;
    hasAttemptedKissKickstart = true;
    subtitleRevision += 1;
    console.log('[VisionPiP] Attempting CC toggle nudge to kickstart KISS/captions...');

    const nativeCcBtn = document.querySelector('.ytp-subtitles-button');
    if (nativeCcBtn) {
      const isPressed = nativeCcBtn.getAttribute('aria-pressed') === 'true';
      if (!isPressed) {
        nativeCcBtn.click();
      } else {
        nativeCcBtn.click();
        setTimeout(() => {
          const btn = document.querySelector('.ytp-subtitles-button');
          if (btn && btn.getAttribute('aria-pressed') !== 'true') {
            btn.click();
          }
          subtitleRevision += 1;
        }, 300);
      }
    } else {
      const player = document.querySelector('#movie_player');
      if (player?.toggleSubtitles) {
        player.toggleSubtitles();
        setTimeout(() => {
          if (player?.toggleSubtitlesOn) {
            player.toggleSubtitlesOn();
          } else if (player?.toggleSubtitles) {
            player.toggleSubtitles();
          }
          subtitleRevision += 1;
        }, 300);
      }
    }
  }

  function startPageKissWatcher() {
    if (pageKissWatcherTimer) return;
    pageKissWatcherTimer = setInterval(() => {
      if (hasAttemptedKissKickstart) return;
      const v = getVideo();
      if (!v || v.paused || v.currentTime < 1.5) return;

      const hasKiss = Boolean(
        document.getElementById('kiss-translator-inject-subtitle-js') ||
        document.querySelector('.kiss-subtitle-button, .kiss-caption-window, .kiss-caption-container, #kiss-fixture')
      );
      if (!hasKiss) return;

      const lines = getBilingualKissCaptions();
      if (lines.length > 0) {
        hasAttemptedKissKickstart = true;
        return;
      }

      const nativeCcBtn = document.querySelector('.ytp-subtitles-button');
      const isPressed = nativeCcBtn?.getAttribute('aria-pressed') === 'true';

      if (isPressed || (subtitlesEnabled && pipWindow && !pipWindow.closed)) {
        attemptCcToggleNudge();
      }
    }, 1000);
  }

  function startSync(video, win) {
    if (syncInterval) clearInterval(syncInterval);
    let lastContent = '';
    let lastTrackCheck = 0;
    let lastRevision = subtitleRevision;

    syncInterval = setInterval(() => {
      try {
        if (!pipSubEl || !pipSubEl.isConnected) {
          if (win?.document) {
            pipSubEl = win.document.getElementById('pip-sub-box');
          }
        }
        if (!pipSubEl) return;

        if (lastRevision !== subtitleRevision) {
          lastRevision = subtitleRevision;
          lastContent = '';
          pipSubEl.innerHTML = '';
        }

        if (!subtitlesEnabled) {
          if (pipSubEl.innerHTML !== '') pipSubEl.innerHTML = '';
          lastContent = '';
          return;
        }

        const currentVideo = getVideo() || video;
        const now = Date.now();
        if (now - lastTrackCheck >= 2000) {
          lastTrackCheck = now;
          loadCaptionTracks();
        }

        const t = currentVideo.currentTime;
        let lines = getBilingualKissCaptions();

        if (lines.length > 0) {
          if (typeof hasAttemptedKissKickstart !== 'undefined') hasAttemptedKissKickstart = true;
        } else if (typeof hasAttemptedKissKickstart !== 'undefined' && !hasAttemptedKissKickstart && subtitlesEnabled && !currentVideo.paused && t > 1.5) {
          if (typeof attemptCcToggleNudge === 'function') attemptCcToggleNudge();
        }

        // When KISS has no output because its target language is the same as
        // YouTube's source/selected language, read the native caption layer.
        if (lines.length === 0) {
          lines = getNativeYouTubeCaptions();
        }

        // JSON3 is used as a reliable time-synchronized fallback when YouTube's
        // own caption DOM is hidden or has not been painted yet.
        if (lines.length === 0 && captionData.length > 0) {
          const matches = captionData.filter(c => t >= c.start && t < c.end);
          const text = matches.map(c => c.text).join(' ').trim();
          if (text) lines = [text];
        }

        const subMode = (typeof settings !== 'undefined' && settings?.subtitleMode) || 'bilingual';
        if (lines.length > 1) {
          if (subMode === 'original') lines = [lines[0]];
          else if (subMode === 'translation') lines = [lines[lines.length - 1]];
        }

        const currentContent = lines.join('|||');
        if (currentContent === lastContent) return;
        lastContent = currentContent;

        pipSubEl.innerHTML = lines.length > 0
          ? lines
              .map(l => `<span class="pip-line">${escapeHtml(l.trim())}</span>`)
              .join('')
          : '';
      } catch (err) {
        console.error('[VisionPiP] startSync error:', err);
      }
    }, 100);
  }

  // ── Shared Caption Text Filter ──────────────────────────────────────────────
  const captionUiAncestorSelector = [
    '.ytp-settings-menu', '.ytp-panel-menu', '.ytp-popup',
    '.ytp-menuitem', '.ytp-menuitem-label', '.ytp-contextmenu',
    '.ytp-share-panel', '.ytp-watch-later-panel', '.ytp-caption-settings',
    '.kiss-subtitle-controls', '.kiss-notification', '.kiss-word-tooltip',
    '.kiss-hover-bubble', '#kiss-youtube-subtitle-list-container',
    '[role="menu"]', '[role="menuitem"]', 'button', 'select',
  ].join(',');

  function normalizeCaptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isCaptionUiText(text, element = null) {
    const normalized = normalizeCaptionText(text);
    if (!normalized || /^\d+:\d+/.test(normalized)) return true;
    if (/^\.+$|^…+$/.test(normalized)) return true;

    const isCaptionContainer = !!element?.closest?.(
      '.ytp-caption-window-container, .caption-window, .kiss-caption-window, .kiss-caption-paper, .kiss-caption-container, #kiss-fixture'
    );

    if (!isCaptionContainer) {
      const languageLabelPattern = /^(?:中文|汉语|漢語|英文|英语|英語|日文|日本語|韓文|韩语|法文|法語|德文|德語|西班牙文|Chinese|English|Japanese|Korean|French|German|Spanish)(?:[（(][^（）()]{1,32}[）)])?$/i;
      if (languageLabelPattern.test(normalized)) return true;
    } else {
      const languageWithVariantPattern = /^(?:中文|汉语|漢語|英文|英语|英語|日文|日本語|韓文|韩语|法文|法語|德文|德語|西班牙文|Chinese|English|Japanese|Korean|French|German|Spanish)[（(][^（）()]{1,32}[）)]$/i;
      if (languageWithVariantPattern.test(normalized)) return true;
    }

    return [
      /^(?:語言|语言|language)$/i,
      /^(?:字幕|subtitles?|captions?)$/i,
      /^(?:字幕設定|字幕设置|subtitle settings|caption settings)$/i,
      /^(?:設定|设置|settings?)$/i,
      /^(?:按一下|點擊|点击|click).*(?:進入|进入|設定|设置|settings?)/i,
      /^(?:進入|进入|open|enter).*(?:設定|设置|settings?)/i,
    ].some(pattern => pattern.test(normalized));
  }

  function getUsableCaptionText(element) {
    const text = normalizeCaptionText(element?.textContent);
    if (isCaptionUiText(text, element)) return '';
    if (element?.closest?.(captionUiAncestorSelector)) return '';
    if (element?.getAttribute?.('aria-hidden') === 'true') return '';
    return text;
  }

  // ── Native YouTube Caption DOM Fallback ─────────────────────────────────────
  function getNativeYouTubeCaptions() {
    const player = document.querySelector('.html5-video-player, #movie_player');
    if (!player) return [];

    const lineNodes = player.querySelectorAll(
      '.ytp-caption-window-container .caption-visual-line, ' +
      '.ytp-caption-window-container .caption-line, ' +
      '.caption-window .caption-visual-line, ' +
      '.caption-window .caption-line'
    );

    const lines = [];
    if (lineNodes.length > 0) {
      for (const line of lineNodes) {
        const segments = line.querySelectorAll('.ytp-caption-segment');
        let rawText = '';
        if (segments.length > 0) {
          for (const seg of segments) {
            rawText += seg.textContent || '';
          }
        } else {
          rawText = line.textContent || '';
        }
        const text = normalizeCaptionText(rawText);
        if (text && !isCaptionUiText(text, line) && !lines.includes(text)) {
          lines.push(text);
        }
      }
      if (lines.length > 0) return lines;
    }

    const leafNodes = player.querySelectorAll('.ytp-caption-segment');
    for (const node of leafNodes) {
      const text = getUsableCaptionText(node);
      if (text && !lines.includes(text)) lines.push(text);
    }
    return lines;
  }

  // ── [Optimized Extraction: High Performance DOM Query for KISS Translator] ──
  function getBilingualKissCaptions() {
    const kissContainers = document.querySelectorAll(
      '.kiss-caption-window, .kiss-caption-paper, .kiss-caption-container, #kiss-fixture'
    );
    const pLines = [];

    if (kissContainers.length > 0) {
      for (let c = 0; c < kissContainers.length; c++) {
        const container = kissContainers[c];
        if (container.style && container.style.display === 'none') continue;
        try {
          if (window.getComputedStyle && window.getComputedStyle(container).display === 'none') continue;
        } catch (e) {}

        const pNodes = container.querySelectorAll('p, .kiss-p, .kiss-youtube-original, .kiss-youtube-translation');
        for (let i = 0; i < pNodes.length; i++) {
          const el = pNodes[i];
          const text = getUsableCaptionText(el);
          if (text) pLines.push(text);
        }
      }
      if (pLines.length > 0) return [...new Set(pLines)];
    }

    const player = document.querySelector('.html5-video-player, #movie_player');
    if (!player) return [];

    const pNodes = player.querySelectorAll('.kiss-caption-window p, .kiss-caption-paper p, .kiss-p, .kiss-youtube-original, .kiss-youtube-translation');
    for (let i = 0; i < pNodes.length; i++) {
      const el = pNodes[i];
      const text = getUsableCaptionText(el);
      if (text) pLines.push(text);
    }

    return [...new Set(pLines)];
  }

  function formatFontFamily(font) {
    if (!font) return '"Trebuchet MS", sans-serif';
    if (font === 'system-ui') return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const parts = font.split(',').map(f => f.trim()).filter(Boolean);
    const formatted = parts.map(f => {
      if (f.startsWith('"') || f.startsWith("'") || !f.includes(' ')) return f;
      return `"${f}"`;
    });
    return `${formatted.join(', ')}, sans-serif`;
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function buildCSS() {
    const pos = settings.position === 'top' ? 'top:4%' : 'bottom:8%';
    const fit = settings.fitMode || 'contain';
    const fontStack = formatFontFamily(settings.fontFamily);
    return `
      *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
      html,body{width:100%;height:100%;background:#0b0f19;overflow:hidden;font-family:'Plus Jakarta Sans', Roboto, Arial, sans-serif}
      #pip-wrapper{position:relative;width:100%;height:100%;cursor:pointer;user-select:none}
      video{width:100%;height:100%;display:block;object-fit:${fit};background:#000}
      
      /* Subtitle Overlay */
      #pip-sub-overlay{
        position:absolute;left:0;right:0;${pos};
        display:flex;justify-content:center;align-items:flex-end;
        pointer-events:none;z-index:99999;padding:0 2%;
        transition: bottom 0.2s ease, top 0.2s ease, left 0.2s ease, width 0.2s ease;
      }
      #pip-sub-box{
        display:flex !important;flex-direction:column;align-items:center;gap:4px;
        width:100%;
        max-width:100%;
        pointer-events:none;
        visibility:visible !important;
      }
      .pip-line{
        display:block !important;
        visibility:visible !important;
        width:max-content;
        max-width:95vw;
        background:${settings.bgColor || 'rgba(0,0,0,0.82)'};
        color:${settings.textColor || '#ffffff'};
        font-size:${settings.fontSize || 16}px;
        font-family:${fontStack};
        font-weight:500;line-height:1.35;
        padding:5px 12px;border-radius:6px;
        text-align:center;
        word-break:break-word;
        white-space:normal;
        text-shadow:0 1px 2px rgba(0,0,0,0.9);
        -webkit-font-smoothing:antialiased;
        pointer-events:none;
        box-shadow:0 2px 8px rgba(0,0,0,0.6);
      }
      .pip-line:not(:first-child){
        font-size:${Math.max(11, Math.round((settings.fontSize || 16) * 0.92))}px;
        opacity:0.94;
      }

      /* VisionPiP Control Panel Overlay */
      #yt-controls-overlay {
        position: absolute; inset: 0;
        background: linear-gradient(to top, rgba(11, 15, 25, 0.92) 0%, rgba(11, 15, 25, 0.3) 30%, rgba(0,0,0,0) 60%);
        display: flex; flex-direction: column; justify-content: flex-end;
        padding: 0 12px 8px;
        z-index: 9999;
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s ease;
      }
      #yt-controls-overlay.visible {
        opacity: 1; pointer-events: auto;
      }

      .yt-progress-container {
        width: 100%; margin-bottom: 4px;
        display: flex; align-items: center;
      }
      #yt-progress {
        width: 100%; -webkit-appearance: none;
        height: 4px; border-radius: 2px;
        background: rgba(255,255,255,0.25); outline: none; cursor: pointer;
        transition: height 0.15s ease;
      }
      #yt-progress:hover { height: 6px; }
      #yt-progress::-webkit-slider-thumb {
        -webkit-appearance: none; width: 12px; height: 12px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        box-shadow: 0 0 10px rgba(168, 85, 247, 0.8);
        cursor: pointer;
      }

      .yt-controls-bar {
        display: flex; align-items: center; gap: 8px; width: 100%;
      }
      .yt-btn {
        background: transparent; border: none; color: #9ca3af;
        font-size: 11.5px; font-weight: 600; cursor: pointer;
        padding: 4px 8px; border-radius: 6px;
        display: inline-flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s, transform 0.1s; flex-shrink: 0;
      }
      .yt-btn:hover {
        background: rgba(168, 85, 247, 0.25);
        color: #f3f4f6;
      }
      
      .yt-btn.yt-cc-active {
        color: #c084fc;
        border-bottom: 2px solid #a855f7;
        text-shadow: 0 0 8px rgba(168, 85, 247, 0.6);
      }

      #yt-time-display {
        color: #cbd5e1; font-size: 11px; font-family: 'Plus Jakarta Sans', Roboto, sans-serif;
        margin-left: auto; white-space: nowrap; pointer-events: none;
      }

      /* Center Click Visual Indicator */
      #pip-play-indicator {
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.6);
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.9), rgba(168, 85, 247, 0.9));
        box-shadow: 0 0 20px rgba(168, 85, 247, 0.6);
        color: #fff; border-radius: 50%;
        width: 48px; height: 48px;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none;
        transition: transform 0.2s ease-out, opacity 0.2s ease-out;
        z-index: 9999;
      }
      #pip-play-indicator.animate {
        opacity: 1; transform: translate(-50%, -50%) scale(1.1);
      }

      /* Dynamic Aspect Ratio Pill */
      #pip-pill-indicator {
        position: absolute; top: 12px; left: 50%;
        transform: translateX(-50%) translateY(-10px);
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f8fafc; font-size: 11px; font-weight: 600;
        letter-spacing: 0.5px;
        padding: 4px 12px; border-radius: 9999px;
        opacity: 0; pointer-events: none;
        transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 100000;
        box-shadow: 0 4px 14px rgba(0,0,0,0.45);
      }
      #pip-pill-indicator.visible {
        opacity: 1; transform: translateX(-50%) translateY(0);
      }

      /* Mouse Wheel Volume HUD */
      #pip-volume-hud {
        position: absolute; top: 16px; right: 16px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        padding: 8px 14px;
        display: flex; align-items: center; gap: 10px;
        color: #f8fafc;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        opacity: 0; pointer-events: none;
        transform: translateY(-8px) scale(0.95);
        transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 100001;
      }
      #pip-volume-hud.visible {
        opacity: 1; transform: translateY(0) scale(1);
      }
      .pip-vol-icon {
        display: flex; align-items: center; justify-content: center;
        color: #c084fc;
      }
      .pip-vol-icon svg {
        width: 14px; height: 14px;
      }
      .pip-vol-bar {
        width: 64px; height: 5px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 9999px; overflow: hidden;
      }
      .pip-vol-fill {
        height: 100%;
        background: linear-gradient(90deg, #6366f1, #a855f7);
        border-radius: 9999px;
        transition: width 0.08s ease;
      }
      .pip-vol-text {
        font-size: 11px; font-weight: 600; font-family: 'Plus Jakarta Sans', Roboto, sans-serif;
        min-width: 32px; text-align: right; color: #e2e8f0;
      }
    `;
  }

  function applyStylesToOverlay() {
    if (!pipWindow?.document) return;
    const el = pipWindow.document.getElementById('pip-styles');
    if (el) el.textContent = buildCSS();
  }

  // ── Cleanup & Memory Disposal ──────────────────────────────────────────────
  function onPipClose(video, win) {
    clearInterval(syncInterval); syncInterval = null;
    clearInterval(controlsInterval); controlsInterval = null;
    pipSubEl = null;
    onBridgeRateChange = null;

    restoreMovedVideo(win);
    removePipStreamVideo(win);

    pipWindow = null;
    cachedVideo = null;

    const floatBtn = document.getElementById('pip-sub-float');
    if (floatBtn) floatBtn.innerHTML = `${icons.pip}Open VisionPiP (P)`;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
      'background:linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(88, 28, 135, 0.95));' +
      'border:1px solid rgba(168, 85, 247, 0.4);color:#fff;padding:10px 20px;border-radius:10px;' +
      'font-size:13.5px;z-index:99999;font-family:sans-serif;pointer-events:none;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ── Testing & Remote Settings Hook ─────────────────────────────────────────
  window.addEventListener('vision-pip-test-update-settings', (e) => {
    if (e.detail && typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set(e.detail);
    }
  });

  // ── Listen for Control Commands from Popup Toggle ──────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'togglePip') {
      handlePipToggle();
      sendResponse({ active: !!(pipWindow && !pipWindow.closed) });
    } else if (request.action === 'getPipStatus') {
      sendResponse({ active: !!(pipWindow && !pipWindow.closed) });
    }
    return true;
  });
})();