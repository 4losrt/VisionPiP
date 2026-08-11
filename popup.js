/**
 * YouTube PiP Subtitles - Popup Script
 * Reads, updates, and saves settings to chrome.storage.sync.
 */

const defaults = {
  fontSize: 16,
  fontFamily: 'Trebuchet MS',
  textColor: '#ffffff',
  bgOpacity: 75,
  position: 'bottom',
};

// Elements
const fontSizeInput   = document.getElementById('font-size');
const fontSizeVal     = document.getElementById('font-size-val');
const fontFamilyInput = document.getElementById('font-family');
const textColorInput  = document.getElementById('text-color');
const bgOpacityInput  = document.getElementById('bg-opacity');
const bgOpacityVal    = document.getElementById('bg-opacity-val');
const previewText     = document.getElementById('preview-text');
const saveIndicator   = document.getElementById('save-indicator');
const resetBtn        = document.getElementById('reset-btn');
const statusDot       = document.getElementById('status-dot');
const statusText      = document.getElementById('status-text');
const posButtons      = document.querySelectorAll('.toggle-btn[data-pos]');
const pipToggle       = document.getElementById('pip-toggle');

let saveTimer = null;

// ─── Load ────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(defaults, (saved) => {
  fontSizeInput.value    = saved.fontSize;
  fontSizeVal.textContent = saved.fontSize + 'px';
  fontFamilyInput.value = saved.fontFamily;
  textColorInput.value  = saved.textColor;
  bgOpacityInput.value  = saved.bgOpacity;
  bgOpacityVal.textContent = saved.bgOpacity + '%';
  setActivePosition(saved.position);
  updatePreview(saved);
});

// ─── Event Listeners ─────────────────────────────────────────────────────────
fontSizeInput.addEventListener('input', () => {
  fontSizeVal.textContent = fontSizeInput.value + 'px';
  saveAndPreview();
});

fontFamilyInput.addEventListener('change', saveAndPreview);
textColorInput.addEventListener('input', saveAndPreview);

bgOpacityInput.addEventListener('input', () => {
  bgOpacityVal.textContent = bgOpacityInput.value + '%';
  saveAndPreview();
});

posButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActivePosition(btn.dataset.pos);
    saveAndPreview();
  });
});

resetBtn.addEventListener('click', () => {
  fontSizeInput.value     = defaults.fontSize;
  fontSizeVal.textContent = defaults.fontSize + 'px';
  fontFamilyInput.value   = defaults.fontFamily;
  textColorInput.value    = defaults.textColor;
  bgOpacityInput.value    = defaults.bgOpacity;
  bgOpacityVal.textContent = defaults.bgOpacity + '%';
  setActivePosition(defaults.position);
  saveAndPreview();
});

// ─── PiP Switch Event Listener ──────────────────────────────────────────────
pipToggle.addEventListener('change', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'togglePip' });
    }
  });
});

// ─── Save & Preview ──────────────────────────────────────────────────────────
function saveAndPreview() {
  const current = getCurrentSettings();
  updatePreview(current);

  // Save with debounce
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Build bgColor as string
    const opacity = (current.bgOpacity / 100).toFixed(2);
    const toSave = {
      ...current,
      bgColor: `rgba(0,0,0,${opacity})`,
    };
    chrome.storage.sync.set(toSave, () => {
      flashSaved();
    });
  }, 400);
}

function getCurrentSettings() {
  const activePos = document.querySelector('.toggle-btn.active');
  return {
    fontSize:   parseInt(fontSizeInput.value),
    fontFamily: fontFamilyInput.value,
    textColor:  textColorInput.value,
    bgOpacity:  parseInt(bgOpacityInput.value),
    position:   activePos ? activePos.dataset.pos : 'bottom',
  };
}

function updatePreview(s) {
  const opacity = ((s.bgOpacity ?? 75) / 100).toFixed(2);
  previewText.style.fontSize   = (s.fontSize || 16) + 'px';
  previewText.style.fontFamily = `"${s.fontFamily || 'Trebuchet MS'}", sans-serif`;
  previewText.style.color      = s.textColor || '#ffffff';
  previewText.style.background = `rgba(0,0,0,${opacity})`;
}

function setActivePosition(pos) {
  posButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pos === pos);
  });
}

function flashSaved() {
  saveIndicator.classList.add('show');
  setTimeout(() => saveIndicator.classList.remove('show'), 1800);
}

// ─── PiP Status & Sync Check ────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs[0]) return;
  const url = tabs[0].url || '';
  if (url.includes('youtube.com/watch')) {
    statusDot.classList.add('active');
    statusText.textContent = 'Active on YouTube';

    chrome.tabs.sendMessage(tabs[0].id, { action: 'getPipStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && typeof response.active === 'boolean') {
        pipToggle.checked = response.active;
      }
    });
  } else if (url.includes('youtube.com')) {
    statusText.textContent = 'Go to a video page';
    pipToggle.disabled = true;
  } else {
    statusText.textContent = 'Works on YouTube';
    pipToggle.disabled = true;
  }
});