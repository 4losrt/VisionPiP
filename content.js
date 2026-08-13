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
    volumeMute: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
  };

  let settings = {
    fontSize: 16, fontFamily: 'Trebuchet MS',
    textColor: '#ffffff', bgColor: 'rgba(0,0,0,0.75)', position: 'bottom',
  };

  chrome.storage.sync.get(settings, (s) => { settings = { ...settings, ...s }; });
  chrome.storage.onChanged.addListener((changes) => {
    for (const k in changes) settings[k] = changes[k].newValue;
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

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (!location.pathname.startsWith('/watch')) return;
    tryInjectButton();
    loadCaptionTracks();
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
      const currentVideoId = new URL(location.href).searchParams.get('v');
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
      return (candidate.vssId && track.vssId === candidate.vssId)
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

  function loadCaptionTracks() {
    try {
      const pr = getPlayerResponse();
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        allTracks = tracks;
        const nextTrack = getNativeCaptionTrack(allTracks, pr);
        const nextTrackKey = nextTrack
          ? `${nextTrack.languageCode || ''}|${nextTrack.vssId || ''}|${nextTrack.baseUrl || ''}`
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
      const w = video.videoWidth || 1280, h = video.videoHeight || 720;
      const pipW = 480, pipH = Math.round((pipW * h) / w);

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
    overlay.appendChild(subBox);
    wrapper.appendChild(overlay);
    pipSubEl = subBox;

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
          v.currentTime = Math.min(v.duration, v.currentTime + 5);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          v.muted = !v.muted;
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
        <button id="yt-cc-btn" class="yt-btn ${subtitlesEnabled ? 'yt-cc-active' : ''}" title="Toggle Subtitles">CC</button>
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
      if (v) v.currentTime = Math.min(v.duration, v.currentTime + 10);
    });

    let isDragging = false;
    progressInput.addEventListener('mousedown', (e) => { e.stopPropagation(); isDragging = true; });
    progressInput.addEventListener('mouseup', (e) => { e.stopPropagation(); isDragging = false; });
    progressInput.addEventListener('input', (e) => {
      e.stopPropagation();
      const v = getVideo() || mainVideo;
      if (v?.duration) {
        v.currentTime = (progressInput.value / 100) * v.duration;
      }
    });

    // Optimized diff-based UI timer
    let lastTimeSec = -1;
    let lastPaused = null;
    let lastMuted = null;

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

      const curTime = Math.floor(v.currentTime);
      if (!isDragging && v.duration && curTime !== lastTimeSec) {
        lastTimeSec = curTime;
        progressInput.value = (v.currentTime / v.duration) * 100;
        timeDisplay.textContent = `${formatTime(v.currentTime, v.duration)} / ${formatTime(v.duration, v.duration)}`;
      }
    }, 200);
  }

  function formatTime(seconds, totalDuration) {
    if (isNaN(seconds)) return "00:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const hasHours = totalDuration >= 3600 || h > 0;

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
          pipVideo.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;';
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

    video.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain;background:#000;';
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
  }

  // ── Subtitle Synchronization (Smart Skip when Paused) ────────────────────
  function startSync(video, win) {
    let lastContent = '';
    let lastVideoTime = -1;
    let lastTrackCheck = 0;
    let lastRevision = subtitleRevision;

    syncInterval = setInterval(() => {
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
      if (currentVideo.paused && lastContent !== '' && Math.abs(t - lastVideoTime) < 0.05) {
        return;
      }
      let lines = getBilingualKissCaptions();

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

      const currentContent = lines.join('|||');
      lastVideoTime = t;
      if (currentContent === lastContent) return;
      lastContent = currentContent;

      pipSubEl.innerHTML = lines.length > 0
        ? lines
            .map(l => `<span class="pip-line">${escapeHtml(l.trim())}</span>`)
            .join('')
        : '';

    }, 100);
  }

  // ── Shared Caption Text Filter ──────────────────────────────────────────────
  const captionUiAncestorSelector = [
    '.ytp-settings-menu', '.ytp-panel-menu', '.ytp-popup',
    '.ytp-menuitem', '.ytp-menuitem-label', '.ytp-contextmenu',
    '.ytp-share-panel', '.ytp-watch-later-panel', '.ytp-caption-settings',
    '[role="menu"]', '[role="menuitem"]', 'button', 'select',
  ].join(',');

  function normalizeCaptionText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function isCaptionUiText(text) {
    const normalized = normalizeCaptionText(text);
    if (!normalized || /^\d+:\d+/.test(normalized)) return true;
    if (/^\.+$|^…+$/.test(normalized)) return true;

    // YouTube may render the currently selected caption language inside the
    // same visible layer, for example: 中文（繁體） or Chinese (Traditional).
    const languageLabelPattern = /^(?:中文|汉语|漢語|英文|英语|英語|日文|日本語|韓文|韩语|法文|法語|德文|德語|西班牙文|Chinese|English|Japanese|Korean|French|German|Spanish)(?:[（(][^（）()]{1,32}[）)])?$/i;
    if (languageLabelPattern.test(normalized)) return true;

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
    if (isCaptionUiText(text)) return '';
    if (element?.closest?.(captionUiAncestorSelector)) return '';
    if (element?.getAttribute?.('aria-hidden') === 'true') return '';
    return text;
  }

  // ── Native YouTube Caption DOM Fallback ─────────────────────────────────────
  function getNativeYouTubeCaptions() {
    const player = document.querySelector('.html5-video-player, #movie_player');
    if (!player) return [];

    const leafNodes = player.querySelectorAll('.ytp-caption-segment');
    const nodes = leafNodes.length > 0
      ? leafNodes
      : player.querySelectorAll(
          '.ytp-caption-window-container .caption-visual-line,' +
          '.ytp-caption-window-container .caption-line'
        );

    const lines = [];
    for (const node of nodes) {
      const text = getUsableCaptionText(node);
      if (text && !lines.includes(text)) lines.push(text);
    }
    return lines;
  }

  // ── [Optimized Extraction: High Performance DOM Query for KISS Translator] ──
  function getBilingualKissCaptions() {
    const player = document.querySelector('.html5-video-player, #movie_player');
    if (!player) return [];

    const pLines = [];
    const pNodes = player.querySelectorAll('p');
    for (let i = 0; i < pNodes.length; i++) {
      const el = pNodes[i];
      const text = getUsableCaptionText(el);
      const isVisible = el.checkVisibility
        ? el.checkVisibility()
        : (el.offsetParent !== null || el.offsetWidth > 0);
      if (text && isVisible) pLines.push(text);
    }

    return [...new Set(pLines)];
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function buildCSS() {
    const pos = settings.position === 'top' ? 'top:4%' : 'bottom:8%';
    return `
      *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
      html,body{width:100%;height:100%;background:#0b0f19;overflow:hidden;font-family:'Plus Jakarta Sans', Roboto, Arial, sans-serif}
      #pip-wrapper{position:relative;width:100%;height:100%;cursor:pointer;user-select:none}
      video{width:100%;height:100%;display:block;object-fit:contain;background:#000}
      
      /* Subtitle Overlay */
      #pip-sub-overlay{
        position:absolute;left:0;right:0;${pos};
        display:flex;justify-content:center;align-items:flex-end;
        pointer-events:none;z-index:8888;padding:0 2%;
        transition: bottom 0.2s ease, top 0.2s ease;
      }
      #pip-sub-box{
        display:flex;flex-direction:column;align-items:center;gap:4px;
        width:100%;
        max-width:100%;
        pointer-events:none;
      }
      .pip-line{
        display:block;
        width:max-content;
        max-width:95vw;
        background:${settings.bgColor};
        color:${settings.textColor};
        font-size:${settings.fontSize}px;
        font-family:"${settings.fontFamily}",sans-serif;
        font-weight:500;line-height:1.35;
        padding:4px 10px;border-radius:6px;
        text-align:center;
        word-break:break-word;
        white-space:normal;
        -webkit-font-smoothing:antialiased;
        pointer-events:none;
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