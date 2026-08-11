# VisionPiP - YouTube Floating Subtitles

> Next-generation Picture-in-Picture (PiP) floating subtitles for YouTube with real-time bilingual rendering and ultra-fast performance.

VisionPiP is a modern Chrome extension (Manifest V3) that leverages Chrome's **Document Picture-in-Picture API** to display floating YouTube videos with synchronized subtitles in a standalone, OS-level window. Custom-built and optimized for displaying bilingual subtitles seamlessly when used alongside [KISS Translator](https://github.com/fishjar/kiss-translator) as well as native YouTube CC tracks.

---

## [📥 Download Latest VisionPiP.crx](https://github.com/4losrt/VisionPiP/releases/latest/download/VisionPiP.crx)

---

## ✨ Features

- 🎬 **Document Picture-in-Picture API**: Renders full video, subtitles, and interactive controls in an independent floating window (Chrome 116+ required).
- 🌐 **Real-time Bilingual Subtitle Support**: High-efficiency DOM extraction custom-tailored to work with [KISS Translator](https://github.com/fishjar/kiss-translator) to display dual-language subtitles live in PiP mode, with fallback for YouTube JSON3 caption tracks.
- ⌨️ **Keyboard Shortcuts & In-Window Hotkeys**:
  - `P` : Toggle PiP window on YouTube watch pages.
  - `Space` / `K` : Play / Pause video inside PiP.
  - `←` / `→` : Seek backward / forward 5 seconds.
  - `M` : Mute / Unmute audio.
- ⚡️ **Ultra-Performance Engine**:
  - **Zero CPU Idle Overhead**: Uses native YouTube SPA navigation hooks (`yt-navigate-finish`) instead of heavy MutationObservers.
  - **Zero Layout Thrashing**: Utilizes high-performance DOM visibility checks (`checkVisibility()`).
  - **Smart Pause Skipping**: Automatically skips DOM parsing when video is paused.
- 🎨 **Modern Dark Glassmorphism UI**: Sleek, flat-icon interface with customizable typography, text color, background opacity, and vertical subtitle placement.

---

## 🚀 Installation

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder containing these project files.
5. Open any YouTube video (`youtube.com/watch?v=...`) to start using VisionPiP.

---

## 🛠 Usage

1. **Open PiP Mode**:
   - Hover over the video player and click the **Open VisionPiP (P)** floating button in the top-left corner, or press `P` on your keyboard.
2. **Bilingual Subtitles with KISS Translator**:
   - Install and enable [KISS Translator](https://github.com/fishjar/kiss-translator) on YouTube. VisionPiP automatically captures and renders the translated bilingual subtitles in real-time inside the PiP overlay.
3. **Customize Subtitle Appearance**:
   - Click the extension icon in your Chrome toolbar to open the settings popup.
   - Adjust font size, font family, text color, background opacity, and position (Top / Bottom). Settings are synced instantly via `chrome.storage.sync`.
4. **In-Window Video Controls**:
   - Hover over the floating window to reveal progress controls, speed rate selector (`0.5x`–`2x`), CC toggle, and mute button.

---

## 📁 Project Structure

```text
├── manifest.json       # Extension Manifest V3 configuration
├── content.js          # Core injection script, Document PiP logic & DOM subtitle sync
├── content.css         # Floating button & player styling
├── popup.html          # Extension settings popup UI (Dark Glassmorphism)
├── popup.js            # Settings storage & tab communication logic
├── icons/              # Extension icons (16x16, 48x48, 128x128)
├── README.md           # Documentation
└── LICENSE             # MIT License
```

---

## 🙏 Acknowledgments & Attribution

- Built and refined with assistance from **Gemini**.
- Designed to work seamlessly with [KISS Translator](https://github.com/fishjar/kiss-translator) for bilingual subtitle rendering.
- Inspired by and adapted from [mehmetkahya0/youtube-pip-subtitles](https://github.com/mehmetkahya0/youtube-pip-subtitles). Special thanks to the original author for the foundational concept.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
